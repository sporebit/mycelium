/**
 * Break-glass cookie: the dormant emergency path into the app.
 *
 * Before P12 this file minted the `auth-token` cookie that admitted every
 * browser session, keyed on AUTH_SECRET and unlocked by DASHBOARD_PASSWORD.
 * Supabase Auth now owns sign-in. The HMAC helper survives, re-keyed on
 * BREAK_GLASS_SECRET, for one purpose: if Supabase Auth is unavailable or
 * Phil is locked out, he can flip BREAK_GLASS_ENABLED to "true", post the
 * secret to /api/auth/break-glass, and act as himself for one hour. The
 * middleware refuses the cookie outright while the flag is off, so a leaked
 * secret is inert until an emergency is declared. Every request made under
 * it is audited (Part 5 resolves the writer; middleware.ts carries the TODO).
 *
 * Edge-safe: WebCrypto and TextEncoder only, no Buffer.
 */
import { timingSafeEqual } from "@/lib/auth/gate";

export const BREAK_GLASS_COOKIE = "break-glass";
/** One hour. An emergency session, not a login. */
export const BREAK_GLASS_MAX_AGE = 60 * 60;

type Env = Record<string, string | undefined>;

export function breakGlassEnabled(env: Env = process.env): boolean {
  return env.BREAK_GLASS_ENABLED === "true";
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
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

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export type BreakGlassPayload = { iat: number };

/**
 * Mint a break-glass token: base64url(payload).base64url(hmac). The payload
 * carries only an issued-at; who it acts as is fixed (Phil) by the middleware.
 */
export async function signBreakGlassToken(
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const payload: BreakGlassPayload = { iat: now };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verify a break-glass token against the secret and the max age. Returns the
 * payload on success, null on any failure. Does NOT consult the enable flag;
 * the caller checks that first so the cookie is never even inspected while
 * the path is dormant.
 */
export async function verifyBreakGlassToken(
  token: string | null | undefined,
  secret: string | undefined,
  now: number = Date.now(),
  maxAgeSeconds: number = BREAK_GLASS_MAX_AGE,
): Promise<BreakGlassPayload | null> {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const sig = fromBase64Url(sigB64);
  if (!sig) return null;

  const key = await hmacKey(secret, "verify");
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(payloadB64),
  );
  if (!ok) return null;

  const raw = fromBase64Url(payloadB64);
  if (!raw) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { iat?: unknown }).iat !== "number"
  ) {
    return null;
  }
  const { iat } = payload as BreakGlassPayload;
  if (iat > now + 60_000) return null; // issued in the future: clock skew beyond a minute is a forgery
  if (now - iat > maxAgeSeconds * 1000) return null;
  return { iat };
}

/** Constant-time comparison of a presented secret with the configured one. */
export function breakGlassSecretMatches(
  presented: string,
  env: Env = process.env,
): boolean {
  const expected = env.BREAK_GLASS_SECRET;
  if (!expected || !presented) return false;
  return timingSafeEqual(presented, expected);
}
