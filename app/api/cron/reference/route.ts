import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { queueOffload } from "@/lib/reference/jobs";
import { activeUserIds } from "@/lib/system/users";
import { withUser } from "@/lib/system/withUser";
import "@/lib/jobs/register";

export const runtime = "nodejs";

/**
 * /api/cron/reference — queue the sweep that moves cold recipe details
 * to the PC's reference store (master run §9 "database size"; rules in
 * lib/reference/offload.ts). The tick knocks on Sunday morning after the
 * Gousto sync; `?force=1` queues it any day (the first run, by hand).
 * The sweep itself runs on the PC lane and drains batch by batch; nothing
 * is cleared from the hosted database until the PC confirms it holds it.
 * Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const london = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(new Date());
  if (!force && london !== "Sun") return NextResponse.json({ ok: true, status: "ok", queued: 0, skipped: "not Sunday" });
  const out = { users: 0, queued: 0, already: 0, failed: 0 };
  for (const uid of await activeUserIds()) {
    try {
      const r = await withUser(uid, (db) => queueOffload(db));
      out.users += 1;
      if (r.duplicate) out.already += 1;
      else out.queued += 1;
    } catch (err) {
      out.failed += 1;
      console.error("[cron/reference]", uid, err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ ok: out.failed === 0, status: out.failed === 0 ? "ok" : "error", ...out });
}

export const GET = run;
export const POST = run;
