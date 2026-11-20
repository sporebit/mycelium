import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { claimJobs, finishJob, heartbeat, type JobRow } from "@/lib/system/jobs";
import { withUser } from "@/lib/system/withUser";
import { jobHandler } from "@/lib/jobs/handlers";
import "@/lib/jobs/register";

export const runtime = "nodejs";
export const maxDuration = 60;

type ClaimBody = {
  worker?: unknown;
  kinds?: unknown;
  limit?: unknown;
  capabilities?: unknown;
  info?: unknown;
  started_at?: unknown;
};

/**
 * POST /api/worker/claim — the PC asks for work (master run §9).
 * Bearer CRON_SECRET. Every call is also the worker's heartbeat, so "is the
 * PC on?" needs no second request.
 *
 * Body: { worker, kinds[], limit?, capabilities?, info? }
 * Reply: { jobs: [{ id, kind, payload, attempts }] } — each payload already
 * carries what the worker needs (a signed link, a prompt), prepared here as
 * the job's owner.
 */
export async function POST(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as ClaimBody;
  const worker = typeof body.worker === "string" ? body.worker.trim().slice(0, 80) : "";
  if (!worker) return NextResponse.json({ error: "worker name required" }, { status: 400 });
  const kinds = Array.isArray(body.kinds) ? body.kinds.filter((k): k is string => typeof k === "string" && k.length > 0).slice(0, 30) : [];
  const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? Math.max(1, Math.min(20, Math.floor(body.limit))) : 5;

  await heartbeat({
    name: worker,
    lane: "pc",
    capabilities: body.capabilities && typeof body.capabilities === "object" ? (body.capabilities as Record<string, unknown>) : { kinds },
    info: body.info && typeof body.info === "object" ? (body.info as Record<string, unknown>) : {},
    startedAt: typeof body.started_at === "string" ? body.started_at : null,
  });

  let claimed: JobRow[];
  try {
    claimed = await claimJobs({ worker, lane: "pc", kinds, limit });
  } catch (err) {
    console.error("[worker/claim]", err);
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }

  const jobs: Array<{ id: string; kind: string; payload: Record<string, unknown>; attempts: number }> = [];
  for (const job of claimed) {
    const handler = jobHandler(job.kind);
    if (!handler || !job.created_by) {
      await finishJob({ id: job.id, worker, ok: false, error: handler ? "job has no owner" : `no handler for kind ${job.kind}` }).catch(() => undefined);
      continue;
    }
    try {
      const extra = handler.prepare ? await withUser(job.created_by, (db) => handler.prepare!(job, db)) : {};
      jobs.push({ id: job.id, kind: job.kind, payload: { ...job.payload, ...extra }, attempts: job.attempts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker/claim] prepare ${job.kind} ${job.id}:`, message);
      await finishJob({ id: job.id, worker, ok: false, error: `prepare: ${message}` }).catch(() => undefined);
    }
  }

  return NextResponse.json({ ok: true, jobs });
}
