import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/system/withUser";
import { boundUser } from "@/lib/system/bindings";
import { matchesBearer } from "@/lib/auth/gate";
import { sendDueReminders } from "@/lib/tickets/reminders";
import { londonNow } from "@/lib/tickets/categories";

export const runtime = "nodejs";

/**
 * GET /api/cron/reminders — the pre-existing cron-job.org schedule, kept so
 * nothing external changes. Since the reminders fold (0119) it sends due
 * `kind = reminder` tickets; /api/cron/tickets-checkins does the same every
 * 15 minutes, so either schedule alone is enough.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.REMINDERS_CRON_SECRET;
  if (!expected || !matchesBearer(req.headers.get("authorization"), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const today = londonNow().date;
    const result = await withUser(boundUser("cron"), (db) => sendDueReminders(db, today));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/reminders]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
