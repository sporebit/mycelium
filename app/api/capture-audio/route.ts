import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { cloudAllowed } from "@/lib/ai/budget";
import { captureRecording } from "@/lib/capture/receiveAudio";
import { transcribeAudio } from "@/lib/openai/whisper";
import { audioExtension } from "@/lib/storage/captures";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";
// Audio uploads can be sizeable; keep this generous.
export const maxDuration = 60;

/** Every answer says in its body whether it worked: an iPhone Shortcut cannot read the status code. */
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, status: "error", error, ...extra }, { status });

/**
 * POST /api/capture-audio — a recording, as a multipart form or as the
 * whole request body.
 *
 * Multipart fields:
 *   audio        the file (m4a, mp3, wav, mp4, webm, ogg …)
 *   client_uuid  the sender's id for this capture. The same id as the text
 *                sent to /api/capture joins the recording to that capture.
 *   text         the words, if the device already has them and did not send
 *                them separately
 *   kind         optional: skip the classifier's choice
 *   transcribe_only=1   do not capture: just return the words (the chat's
 *                microphone button)
 *
 * Raw body (any Content-Type that is not multipart/form-data): the body is
 * the recording, named `<client_uuid>.m4a`, typed by the Content-Type
 * header (default audio/m4a, also for application/octet-stream); `client_uuid`, `text` and `kind` come from
 * the query string. The iPhone Shortcuts are compiled with Cherri, which
 * can only send a file as the whole body.
 *
 * The recording is stored and the answer goes back at once, 202
 * `{ ok, status: "saved", capture_id }`. Whisper on the PC transcribes it
 * afterwards for nothing; if the device sent no words, that transcript is
 * the capture's text, and if the PC is off for more than three minutes the
 * cloud does it instead, inside the monthly cap. The same `client_uuid`
 * sent again stores nothing new, so a retry is always safe.
 *
 * A file over about 4 MB is refused by the host before it reaches this
 * code, whichever way it is sent; a normal-quality voice note is about half
 * a megabyte a minute.
 */

type Incoming = { audio: File; text: string; clientUuid: string | null; forcedKind: string | null; transcribeOnly: boolean };

/** The two ways a recording arrives, read into one shape; a string is the reason it was refused. */
async function readIncoming(req: NextRequest): Promise<Incoming | string> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data/i.test(contentType)) {
    const q = req.nextUrl.searchParams;
    const clientUuid = (q.get("client_uuid") ?? "").trim() || null;
    // A missing or generic binary type says nothing about the audio.
    const declared = contentType.split(";")[0].trim().toLowerCase();
    const type = declared && declared !== "application/octet-stream" ? declared : "audio/m4a";
    const bytes = await req.arrayBuffer().catch(() => new ArrayBuffer(0));
    return {
      audio: new File([bytes], `${clientUuid ?? "recording"}.m4a`, { type }),
      text: (q.get("text") ?? "").trim(),
      clientUuid,
      forcedKind: (q.get("kind") ?? "").trim() || null,
      transcribeOnly: false,
    };
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return "expected multipart form";
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) return "audio file required";
  return {
    audio,
    text: ((form.get("text") as string | null) ?? "").trim(),
    clientUuid: ((form.get("client_uuid") as string | null) ?? "").trim() || null,
    forcedKind: ((form.get("kind") as string | null) ?? "").trim() || null,
    transcribeOnly: form.get("transcribe_only") === "1",
  };
}
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);

  const incoming = await readIncoming(req);
  if (typeof incoming === "string") return fail(incoming, 400);
  const { audio, text, clientUuid, forcedKind } = incoming;
  if (audio.size === 0) return fail("audio file required", 400);
  const ext = audioExtension(audio.name, audio.type);
  const supabase = await createUserClient();

  // The chat's microphone: words back now, nothing stored.
  if (incoming.transcribeOnly) {
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
