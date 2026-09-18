import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";
import { daylogTick } from "@/lib/daylog/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/daylog — every 15 minutes through the evening (spec §4.1).
 * Bearer CRON_SECRET; GET for the Vercel cron, POST for cron-job.org.
 * No model call: prompt, snooze, idle-close, cutoff-skip only.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const report = await withUser(boundUser("cron"), (db) => daylogTick(db));
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error("[cron/daylog]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
