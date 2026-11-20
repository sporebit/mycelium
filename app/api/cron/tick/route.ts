import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { dueJobs } from "@/lib/system/schedule";
import { londonNow } from "@/lib/tickets/categories";
import { GET as briefing } from "../../briefings/morning/route";
import { GET as dailyPrompts } from "../daily-prompts/route";
import { GET as daylog } from "../daylog/route";
import { GET as family } from "../family/route";
import { GET as finance } from "../finance/route";
import { GET as giftOccasions } from "../gift-occasions/route";
import { GET as giftReminders } from "../gift-reminders/route";
import { GET as quotesResearch } from "../quotes-research/route";
import { GET as reminders } from "../reminders/route";
import { GET as rundowns } from "../rundowns/route";
import { GET as ticketsCheckins } from "../tickets-checkins/route";

export const runtime = "nodejs";
export const maxDuration = 120;

type Handler = (req: NextRequest) => Promise<Response>;

const HANDLERS: Record<string, Handler> = {
  "/api/briefings/morning": briefing,
  "/api/cron/daily-prompts": dailyPrompts,
  "/api/cron/reminders": reminders,
  "/api/cron/tickets-checkins": ticketsCheckins,
  "/api/cron/daylog": daylog,
  "/api/cron/family": family,
  "/api/cron/finance": finance,
  "/api/cron/gift-occasions": giftOccasions,
  "/api/cron/gift-reminders": giftReminders,
  "/api/cron/quotes-research": quotesResearch,
  "/api/cron/rundowns": rundowns,
};

/**
 * /api/cron/tick — the one door for everything that must happen during the
 * day. Knocked on every five minutes (the PC worker; one cron-job.org job
 * when the PC is off). Works out from lib/system/schedule.ts which jobs are
 * due in this five-minute slot and runs each in turn; one failing does not
 * stop the others. Every job is safe to run twice, so two knockers in the
 * same slot do no harm.
 *
 * Bearer CRON_SECRET; GET or POST. `?dry=1` lists what is due and runs
 * nothing.
 */
async function run(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!matchesBearer(authorization, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const now = londonNow();
  const due = dueJobs(now.minutes);
  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ ok: true, status: "ok", london_minutes: now.minutes, due: due.map((j) => j.path) });
  }
  const ran: Array<{ path: string; status: number; ms: number }> = [];
  for (const job of due) {
    const started = Date.now();
    let status = 0;
    try {
      const res = await HANDLERS[job.path](new NextRequest(new URL(job.path, req.url), { headers: new Headers(req.headers) }));
      status = res.status;
    } catch (err) {
      status = 500;
      console.error(`[cron/tick] ${job.path}:`, err);
    }
    ran.push({ path: job.path, status, ms: Date.now() - started });
  }
  return NextResponse.json({ ok: ran.every((r) => r.status === 200), status: "ok", london_minutes: now.minutes, ran });
}

export const GET = run;
export const POST = run;
