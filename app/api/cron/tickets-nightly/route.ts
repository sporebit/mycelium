import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";
import { purgeDeletedPeople } from "@/lib/people/contacts";
import { londonNow } from "@/lib/tickets/categories";
import { spawnDue } from "@/lib/tickets/spawn";
import { syncRepoTemplates } from "@/lib/tickets/templates";
import { generateMissingRundowns } from "@/lib/tickets/rundown";
import { autoFileStale } from "@/lib/capture/autofile";
import { sweepCaptures } from "@/lib/capture/sweep";
import { activeUserIds } from "@/lib/system/users";
import { queueFirstSteps } from "@/lib/daily/firstSteps";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/tickets-nightly — 02:00 London (spec §8.2):
 *  - spawn recurrence occurrences due within 7 days,
 *  - generate rundowns for tomorrow's scheduled life tickets that lack one
 *    (§9.1, under the monthly cap),
 *  - sync the repo-authored templates,
 *  - for every user: finish any capture that was stored but never
 *    processed, and file the review cards nobody answered in seven days
 *    (master run §5).
 * Bearer CRON_SECRET; `?dry=1` reports without writing rundowns.
 */
export async function GET(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const today = londonNow().date;
  try {
    const result = await withUser(boundUser("cron"), async (db) => {
      const spawned = await spawnDue(db, today, 7);
      const templates = await syncRepoTemplates(db);
      const rundowns = await generateMissingRundowns(db, { forDate: today, dry });
      // people-contacts C4: the bin empties itself after 30 days
      const purgedPeople = dry ? 0 : await purgeDeletedPeople(db, 30);
      return { spawned, templates, rundowns, purgedPeople };
    });
    // Captures: per person, as that person. One user's failure does not stop the rest.
    const captures = { swept: 0, transcribed: 0, auto_filed: 0, users: 0, first_steps_asked: 0 };
    if (!dry) {
      for (const uid of await activeUserIds()) {
        try {
          const done = await withUser(uid, async (db) => ({ sweep: await sweepCaptures(db, uid, { limit: 25 }), filed: await autoFileStale(db) }));
          captures.users += 1;
          captures.swept += done.sweep.processed;
          captures.transcribed += done.sweep.transcribed;
          captures.auto_filed += done.filed.filed;
          // Tomorrow's first steps, for the PC's own model to write overnight (no cloud model, no cost).
          captures.first_steps_asked += await withUser(uid, (db) => queueFirstSteps(db, uid)).catch((err) => {
            console.error(`[cron/tickets-nightly] first steps for ${uid}:`, err);
            return 0;
          });
        } catch (err) {
          console.error(`[cron/tickets-nightly] captures for ${uid}:`, err);
        }
      }
    }
    return NextResponse.json({ ok: true, today, ...result, captures });
  } catch (err) {
    console.error("[cron/tickets-nightly]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
