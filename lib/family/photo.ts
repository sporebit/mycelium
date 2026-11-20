/**
 * Photos too big to send (MYC-186). Pure: the limits, the sizing sums and
 * a reader for the date a picture was taken. The browser does the shrinking
 * (components/family/shrink.ts); the server keeps refusing anything over
 * the limit in words (lib/family/files.ts).
 *
 * The limit: the host cuts a request off at 4.5 MB, so the server refuses a
 * file over 4 MB. Phone photos are often 5–12 MB. A picture is shrunk in the
 * browser to at most 2560 px on its long side and re-encoded as JPEG,
 * stepping down until it is under 3.5 MB (headroom for the form around it).
 * 2560 px is more than any phone or laptop screen shows and prints at
 * 8 inches at 300 dpi, which covers the photobook. Re-encoding drops the
 * EXIF block, so the date the picture was taken is read from the original
 * first and sent as the entry's date.
 */

export const PHOTO_LIMIT_BYTES = 4 * 1024 * 1024;
export const PHOTO_TARGET_BYTES = Math.floor(3.5 * 1024 * 1024);
export const PHOTO_MAX_SIDE = 2560;

/** Tried in order until the picture is under the target. */
export const SHRINK_STEPS: ReadonlyArray<{ side: number; quality: number }> = [
  { side: 2560, quality: 0.85 },
  { side: 2560, quality: 0.75 },
  { side: 2048, quality: 0.75 },
  { side: 2048, quality: 0.65 },
  { side: 1600, quality: 0.65 },
  { side: 1280, quality: 0.6 },
];

/** A picture needs shrinking when it is an image over the limit. */
export function needsShrinking(file: { type: string; size: number }): boolean {
  return file.type.startsWith("image/") && file.size > PHOTO_LIMIT_BYTES;
}

/** Width and height scaled so the long side is at most `maxSide`; never scaled up; whole pixels. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxSide || long <= 0) return { width, height };
  const k = maxSide / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

const DATE_TIME_ORIGINAL = 0x9003;
const DATE_TIME = 0x0132;
const EXIF_IFD_POINTER = 0x8769;

/**
 * The day a JPEG was taken, "YYYY-MM-DD", from its EXIF DateTimeOriginal
 * (or DateTime, failing that). Null for anything else: a PNG, a JPEG with
 * no EXIF, a date that is not one. Reads the first APP1 segment only.
 */
export function exifTakenOn(bytes: ArrayBuffer | Uint8Array): string | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return null;
    const marker = b[p + 1];
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan: no EXIF before the pixels
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2) return null;
    if (marker === 0xe1 && p + 10 <= b.length && String.fromCharCode(...b.subarray(p + 4, p + 10)) === "Exif\0\0") {
      return readTiff(b, p + 10, Math.min(b.length, p + 2 + len));
    }
    p += 2 + len;
  }
  return null;
}

function readTiff(b: Uint8Array, start: number, end: number): string | null {
  if (start + 8 > end) return null;
  const order = String.fromCharCode(b[start], b[start + 1]);
  const little = order === "II";
  if (!little && order !== "MM") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  if (u16(start + 2) !== 0x2a) return null;
  const ifd0 = start + u32(start + 4);

  const ascii = (entryAt: number): string | null => {
    const count = u32(entryAt + 4);
    const at = count <= 4 ? entryAt + 8 : start + u32(entryAt + 8);
    if (at + count > end || count < 1) return null;
    return String.fromCharCode(...b.subarray(at, at + count - 1));
  };
  const scan = (ifd: number, want: number): { value: string | null; exifIfd: number | null } => {
    if (ifd + 2 > end) return { value: null, exifIfd: null };
    const n = u16(ifd);
    let exifIfd: number | null = null;
    let value: string | null = null;
    for (let i = 0; i < n; i += 1) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = u16(e);
      if (tag === EXIF_IFD_POINTER) exifIfd = start + u32(e + 8);
      if (tag === want && u16(e + 2) === 2) value = ascii(e);
    }
    return { value, exifIfd };
  };

  const first = scan(ifd0, DATE_TIME);
  const original = first.exifIfd !== null ? scan(first.exifIfd, DATE_TIME_ORIGINAL).value : null;
  return asDay(original) ?? asDay(first.value);
}

/** "2026:11:20 14:03:00" → "2026-11-20", when it is a real day. */
export function asDay(exif: string | null | undefined): string | null {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})/.exec(exif ?? "");
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}
