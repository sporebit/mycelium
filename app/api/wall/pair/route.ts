import { NextRequest, NextResponse } from "next/server";
import { WALL_DEVICE_COOKIE } from "@/lib/auth/gate";
import { LIMITS, clientIp, takeToken } from "@/lib/system/rateLimit";
import { redeemPairing } from "@/lib/system/wall";

export const runtime = "nodejs";

/**
 * POST /api/wall/pair { code } — the wall types the eight-digit code shown
 * in Settings → Walls. A right code answers with the device cookie set; the
 * code is spent. Public by design (the wall has nothing yet), rate-limited
 * by address, and the answer never says why a code failed.
 */
export async function POST(req: NextRequest) {
  if (!(await takeToken(`wall-pair:${clientIp(req.headers)}`, LIMITS.wallPair))) {
    return NextResponse.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";
  const got = await redeemPairing(code);
  if (!got) return NextResponse.json({ error: "That code did not work." }, { status: 400 });
  const res = NextResponse.json({ ok: true, device_id: got.device_id });
  res.cookies.set(WALL_DEVICE_COOKIE, got.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86_400,
  });
  return res;
}

/** DELETE — the wall forgets its pairing (the token stays valid until the owner revokes it in Settings). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(WALL_DEVICE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
