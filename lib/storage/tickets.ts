import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Private Supabase Storage bucket for ticket attachments (spec §8.1, §17.1):
 * created in 0119 with public = false and a 10 MB limit, so every read goes
 * through a signed URL minted server-side. Paths are `<ticketId>/<ts>-<rand>.<ext>`.
 */
export const TICKETS_BUCKET = "tickets";
export const TICKETS_SIGNED_TTL = 3600;

function extensionFor(mediaType: string, fallbackName?: string): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/jpeg" || mediaType === "image/jpg") return "jpg";
  if (mediaType === "application/pdf") return "pdf";
  const m = fallbackName?.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : "bin";
}

export async function uploadTicketAttachment(
  db: SupabaseClient,
  ticketId: string,
  buffer: ArrayBuffer | Buffer,
  mediaType: string,
  fileName?: string,
): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${ticketId}/${Date.now()}-${suffix}.${extensionFor(mediaType, fileName)}`;
  const { error } = await db.storage.from(TICKETS_BUCKET).upload(path, buffer, { contentType: mediaType, upsert: false });
  if (error) throw new Error(`attachment upload failed: ${error.message}`);
  return path;
}

export async function signTicketAttachment(db: SupabaseClient, path: string, expiresIn = TICKETS_SIGNED_TTL): Promise<string | null> {
  const { data, error } = await db.storage.from(TICKETS_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function removeTicketAttachment(db: SupabaseClient, path: string): Promise<void> {
  const { error } = await db.storage.from(TICKETS_BUCKET).remove([path]);
  if (error) console.error("[storage/tickets] remove failed:", error.message);
}
