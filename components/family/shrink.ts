/**
 * A picture made small enough to send, in the browser (MYC-186). The limits
 * and the reasons are in lib/family/photo.ts. The date the picture was
 * taken is read from the original before anything is done to it, because
 * re-encoding drops it; it goes up as the entry's date.
 *
 * A picture the browser cannot decode (most HEIC files on a desktop) is sent
 * as it is; the server answers in words if it is too big.
 */
import { exifTakenOn, needsShrinking, fitWithin, PHOTO_TARGET_BYTES, SHRINK_STEPS } from "@/lib/family/photo";

export type Prepared = { file: File; taken_on: string | null; shrunk: boolean };

/** The first 256 KB is where the EXIF block lives. */
async function takenOn(file: File): Promise<string | null> {
  if (file.type !== "image/jpeg") return null;
  try {
    return exifTakenOn(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    return null;
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof createImageBitmap === "function") return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    /* fall through to an <img> */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

export async function prepareUpload(file: File): Promise<Prepared> {
  const taken = await takenOn(file);
  if (!needsShrinking(file)) return { file, taken_on: taken, shrunk: false };
  const source = await decode(file);
  if (!source) return { file, taken_on: taken, shrunk: false };
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, taken_on: taken, shrunk: false };

  let best: Blob | null = null;
  for (const step of SHRINK_STEPS) {
    const size = fitWithin(width, height, step.side);
    canvas.width = size.width;
    canvas.height = size.height;
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const blob = await toBlob(canvas, step.quality);
    if (!blob) break;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= PHOTO_TARGET_BYTES) break;
  }
  if ("close" in source) source.close();
  if (!best) return { file, taken_on: taken, shrunk: false };
  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return { file: new File([best], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified }), taken_on: taken, shrunk: true };
}
