import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/spotify/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(new URL("/studio/spotify?error=denied", req.nextUrl.origin));
    }
    if (!code) {
      return NextResponse.redirect(new URL("/studio/spotify?error=no_code", req.nextUrl.origin));
    }

    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/spotify/callback`;
    await exchangeCode(code, redirectUri);

    return NextResponse.redirect(new URL("/studio/spotify?connected=1", req.nextUrl.origin));
  } catch (err) {
    console.error("[spotify/callback]", err);
    return NextResponse.redirect(new URL("/studio/spotify?error=exchange_failed", req.nextUrl.origin));
  }
}
