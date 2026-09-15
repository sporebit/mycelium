import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { getSessionUser } from "@/lib/auth/session";
import { REAUTH_COOKIE, REAUTH_MAX_AGE, signReauth } from "@/lib/auth/reauth";
import { LIMITS, clientIp, takeToken } from "@/lib/system/rateLimit";

export const runtime = "nodejs";

/**
 * Re-authentication: a fresh TOTP verify sets the ten-minute cookie the
 * middleware demands on sensitive routes. Same lockout and rate limit as
 * sign-in verification. Passkey re-auth is not offered yet (the WebAuthn
 * ceremony would need a browser round-trip through a separate endpoint).
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (me.aal !== "aal2") return NextResponse.json({ error: "Verify your second factor at sign-in first", reason: "mfa_required" }, { status: 403 });
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return NextResponse.json({ error: "SUPABASE_JWT_SECRET is not set" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the six-digit code" }, { status: 400 });

  const supabase = await createUserClient();
  const { data: locked } = await supabase.rpc("second_factor_locked");
  if (locked === true) return NextResponse.json({ error: "Too many failed codes. Try again in 15 minutes.", locked: true }, { status: 423 });
  if (!(await takeToken(supabase, `totp:ip:${clientIp(req.headers)}`, LIMITS.totpVerify))) {
    return NextResponse.json({ error: "Too many attempts. Slow down." }, { status: 429 });
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return NextResponse.json({ error: "No authenticator is enrolled" }, { status: 400 });

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    const { data: nowLocked } = await supabase.rpc("second_factor_failed");
    return NextResponse.json({ error: "That code was not accepted", locked: nowLocked === true }, { status: nowLocked === true ? 423 : 401 });
  }
  await supabase.rpc("second_factor_succeeded");

  const token = await signReauth(me.id, secret);
  const res = NextResponse.json({ ok: true, expiresIn: REAUTH_MAX_AGE });
  res.cookies.set(REAUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: REAUTH_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
