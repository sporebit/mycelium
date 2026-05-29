import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side count of raw_captures that need review for `userId`.
 *
 * Definition mirrors GET /api/captures/review?tab=needs_review:
 *   classification->>'confidence' IN ('low', 'ambiguous')
 *   OR classification->>'kind'    = 'ambiguous'
 *   OR (reviewed_at IS NULL AND created_at < now() - interval '1 hour')
 *   AND discarded_at IS NULL
 *
 * Used by:
 *  - the home dashboard "Capture review" card
 *  - the morning Telegram briefing footer
 *  - the badge on the Compost SubNav (future)
 *
 * Returns 0 on any error so a partial failure can't break the briefing
 * or the card.
 */
export async function fetchPendingReviewCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count, error } = await supabase
      .from("raw_captures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("discarded_at", null)
      .or(
        [
          `classification->>confidence.in.(low,ambiguous)`,
          `classification->>kind.eq.ambiguous`,
          `and(reviewed_at.is.null,created_at.lt.${oneHourAgo})`,
        ].join(","),
      );
    if (error) {
      console.error("[fetchPendingReviewCount]", error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("[fetchPendingReviewCount]", err);
    return 0;
  }
}
