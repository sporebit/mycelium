/**
 * The two jobs that move reference data between the hosted database and
 * the PC's store (pc-worker/reference.mjs; rules in ./offload.ts).
 *
 * reference_offload — the cloud picks a batch of cold recipe details as
 *   the job is claimed (prepare), the PC stores them and answers with the
 *   slugs it holds, and only those rows have their hosted detail cleared
 *   (apply). While there is more, apply queues the next batch, so one
 *   request drains the lot. Nothing is cleared the PC has not confirmed.
 *
 * reference_get — a recipe someone opened whose detail is on the PC: the
 *   PC sends it back and it is written to the row again (and stays, since
 *   it was opened today).
 *
 * Importing this file registers both handlers (lib/jobs/register.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { enqueueJob, type Enqueued } from "@/lib/jobs/queue";
import { heldOf, isCold, KEEP_OPENED_DAYS, OFFLOAD_BATCH, type OffloadCandidate } from "./offload";

export const OFFLOAD_KIND = "reference_offload";
export const GET_KIND = "reference_get";

/** Queue one offload sweep (the tick on Sunday morning, or by hand). One live sweep at a time. */
export function queueOffload(db: SupabaseClient, opts: { limit?: number } = {}): Promise<Enqueued> {
  return enqueueJob(db, { kind: OFFLOAD_KIND, payload: { table: "gousto_recipes", limit: opts.limit ?? OFFLOAD_BATCH }, lane: "pc", dedupeKey: "reference_offload:gousto_recipes", maxAttempts: 2 });
}

/** Ask the PC for one recipe's detail. One live request per recipe. */
export function queueGet(db: SupabaseClient, slug: string): Promise<Enqueued> {
  return enqueueJob(db, { kind: GET_KIND, payload: { table: "gousto_recipes", slug }, lane: "pc", dedupeKey: `reference_get:gousto_recipes:${slug}`, maxAttempts: 2 });
}

type ColdRow = OffloadCandidate & { detail: unknown; detail_fetched_at: string | null };

/** The next batch of cold details, oldest-opened first, and whether more wait behind it. */
export async function coldBatch(db: SupabaseClient, limit: number, now: Date = new Date()): Promise<{ rows: ColdRow[]; more: boolean }> {
  const cutoff = new Date(now.getTime() - KEEP_OPENED_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("gousto_recipes")
    .select("slug, is_favourite, saved_recipe_id, detail_opened_at, detail_offloaded_at, detail, detail_fetched_at")
    .not("detail", "is", null)
    .eq("is_favourite", false)
    .is("saved_recipe_id", null)
    .or(`detail_opened_at.is.null,detail_opened_at.lt.${cutoff}`)
    .order("detail_opened_at", { ascending: true, nullsFirst: true })
    .order("slug")
    .limit(limit + 1);
  if (error) throw new Error(`cold batch: ${error.message}`);
  const rows = ((data ?? []) as Array<Omit<ColdRow, "has_detail">>).map((r) => ({ ...r, has_detail: r.detail != null })).filter((r) => isCold(r, now));
  return { rows: rows.slice(0, limit), more: rows.length > limit };
}

/**
 * Clear the hosted detail of exactly these slugs and stamp them. The cold
 * conditions are applied again here, so a recipe favourited or opened
 * between the claim and the result keeps its detail. Returns how many
 * were cleared.
 */
export async function markOffloaded(db: SupabaseClient, slugs: readonly string[], now: Date = new Date()): Promise<number> {
  if (!slugs.length) return 0;
  const cutoff = new Date(now.getTime() - KEEP_OPENED_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("gousto_recipes")
    .update({ detail: null, detail_offloaded_at: now.toISOString() })
    .in("slug", [...slugs])
    .not("detail", "is", null)
    .eq("is_favourite", false)
    .is("saved_recipe_id", null)
    .or(`detail_opened_at.is.null,detail_opened_at.lt.${cutoff}`)
    .select("slug");
  if (error) throw new Error(`offload stamp: ${error.message}`);
  return (data ?? []).length;
}

registerJobHandler(OFFLOAD_KIND, {
  prepare: async (job, db) => {
    const limit = typeof job.payload.limit === "number" ? Math.max(1, Math.min(1000, Math.floor(job.payload.limit))) : OFFLOAD_BATCH;
    const { rows, more } = await coldBatch(db, limit);
    return {
      table: "gousto_recipes",
      rows: rows.map((r) => ({ slug: r.slug, detail: r.detail, fetched_at: r.detail_fetched_at })),
      more,
    };
  },
  apply: async (job, result, db) => {
    // Only what the PC says it holds; markOffloaded checks each is still cold.
    const held = heldOf(result);
    const cleared = await markOffloaded(db, held);
    console.log(`[reference] offloaded ${cleared} of ${held.length} held recipe details${result.more === true ? "; more to come" : ""}`);
    if (result.more === true && cleared > 0) {
      // The next batch, as a new job: the worker's round stays short and the queue shows progress.
      await enqueueJob(db, { kind: OFFLOAD_KIND, payload: job.payload, lane: "pc", dedupeKey: `reference_offload:gousto_recipes:${Date.now()}`, maxAttempts: 2 });
    }
  },
});

registerJobHandler(GET_KIND, {
  apply: async (job, result, db) => {
    const slug = typeof job.payload.slug === "string" ? job.payload.slug : "";
    if (!slug || typeof result.slug !== "string" || result.slug !== slug || !result.detail || typeof result.detail !== "object") throw new Error("the PC's answer was not this recipe's detail");
    const now = new Date().toISOString();
    const { error } = await db.from("gousto_recipes").update({ detail: result.detail, detail_offloaded_at: null, detail_opened_at: now }).eq("slug", slug);
    if (error) throw new Error(`detail not written back: ${error.message}`);
  },
});
