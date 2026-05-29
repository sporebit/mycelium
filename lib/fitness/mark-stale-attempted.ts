import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Promotes any of a user's `active` workout_sessions whose `started_at`
 * is older than 48 hours to `status='attempted'`. The completed_at
 * column is left alone — `attempted` only describes the gap between
 * start and abandonment-or-completion, it does not finish the session.
 *
 * This is intentionally piggybacked on existing reads (the today view,
 * session detail) instead of being scheduled, because:
 *  - the bound is a partial-indexed slice (`workout_sessions_status_idx`
 *    filters to status IN (active, attempted)), so the read is cheap
 *  - the write only happens when there's something to promote, since
 *    PostgREST returns the affected rows so callers can no-op
 *  - we don't gain anything from a separate cron firing during periods
 *    the user isn't looking at fitness at all
 *
 * Soft-failure: any error is logged and swallowed so a transient DB
 * blip can't break the route the helper is attached to.
 */
export async function markStaleSessionsAttempted(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
    const { error } = await supabase
      .from("workout_sessions")
      .update({ status: "attempted", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "active")
      .is("completed_at", null)
      .not("started_at", "is", null)
      .lt("started_at", cutoff);
    if (error) {
      console.error("[markStaleSessionsAttempted]", error);
    }
  } catch (err) {
    console.error("[markStaleSessionsAttempted]", err);
  }
}
