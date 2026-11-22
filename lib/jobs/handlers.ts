/**
 * What each kind of job needs from the cloud, and what its result does.
 *
 * A handler has two halves, both run in the cloud:
 *   prepare(job, db)  — before the job is handed to a worker: add what the
 *                       worker needs and cannot fetch itself (a signed link
 *                       to an audio file, a prompt). Returns extra fields
 *                       merged into the payload the worker sees.
 *   apply(job, result, db) — when the worker posts its result: write it to
 *                       the owner's data.
 * `db` always acts as the job's owner, so a result can only touch what that
 * user could touch themselves.
 *
 * Kinds are registered by the feature that owns them (the capture pipeline
 * registers "transcribe" and "classify"); the worker routes only dispatch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobRow } from "@/lib/system/jobs";

export type JobHandler = {
  /** Which lane may run it. The PC worker asks only for kinds it can do. */
  prepare?: (job: JobRow, db: SupabaseClient) => Promise<Record<string, unknown>>;
  /**
   * The work itself, done in the cloud (lib/jobs/cloud.ts) as the job's
   * owner. A kind with `run` is one the cloud runner may claim (lane
   * "cloud", or "any" once the PC's grace has passed); its result then goes
   * through `apply` like a worker's would. Kinds without it are the PC's.
   */
  run?: (job: JobRow, db: SupabaseClient) => Promise<Record<string, unknown>>;
  apply: (job: JobRow, result: Record<string, unknown>, db: SupabaseClient) => Promise<void>;
  /** Called when the job has failed for the last time, so the feature can fall back. */
  onGiveUp?: (job: JobRow, error: string, db: SupabaseClient) => Promise<void>;
};

const HANDLERS = new Map<string, JobHandler>();

export function registerJobHandler(kind: string, handler: JobHandler): void {
  HANDLERS.set(kind, handler);
}

export function jobHandler(kind: string): JobHandler | null {
  return HANDLERS.get(kind) ?? null;
}

export function knownJobKinds(): string[] {
  return [...HANDLERS.keys()];
}

/** The kinds the cloud runner may take: those whose handler can do the work itself. */
export function cloudRunnableKinds(): string[] {
  return [...HANDLERS.entries()].filter(([, h]) => typeof h.run === "function").map(([k]) => k);
}

/** A job that does nothing; proves the queue end to end (worker self-test, tests). */
registerJobHandler("ping", {
  apply: async () => undefined,
});
