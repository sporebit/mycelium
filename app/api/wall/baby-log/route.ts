import { NextRequest, NextResponse } from "next/server";
import { createRow } from "@/lib/family/resources";
import { familyCtx } from "@/lib/family/server";
import { createUserClient } from "@/lib/supabase/user";
import { unauthorised, wallDevice } from "@/lib/system/wallRequest";

export const runtime = "nodejs";

/**
 * POST /api/wall/baby-log { kind, how?, what?, ml? } — one tap on the board:
 * a feed, a nappy, a sleep. Written as the device, in the family space, so
 * the family page shows it as logged from the wall. No unlock: the baby log
 * is the household's.
 */
export async function POST(req: NextRequest) {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  try {
    const db = await createUserClient();
    const ctx = await familyCtx(db, device.device_user_id, device.team_space_id);
    if (!ctx) return NextResponse.json({ error: "No family space yet." }, { status: 404 });
    const made = await createRow("baby-log", { ...body, source: "wall" }, ctx);
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[wall/baby-log]", err);
    return NextResponse.json({ error: "Not saved." }, { status: 500 });
  }
}
