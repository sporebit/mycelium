import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runPhirstmaxxTick } from "@/lib/phirstmaxx/tick";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/phirstmaxx — every fifteen minutes from the tick (spec §6
 * upkeep, §7). For each family space, once (as the first person in it):
 * expire unanswered proposals, flag accepted plans that no longer fit,
 * let the engine propose into empty windows, re-research things that are
 * due, and send leave-by reminders. Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const out = { users: 0, spaces: 0, expired: 0, conflicts: 0, cleared: 0, proposed: 0, rechecked: 0, reminders: 0, errors: [] as string[] };
  for (const uid of await activeUserIds()) {
    try {
      const r = await withUser(uid, (db) => runPhirstmaxxTick(db, uid));
      out.users += 1;
      if (!r) continue;
      out.spaces += 1;
      out.expired += r.expired;
      out.conflicts += r.conflicts;
      out.cleared += r.cleared;
      out.proposed += r.proposed;
      out.rechecked += r.rechecked;
      out.reminders += r.reminders;
      out.errors.push(...r.errors);
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
      console.error(`[cron/phirstmaxx] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", ...out });
}

export const GET = run;
export const POST = run;
