import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { acceptPlan, ensurePlan } from "@/lib/daily/server";
import { viewOf } from "@/lib/daily/view";
import { dailySettings } from "@/lib/daily/settings";

export const runtime = "nodejs";

/**
 * GET /api/daily/today — today for the signed-in person: the focus card,
 * the "then" peek, the rest of the five, two swap options, and any ticket
 * whose date slipped a week ago (one Re-date / Someday / Drop card each).
 * Proposes the day if it has no plan yet, so opening the app after any gap
 * lands on one card and never on a backlog (research rule 2).
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
    return NextResponse.json(await viewOf(db, plan));
  } catch (err) {
    console.error("[daily/today GET]", err);
    return NextResponse.json({ error: "Could not load today" }, { status: 500 });
  }
}

/** POST { action: "accept" } — "Looks right": the proposed day becomes the day. */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "accept") return NextResponse.json({ error: "action must be accept" }, { status: 400 });
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
    if (plan.status === "proposed") await acceptPlan(db, plan.id, "tap");
    const fresh = await ensurePlan(db, uid, plan.day, { freeMinutes: settings.free_minutes });
    return NextResponse.json(await viewOf(db, fresh));
  } catch (err) {
    console.error("[daily/today POST]", err);
    return NextResponse.json({ error: "Could not accept today" }, { status: 500 });
  }
}
