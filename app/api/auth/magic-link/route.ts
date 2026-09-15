import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { safeNextPath } from "@/lib/auth/next-path";
import { LIMITS, anonClient, clientIp, takeToken } from "@/lib/system/rateLimit";

export const runtime = "nodejs";

/**
 * Magic-link request, proxied for rate limiting (per IP and per email).
 * Never creates a user: sign-up happens only through an invite. The
 * response is the same whether or not the address exists.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; next?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  const next = safeNextPath(typeof body.next === "string" ? body.next : null);

  const limiter = anonClient();
  const ip = clientIp(req.headers);
  const [ipOk, emailOk] = await Promise.all([
    takeToken(limiter, `magic:ip:${ip}`, LIMITS.magicLinkIp),
    takeToken(limiter, `magic:email:${email}`, LIMITS.magicLinkEmail),
  ]);
  if (!ipOk || !emailOk) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const supabase = await createUserClient();
  const origin = process.env.NODE_ENV === "production" && process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL : req.nextUrl.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: false,
    },
  });
  // "Signups not allowed" means the address is unknown; say nothing different.
  if (error && !/signup/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
