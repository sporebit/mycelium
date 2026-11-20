import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { ensurePlan } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { viewOf } from "@/lib/daily/view";
import { moveTicket } from "@/lib/tickets/server";
import { addDays, todayLondon } from "@/lib/tickets/when";

export const runtime = "nodejs";

/**
 * POST /api/daily/slipped — the one card a ticket gets when its date
 * slipped a week ago (research rule 14): { ticket_id, decision, date? }
 *   redate   a new date (tomorrow if none is given); it may be planned again
 *   someday  no date; out of the daily proposal until brought back
 *   drop     cancelled
 * The ticket leaves today's "slipped" list whichever is chosen.
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ticket_id?: unknown; decision?: unknown; date?: unknown };
  const ticketId = typeof body.ticket_id === "string" ? body.ticket_id : "";
  const decision = typeof body.decision === "string" ? body.decision : "";
  if (!/^[0-9a-f-]{36}$/i.test(ticketId) || !["redate", "someday", "drop"].includes(decision)) {
    return NextResponse.json({ error: "ticket_id and decision (redate, someday or drop) are required" }, { status: 400 });
  }
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
    if (!plan.slipped.includes(ticketId)) return NextResponse.json({ error: "That ticket is not waiting for a decision today" }, { status: 404 });

    const today = todayLondon();
    if (decision === "redate") {
      const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && body.date >= today ? body.date : addDays(today, 1);
      const { error } = await db
        .from("tickets")
        .update({ scheduled_on: date, deadline_on: null, due_window: "date", someday: false, slip_offered_on: null, updated_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (error) throw new Error(error.message);
    } else if (decision === "someday") {
      const { error } = await db
        .from("tickets")
        .update({ someday: true, scheduled_on: null, deadline_on: null, due_window: "someday", updated_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (error) throw new Error(error.message);
    } else {
      const moved = await moveTicket(db, ticketId, "cancelled");
      if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
    }
    await db.from("day_plans").update({ slipped: plan.slipped.filter((id) => id !== ticketId) }).eq("id", plan.id);
    const fresh = await ensurePlan(db, uid, plan.day, { freeMinutes: settings.free_minutes });
    return NextResponse.json(await viewOf(db, fresh));
  } catch (err) {
    console.error("[daily/slipped POST]", err);
    return NextResponse.json({ error: "That did not save. Nothing was lost; try again." }, { status: 500 });
  }
}
