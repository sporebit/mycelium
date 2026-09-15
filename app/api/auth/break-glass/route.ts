import { NextRequest, NextResponse } from "next/server";
import {
  BREAK_GLASS_COOKIE,
  BREAK_GLASS_MAX_AGE,
  breakGlassEnabled,
  breakGlassSecretMatches,
  signBreakGlassToken,
} from "@/lib/auth/cookie";

/**
 * Issues the break-glass cookie. Dormant unless BREAK_GLASS_ENABLED is
 * "true": while it is not, the route answers 404 so the path is
 * indistinguishable from absent. When it is, the caller must present
 * BREAK_GLASS_SECRET itself; the cookie it receives is an HMAC over an
 * issued-at, keyed on that same secret, valid for one hour, and the
 * middleware only ever honours it while the flag stays on.
 *
 * Emergency use only. Every request made under the cookie is logged
 * (Part 5 turns that into audit rows).
 */
export async function POST(req: NextRequest) {
  if (!breakGlassEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const presented = typeof body?.secret === "string" ? body.secret : "";
  if (!breakGlassSecretMatches(presented)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const token = await signBreakGlassToken(process.env.BREAK_GLASS_SECRET!);
  const res = NextResponse.json({ ok: true, expiresIn: BREAK_GLASS_MAX_AGE });
  res.cookies.set(BREAK_GLASS_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: BREAK_GLASS_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
