/**
 * The job queue, seen from the worker's side (0159; master run §9).
 *
 * The PC collects work from the cloud: it asks for jobs, does them, and
 * posts the results back. Nothing on the home network is exposed. These
 * functions are the only code that reads jobs across users, so they use the
 * service role and live here; a job's result is always applied AS the user
 * who owns the job (lib/jobs/handlers.ts, through withUser), so RLS decides
 * what a result may touch.
 */
import { createServiceClient } from "./serviceClient";

export type JobLane = "pc" | "cloud" | "any";
export type JobStatus = "queued" | "claimed" | "done" | "failed" | "cancelled";

export type JobRow = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  lane: JobLane;
  cloud_after: string | null;
  run_after: string;
  attempts: number;
  max_attempts: number;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_until: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  dedupe_key: string | null;
  created_at: string;
  finished_at: string | null;
  space_id: string;
  created_by: string | null;
};

export type WorkerInfo = {
  name: string;
  lane: "pc" | "cloud";
  capabilities?: Record<string, unknown>;
  info?: Record<string, unknown>;
  startedAt?: string | null;
};

/** A worker is treated as on while its last heartbeat is this recent. */
export const WORKER_ALIVE_SECONDS = 180;

/** Record that a worker is alive. Called on every claim, so a polling worker needs no second request. */
export async function heartbeat(worker: WorkerInfo): Promise<void> {
  const row: Record<string, unknown> = {
    name: worker.name,
    lane: worker.lane,
    last_seen_at: new Date().toISOString(),
    capabilities: worker.capabilities ?? {},
    info: worker.info ?? {},
  };
  if (worker.startedAt) row.started_at = worker.startedAt;
  const { error } = await createServiceClient().from("workers").upsert(row, { onConflict: "name" });
  if (error) console.error("[jobs] heartbeat failed:", error.message);
}

export async function claimJobs(input: { worker: string; lane: "pc" | "cloud"; kinds: string[]; limit?: number; leaseSeconds?: number }): Promise<JobRow[]> {
  if (!input.kinds.length) return [];
  const { data, error } = await createServiceClient().rpc("claim_jobs", {
    p_worker: input.worker,
    p_lane: input.lane,
    p_kinds: input.kinds,
    p_limit: input.limit ?? 5,
    p_lease_seconds: input.leaseSeconds ?? 300,
  });
  if (error) throw new Error(`claim_jobs failed: ${error.message}`);
  return (data ?? []) as JobRow[];
}

/** The job, only if this worker holds it. */
export async function claimedJob(id: string, worker: string): Promise<JobRow | null> {
  const { data, error } = await createServiceClient().from("jobs").select("*").eq("id", id).eq("status", "claimed").eq("claimed_by", worker).maybeSingle();
  if (error) throw new Error(`job lookup failed: ${error.message}`);
  return (data as JobRow | null) ?? null;
}

export async function finishJob(input: { id: string; worker: string; ok: boolean; result?: Record<string, unknown> | null; error?: string | null }): Promise<JobRow> {
  const { data, error } = await createServiceClient().rpc("finish_job", {
    p_id: input.id,
    p_worker: input.worker,
    p_ok: input.ok,
    p_result: input.result ?? null,
    p_error: input.error ?? null,
  });
  if (error) throw new Error(`finish_job failed: ${error.message}`);
  return data as JobRow;
}
