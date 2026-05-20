export const COOKIE_NAME = "auth-token";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function signToken(payload: string): Promise<string> {
  const secret = process.env.AUTH_SECRET!;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payloadB64}.${sigHex}`;
}
