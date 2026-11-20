import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runBudgetAlerts, runUnusualAlert } from "@/lib/finance/billsServer";
import { categoriseNew } from "@/lib/finance/categorise";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/finance — once a morning (master run §10). For each person:
 * a nudge when a category has passed 80% of the month's budget, and one
 * when it has passed all of it (each once a month); and one when the
 * latest import brought a payment larger than usual (once a day). Each a
 * percentage or a count and never an amount, each inside the day's three.
 * Reads only that person's own finance rows, as that person. No model
 * call. Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const out = { users: 0, nudges: 0, categorised: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      await withUser(uid, async (db) => {
        // First the morning's slice of anything still uncategorised (an
        // import bigger than one run could place, or a model that was not
        // reachable at the time): rules, memory, then the model. Silent.
        const placed = await categoriseNew(db, 200).catch((err) => {
          console.error(`[cron/finance] categorise ${uid}:`, err);
          return null;
        });
        if (placed) out.categorised += placed.ruleMatched + placed.remembered + placed.aiCategorised;
        out.nudges += (await runBudgetAlerts(db, uid)) + (await runUnusualAlert(db, uid));
      });
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
