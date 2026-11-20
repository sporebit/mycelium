/**
 * A recording arrives (the phone's Shortcut, the wall's tap-to-talk): store
 * it, answer at once, transcribe afterwards. The one path both doors share;
 * app/api/capture-audio/route.ts is the HTTP shape of it.
 *
 * The recording goes into the capture's own folder. The capture already
 * exists before the upload, so a failure there loses nothing: the words (if
 * any) are stored and the device still holds the file to send again.
 * Whisper on the PC transcribes for nothing; if the device sent no words and
 * the PC is off, the cloud does it inside the month's cap. The same
 * `clientUuid` sent again stores nothing new, so a retry is always safe.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { cloudAllowed } from "@/lib/ai/budget";
import { applyTranscript, queueTranscription } from "@/lib/capture/jobs";
import { type CaptureSource, processCapture, receiveCapture } from "@/lib/capture/pipeline";
import { sweepCaptures } from "@/lib/capture/sweep";
import { pcIsOn } from "@/lib/jobs/queue";
import { transcribeAudio } from "@/lib/openai/whisper";
import { audioExtension, uploadCaptureAudio } from "@/lib/storage/captures";


export type RecordingInput = {
  audio: File;
  /** The words, if the device already has them. */
  text?: string;
  clientUuid?: string | null;
  forcedKind?: string | null;
  /** Where it came from, for the capture row. */
  source?: CaptureSource;
};

export type RecordingResult = { id: string; duplicate: boolean; hasText: boolean };

/** Store the recording as `uid`'s capture and queue its words. Returns once the file is safe; processing follows the response. */
export async function captureRecording(db: SupabaseClient, uid: string, input: RecordingInput): Promise<RecordingResult> {
  const { audio } = input;
  const text = (input.text ?? "").trim();
  const ext = audioExtension(audio.name, audio.type);
  const received = await receiveCapture(db, { text, clientUuid: input.clientUuid ?? null, source: input.source ?? "api", textSource: "dictation", forcedKind: input.forcedKind ?? null });

  const buffer = await audio.arrayBuffer();
  const path = await uploadCaptureAudio(db, received.id, buffer, audio.type || `audio/${ext}`, ext);
  const { data: row } = await db.from("raw_captures").update({ audio_path: path }).eq("id", received.id).select("id, raw_text, status").single();
  const hasText = !!row?.raw_text?.trim();
  await queueTranscription(db, received.id, hasText);

  after(async () => {
    try {
      if (hasText && row?.status !== "processed") await processCapture(db, uid, received.id, { reply: true });
      // No words yet. If the PC is on it will transcribe within the minute,
      // for nothing. If it is off, do not leave the capture wordless until
      // the next sweep: transcribe now in the cloud, inside the month's cap.
      if (!hasText && !(await pcIsOn(db)) && process.env.OPENAI_API_KEY && (await cloudAllowed(db))) {
        // The meter counts the call under capture.transcribe (lib/system/aiMeter.ts); nothing is recorded by hand.
        const words = await transcribeAudio(buffer, audio.name || `capture.${ext}`, audio.type || `audio/${ext}`, { feature: "capture.transcribe" });
        await applyTranscript(db, uid, received.id, words, "whisper_cloud");
      }
      await sweepCaptures(db, uid, { limit: 5 });
    } catch (err) {
      console.error("[capture-audio] processing soft-fail:", err);
    }
  });

  return { id: received.id, duplicate: !!received.duplicate, hasText };
}
