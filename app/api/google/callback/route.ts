import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { updateUserSettings } from "@/lib/settings/userSettingsRow";
import { allowedAccounts, connectedAccountEmail, decideCallback, revokeToken, settingsReturn, STATE_COOKIE, STATE_COOKIE_OLD_PATH, STATE_COOKIE_PATH, stateAccepted } from "@/lib/google/oauth";

export const runtime = "nodejs";

/**
 * GET /api/google/callback — finish the Google sign-in (family calendar
 * spec §4.5). The `state` must match the cookie the auth route set; the
 * account that consented must be one named in GOOGLE_ALLOWED_ACCOUNTS.
 * Anything else revokes the token on the spot and stores nothing, and the
 * person is told in Settings → Integrations in plain words (`?google=`
 * opens that tab). The address of the account that did connect is kept
 * beside the tokens. The cookie may hold several nonces (a second click or
 * tab); the one Google sends back must be among them.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  // `account` travels only for a refusal, so Settings can say which address was turned away.
  const back = (flag: string, account?: string | null) => {
    const res = NextResponse.redirect(new URL(settingsReturn(flag, account), origin));
    res.headers.set("cache-control", "no-store");
    const secure = origin.startsWith("https://");
    res.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: STATE_COOKIE_PATH, maxAge: 0 });
    // The response cookie jar is keyed by name, so the clear for the old path goes on as a raw header.
    res.headers.append("set-cookie", `${STATE_COOKIE}=; Path=${STATE_COOKIE_OLD_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
    return res;
  };
  try {
    const code = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");
    const sentState = req.nextUrl.searchParams.get("state");
    // Every cookie of that name: the browser sends one per path it was set on.
    const storedState = req.cookies.getAll(STATE_COOKIE).map((c) => c.value).join(".") || null;

    if (error) return back("denied");
    // The state is checked before the code is spent, so a crafted link does not even reach Google.
    if (!stateAccepted(sentState, storedState)) return back("bad_state");
    if (!code) return back("no_code");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return back("config_error");

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
      return back("exchange_failed");
    }

    const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    const email = await connectedAccountEmail(tokens.access_token);
    const decision = decideCallback({ sentState, storedState, email, allowed: allowedAccounts() });
    if (!decision.ok) {
      // Not ours: give the token back and keep nothing. The refresh token is
      // what would outlive this request, so it is the one to revoke.
      await revokeToken(tokens.refresh_token ?? tokens.access_token);
      console.warn("[google/callback] refused a Google account:", decision.reason, email ? email.replace(/^(.).*(@.*)$/, "$1…$2") : "(no address)");
      return back(decision.reason === "not_allowed" ? "not_allowed" : "no_account", decision.reason === "not_allowed" ? email : null);
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    const supabase = await createUserClient();
    await updateUserSettings(
      supabase,
      {
        google_refresh_token: tokens.refresh_token ?? null,
        google_access_token: tokens.access_token,
        google_token_expires_at: expiresAt,
        google_sync_error: null,
        google_account_email: decision.email,
      },
      { select: "id" },
    );

    return back("connected");
  } catch (err) {
    console.error("[google/callback]", err);
    return back("error");
  }
}
