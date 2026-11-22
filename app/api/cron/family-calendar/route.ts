import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runFamilyCalendarTick } from "@/lib/family/calendar/sync";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/family-calendar — every fifteen minutes from the tick (family
 * calendar spec §4.2, §4.4). For each person who owns a Family calendar
 * connection: pull what changed on Google (the safety net under the push
 * channel), renew the channel when it is about to lapse, and once a day run
 * the health check. Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const out = { users: 0, spaces: 0, pulled: 0, channels: 0, health: 0, errors: [] as string[] };
  for (const uid of await activeUserIds()) {
    try {
      const r = await withUser(uid, (db) => runFamilyCalendarTick(db, uid));
      out.users += 1;
      out.spaces += r.spaces;
      out.pulled += r.pulled;
      out.channels += r.channels;
      out.health += r.health;
      out.errors.push(...r.errors);
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
      console.error(`[cron/family-calendar] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", ...out });
}

export const GET = run;
export const POST = run;
