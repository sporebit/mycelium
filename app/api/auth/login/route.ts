import { NextRequest, NextResponse } from "next/server";
import { COOKIE_MAX_AGE, COOKIE_NAME, signToken } from "@/lib/auth/cookie";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || !timingSafeEqual(String(password), expected)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const payload = JSON.stringify({ authed: true, ts: Date.now() });
  const token = await signToken(payload);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
