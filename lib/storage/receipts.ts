import { createServerClient } from "@/lib/supabase/server";

/**
 * Private Supabase Storage bucket holding receipt source images.
 * Created in supabase/migrations/0092_receipts.sql with public = false, so
 * every read has to go through a signed URL minted server-side.
 */
export const RECEIPTS_BUCKET = "receipts";

/** How long a signed image URL stays valid, in seconds. */
export const SIGNED_URL_TTL = 3600;

function extensionFor(mediaType: string): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Uploads one receipt image and returns the storage path it was written to.
 *
 * Paths are `<receiptId>/<sortOrder>-<random>.<ext>`: the receipt id prefix
 * keeps a receipt's pages together, sort_order preserves page order, and the
 * random suffix means a re-upload of the same page never silently overwrites
 * the previous one.
 *
 * Service-role only — this bucket is private and there is no client-side path.
 */
export async function uploadReceiptImage(
  receiptId: string,
  buffer: Buffer,
  mediaType: string,
  sortOrder: number,
): Promise<string> {
  const supabase = createServerClient();
  const suffix = Math.random().toString(36).slice(2, 10);
  const path = `${receiptId}/${sortOrder}-${suffix}.${extensionFor(mediaType)}`;

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, buffer, { contentType: mediaType, upsert: false });

  if (error) {
    throw new Error(`receipt image upload failed: ${error.message}`);
  }
  return path;
}

/**
 * Mints a signed URL for a stored receipt image. Returns null rather than
 * throwing, so one unreadable image cannot take down a whole detail response.
 */
export async function getSignedUrl(
  path: string,
  expiresIn: number = SIGNED_URL_TTL,
): Promise<string | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("[storage/receipts] signed URL failed:", error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Removes stored images. Called when a receipt is deleted. */
export async function removeReceiptImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createServerClient();
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).remove(paths);
  if (error) {
    console.error("[storage/receipts] remove failed:", error.message);
  }
}

/** Downloads a stored image back into a Buffer, for re-parsing. */
export async function downloadReceiptImage(path: string): Promise<Buffer | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .download(path);
  if (error || !data) {
    console.error("[storage/receipts] download failed:", error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}
