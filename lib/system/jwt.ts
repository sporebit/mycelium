/**
 * Minting short-lived Supabase user JWTs for system code.
 *
 * The project keeps its legacy HS256 JWT secret (locked decision, Part 0),
 * so a token signed with SUPABASE_JWT_SECRET carrying `role: authenticated`
 * and `sub: <userId>` is accepted by PostgREST exactly as a GoTrue-issued
 * one, and every RLS policy sees auth.uid() = that user. This is how cron,
 * webhooks and imports act FOR a user instead of bypassing RLS.
 *
 * WebCrypto only, so it runs on both the Node and edge runtimes. Never log
 * a minted token.
 */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(value: unknown): string {
  return b64url(enc.encode(JSON.stringify(value)));
}

export type MintOptions = {
  /** auth.users.id of the user to act as. */
  sub: string;
  /** The project's legacy HS256 JWT secret. */
  secret: string;
  /** Token lifetime in seconds. Default five minutes; system work is short. */
  ttlSeconds?: number;
  /** Issuer claim; GoTrue uses `${SUPABASE_URL}/auth/v1`. Informational. */
  issuer?: string;
  email?: string;
  /** Assurance level to claim. System actions never carry a second factor. */
  aal?: "aal1" | "aal2";
  now?: number;
};

export async function mintUserJwt(opts: MintOptions): Promise<string> {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const ttl = opts.ttlSeconds ?? 300;
  const header = { alg: "HS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    aud: "authenticated",
    role: "authenticated",
    sub: opts.sub,
    iat: now,
    exp: now + ttl,
    aal: opts.aal ?? "aal1",
    amr: [{ method: "system", timestamp: now }],
    app_metadata: { provider: "system", providers: ["system"] },
    user_metadata: {},
  };
  if (opts.issuer) payload.iss = opts.issuer;
  if (opts.email) payload.email = opts.email;

  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(opts.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

/** Decode a JWT payload without verifying it. For tests and diagnostics only. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? "";
  const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
  const bin = atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}
