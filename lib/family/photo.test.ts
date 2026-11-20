import { describe, expect, it } from "vitest";
import { asDay, exifTakenOn, fitWithin, needsShrinking, PHOTO_LIMIT_BYTES, PHOTO_TARGET_BYTES, SHRINK_STEPS } from "./photo";

/**
 * A JPEG with an EXIF block built by hand: SOI, APP1 "Exif", a TIFF header,
 * IFD0 with DateTime and a pointer to the Exif IFD, which has
 * DateTimeOriginal. Big-endian unless `little`.
 */
function jpegWith(o: { original?: string; dateTime?: string; little?: boolean }): Uint8Array {
  const little = !!o.little;
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  const entry = (tag: number, type: number, count: number, valueOrOffset: number) => [...u16(tag), ...u16(type), ...u32(count), ...u32(valueOrOffset)];

  // layout inside the TIFF block (offsets from its start)
  const ifd0At = 8;
  const ifd0Entries = (o.dateTime ? 1 : 0) + (o.original ? 1 : 0);
  const ifd0Len = 2 + ifd0Entries * 12 + 4;
  const dateTimeAt = ifd0At + ifd0Len;
  const dateTimeBytes = o.dateTime ? ascii(o.dateTime) : [];
  const exifIfdAt = dateTimeAt + dateTimeBytes.length;
  const exifLen = o.original ? 2 + 12 + 4 : 0;
  const originalAt = exifIfdAt + exifLen;
  const originalBytes = o.original ? ascii(o.original) : [];

  const tiff: number[] = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(0x2a), ...u32(ifd0At)];
  tiff.push(...u16(ifd0Entries));
  if (o.dateTime) tiff.push(...entry(0x0132, 2, dateTimeBytes.length, dateTimeAt));
  if (o.original) tiff.push(...entry(0x8769, 4, 1, exifIfdAt));
  tiff.push(...u32(0));
  tiff.push(...dateTimeBytes);
  if (o.original) {
    tiff.push(...u16(1), ...entry(0x9003, 2, originalBytes.length, originalAt), ...u32(0));
    tiff.push(...originalBytes);
  }
  const app1 = [...[0x45, 0x78, 0x69, 0x66, 0, 0], ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xd9]);
}

describe("photos too big to send", () => {
  it("the limit is the server's, the target leaves room under it, and the steps go down", () => {
    expect(PHOTO_LIMIT_BYTES).toBe(4 * 1024 * 1024);
    expect(PHOTO_TARGET_BYTES).toBeLessThan(PHOTO_LIMIT_BYTES);
    for (let i = 1; i < SHRINK_STEPS.length; i += 1) {
      expect(SHRINK_STEPS[i].side * SHRINK_STEPS[i].quality).toBeLessThan(SHRINK_STEPS[i - 1].side * SHRINK_STEPS[i - 1].quality);
    }
  });

  it("shrinks a picture over the limit and nothing else", () => {
    expect(needsShrinking({ type: "image/jpeg", size: PHOTO_LIMIT_BYTES + 1 })).toBe(true);
    expect(needsShrinking({ type: "image/jpeg", size: PHOTO_LIMIT_BYTES })).toBe(false);
    expect(needsShrinking({ type: "application/pdf", size: 10 * 1024 * 1024 })).toBe(false);
  });

  it("fits the long side and keeps the shape; never scales up", () => {
    expect(fitWithin(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3024, 4032, 2560)).toEqual({ width: 1920, height: 2560 });
    expect(fitWithin(1200, 800, 2560)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(10000, 1, 2560)).toEqual({ width: 2560, height: 1 });
  });

  it("reads the day a JPEG was taken, preferring DateTimeOriginal, in either byte order", () => {
    expect(exifTakenOn(jpegWith({ original: "2026:08:14 09:12:33", dateTime: "2026:11:01 10:00:00" }))).toBe("2026-08-14");
    expect(exifTakenOn(jpegWith({ original: "2026:08:14 09:12:33", little: true }))).toBe("2026-08-14");
    expect(exifTakenOn(jpegWith({ dateTime: "2026:11:01 10:00:00" }))).toBe("2026-11-01");
  });

  it("gives nothing for a PNG, a JPEG without EXIF, an empty block, or a date that is not one", () => {
    expect(exifTakenOn(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(exifTakenOn(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 0, 0, 0xff, 0xd9]))).toBeNull();
    expect(exifTakenOn(jpegWith({}))).toBeNull();
    expect(exifTakenOn(jpegWith({ original: "0000:00:00 00:00:00" }))).toBeNull();
    expect(exifTakenOn(jpegWith({ original: "2026:02:30 09:12:33" }))).toBeNull();
    expect(exifTakenOn(new Uint8Array(0))).toBeNull();
  });

  it("asDay takes the EXIF shape and the ISO one, and refuses days that do not exist", () => {
    expect(asDay("2026:11:20 14:03:00")).toBe("2026-11-20");
    expect(asDay("2026-11-20")).toBe("2026-11-20");
    expect(asDay("2026:13:01 00:00:00")).toBeNull();
    expect(asDay(null)).toBeNull();
  });
});
