import { describe, expect, it } from "vitest";
import { exifTimeToIso, parseExif } from "./exif";

/**
 * A JPEG that is only an EXIF block: SOI, APP1 with IFD0 (Make, Model, the
 * Exif and GPS pointers), an Exif IFD with DateTimeOriginal, and a GPS IFD
 * with tags 1–4. Built here in either byte order, after the shape of
 * e2e/support/images.ts `jpegTakenOn`.
 */
function jpegWithExif(opts: { little: boolean; when?: string; lat?: [number, "N" | "S"]; lng?: [number, "E" | "W"]; make?: string; model?: string }): Uint8Array {
  const le = opts.little;
  const u16 = (n: number) => (le ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) => (le ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  const dms = (deg: number) => {
    const d = Math.floor(deg);
    const mFull = (deg - d) * 60;
    const m = Math.floor(mFull);
    const s = Math.round((mFull - m) * 60 * 100);
    return [...u32(d), ...u32(1), ...u32(m), ...u32(1), ...u32(s), ...u32(100)];
  };

  type E = { tag: number; type: number; count: number; data: number[] };
  const ifd0: E[] = [];
  const exif: E[] = [];
  const gps: E[] = [];
  if (opts.make) ifd0.push({ tag: 0x010f, type: 2, count: ascii(opts.make).length, data: ascii(opts.make) });
  if (opts.model) ifd0.push({ tag: 0x0110, type: 2, count: ascii(opts.model).length, data: ascii(opts.model) });
  if (opts.when) exif.push({ tag: 0x9003, type: 2, count: 20, data: ascii(opts.when) });
  if (opts.lat) {
    gps.push({ tag: 1, type: 2, count: 2, data: ascii(opts.lat[1]) });
    gps.push({ tag: 2, type: 5, count: 3, data: dms(opts.lat[0]) });
  }
  if (opts.lng) {
    gps.push({ tag: 3, type: 2, count: 2, data: ascii(opts.lng[1]) });
    gps.push({ tag: 4, type: 5, count: 3, data: dms(opts.lng[0]) });
  }
  const hasExif = exif.length > 0;
  const hasGps = gps.length > 0;
  const size = (n: number) => 2 + n * 12 + 4;
  const ifd0Count = ifd0.length + (hasExif ? 1 : 0) + (hasGps ? 1 : 0);
  const ifd0At = 8;
  const exifAt = ifd0At + size(ifd0Count);
  const gpsAt = exifAt + (hasExif ? size(exif.length) : 0);
  let dataAt = gpsAt + (hasGps ? size(gps.length) : 0);
  if (hasExif) ifd0.push({ tag: 0x8769, type: 4, count: 1, data: u32(exifAt) });
  if (hasGps) ifd0.push({ tag: 0x8825, type: 4, count: 1, data: u32(gpsAt) });
  ifd0.sort((a, b) => a.tag - b.tag);

  const extra: number[] = [];
  const table = (entries: E[]) => {
    const out = [...u16(entries.length)];
    for (const e of entries) {
      out.push(...u16(e.tag), ...u16(e.type), ...u32(e.count));
      if (e.data.length <= 4) out.push(...e.data, ...new Array(4 - e.data.length).fill(0));
      else {
        out.push(...u32(dataAt));
        extra.push(...e.data);
        dataAt += e.data.length;
      }
    }
    return out.concat(u32(0));
  };
  const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(0x2a), ...u32(ifd0At), ...table(ifd0), ...(hasExif ? table(exif) : []), ...(hasGps ? table(gps) : []), ...extra];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xd9]);
}

describe("parseExif", () => {
  it("reads big-endian (Motorola) time, GPS and camera", () => {
    const r = parseExif(jpegWithExif({ little: false, when: "2026:07:04 13:05:09", lat: [54.2028, "N"], lng: [1.6694, "W"], make: "Apple", model: "iPhone 15" }))!;
    expect(r.taken_at).toBe("2026-07-04T12:05:09.000Z"); // BST
    expect(r.lat).toBeCloseTo(54.2028, 3);
    expect(r.lng).toBeCloseTo(-1.6694, 3);
    expect(r.make_model).toBe("Apple iPhone 15");
  });
  it("reads little-endian (Intel) and a southern, western fix", () => {
    const r = parseExif(jpegWithExif({ little: true, when: "2026:01:15 09:00:00", lat: [33.8568, "S"], lng: [70.6483, "W"], make: "Google", model: "Google Pixel 9" }))!;
    expect(r.taken_at).toBe("2026-01-15T09:00:00.000Z"); // GMT
    expect(r.lat).toBeCloseTo(-33.8568, 3);
    expect(r.lng).toBeCloseTo(-70.6483, 3);
    expect(r.make_model).toBe("Google Pixel 9");
  });
  it("reads a south-east fix with no time", () => {
    const r = parseExif(jpegWithExif({ little: true, lat: [37.8136, "S"], lng: [144.9631, "E"] }))!;
    expect(r.taken_at).toBeNull();
    expect(r.lat).toBeCloseTo(-37.8136, 3);
    expect(r.lng).toBeCloseTo(144.9631, 3);
  });
  it("accepts an ArrayBuffer", () => {
    const bytes = jpegWithExif({ little: false, when: "2026:07:04 13:05:09" });
    expect(parseExif(bytes.buffer as ArrayBuffer)?.taken_at).toBe("2026-07-04T12:05:09.000Z");
  });
  it("returns null for a JPEG without EXIF, a non-JPEG and junk", () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    expect(parseExif(plain)).toBeNull();
    expect(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x45]))).toBeNull();
    expect(parseExif(new Uint8Array(0))).toBeNull();
  });
});

describe("exifTimeToIso", () => {
  it("reads zoneless times as London and honours an offset", () => {
    expect(exifTimeToIso("2026:11:21 10:00:00")).toBe("2026-11-21T10:00:00.000Z");
    expect(exifTimeToIso("2026:06:21 10:00:00")).toBe("2026-06-21T09:00:00.000Z");
    expect(exifTimeToIso("2026:06:21 10:00:00", "+02:00")).toBe("2026-06-21T08:00:00.000Z");
    expect(exifTimeToIso("0000:00:00 00:00:00")).toBeNull();
  });
});
