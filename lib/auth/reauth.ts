/**
 * Re-authentication cookie (P12 Part 5).
 *
 * Sensitive routes (/admin, account deletion, …) need more than an aal2
 * session: the second factor must have been presented recently. After a
 * fresh TOTP verify, /api/auth/reauth sets this cookie — an HMAC over
 * {sub, iat}, keyed on SUPABASE_JWT_SECRET, good for ten minutes and bound
 * to the user. The middleware checks it on every sensitive request.
 *
 * Edge-safe: WebCrypto only.
 */
export const REAUTH_COOKIE = "reauth";
export const REAUTH_MAX_AGE = 10 * 60;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function key(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signReauth(sub: string, secret: string, now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ sub, iat: now })));
  const sig = await crypto.subtle.sign("HMAC", await key(secret, "sign"), enc.encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/** True when the token is intact, for this user, and younger than the max age. */
export async function verifyReauth(
  token: string | null | undefined,
  sub: string,
  secret: string | undefined,
  now = Date.now(),
  maxAgeSeconds = REAUTH_MAX_AGE,
): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = fromB64url(token.slice(dot + 1));
  if (!sig) return false;
  const ok = await crypto.subtle.verify("HMAC", await key(secret, "verify"), sig, enc.encode(payload));
  if (!ok) return false;
  const raw = fromB64url(payload);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as { sub?: unknown; iat?: unknown };
    if (parsed.sub !== sub || typeof parsed.iat !== "number") return false;
    if (parsed.iat > now + 60_000) return false;
    return now - parsed.iat <= maxAgeSeconds * 1000;
  } catch {
    return false;
  }
}
