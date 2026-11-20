import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The private bucket for capture audio (0159). A recording is kept under
 * `<capture id>/audio.<ext>`, and the bucket's policies tie the file to the
 * capture's row: whoever can see the capture can hear it, nobody else.
 * Reads go through a signed link minted server-side.
 */
export const CAPTURES_BUCKET = "captures";
export const CAPTURE_AUDIO_SIGNED_TTL = 900;

const AUDIO_EXT = new Set(["m4a", "mp3", "mp4", "wav", "webm", "ogg", "oga", "mpga", "mpeg", "aac", "caf", "flac"]);

/** A safe extension for the stored file, from the name or the type sent. */
export function audioExtension(name: string | null | undefined, mime: string | null | undefined): string {
  const fromName = name?.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (AUDIO_EXT.has(fromName)) return fromName;
  const fromMime = mime?.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "";
  if (fromMime === "x-m4a" || fromMime === "mp4a-latm") return "m4a";
  if (AUDIO_EXT.has(fromMime)) return fromMime;
  return "m4a";
}

export function captureAudioPath(captureId: string, ext: string): string {
  return `${captureId}/audio.${ext}`;
}

/** Store the recording for a capture. Uploading the same capture's audio again replaces nothing and is not an error: the first copy stands. */
export async function uploadCaptureAudio(db: SupabaseClient, captureId: string, buffer: ArrayBuffer | Buffer, mime: string, ext: string): Promise<string> {
  const path = captureAudioPath(captureId, ext);
  const { error } = await db.storage.from(CAPTURES_BUCKET).upload(path, buffer, { contentType: mime || `audio/${ext}`, upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`audio not stored: ${error.message}`);
  return path;
}

export async function signCaptureAudio(db: SupabaseClient, path: string, expiresIn = CAPTURE_AUDIO_SIGNED_TTL): Promise<string | null> {
  const { data, error } = await db.storage.from(CAPTURES_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function downloadCaptureAudio(db: SupabaseClient, path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await db.storage.from(CAPTURES_BUCKET).download(path);
  if (error || !data) return null;
  return data.arrayBuffer();
}
