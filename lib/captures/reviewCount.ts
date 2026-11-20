import type { SupabaseClient } from "@supabase/supabase-js";
import { countWaiting } from "@/lib/capture/queue";

/**
 * How many captures are waiting for review, for the calling user.
 *
 * The definition lives in lib/capture/queue.ts and is the same one the list
 * and the evening deck use. Returns 0 on any error so a partial failure
 * cannot break the briefing or the dashboard card.
 */
export async function fetchPendingReviewCount(supabase: SupabaseClient): Promise<number> {
  try {
    return await countWaiting(supabase);
  } catch (err) {
    console.error("[fetchPendingReviewCount]", err);
    return 0;
  }
}
