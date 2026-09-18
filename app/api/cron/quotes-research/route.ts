import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { boundUser } from "@/lib/system/bindings";
import { withUser } from "@/lib/system/withUser";
import { sweepResearch } from "@/lib/quotes/research";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Quotes research sweeper (spec §5): `after()` in the approve / create route
 * is not a queue, so every 30 minutes this picks up `pending` rows older
 * than 10 minutes and retries `failed` rows once. Bearer CRON_SECRET; GET
 * for the Vercel cron, POST for cron-job.org.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await withUser(boundUser("cron"), (db) => sweepResearch(db, { limit: 10 }));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/quotes-research]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
