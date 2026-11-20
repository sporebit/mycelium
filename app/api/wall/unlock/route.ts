import { NextRequest, NextResponse } from "next/server";
import { verifyQuickUnlock } from "@/lib/system/quickUnlock";
import { isTeamPerson } from "@/lib/system/wall";
import { grantPerson, revokePerson, unauthorised, wallDevice } from "@/lib/system/wallRequest";
import { PERSON_TTL_MS } from "@/lib/wall/personToken";

export const runtime = "nodejs";

/**
 * POST /api/wall/unlock { user_id, pin } — a person opens their own view on
 * this wall for ten minutes. Only a member of the wall's team, only with
 * their own PIN, throttled per wall and per person. The answer for a wrong
 * PIN and for a person with none is the same.
 */
export async function POST(req: NextRequest) {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  const body = (await req.json().catch(() => ({}))) as { user_id?: unknown; pin?: unknown };
  const uid = typeof body.user_id === "string" ? body.user_id : "";
  const pin = typeof body.pin === "string" ? body.pin.replace(/\s+/g, "") : "";
  if (!uid || !pin) return NextResponse.json({ error: "user_id and pin required" }, { status: 400 });
  if (!(await isTeamPerson(device.team_space_id, uid))) return NextResponse.json({ error: "That did not work." }, { status: 403 });
  const verdict = await verifyQuickUnlock(device.id, uid, pin);
  if (verdict === "throttled") return NextResponse.json({ error: "Too many tries. Wait a minute." }, { status: 429 });
  if (verdict !== "ok") {
    const res = NextResponse.json({ error: "That did not work." }, { status: 403 });
    revokePerson(res);
    return res;
  }
  const now = new Date();
  const res = NextResponse.json({ ok: true, until: now.getTime() + PERSON_TTL_MS });
  await grantPerson(res, device, uid, now);
  return res;
}
