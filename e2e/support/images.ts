/**
 * Pictures for the end-to-end checks, made here so nothing binary is kept
 * in the repository.
 */
import { deflateSync } from "node:zlib";

const be16 = (n: number) => [n >> 8, n & 0xff];
const be32 = (n: number) => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/**
 * A JPEG that is only its EXIF block (start of image, APP1 with
 * DateTimeOriginal, end of image). Nothing can draw it, but it is a JPEG by
 * type and by header, which is all the date reader looks at.
 */
export function jpegTakenOn(dateTimeOriginal: string): Buffer {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  const entry = (tag: number, type: number, count: number, at: number) => [...be16(tag), ...be16(type), ...be32(count), ...be32(at)];
  const text = ascii(dateTimeOriginal);
  // TIFF: header(8) · IFD0 with one entry, the Exif pointer (2+12+4) · Exif IFD with one entry (2+12+4) · the text
  const ifd0At = 8;
  const exifAt = ifd0At + 18;
  const textAt = exifAt + 18;
  const tiff = [0x4d, 0x4d, ...be16(0x2a), ...be32(ifd0At), ...be16(1), ...entry(0x8769, 4, 1, exifAt), ...be32(0), ...be16(1), ...entry(0x9003, 2, text.length, textAt), ...be32(0), ...text];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return Buffer.from([0xff, 0xd8, 0xff, 0xe1, ...be16(app1.length + 2), ...app1, 0xff, 0xd9]);
}

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  return Buffer.concat([Buffer.from(be32(data.length)), body, Buffer.from(be32(crc32(body)))]);
}

/**
 * A real, decodable PNG of one flat colour, stored without compression so
 * its size is about width × height × 3 bytes: the way to make a picture
 * that is too big to send without shipping one.
 */
export function flatPng(width: number, height: number, rgb: [number, number, number] = [120, 80, 200]): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.from([...be32(width), ...be32(height), 8, 2, 0, 0, 0]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 0 })), chunk("IEND", new Uint8Array(0))]);
}
