import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { LIMITS, anonClient, clientIp, takeToken } from "@/lib/system/rateLimit";

export const runtime = "nodejs";

/**
 * Password sign-in, proxied so it can be rate limited (P12 Part 5): per IP
 * and per email through the shared Postgres bucket. The session cookies are
 * written by the ssr client from this route handler. Returns whether a
 * second factor is now needed (a verified TOTP factor exists) or must be
 * enrolled (the role requires one and none exists).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "email and password are required" }, { status: 400 });

  const limiter = anonClient();
  const ip = clientIp(req.headers);
  const [ipOk, emailOk] = await Promise.all([
    takeToken(limiter, `login:ip:${ip}`, LIMITS.loginIp),
    takeToken(limiter, `login:email:${email}`, LIMITS.loginEmail),
  ]);
  if (!ipOk || !emailOk) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });

  const [{ data: level }, { data: requiresTotp }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.rpc("requires_totp"),
  ]);
  const mfaRequired = Boolean(level && level.nextLevel === "aal2" && level.currentLevel !== "aal2");
  const enrolRequired = !mfaRequired && level?.nextLevel !== "aal2" && requiresTotp === true;
  return NextResponse.json({ ok: true, mfaRequired, enrolRequired });
}
