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
 * Why reconnecting failed with bad_state (found 2026-11-23): CONNECT and
 * RECONNECT were Next `<Link>`s, and the app router prefetches a link's
 * href as soon as it is on screen and again on hover, so /api/google/auth
 * ran several times per visit to Settings → Integrations and each run
 * replaced the cookie with a new nonce. The click itself went through the
 * router too (one RSC fetch that follows the redirect to Google, then a
 * full navigation), so by the time Google sent the person back the cookie
 * held a different nonce from the one in the link. Three things close it:
 * the links are plain anchors; the auth route answers a router fetch with
 * 204 and no cookie; and the cookie keeps the last few nonces, so a second
 * start (a second click, a second tab) does not break the first.
 *
 * The decisions are pure functions here so they can be tested without a
 * request; the routes only sequence them.
 */

export const STATE_COOKIE = "mycelium_google_state";
/** The nonce lives this long: enough for the consent screen, not for a link kept for later. */
export const STATE_MAX_AGE_SECONDS = 600;
/** How many sign-ins may be in flight at once; the oldest nonce falls off. */
export const STATES_KEPT = 5;
/**
 * The cookie's path: it must reach the callback, and the auth route too, so
 * a second start can keep the nonces already waiting (a path of only the
 * callback hid them from the auth route). Set and cleared with the same
 * attributes; a clear with other attributes is a different cookie.
 */
export const STATE_COOKIE_PATH = "/api/google";
/** Where the cookie lived before 2026-11-23; the callback clears that one too. */
export const STATE_COOKIE_OLD_PATH = "/api/google/callback";
/** The one place a sign-in comes back to (Settings → Integrations, which reads `?google=`). */
export const SETTINGS_RETURN = "/other/settings?tab=integrations";

export function settingsReturn(flag: string): string {
  return `${SETTINGS_RETURN}&google=${encodeURIComponent(flag)}`;
}

/**
 * A request the Next router makes on its own (a prefetch while the link is
 * on screen or hovered, or the RSC fetch of a soft navigation) rather than
 * a person arriving. Answered without a nonce, so it cannot disturb a
 * sign-in that is under way.
 */
export function isRouterFetch(headers: { get(name: string): string | null }): boolean {
  if (headers.get("next-router-prefetch") !== null) return true;
  if (headers.get("rsc") !== null) return true;
  const purpose = (headers.get("purpose") ?? headers.get("sec-purpose") ?? "").toLowerCase();
  return purpose.includes("prefetch");
}

/** The nonces held in the cookie, newest first. A nonce is base64url, so "." can separate them. */
export function unpackStates(cookie: string | null | undefined): string[] {
  if (!cookie) return [];
  return cookie.split(".").filter((s) => /^[A-Za-z0-9_-]{16,}$/.test(s));
}

/** The cookie value after a new start: the fresh nonce first, then the ones still waiting, at most STATES_KEPT. */
export function packStates(existing: string | null | undefined, fresh: string): string {
  return [fresh, ...unpackStates(existing).filter((s) => s !== fresh)].slice(0, STATES_KEPT).join(".");
}

/** Whether the state Google sent back is one this browser started. */
export function stateAccepted(sent: string | null | undefined, cookie: string | null | undefined): boolean {
  return unpackStates(cookie).some((s) => stateMatches(sent, s));
}

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
 * the address and pass it in. `storedState` is the cookie as sent (one
 * nonce or several).
 */
export function decideCallback(input: { sentState: string | null; storedState: string | null; email: string | null; allowed: readonly string[] }): CallbackDecision {
  if (!stateAccepted(input.sentState, input.storedState)) return { ok: false, reason: "state" };
  if (!input.email) return { ok: false, reason: "no_account" };
  if (!accountAllowed(input.email, input.allowed)) return { ok: false, reason: "not_allowed" };
  return { ok: true, email: input.email.toLowerCase() };
}
