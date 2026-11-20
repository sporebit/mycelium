import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runNotices } from "@/lib/daily/noticesServer";
import { runFallbacks } from "@/lib/daily/prompts";
import { tellSendersOfDone } from "@/lib/system/nudges";
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
  const out = { users: 0, morning: 0, evening: 0, notices: 0, nudges_told: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      const sent = await withUser(uid, (db) => runFallbacks(db, uid, time));
      out.users += 1;
      if (sent.morning) out.morning += 1;
      if (sent.evening) out.evening += 1;
      // Notices before a scheduled switch (research rule 27): a ticket with a time today, or the week's close-out at its slot.
      out.notices += await withUser(uid, (db) => runNotices(db, uid)).then(
        (r) => r.sent,
        (err) => {
          console.error(`[cron/daily-prompts] notices for ${uid}:`, err);
          return 0;
        },
      );
      // Anyone who nudged this person about something now finished is told, once (research rule 30).
      out.nudges_told += await tellSendersOfDone(uid).catch((err) => {
        console.error(`[cron/daily-prompts] nudges for ${uid}:`, err);
        return 0;
      });
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
