import { NextRequest, NextResponse } from "next/server";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import {
  PC_METRICS_PREFIX,
  PRINCIPAL_AAL_HEADER,
  PRINCIPAL_HEADER,
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
 *  6. Sensitive routes (/admin and friends) require aal2. Part 5 adds the
 *     ten-minute re-auth cookie on top.
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

  // 3. System principals.
  if (matchesBearer(authorization, process.env.CRON_SECRET)) {
    return passThrough(req, "system");
  }
  if (matchesSecret(req.headers.get("x-api-secret"), process.env.API_SECRET)) {
    return passThrough(req, "system", PHIL_AUTH_UID);
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
    // 6. Sensitive routes need a second factor.
    if (isSensitivePath(pathname) && !isAal2(aal)) {
      return withRefreshedCookies(forbiddenMfa(pathname));
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
      recordBreakGlassUse(req);
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

/** Continue to the route with the principal headers set (and any client-sent ones removed). */
function passThrough(
  req: NextRequest,
  principal: Principal,
  userId?: string,
  aal?: AssuranceLevel,
): NextResponse {
  const headers = stripPrincipalHeaders(new Headers(req.headers));
  headers.set(PRINCIPAL_HEADER, principal);
  if (userId) headers.set(PRINCIPAL_USER_HEADER, userId);
  if (aal) headers.set(PRINCIPAL_AAL_HEADER, aal);
  return NextResponse.next({ request: { headers } });
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

/**
 * TODO(P12 Part 5): replace with the audit writer in lib/system/audit.ts —
 * one audit_events row per request with principal = break_glass, the path,
 * ip and user agent. Middleware cannot reach the database until then; the
 * console line keeps the use visible in Vercel logs in the meantime.
 */
function recordBreakGlassUse(req: NextRequest): void {
  console.warn(
    `[break-glass] ${req.method} ${req.nextUrl.pathname} ip=${req.headers.get("x-forwarded-for") ?? "?"} ua=${req.headers.get("user-agent") ?? "?"}`,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
