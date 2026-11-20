/**
 * Files in the family space: a scan, a photo, a document, the recording of
 * a letter. One private bucket, <space id>/<random>.<ext>; the storage
 * rules read the space from the path (0171), so the upload below is the
 * caller's own and is refused for anyone outside the team.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob } from "@/lib/jobs/queue";
import { FAMILY_BUCKET } from "./server";

/** Just under the host's request limit (4.5 MB on Vercel), so a too-large file is refused in words, not by a blank error. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

const KINDS: Record<string, { ext: string; group: "image" | "audio" | "document" }> = {
  "image/jpeg": { ext: "jpg", group: "image" },
  "image/png": { ext: "png", group: "image" },
  "image/webp": { ext: "webp", group: "image" },
  "image/heic": { ext: "heic", group: "image" },
  "image/heif": { ext: "heif", group: "image" },
  "application/pdf": { ext: "pdf", group: "document" },
  "audio/mp4": { ext: "m4a", group: "audio" },
  "audio/x-m4a": { ext: "m4a", group: "audio" },
  "audio/m4a": { ext: "m4a", group: "audio" },
  "audio/mpeg": { ext: "mp3", group: "audio" },
  "audio/webm": { ext: "webm", group: "audio" },
  "audio/ogg": { ext: "ogg", group: "audio" },
  "audio/wav": { ext: "wav", group: "audio" },
  "audio/x-wav": { ext: "wav", group: "audio" },
};

export type Stored = { path: string; mime: string; group: "image" | "audio" | "document" };

/** What kind of file this is, or null when it is not one the family space keeps. */
export function fileKind(mime: string | null | undefined): { ext: string; group: Stored["group"]; mime: string } | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  const k = KINDS[m];
  return k ? { ...k, mime: m } : null;
}

export async function storeFamilyFile(supabase: SupabaseClient, spaceId: string, file: File): Promise<{ ok: true; stored: Stored } | { ok: false; status: number; error: string }> {
  const kind = fileKind(file.type);
  if (!kind) return { ok: false, status: 415, error: "That kind of file is not kept here. Pictures, PDFs and voice recordings are." };
  if (file.size === 0) return { ok: false, status: 400, error: "The file is empty." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, status: 413, error: "That file is over 4 MB. A smaller copy will go through." };
  const path = `${spaceId}/${randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage.from(FAMILY_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: kind.mime, upsert: false });
  if (error) return { ok: false, status: /row-level|policy|not allowed|unauthor/i.test(error.message) ? 403 : 500, error: "The file could not be stored." };
  return { ok: true, stored: { path, mime: kind.mime, group: kind.group } };
}

/**
 * A letter spoken aloud: its words come from Whisper on the PC, free, when
 * the PC is next on. Never the cloud: a letter can wait a day, and nothing
 * about it is worth paying for.
 */
export async function queueLetterTranscript(supabase: SupabaseClient, entryId: string): Promise<void> {
  await enqueueJob(supabase, { kind: "transcribe", payload: { family_entry_id: entryId }, lane: "pc", dedupeKey: `transcribe:family:${entryId}` });
}

/** For the job: where the recording is. Null when the entry or its recording has gone. */
export async function letterAudio(db: SupabaseClient, entryId: string): Promise<{ audio_url: string; audio_ext: string } | null> {
  const { data } = await db.from("family_entries").select("media_path").eq("id", entryId).maybeSingle();
  const path = (data as { media_path: string | null } | null)?.media_path;
  if (!path) return null;
  const { data: signed } = await db.storage.from(FAMILY_BUCKET).createSignedUrl(path, 900);
  return signed?.signedUrl ? { audio_url: signed.signedUrl, audio_ext: path.split(".").pop() ?? "m4a" } : null;
}

/** For the job: the words arrive. Words typed in the meantime are never written over. */
export async function applyLetterTranscript(db: SupabaseClient, entryId: string, text: string): Promise<void> {
  const { data } = await db.from("family_entries").select("id, body").eq("id", entryId).maybeSingle();
  const row = data as { id: string; body: string | null } | null;
  if (!row) return;
  const words = text.trim();
  const update: Record<string, unknown> = { transcribed: true, updated_at: new Date().toISOString() };
  if (!row.body?.trim() && words) update.body = words;
  await db.from("family_entries").update(update).eq("id", entryId);
}
