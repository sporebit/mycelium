import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { cloudAllowed } from "@/lib/ai/budget";
import { applyTranscript, queueTranscription } from "@/lib/capture/jobs";
import { pcIsOn } from "@/lib/jobs/queue";
import { processCapture, receiveCapture } from "@/lib/capture/pipeline";
import { sweepCaptures } from "@/lib/capture/sweep";
import { transcribeAudio } from "@/lib/openai/whisper";
import { audioExtension, uploadCaptureAudio } from "@/lib/storage/captures";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";
// Audio uploads can be sizeable; keep this generous.
export const maxDuration = 60;

/** Every answer says in its body whether it worked: an iPhone Shortcut cannot read the status code. */
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, status: "error", error, ...extra }, { status });

/**
 * POST /api/capture-audio — a recording, as a multipart form.
 *
 * Fields:
 *   audio        the file (m4a, mp3, wav, mp4, webm, ogg …)
 *   client_uuid  the sender's id for this capture. The same id as the text
 *                sent to /api/capture joins the recording to that capture.
 *   text         the words, if the device already has them and did not send
 *                them separately
 *   kind         optional: skip the classifier's choice
 *   transcribe_only=1   do not capture: just return the words (the chat's
 *                microphone button)
 *
 * The recording is stored and the answer goes back at once, 202
 * `{ ok, status: "saved", capture_id }`. Whisper on the PC transcribes it
 * afterwards for nothing; if the device sent no words, that transcript is
 * the capture's text, and if the PC is off for more than three minutes the
 * cloud does it instead, inside the monthly cap. The same `client_uuid`
 * sent again stores nothing new, so a retry is always safe.
 *
 * A file over about 4 MB is refused by the host before it reaches this
 * code; a normal-quality voice note is about half a megabyte a minute.
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("expected multipart form", 400);
  }
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return fail("audio file required", 400);
  const text = ((form.get("text") as string | null) ?? "").trim();
  const clientUuid = ((form.get("client_uuid") as string | null) ?? "").trim() || null;
  const forcedKind = ((form.get("kind") as string | null) ?? "").trim() || null;
  const ext = audioExtension(audio.name, audio.type);
  const supabase = await createUserClient();

  // The chat's microphone: words back now, nothing stored.
  if (form.get("transcribe_only") === "1") {
    if (!(await cloudAllowed(supabase)) || !process.env.OPENAI_API_KEY) {
      return fail("transcription_unavailable", 503, { summary: "Voice typing is off for now (the month's AI allowance is used, or no key is set)." });
    }
    try {
      // The meter counts the call under voice.transcribe (lib/system/aiMeter.ts).
      const transcription = (await transcribeAudio(await audio.arrayBuffer(), audio.name || `speech.${ext}`, audio.type || `audio/${ext}`, { feature: "voice.transcribe" })).trim();
      return NextResponse.json({ ok: true, status: "ok", transcription });
    } catch (err) {
      console.error("[capture-audio] transcribe_only failed:", err);
      return fail("transcription_failed", 502, { summary: "Couldn't transcribe — was the audio recorded properly?" });
    }
  }

  try {
    const received = await receiveCapture(supabase, { text, clientUuid, source: "api", textSource: "dictation", forcedKind });

    // The recording goes into the capture's own folder. The capture already
    // exists, so a failure here loses nothing: the words (if any) are stored
    // and the device still holds the file to send again.
    const buffer = await audio.arrayBuffer();
    const path = await uploadCaptureAudio(supabase, received.id, buffer, audio.type || `audio/${ext}`, ext);
    const { data: row } = await supabase.from("raw_captures").update({ audio_path: path }).eq("id", received.id).select("id, raw_text, status").single();
    const hasText = !!row?.raw_text?.trim();
    await queueTranscription(supabase, received.id, hasText);

    after(async () => {
      try {
        if (hasText && row?.status !== "processed") await processCapture(supabase, uid, received.id, { reply: true });
        // No words yet. If the PC is on it will transcribe within the minute,
        // for nothing. If it is off, do not leave the capture wordless until
        // the next sweep: transcribe now in the cloud, inside the month's cap.
        if (!hasText && !(await pcIsOn(supabase)) && process.env.OPENAI_API_KEY && (await cloudAllowed(supabase))) {
          const words = await transcribeAudio(buffer, audio.name || `capture.${ext}`, audio.type || `audio/${ext}`, { feature: "capture.transcribe" });
          await applyTranscript(supabase, uid, received.id, words, "whisper_cloud");
        }
        await sweepCaptures(supabase, uid, { limit: 5 });
      } catch (err) {
        console.error("[capture-audio] processing soft-fail:", err);
      }
    });

    return NextResponse.json(
      {
        ok: true,
        status: "saved",
        capture_id: received.id,
        audio: "stored",
        ...(received.duplicate ? { deduplicated: true } : {}),
        // Older Shortcuts show `summary`; keep them saying something true.
        summary: hasText ? "Saved" : "Saved. The words will follow once it is transcribed.",
        transcription: text,
      },
      { status: 202 },
    );
  } catch (err) {
    console.error("[capture-audio] failed:", err);
    return fail("capture_failed", 500, { summary: "Not saved. Keep the recording and send it again." });
  }
}
