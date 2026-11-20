import { NextRequest, NextResponse } from "next/server";
import { matchesBearer } from "@/lib/auth/gate";
import { claimedJob, finishJob } from "@/lib/system/jobs";
import { withUser } from "@/lib/system/withUser";
import { jobHandler } from "@/lib/jobs/handlers";
import "@/lib/jobs/register";

export const runtime = "nodejs";
export const maxDuration = 60;

type FinishBody = { id?: unknown; worker?: unknown; ok?: unknown; result?: unknown; error?: unknown };

/**
 * POST /api/worker/finish — the PC posts a job's result (master run §9).
 * Bearer CRON_SECRET.
 *
 * Body: { id, worker, ok, result?, error? }
 * A result is applied AS the job's owner, then the job is marked done. If
 * applying it throws, the job goes back to the queue like any other
 * failure, so a result is never recorded as done without being written.
 */
export async function POST(req: NextRequest) {
  if (!matchesBearer(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as FinishBody;
  const id = typeof body.id === "string" ? body.id : "";
  const worker = typeof body.worker === "string" ? body.worker.trim().slice(0, 80) : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !worker) return NextResponse.json({ error: "id and worker required" }, { status: 400 });

  try {
    const job = await claimedJob(id, worker);
    if (!job) return NextResponse.json({ error: "not claimed by this worker" }, { status: 409 });
    const handler = jobHandler(job.kind);
    const owner = job.created_by;

    if (body.ok === true && handler && owner) {
      const result = body.result && typeof body.result === "object" ? (body.result as Record<string, unknown>) : {};
      try {
        await withUser(owner, (db) => handler.apply(job, result, db));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[worker/finish] apply ${job.kind} ${job.id}:`, message);
        const after = await finishJob({ id, worker, ok: false, error: `apply: ${message}` });
        return NextResponse.json({ ok: false, status: after.status, error: "apply failed" }, { status: 500 });
      }
      const done = await finishJob({ id, worker, ok: true, result });
      return NextResponse.json({ ok: true, status: done.status });
    }

    const error = typeof body.error === "string" && body.error ? body.error : handler ? "worker reported failure" : `no handler for kind ${job.kind}`;
    const after = await finishJob({ id, worker, ok: false, error });
    if (after.status === "failed" && handler?.onGiveUp && owner) {
      await withUser(owner, (db) => handler.onGiveUp!(job, error, db)).catch((err) => console.error(`[worker/finish] onGiveUp ${job.kind}:`, err));
    }
    return NextResponse.json({ ok: true, status: after.status });
  } catch (err) {
    console.error("[worker/finish]", err);
    return NextResponse.json({ error: "finish failed" }, { status: 500 });
  }
}
