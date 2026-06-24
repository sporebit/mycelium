import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UID = () => process.env.USER_ID ?? "default";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL("/other/settings?google=denied", req.nextUrl.origin),
      );
    }
    if (!code) {
      return NextResponse.redirect(
        new URL("/other/settings?google=no_code", req.nextUrl.origin),
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL("/other/settings?google=config_error", req.nextUrl.origin),
      );
    }

    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/google/callback`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[google/callback] token exchange failed", res.status, text);
      return NextResponse.redirect(
        new URL("/other/settings?google=exchange_failed", req.nextUrl.origin),
      );
    }

    const tokens = await res.json();
    const expiresAt = new Date(
      Date.now() + (tokens.expires_in ?? 3600) * 1000,
    ).toISOString();

    const supabase = createServerClient();
    await supabase
      .from("user_settings")
      .update({
        google_refresh_token: tokens.refresh_token ?? null,
        google_access_token: tokens.access_token,
        google_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", UID());

    return NextResponse.redirect(
      new URL("/other/settings?google=connected", req.nextUrl.origin),
    );
  } catch (err) {
    console.error("[google/callback]", err);
    return NextResponse.redirect(
      new URL("/other/settings?google=error", req.nextUrl.origin),
    );
  }
}
