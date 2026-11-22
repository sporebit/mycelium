/**
 * PhirstMaxx research — a photo's own time and place (spec §6 step 1, "Photo").
 *
 * What it reads: the EXIF block of a JPEG — DateTimeOriginal (falling back
 * to DateTimeDigitized, then IFD0 DateTime), the GPS latitude and longitude
 * with their N/S and E/W references, and the camera make and model. Pure:
 * bytes in, a record out; no service, no cost.
 *
 * Limits: JPEG only (HEIC, PNG and WebP return null — the share sheet
 * usually converts to JPEG, and the vision stage reads the picture either
 * way). Messaging apps and some share paths strip EXIF, so an empty answer
 * is common. EXIF times carry no zone: they are read as Europe/London wall
 * clock unless the photo has an OffsetTimeOriginal, and returned as an ISO
 * string in UTC. Fallback: the drop's received time and the vision stage's
 * reading of signage and landmarks.
 */

export type ExifRead = {
  /** ISO in UTC; the camera's wall clock read as London local unless the file gave an offset. */
  taken_at: string | null;
  lat: number | null;
  lng: number | null;
  make_model: string | null;
};

type Entry = { type: number; count: number; at: number };

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

class Tiff {
  constructor(private view: DataView, private base: number, private little: boolean, private end: number) {}

  u16(at: number): number {
    return this.view.getUint16(this.base + at, this.little);
  }
  u32(at: number): number {
    return this.view.getUint32(this.base + at, this.little);
  }
  inRange(at: number, len: number): boolean {
    return at >= 0 && this.base + at + len <= this.end;
  }

  /** Tag → where its value sits (relative to the TIFF header). */
  ifd(offset: number): Map<number, Entry> {
    const out = new Map<number, Entry>();
    if (!this.inRange(offset, 2)) return out;
    const n = this.u16(offset);
    for (let i = 0; i < n && i < 512; i += 1) {
      const e = offset + 2 + i * 12;
      if (!this.inRange(e, 12)) break;
      const tag = this.u16(e);
      const type = this.u16(e + 2);
      const count = this.u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 0) * count;
      if (!size) continue;
      const at = size <= 4 ? e + 8 : this.u32(e + 8);
      if (!this.inRange(at, size)) continue;
      out.set(tag, { type, count, at });
    }
    return out;
  }

  ascii(e: Entry | undefined): string | null {
    if (!e || (e.type !== 2 && e.type !== 7 && e.type !== 1)) return null;
    let s = "";
    for (let i = 0; i < e.count; i += 1) {
      const c = this.view.getUint8(this.base + e.at + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim() || null;
  }

  long(e: Entry | undefined): number | null {
    if (!e) return null;
    if (e.type === 4) return this.u32(e.at);
    if (e.type === 3) return this.u16(e.at);
    return null;
  }

  rationals(e: Entry | undefined): number[] | null {
    if (!e || (e.type !== 5 && e.type !== 10)) return null;
    const out: number[] = [];
    for (let i = 0; i < e.count; i += 1) {
      const at = this.base + e.at + i * 8;
      const num = e.type === 5 ? this.view.getUint32(at, this.little) : this.view.getInt32(at, this.little);
      const den = e.type === 5 ? this.view.getUint32(at + 4, this.little) : this.view.getInt32(at + 4, this.little);
      out.push(den === 0 ? 0 : num / den);
    }
    return out;
  }
}

/** Find the TIFF block inside the first APP1 "Exif\0\0" segment, or null. */
function findExif(view: DataView): { start: number; end: number } | null {
  if (view.byteLength < 4 || view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return null;
  let p = 2;
  while (p + 4 <= view.byteLength) {
    if (view.getUint8(p) !== 0xff) return null;
    const marker = view.getUint8(p + 1);
    if (marker === 0xff) {
      p += 1; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image, start of scan: no EXIF before the picture
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      p += 2;
      continue;
    }
    const len = view.getUint16(p + 2, false);
    if (len < 2 || p + 2 + len > view.byteLength) return null;
    if (marker === 0xe1 && len >= 8) {
      const s = p + 4;
      const isExif = [0x45, 0x78, 0x69, 0x66, 0, 0].every((b, i) => view.getUint8(s + i) === b);
      if (isExif) return { start: s + 6, end: p + 2 + len };
    }
    p += 2 + len;
  }
  return null;
}

const londonParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Minutes London is ahead of UTC at an instant (0 or 60). */
function londonOffsetMinutes(ms: number): number {
  const parts = londonParts.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** "2026:07:04 13:05:09" (+ optional "+01:00") → ISO UTC, reading a zoneless time as London. */
export function exifTimeToIso(text: string | null, offset: string | null = null): string | null {
  if (!text) return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const off = offset ? /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim()) : null;
  if (off) {
    const mins = (off[1] === "-" ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3]));
    return new Date(wall - mins * 60_000).toISOString();
  }
  // Guess with the offset at the wall time read as UTC, then correct once with the offset at the guess.
  let utc = wall - londonOffsetMinutes(wall) * 60_000;
  utc = wall - londonOffsetMinutes(utc) * 60_000;
  return new Date(utc).toISOString();
}

