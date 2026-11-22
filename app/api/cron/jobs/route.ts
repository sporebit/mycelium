import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { runCloudJobs } from "@/lib/jobs/cloud";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/jobs — the cloud lane of the job queue, every five minutes from
 * the tick (lib/jobs/cloud.ts). Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  try {
    const out = await runCloudJobs();
    return NextResponse.json({ ok: true, status: "ok", ...out });
  } catch (err) {
    console.error("[cron/jobs]", err);
    return NextResponse.json({ ok: false, status: "error", error: "failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
