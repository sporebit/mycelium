import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runFamilyTick } from "@/lib/family/remind";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/family — every fifteen minutes (master run §8). For each person
 * in a family space: the month's rows for the household bills marked
 * monthly, once the month has turned (one row a month per bill, however
 * many turns); a reminder the evening before an appointment and two
 * hours before it, and on Sunday evening the week's letter question if they
 * have not answered it. Each is sent once to each person, as that person.
 * No model call. Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const out = { users: 0, appointments: 0, letters: 0, bills: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      const sent = await withUser(uid, (db) => runFamilyTick(db, uid));
      out.users += 1;
      out.appointments += sent.appointments;
      out.bills += sent.bills;
      if (sent.letter) out.letters += 1;
    } catch (err) {
      // One person's failure does not stop the rest.
      out.failed += 1;
      console.error(`[cron/family] ${uid}:`, err);
    }
  }
  return NextResponse.json({ ok: true, status: "ok", ...out });
}

export const GET = run;
export const POST = run;
