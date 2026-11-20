import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runFindsTick } from "@/lib/finds/run";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/finds — the Finds feed's daily turn (master run §12), knocked
 * by the tick once an hour in the day. For each person: the watchers once a
 * day (GitHub search, Hacker News, the feeds, the advisory database; `npm
 * audit` queued for the PC), each new find kept once and queued for a
 * verdict on the PC; the cloud fallback for finds that have waited; and on
 * Sunday evening one Telegram digest inside the day's three. Free APIs
 * only; nothing installed. Bearer CRON_SECRET; GET or POST.
 * `?force=1` runs the watchers again today (a check, not a schedule).
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const only = req.nextUrl.searchParams.get("user");
  const out = { users: 0, sources_run: 0, found: 0, new: 0, queued: 0, cloud_verdicts: 0, digests: 0, failed: 0, errors: [] as string[] };
  for (const uid of await activeUserIds()) {
    if (only && uid !== only) continue;
    try {
      const r = await withUser(uid, (db) => runFindsTick(db, uid, new Date(), { force }));
      out.users += 1;
      out.sources_run += r.sources_run;
      out.found += r.found;
      out.new += r.new;
      out.queued += r.queued;
      out.cloud_verdicts += r.cloud_verdicts;
      if (r.digest === "sent") out.digests += 1;
      out.errors.push(...r.errors.slice(0, 5));
    } catch (err) {
      out.failed += 1;
      console.error(`[cron/finds] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", ...out });
}

export const GET = run;
export const POST = run;
