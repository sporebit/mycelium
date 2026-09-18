/**
 * Pure request-classification helpers for middleware.ts.
 *
 * Kept free of Next.js and Node imports so they run on the edge runtime and
 * can be unit-tested without a request object. The middleware itself only
 * sequences these; the decisions live here.
 */

/** Routes that bypass the auth gate. Each validates its own secret. */
export const PUBLIC_PREFIXES: readonly string[] = [
  "/login",
  "/api/auth/",
  "/api/telegram/webhook",
  "/api/cron/reminders",
  "/api/health-import",
  "/api/cron/drops-monitor",
  // Part 4: the invite landing page and its preview are reachable before the
  // invitee has an account; accepting still requires a session (the route
  // checks). Cookies are still read by createUserClient() on public paths.
  "/invite/",
  "/api/invites/",
  // Tickets Part G: signature-verified webhooks (spec §7.1, §14.3), and the
  // smoke check the Vercel webhook runs before it closes a ticket.
  "/api/tickets/github",
  "/api/tickets/vercel",
  "/api/health",
];

/** Reachable with PC_METRICS_SECRET as a bearer token, this path only. */
export const PC_METRICS_PREFIX = "/api/studio/pc-metrics";

/**
 * Routes that require a second factor (aal2). Part 5 adds the re-auth cookie
 * check on top and extends this list with the routes it tags sensitive.
 */
export const SENSITIVE_PREFIXES: readonly string[] = ["/admin", "/api/admin", "/api/account/"];

/**
 * Request headers the middleware sets for downstream code. Anything a client
 * sends under these names is stripped before the middleware decides, so a
 * caller cannot claim a principal.
 */
export const PRINCIPAL_HEADER = "x-principal";
export const PRINCIPAL_USER_HEADER = "x-principal-user";
export const PRINCIPAL_AAL_HEADER = "x-principal-aal";
/** The request path, for audit rows written where the URL is not in scope. */
export const PRINCIPAL_PATH_HEADER = "x-principal-path";
/** Set only for API-token principals (tickets spec §14.4): the token's scopes as JSON. */
export const PRINCIPAL_SCOPES_HEADER = "x-principal-scopes";
export const PRINCIPAL_HEADERS = [
  PRINCIPAL_HEADER,
  PRINCIPAL_USER_HEADER,
  PRINCIPAL_AAL_HEADER,
  PRINCIPAL_PATH_HEADER,
  PRINCIPAL_SCOPES_HEADER,
] as const;

/**
 * Who a request runs as.
 *  - system: CRON_SECRET or API_SECRET. API_SECRET additionally carries
 *    Phil's uid in PRINCIPAL_USER_HEADER; no acting-user header is honoured.
 *  - user: a Supabase Auth session.
 *  - break_glass: the dormant HMAC cookie, only while BREAK_GLASS_ENABLED.
 */
export type Principal = "system" | "user" | "break_glass";

export type AssuranceLevel = "aal1" | "aal2";

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_PREFIXES.some((prefix) => {
    // A prefix may be written with or without a trailing slash; either way
    // it matches itself and everything beneath it, never a sibling
    // ("/administer" is not under "/admin").
    const base = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return pathname === base || pathname.startsWith(base + "/");
  });
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/** Constant-time string comparison. Length differences short-circuit, which leaks only length. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

/** True when `presented` is a non-empty match for a configured secret. Unset secret never matches. */
export function matchesSecret(
  presented: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!presented || !expected) return false;
  return timingSafeEqual(presented, expected);
}

/** True when an Authorization header is exactly `Bearer <expected>`. */
export function matchesBearer(
  authorization: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!authorization || !expected) return false;
  return timingSafeEqual(authorization, `Bearer ${expected}`);
}

/** Remove every principal header a client may have sent. Returns the same Headers for chaining. */
export function stripPrincipalHeaders(headers: Headers): Headers {
  for (const name of PRINCIPAL_HEADERS) headers.delete(name);
  return headers;
}

export function isAal2(aal: string | null | undefined): aal is "aal2" {
  return aal === "aal2";
}
