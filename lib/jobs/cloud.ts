/**
 * The cloud lane of the job queue (0159). The PC worker collects its lane
 * over /api/worker/claim; nothing collected the cloud lane, so a job put
 * there (a calendar write that failed, research for a drop) would have sat
 * for ever. This runs on the tick, every five minutes: it claims jobs whose
 * handler can do the work itself (`run`), runs each as the job's owner, and
 * finishes it; a failure goes back to the queue with the queue's own
 * back-off until max_attempts, then `onGiveUp`.
 *
 * Service role only for the claim and the finish (the queue's own
 * functions); the work and its result are applied as the owner, so RLS
 * decides what a job may touch, as with a worker's result.
 */
import { cloudRunnableKinds, jobHandler } from "./handlers";
import "./register";
import { claimJobs, finishJob } from "@/lib/system/jobs";
import { withUser } from "@/lib/system/withUser";

export const CLOUD_WORKER = "cloud";

export type CloudRunResult = { claimed: number; done: number; failed: number; kinds: string[] };

export async function runCloudJobs(opts: { kinds?: string[]; limit?: number; budgetMs?: number } = {}): Promise<CloudRunResult> {
  const kinds = opts.kinds ?? cloudRunnableKinds();
  const out: CloudRunResult = { claimed: 0, done: 0, failed: 0, kinds };
  if (kinds.length === 0) return out;
  const started = Date.now();
  const jobs = await claimJobs({ worker: CLOUD_WORKER, lane: "cloud", kinds, limit: opts.limit ?? 10, leaseSeconds: 120 });
  out.claimed = jobs.length;
  for (const job of jobs) {
    if (Date.now() - started > (opts.budgetMs ?? 45_000)) {
      // out of time: let the lease lapse so the next tick picks it up, without counting an attempt against it
      break;
    }
    const handler = jobHandler(job.kind);
    if (!handler?.run || !job.created_by) {
      await finishJob({ id: job.id, worker: CLOUD_WORKER, ok: false, error: handler ? "job has no owner" : `no handler for kind ${job.kind}` }).catch(() => undefined);
      out.failed += 1;
      continue;
    }
    try {
      const result = await withUser(job.created_by, (db) => handler.run!(job, db));
      await withUser(job.created_by, (db) => handler.apply(job, result, db));
      await finishJob({ id: job.id, worker: CLOUD_WORKER, ok: true, result });
      out.done += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jobs/cloud] ${job.kind} ${job.id}:`, message);
      const finished = await finishJob({ id: job.id, worker: CLOUD_WORKER, ok: false, error: message }).catch(() => null);
      out.failed += 1;
      if (finished?.status === "failed" && handler.onGiveUp) {
        await withUser(job.created_by, (db) => handler.onGiveUp!(job, message, db)).catch((e) => console.error("[jobs/cloud] onGiveUp:", e));
      }
    }
  }
  return out;
}
