/**
 * The job queue, seen from the app's side (0159; master run §9).
 *
 * App code puts work on the queue as the signed-in user; the PC collects it
 * (lib/system/jobs.ts). "Local first": a job goes to the PC lane when the
 * PC is on, and to the cloud only when it is off or the job cannot wait.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type EnqueueInput = {
  kind: string;
  payload?: Record<string, unknown>;
  /**
   * 'pc'    wait for the PC however long it takes (free work that can wait:
   *         re-transcription, bulk jobs).
   * 'cloud' run in the cloud now.
   * 'any'   the PC gets `cloudAfterSeconds` to pick it up; after that the
   *         cloud may take it.
   */
  lane?: "pc" | "cloud" | "any";
  cloudAfterSeconds?: number;
  /** One live job per key: enqueueing the same key again is a no-op. */
  dedupeKey?: string;
  runAfter?: Date;
  maxAttempts?: number;
};

export type Enqueued = { id: string | null; duplicate: boolean };

/** `db` acts as the job's owner (a request client, or one from withUser()). */
export async function enqueueJob(db: SupabaseClient, input: EnqueueInput): Promise<Enqueued> {
  const lane = input.lane ?? "pc";
  const row: Record<string, unknown> = {
    kind: input.kind,
    payload: input.payload ?? {},
    lane,
  };
  if (lane === "any") row.cloud_after = new Date(Date.now() + (input.cloudAfterSeconds ?? 120) * 1000).toISOString();
  if (input.dedupeKey) row.dedupe_key = input.dedupeKey;
  if (input.runAfter) row.run_after = input.runAfter.toISOString();
  if (input.maxAttempts) row.max_attempts = input.maxAttempts;

  const { data, error } = await db.from("jobs").insert(row).select("id").single();
  if (error) {
    // 23505: a live job with this dedupe key already exists. That is the point of the key.
    if (error.code === "23505") return { id: null, duplicate: true };
    throw new Error(`enqueue ${input.kind} failed: ${error.message}`);
  }
  return { id: (data as { id: string }).id, duplicate: false };
}

/** Seconds since a PC worker last checked in, or null if none ever has. */
export async function pcLastSeenSeconds(db: SupabaseClient): Promise<number | null> {
  const { data } = await db.from("workers").select("last_seen_at").eq("lane", "pc").order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
  const at = (data as { last_seen_at?: string } | null)?.last_seen_at;
  if (!at) return null;
  return Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
}

/** True while a PC worker has checked in within the last three minutes. */
export async function pcIsOn(db: SupabaseClient, aliveSeconds = 180): Promise<boolean> {
  const seen = await pcLastSeenSeconds(db);
  return seen !== null && seen <= aliveSeconds;
}
