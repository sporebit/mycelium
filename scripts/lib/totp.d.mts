/** Types for totp.mjs (RFC 6238 codes). */
export function base32Decode(text: string): Buffer;
export function totp(secret: string, atMs?: number): string;
