import { createServerClient } from "@/lib/supabase/server";
import { uploadReceiptImage } from "@/lib/storage/receipts";
import { ACCEPTED_MEDIA_TYPES, MAX_RECEIPT_IMAGES } from "@/lib/types/receipt";

/**
 * Shared by the create endpoint and the add-photos endpoint, so a page added
 * to an existing receipt is validated and stored on exactly the same terms as
 * one uploaded with it. The two diverge only in where sort_order starts.
 */

/** HEIC is what an iPhone hands over by default and the vision API will not take it. */
export function isHeic(type: string, name: string): boolean {
  const t = type.toLowerCase();
  const n = name.toLowerCase();
  return (
    t.includes("heic") ||
    t.includes("heif") ||
    n.endsWith(".heic") ||
    n.endsWith(".heif")
  );
}

export type UploadRejection = { error: string; status: number };

/**
 * Rejects a batch of files that cannot be parsed, with the status the route
 * should return.
 *
 * `existingCount` is how many pages the receipt already holds. The cap applies
 * to the total rather than to the batch, because parseReceipt sends every page
 * of a receipt in one vision call — eight is the ceiling for the receipt, not
 * per upload.
 */
export function validateReceiptFiles(
  files: File[],
  existingCount = 0,
): UploadRejection | null {
  if (files.length === 0) {
    return {
      error: "at least one image required in the 'images' field",
      status: 400,
    };
  }

  const total = existingCount + files.length;
  if (total > MAX_RECEIPT_IMAGES) {
    const detail =
      existingCount > 0
        ? `receipt already has ${existingCount}, adding ${files.length} would make ${total}`
        : `${files.length}`;
    return {
      error: `too many images: ${detail} (max ${MAX_RECEIPT_IMAGES})`,
      status: 400,
    };
  }

  for (const file of files) {
    if (isHeic(file.type, file.name)) {
      return {
        error:
          "HEIC/HEIF images are not supported yet. On iPhone set Settings > Camera > Formats to 'Most Compatible', or export the photo as JPEG before uploading.",
        status: 415,
      };
    }
    if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
      return {
        error: `unsupported image type '${file.type || "unknown"}' — use JPEG or PNG`,
        status: 415,
      };
    }
  }

  return null;
}

/**
 * Writes each file to the private bucket and records a receipt_images row,
 * numbering from `startSortOrder`.
 *
 * sort_order is not merely display order: parseReceipt feeds the images to the
 * vision model in it, and the prompt tells the model consecutive pages overlap.
 * Appending above the current maximum is what stops a page added later being
 * read as though it came before page one.
 *
 * A failed row insert is logged and skipped rather than thrown, matching the
 * create path: the image is already in storage, and losing the whole upload
 * over one row would be worse than a receipt one page short of its photos.
 */
export async function storeReceiptImages(
  receiptId: string,
  files: File[],
  startSortOrder = 0,
): Promise<number> {
  const supabase = createServerClient();
  let stored = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sortOrder = startSortOrder + i;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mediaType = file.type === "image/jpg" ? "image/jpeg" : file.type;
    const path = await uploadReceiptImage(receiptId, buffer, mediaType, sortOrder);

    const { error } = await supabase.from("receipt_images").insert({
      receipt_id: receiptId,
      storage_path: path,
      sort_order: sortOrder,
      media_type: mediaType,
    });
    if (error) {
      console.error("[receipts/upload] image row insert failed:", error.message);
      continue;
    }
    stored++;
  }

  return stored;
}

/**
 * The sort_order a new page should take, i.e. one past the highest in use.
 * Returns 0 for a receipt with no images.
 */
export async function nextSortOrder(receiptId: string): Promise<number> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("receipt_images")
    .select("sort_order")
    .eq("receipt_id", receiptId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  return data ? Number(data.sort_order) + 1 : 0;
}
