import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { cloudAllowed } from "@/lib/ai/budget";
import { costPence, recordUsage } from "@/lib/ai/usage";
import { captureRecording, whisperUsd } from "@/lib/capture/receiveAudio";
import { transcribeAudio } from "@/lib/openai/whisper";
import { audioExtension } from "@/lib/storage/captures";
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
      const transcription = (await transcribeAudio(await audio.arrayBuffer(), audio.name || `speech.${ext}`, audio.type || `audio/${ext}`)).trim();
      await recordUsage(supabase, { provider: "openai", tag: "voice.transcribe", model: "whisper-1", input_tokens: 0, output_tokens: 0, cost_pence: costPence(null, 0, 0, whisperUsd(audio.size)) });
      return NextResponse.json({ ok: true, status: "ok", transcription });
    } catch (err) {
      console.error("[capture-audio] transcribe_only failed:", err);
      return fail("transcription_failed", 502, { summary: "Couldn't transcribe — was the audio recorded properly?" });
    }
  }

  try {
    // Storing, queuing and the after-the-answer transcription live in lib/capture/receiveAudio.ts, shared with the wall's tap-to-talk.
    const received = await captureRecording(supabase, uid, { audio, text, clientUuid, forcedKind, source: "api" });
    const hasText = received.hasText;

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
