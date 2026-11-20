import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { refreshAiModels } from "@/lib/system/aiModels";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/cron/ai-models — once a day on the tick (MYC-190): the providers'
 * model lists into ai_models with first-seen and last-seen; a nudge to the
 * instance owner on a new model and on a retired one that is still pinned.
 * Never sub-daily, never in vercel.json. Bearer CRON_SECRET; GET or POST.
 */
async function run(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, status: "error", error: "unauthorized" }, { status: 401 });
  }
  try {
    const report = await refreshAiModels();
    return NextResponse.json({ ok: true, status: "ok", ...report });
  } catch (err) {
    console.error("[cron/ai-models]", err);
    return NextResponse.json({ ok: false, status: "error", error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
