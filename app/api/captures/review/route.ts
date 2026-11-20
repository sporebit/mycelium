import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { QUEUE_SELECT, waitingForReview } from "@/lib/capture/queue";

export const runtime = "nodejs";

/**
 * GET /api/captures/review
 *   ?tab=needs_review | all          (defaults to needs_review)
 *   ?limit=50                        (capped at 200)
 *   ?before=<created_at iso>         (cursor, optional)
 *
 * "needs_review" is every capture waiting for review: not reviewed, not
 * discarded, not deleted, finished processing, not filed by the seven-day
 * rule (lib/capture/queue.ts; Phil, 2026-11-20: every capture goes to
 * review). `?order=oldest` gives them oldest first, as the evening deck
 * shows them.
 *
 * "all" lists every non-discarded capture, newest first.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "all" ? "all" : "needs_review";
  // ALL tab defaults to 20 per page (per the spec); NEEDS REVIEW also
  // honours the explicit `limit` query if passed but caps at 200 to keep
  // the response cheap.
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20),
  );
  const before = url.searchParams.get("before");
  const oldestFirst = url.searchParams.get("order") === "oldest";

  try {
    const supabase = await createUserClient();
    let q = supabase
      .from("raw_captures")
      .select(QUEUE_SELECT)
      .is("deleted_at", null)
      .is("discarded_at", null)
      .order("created_at", { ascending: oldestFirst })
      .limit(limit + 1);

    if (before) q = oldestFirst ? q.gt("created_at", before) : q.lt("created_at", before);

    if (tab === "needs_review") q = waitingForReview(q);

    const { data, error } = await q;
    if (error) throw error;
    auditListRead(req, data, "organisation", "captures");

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const captures = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? captures[captures.length - 1].created_at : null;

    return NextResponse.json({ captures, next_cursor: nextCursor });
  } catch (err) {
    console.error("[/api/captures/review GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
