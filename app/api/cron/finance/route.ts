import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runBudgetAlerts } from "@/lib/finance/billsServer";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/finance — once a morning (master run §10). For each person
 * with a budget: a nudge when a category has passed 80% of the month's
 * budget, and one when it has passed all of it; each once a month, each a
 * percentage and never an amount, each inside the day's three. Reads only
 * that person's own finance rows, as that person. No model call.
 * Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const out = { users: 0, nudges: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      out.nudges += await withUser(uid, (db) => runBudgetAlerts(db, uid));
      out.users += 1;
    } catch (err) {
      // One person's failure does not stop the rest.
      out.failed += 1;
      console.error(`[cron/finance] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", ...out });
}

export const GET = run;
export const POST = run;
