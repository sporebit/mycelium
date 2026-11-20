import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { syncOccasions } from "@/lib/gifts/engine";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/gift-occasions — once a morning, on the tick (spec §5). For each
 * person, as that person: birthday instances from People, the fixed
 * calendar, next year's row for every annual occasion that has passed, and
 * the date-of-birth reconcile. Idempotent: keyed on (person, kind, year) and
 * backed by the unique index, so a double run creates nothing. Logs the
 * counts (§12 flag 7). Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const out = { users: 0, created: 0, moved: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      const r = await withUser(uid, (db) => syncOccasions(db));
      out.created += r.created;
      out.moved += r.moved;
      out.users += 1;
    } catch (err) {
      out.failed += 1;
      console.error(`[cron/gift-occasions] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", ...out });
}

export const GET = run;
export const POST = run;
