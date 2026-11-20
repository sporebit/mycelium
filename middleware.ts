import { NextRequest, NextResponse } from "next/server";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import {
  PC_METRICS_PREFIX,
  PRINCIPAL_AAL_HEADER,
  PRINCIPAL_HEADER,
  PRINCIPAL_PATH_HEADER,
  PRINCIPAL_SCOPES_HEADER,
  PRINCIPAL_USER_HEADER,
  isAal2,
  isApiPath,
  isPublicPath,
  isSensitivePath,
  matchesBearer,
  matchesSecret,
  stripPrincipalHeaders,
  type AssuranceLevel,
  type Principal,
} from "@/lib/auth/gate";
import {
  BREAK_GLASS_COOKIE,
  breakGlassEnabled,
  verifyBreakGlassToken,
} from "@/lib/auth/cookie";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { resolveApiToken, tokenAllows } from "@/lib/system/apiTokens";
import { REAUTH_COOKIE, verifyReauth } from "@/lib/auth/reauth";

/**
 * The auth gate. Order matters and is fixed by P12 Part 1:
 *
 *  1. PUBLIC_PREFIXES pass straight through; each route validates its own
 *     secret.
 *  2. PC_METRICS_SECRET admits its one path, as before.
 *  3. CRON_SECRET and API_SECRET are the system principal. API_SECRET acts
 *     as Phil; no acting-user header from the caller is ever honoured.
 *  4. Supabase Auth session: refreshed on every request (the @supabase/ssr
 *     pattern), verified with getClaims(), and its identity passed down in
 *     request headers the client could not have set.
 *  5. Break-glass: only while BREAK_GLASS_ENABLED === "true", and only if the
 *     cookie verifies against BREAK_GLASS_SECRET. Acts as Phil.
 *  6. Sensitive routes (/admin, /api/admin, /api/account) require aal2 AND
 *     a re-auth cookie younger than ten minutes (Part 5): the second factor
 *     must have been presented recently, not just at sign-in.
 *
 * Downstream code learns who is calling from x-principal, x-principal-user
 * and x-principal-aal. Those headers are stripped from the incoming request
 * before anything is decided, so they are trustworthy on the way in to a
 * route handler and meaningless from a browser.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Public routes.
  if (isPublicPath(pathname)) return NextResponse.next();

  const authorization = req.headers.get("authorization");

  // 2. PC metrics: path-scoped shared secret. The route handler re-checks it.
  if (
    pathname.startsWith(PC_METRICS_PREFIX) &&
    matchesBearer(authorization, process.env.PC_METRICS_SECRET)
  ) {
    return passThrough(req, "system");
  }

  // 3. System principals. A shared secret is not a person with a second
  // factor, so it never reaches a sensitive path (admin, account): before
  // 2026-11-20 the secret was checked first and the sensitive check never ran.
  if (matchesBearer(authorization, process.env.CRON_SECRET)) {
    if (isSensitivePath(pathname)) return forbiddenMfa(pathname);
    return passThrough(req, "system");
  }
  if (matchesSecret(req.headers.get("x-api-secret"), process.env.API_SECRET)) {
    if (isSensitivePath(pathname)) return forbiddenMfa(pathname);
    return passThrough(req, "system", PHIL_AUTH_UID);
  }

  // 3b. Scoped API tokens (tickets spec §14.4): `Bearer mtk_…` resolves to
  // its owning user; a request outside the token's route/verb scope is 403
  // and audited by the route (the scopes travel in a principal header).
  if (authorization?.startsWith("Bearer mtk_")) {
    const principal = await resolveApiToken(authorization.slice(7).trim());
    if (!principal) {
      return NextResponse.json({ error: "Unauthorized", reason: "bad_token" }, { status: 401 });
    }
    if (isSensitivePath(pathname) || !tokenAllows(principal.scopes, req.method, pathname)) {
      console.warn(`[api-token] out of scope: ${principal.name} ${req.method} ${pathname}`);
      return NextResponse.json({ error: "Forbidden", reason: "token_scope" }, { status: 403 });
    }
    return passThrough(req, "user", principal.user_id, "aal1", JSON.stringify(principal.scopes));
  }

  // 4. Supabase Auth session.
  const cookiesToSet: Parameters<
    NonNullable<Parameters<typeof createSsrServerClient>[2]["cookies"]["setAll"]>
  >[0] = [];
  const supabase = createSsrServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const c of list) {
            cookiesToSet.push(c);
            // Downstream server code reads the request cookies; a refresh
            // must be visible there too, not only on the response.
            req.cookies.set(c.name, c.value);
          }
        },
      },
    },
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as
    | { sub?: string; aal?: string }
    | undefined;

  const withRefreshedCookies = (res: NextResponse) => {
    for (const { name, value, options } of cookiesToSet) {
      res.cookies.set(name, value, options);
    }
    return res;
  };

  if (claims?.sub) {
    const aal: AssuranceLevel = isAal2(claims.aal) ? "aal2" : "aal1";
    // 5a. Will the database serve this session? It refuses one that was
    // signed out from another device, and one whose role now requires an
    // authenticator it does not have (0160). Without asking, the person saw
    // empty pages and 500s; with the answer they are taken where they can
    // act. The database remains the judge: if the question cannot be asked,
    // the request goes on and the database answers it as before.
    const state = await sessionState(supabase);
    if (state === "session_ended") return sessionEnded(req);
    if (state === "enrol_required" && !ENROL_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return withRefreshedCookies(enrolOwed(req));
    }
    // 5b. A second factor that is enrolled is required. A password (or a
    // magic link) alone leaves the session at aal1; if this account has an
    // authenticator, that session may only finish signing in. The database
    // refuses such a session too (0160); this is so the person sees the
    // code prompt instead of empty pages. Read from the session cookie, no
    // network call.
    if (!isAal2(aal)) {
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.nextLevel === "aal2") return withRefreshedCookies(secondFactorOwed(req));
    }
    // 6. Sensitive routes need a second factor, presented recently.
    if (isSensitivePath(pathname)) {
      if (!isAal2(aal)) return withRefreshedCookies(forbiddenMfa(pathname));
      const fresh = await verifyReauth(
        req.cookies.get(REAUTH_COOKIE)?.value,
        claims.sub,
        process.env.SUPABASE_JWT_SECRET,
      );
      if (!fresh) return withRefreshedCookies(forbiddenReauth(pathname));
    }
    return withRefreshedCookies(passThrough(req, "user", claims.sub, aal));
  }

  // 5. Break-glass. The cookie is not even inspected while the flag is off.
  if (breakGlassEnabled()) {
    const payload = await verifyBreakGlassToken(
      req.cookies.get(BREAK_GLASS_COOKIE)?.value,
      process.env.BREAK_GLASS_SECRET,
    );
    if (payload) {
      // Every request under break-glass is audited by createUserClient()
      // (lib/supabase/user.ts) using the path header set below — the
      // middleware itself has no database client.
      console.warn(`[break-glass] ${req.method} ${pathname}`);
      // No second factor exists on this path, so it can never reach a
      // sensitive route. Break-glass is for getting data out, not admin.
      if (isSensitivePath(pathname)) return forbiddenMfa(pathname);
      return passThrough(req, "break_glass", PHIL_AUTH_UID, "aal1");
    }
  }

  // No principal. APIs get 401; pages go to /login.
  if (isApiPath(pathname)) {
    return withRefreshedCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", pathname);
  return withRefreshedCookies(NextResponse.redirect(loginUrl));
}

/** Where someone who must set up an authenticator may still go: the page that does it, and signing out. */
const ENROL_PATHS = ["/other/settings/security", "/login"];

