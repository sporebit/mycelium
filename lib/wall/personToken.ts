/**
 * The wall's ten-minute capability for one person (master run §11). After a
 * quick unlock the wall holds this, not a session: a signed note saying
 * "this device may read <person>'s wall view until <time>". The server
 * checks the signature and the time on every person route and then acts
 * for the person itself, read-only, within those routes. Web Crypto only,
 * so it runs in the middleware's runtime as well as in a route.
 */

export const PERSON_TTL_MS = 10 * 60_000;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function key(secret: string): Promise<CryptoKey> {
  // Derived from the JWT secret with a fixed label, so a wall note is never a valid JWT and a JWT is never a valid note.
  return crypto.subtle.importKey("raw", enc.encode(`wall-person:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function mac(secret: string, body: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body))));
}

export type PersonNote = { uid: string; device: string; exp: number };

/** `uid.device.exp.mac` — the device id is in it so a note lifted from one wall is no use on another. */
export async function signPersonNote(secret: string, note: PersonNote): Promise<string> {
  const body = `${note.uid}.${note.device}.${note.exp}`;
  return `${body}.${await mac(secret, body)}`;
}

/** The note, when its signature holds, it has not run out, and it was signed for this device; otherwise null. */
export async function verifyPersonNote(secret: string, value: string | null | undefined, device: string, now: number = Date.now()): Promise<PersonNote | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [uid, dev, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!uid || !dev || !Number.isFinite(exp) || !sig) return null;
  if (dev !== device) return null;
  if (exp <= now) return null;
  const expected = await mac(secret, `${uid}.${dev}.${exp}`);
  if (expected.length !== sig.length) return null;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { uid, device: dev, exp } : null;
}
