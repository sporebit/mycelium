import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runFallbacks } from "@/lib/daily/prompts";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";
import { londonNow } from "@/lib/tickets/categories";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/daily-prompts — every five minutes through the day (master run
 * §6). For each person: the morning prompt at their fallback time if no
 * alarm sent it, and the evening close at theirs if the phone never went on
 * charge. Each goes once a day and never in quiet hours. No model call.
 * Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const now = londonNow();
  const time = `${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;
  const out = { users: 0, morning: 0, evening: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      const sent = await withUser(uid, (db) => runFallbacks(db, uid, time));
      out.users += 1;
      if (sent.morning) out.morning += 1;
      if (sent.evening) out.evening += 1;
    } catch (err) {
      // One person's failure does not stop the rest.
      out.failed += 1;
      console.error(`[cron/daily-prompts] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", time, ...out });
}

export const GET = run;
export const POST = run;