type SessionState = "ok" | "session_ended" | "enrol_required" | "mfa_required" | "anonymous";

/**
 * One question to the database per request. Not remembered between
 * requests: a first version kept a "yes" for fifteen seconds, and in that
 * window a session that had just been signed out, or a person who had just
 * become an owner, still looked fine and got the empty pages this exists to
 * prevent. Nothing the middleware can see says when a "yes" stops being
 * true, so it asks each time. If the question cannot be asked in time the
 * request goes on; the database still refuses what it must.
 */
async function sessionState(supabase: ReturnType<typeof createSsrServerClient>): Promise<SessionState> {
  try {
    const { data, error } = await supabase.rpc("session_state").abortSignal(AbortSignal.timeout(2_500));
    if (error || typeof data !== "string") return "ok";
    return data as SessionState;
  } catch {
    return "ok";
  }
}

/** A session ended from elsewhere: APIs get 401, pages go to sign-in, and the dead cookies are dropped. */
function sessionEnded(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  let res: NextResponse;
  if (isApiPath(pathname)) {
    res = NextResponse.json({ error: "Unauthorized", reason: "session_ended" }, { status: 401 });
  } else {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    res = NextResponse.redirect(url);
  }
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) res.cookies.delete(c.name);
  }
  return res;
}

/** A role that requires an authenticator, and none set up: APIs get 403 with the reason, pages go to the page that sets one up. */
function enrolOwed(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "Forbidden", reason: "enrol_required" }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/other/settings/security";
  url.search = "";
  url.searchParams.set("enrol", "totp");
  return NextResponse.redirect(url);
}

/** Continue to the route with the principal headers set (and any client-sent ones removed). */
function passThrough(
  req: NextRequest,
  principal: Principal,
  userId?: string,
  aal?: AssuranceLevel,
  scopes?: string,
): NextResponse {
  const headers = stripPrincipalHeaders(new Headers(req.headers));
  headers.set(PRINCIPAL_HEADER, principal);
  headers.set(PRINCIPAL_PATH_HEADER, req.nextUrl.pathname);
  if (userId) headers.set(PRINCIPAL_USER_HEADER, userId);
  if (aal) headers.set(PRINCIPAL_AAL_HEADER, aal);
  if (scopes) headers.set(PRINCIPAL_SCOPES_HEADER, scopes);
  return NextResponse.next({ request: { headers } });
}

/** A session that still owes its second factor: APIs get 403, pages go to the code prompt. */
function secondFactorOwed(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "Forbidden", reason: "mfa_required" }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("step", "mfa");
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

function forbiddenReauth(pathname: string): NextResponse {
  if (isApiPath(pathname)) {
    return NextResponse.json(
      { error: "Forbidden", reason: "reauth_required" },
      { status: 403 },
    );
  }
  const url = `/other/settings/security?reauth=1&next=${encodeURIComponent(pathname)}`;
  return new NextResponse(
    `Forbidden: confirm your second factor again to open this page: ${url}`,
    { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

function forbiddenMfa(pathname: string): NextResponse {
  if (isApiPath(pathname)) {
    return NextResponse.json(
      { error: "Forbidden", reason: "mfa_required" },
      { status: 403 },
    );
  }
  return new NextResponse(
    "Forbidden: this page requires a second factor. Verify at /login?step=mfa or enrol one under Settings > Security.",
    { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
