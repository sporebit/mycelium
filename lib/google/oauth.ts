/**
 * The Google sign-in, locked to one account (family calendar spec §4.5;
 * Phil, 2026-11-21: "I don't want anyone else having access other than
 * Mycelium").
 *
 * Two gaps in the old connect flow mattered once the OAuth app went to
 * "In production", where any Google account can complete consent for this
 * client id:
 *   1. no `state`: a crafted callback link opened by a signed-in person
 *      would attach someone else's Google account to their Mycelium;
 *   2. no check on which account connected.
 * So: /api/google/auth sets a random nonce in a short-lived httpOnly cookie
 * and sends it as `state`; the callback refuses a missing or different
 * one. After the token exchange the callback reads the account's address
 * (the primary calendar's id, no extra scope) and, unless it is in
 * GOOGLE_ALLOWED_ACCOUNTS, revokes the token and stores nothing. An unset
 * allowlist refuses everyone.
 *
 * The decisions are pure functions here so they can be tested without a
 * request; the routes only sequence them.
 */

export const STATE_COOKIE = "mycelium_google_state";
/** The nonce lives this long: enough for the consent screen, not for a link kept for later. */
export const STATE_MAX_AGE_SECONDS = 600;

export function newState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time equality for two short strings; a missing side never matches. */
export function stateMatches(sent: string | null | undefined, stored: string | null | undefined): boolean {
  if (!sent || !stored || sent.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

/** The addresses that may connect, lower-cased and trimmed. Empty when the variable is unset or blank. */
export function allowedAccounts(env: string | undefined = process.env.GOOGLE_ALLOWED_ACCOUNTS): string[] {
  return (env ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether this account may connect. Fails closed: no list, no entry. */
export function accountAllowed(email: string | null | undefined, allowed: readonly string[]): boolean {
  if (!email) return false;
  return allowed.includes(email.trim().toLowerCase());
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Which Google account a token belongs to: the primary calendar's id is the
 * account's address, and reading it needs only the calendar scope already
 * granted. Null when Google refuses or the shape is unexpected.
 */
export async function connectedAccountEmail(accessToken: string, fetchFn: FetchLike = fetch): Promise<string | null> {
  try {
    const res = await fetchFn("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { id?: unknown };
    return typeof j.id === "string" && j.id.includes("@") ? j.id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Hand a token back to Google. Best effort: a failure here leaves a token that can only ever reach that account's own calendar. */
export async function revokeToken(token: string, fetchFn: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchFn("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type CallbackDecision =
  | { ok: true; email: string }
  | { ok: false; reason: "state" | "not_allowed" | "no_account" };

/**
 * The callback's decision, from what it has in hand. Pure: the routes fetch
 * the address and pass it in.
 */
export function decideCallback(input: { sentState: string | null; storedState: string | null; email: string | null; allowed: readonly string[] }): CallbackDecision {
  if (!stateMatches(input.sentState, input.storedState)) return { ok: false, reason: "state" };
  if (!input.email) return { ok: false, reason: "no_account" };
  if (!accountAllowed(input.email, input.allowed)) return { ok: false, reason: "not_allowed" };
  return { ok: true, email: input.email.toLowerCase() };
}