function coordinate(t: Tiff, value: Entry | undefined, ref: Entry | undefined, negative: string, limit: number): number | null {
  const r = t.rationals(value);
  if (!r || !r.length) return null;
  const deg = (r[0] ?? 0) + (r[1] ?? 0) / 60 + (r[2] ?? 0) / 3600;
  if (!Number.isFinite(deg) || deg > limit) return null;
  const sign = (t.ascii(ref) ?? "").toUpperCase().startsWith(negative) ? -1 : 1;
  return Math.round(sign * deg * 1e7) / 1e7;
}

/** Time, GPS and camera from a JPEG's EXIF. Null for a non-JPEG or a JPEG with no EXIF block. */
export function parseExif(input: Uint8Array | ArrayBuffer): ExifRead | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const seg = findExif(view);
    if (!seg || seg.end - seg.start < 8) return null;
    const order = view.getUint16(seg.start, false);
    const little = order === 0x4949;
    if (!little && order !== 0x4d4d) return null;
    const t = new Tiff(view, seg.start, little, seg.end);
    if (t.u16(2) !== 0x2a) return null;

    const ifd0 = t.ifd(t.u32(4));
    const exifAt = t.long(ifd0.get(0x8769));
    const gpsAt = t.long(ifd0.get(0x8825));
    const exif = exifAt ? t.ifd(exifAt) : new Map<number, Entry>();
    const gps = gpsAt ? t.ifd(gpsAt) : new Map<number, Entry>();

    const original = t.ascii(exif.get(0x9003));
    const when = original ?? t.ascii(exif.get(0x9004)) ?? t.ascii(ifd0.get(0x0132));
    const offset = original ? t.ascii(exif.get(0x9011)) : t.ascii(exif.get(0x9012));
    const lat = coordinate(t, gps.get(2), gps.get(1), "S", 90);
    const lng = coordinate(t, gps.get(4), gps.get(3), "W", 180);
    const bothZero = lat === 0 && lng === 0;

    const make = t.ascii(ifd0.get(0x010f));
    const model = t.ascii(ifd0.get(0x0110));
    const makeModel = model && make && !model.toLowerCase().startsWith(make.toLowerCase()) ? `${make} ${model}` : (model ?? make);

    return {
      taken_at: exifTimeToIso(when, offset),
      lat: lat === null || lng === null || bothZero ? null : lat,
      lng: lat === null || lng === null || bothZero ? null : lng,
      make_model: makeModel,
    };
  } catch {
    // A truncated or lying file: treat as no EXIF rather than fail the drop.
    return null;
  }
}
