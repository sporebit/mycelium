import { NextRequest, NextResponse } from "next/server";
import { newState, STATE_COOKIE, STATE_MAX_AGE_SECONDS } from "@/lib/google/oauth";

export const runtime = "nodejs";

/**
 * GET /api/google/auth — start the Google sign-in. Behind the auth gate, so
 * only a signed-in person reaches it. A random `state` goes to Google and
 * into a short-lived httpOnly cookie; the callback refuses anything that
 * does not carry both, the same (family calendar spec §4.5).
 */
export async function GET(req: NextRequest) {
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
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/api/google/callback",
      maxAge: STATE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    console.error("[google/auth]", err);
    return NextResponse.json({ error: "auth setup failed" }, { status: 500 });
  }
}
