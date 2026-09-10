import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { getSessionUser } from "@/lib/auth/session";
import { LIMITS, clientIp, takeToken } from "@/lib/system/rateLimit";

export const runtime = "nodejs";

/**
 * TOTP verification for sign-in, proxied so failures count towards the
 * lockout (ten in fifteen minutes, migration 0114) and the attempt rate is
 * capped. On success the session is upgraded to aal2 in the cookies.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the six-digit code" }, { status: 400 });

  const supabase = await createUserClient();

  const { data: locked } = await supabase.rpc("second_factor_locked");
  if (locked === true) {
    return NextResponse.json({ error: "Too many failed codes. Try again in 15 minutes.", locked: true }, { status: 423 });
  }
  if (!(await takeToken(supabase, `totp:ip:${clientIp(req.headers)}`, LIMITS.totpVerify))) {
    return NextResponse.json({ error: "Too many attempts. Slow down." }, { status: 429 });
  }

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (listError || !factor) {
    return NextResponse.json({ error: listError?.message ?? "No authenticator is enrolled" }, { status: 400 });
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    const { data: nowLocked } = await supabase.rpc("second_factor_failed");
    return NextResponse.json(
      { error: nowLocked === true ? "Too many failed codes. Locked for 15 minutes." : "That code was not accepted", locked: nowLocked === true },
      { status: nowLocked === true ? 423 : 401 },
    );
  }
  await supabase.rpc("second_factor_succeeded");
  return NextResponse.json({ ok: true });
}
