import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runReminders } from "@/lib/gifts/engine";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/gift-reminders — once a morning, on the tick, after the
 * occasions job (spec §6). For each person, as that person: the task when
 * an occasion first enters its longest lead window (made once), and one
 * vague line (counts, never a name) on each lead day and two days out when
 * nothing is bought, inside the day's interruption budget. Nothing for an
 * occasion with a gift already given. Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const out = { users: 0, tasks: 0, nudges: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      const r = await withUser(uid, (db) => runReminders(db, uid));
      out.tasks += r.tasks;
      out.nudges += r.nudges;
      out.users += 1;
    } catch (err) {
      out.failed += 1;
      console.error(`[cron/gift-reminders] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", ...out });
}

export const GET = run;
export const POST = run;
