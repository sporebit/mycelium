import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";
import { purgeDeletedPeople } from "@/lib/people/contacts";
import { londonNow } from "@/lib/tickets/categories";
import { spawnDue } from "@/lib/tickets/spawn";
import { syncRepoTemplates } from "@/lib/tickets/templates";
import { generateMissingRundowns } from "@/lib/tickets/rundown";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/tickets-nightly — 02:00 London (spec §8.2):
 *  - spawn recurrence occurrences due within 7 days,
 *  - generate rundowns for tomorrow's scheduled life tickets that lack one
 *    (§9.1, under the monthly cap),
 *  - sync the repo-authored templates.
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
    return NextResponse.json({ ok: true, today, ...result });
  } catch (err) {
    console.error("[cron/tickets-nightly]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
