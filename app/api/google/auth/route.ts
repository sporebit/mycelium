import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: "GOOGLE_CLIENT_ID missing" }, { status: 500 });
    }

    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/google/callback`;

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
    });

    return NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
  } catch (err) {
    console.error("[google/auth]", err);
    return NextResponse.json({ error: "auth setup failed" }, { status: 500 });
  }
}
