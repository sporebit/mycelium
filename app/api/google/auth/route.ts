import { NextRequest, NextResponse } from "next/server";
import { isRouterFetch, newState, packStates, STATE_COOKIE, STATE_COOKIE_PATH, STATE_MAX_AGE_SECONDS } from "@/lib/google/oauth";

export const runtime = "nodejs";

/**
 * GET /api/google/auth — start the Google sign-in. Behind the auth gate, so
 * only a signed-in person reaches it. A random `state` goes to Google and
 * into a short-lived httpOnly cookie; the callback refuses anything that
 * does not carry one the cookie holds (family calendar spec §4.5).
 *
 * The cookie keeps the last few nonces rather than only the newest, so a
 * second click or a second tab does not break a sign-in already under way.
 * A request the Next router makes by itself (a prefetch, an RSC fetch) is
 * answered 204 with no cookie: before 2026-11-23 every such request minted
 * a nonce and reconnecting always ended in bad_state (see lib/google/oauth.ts).
 */
export async function GET(req: NextRequest) {
  if (isRouterFetch(req.headers)) {
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: "GOOGLE_CLIENT_ID missing" }, { status: 500 });
    }

    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/google/callback`;
    const state = newState();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    res.headers.set("cache-control", "no-store");
    // Every cookie of that name (an old-path one may linger for ten minutes after the 2026-11-23 change).
    const waiting = req.cookies.getAll(STATE_COOKIE).map((c) => c.value).join(".");
    res.cookies.set(STATE_COOKIE, packStates(waiting, state), {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: STATE_COOKIE_PATH,
      maxAge: STATE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("[google/auth]", err);
    return NextResponse.json({ error: "auth setup failed" }, { status: 500 });
  }
}
