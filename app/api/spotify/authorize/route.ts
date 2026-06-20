import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/spotify/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/spotify/callback`;
    const url = buildAuthUrl(redirectUri);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[spotify/authorize]", err);
    return NextResponse.json({ error: "auth setup failed" }, { status: 500 });
  }
}
