/**
 * Capture's jobs for the PC (master run §5 "Transcription", §9).
 *
 * "transcribe" — the saved recording is transcribed by Whisper on the PC,
 * free. When only audio arrived, the transcript becomes the capture's text
 * and the capture is processed. When the phone already sent its own
 * dictation, the transcript replaces it only where the words really differ,
 * and never over a hand edit (lib/capture/transcript.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { signCaptureAudio } from "@/lib/storage/captures";
import { formatParagraphs } from "./paragraphs";
import { processCapture } from "./pipeline";
import { chooseText } from "./transcript";

type AudioRow = {
  id: string;
  raw_text: string | null;
  audio_path: string | null;
  text_edited: boolean;
  status: string;
  classification: Record<string, unknown> | null;
  created_by: string | null;
};

const AUDIO_ROW = "id, raw_text, audio_path, text_edited, status, classification, created_by";

/**
 * Queue the recording for transcription.
 *   hasText = true   the phone already gave us the words: this is the free
 *                    second opinion, so it waits for the PC however long.
 *   hasText = false  there are no words until this runs: the PC gets three
 *                    minutes, then the cloud may take it.
 */
export async function queueTranscription(db: SupabaseClient, captureId: string, hasText: boolean): Promise<void> {
  await enqueueJob(db, {
    kind: "transcribe",
    payload: { capture_id: captureId },
    lane: hasText ? "pc" : "any",
    cloudAfterSeconds: 180,
    dedupeKey: `transcribe:${captureId}`,
  });
}

/** Write a transcript onto its capture and carry on from there. Used by the PC's result and by the cloud fallback alike. */
export async function applyTranscript(
  db: SupabaseClient,
  uid: string,
  captureId: string,
  transcript: string,
  source: "whisper_pc" | "whisper_cloud",
): Promise<"used" | "kept" | "gone"> {
  const { data } = await db.from("raw_captures").select(AUDIO_ROW).eq("id", captureId).maybeSingle();
  const row = data as AudioRow | null;
  if (!row) return "gone";
  const choice = chooseText({ stored: row.raw_text, whisper: transcript, editedByHand: row.text_edited });

  if (choice.use === "keep") {
    // Keep a note that the second opinion agreed (or was overruled by a hand edit).
    await db
      .from("raw_captures")
      .update({ classification: { ...(row.classification ?? {}), whisper: { checked: true, kept: choice.reason } } })
      .eq("id", row.id);
    return "kept";
  }

  const text = formatParagraphs(transcript.trim());
  if (choice.reason === "no_text") {
    await db.from("raw_captures").update({ raw_text: text, dictation_text: transcript.trim(), text_source: source }).eq("id", row.id);
    await processCapture(db, uid, row.id, { reply: true });
    return "used";
  }

  // The words differ from the dictation: correct the stored text. What it was
  // filed as stays (the card in tonight's review shows the corrected text).
  await db
    .from("raw_captures")
    .update({
      raw_text: text,
      text_source: source,
      classification: { ...(row.classification ?? {}), whisper: { checked: true, corrected: true } },
    })
    .eq("id", row.id);
  return "used";
}

registerJobHandler("transcribe", {
  prepare: async (job, db) => {
    const captureId = String(job.payload.capture_id ?? "");
    const { data } = await db.from("raw_captures").select("id, audio_path").eq("id", captureId).maybeSingle();
    const path = (data as { audio_path: string | null } | null)?.audio_path;
    if (!path) throw new Error("the capture has no recording");
    const url = await signCaptureAudio(db, path);
    if (!url) throw new Error("the recording could not be signed");
    return { audio_url: url, audio_ext: path.split(".").pop() ?? "m4a", language: "en" };
  },
  apply: async (job, result, db) => {
    const captureId = String(job.payload.capture_id ?? "");
    const text = typeof result.text === "string" ? result.text : "";
    if (!job.created_by) throw new Error("job has no owner");
    await applyTranscript(db, job.created_by, captureId, text, "whisper_pc");
  },
});
