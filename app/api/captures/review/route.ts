import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/captures/review
 *   ?tab=needs_review | all          (defaults to needs_review)
 *   ?limit=50                        (capped at 200)
 *   ?before=<created_at iso>         (cursor, optional)
 *
 * "needs_review" matches captures that any of:
 *   - classification->>'confidence'      = 'low'
 *   - classification->>'session_intent'  = 'ambiguous'
 *   - classification->>'kind'            = 'ambiguous'
 *   - reviewed_at IS NULL AND created_at < now() - interval '1 hour'
 * discarded_at IS NULL is always required.
 *
 * "all" lists every non-discarded capture, newest first.
 */
export async function GET(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") === "all" ? "all" : "needs_review";
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50),
  );
  const before = url.searchParams.get("before");

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("raw_captures")
      .select(
        "id, source, raw_text, audio_url, classification, llm_source, routed_to, routed_id, reviewed_at, discarded_at, created_at",
      )
      .eq("user_id", uid)
      .is("discarded_at", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (before) q = q.lt("created_at", before);

    if (tab === "needs_review") {
      // PostgREST's .or() chains with comma-separated conditions. The
      // jsonb-arrow operators use ->> for text comparison; the "older
      // than an hour" branch uses created_at < now()-1h, which we encode
      // with a server-evaluated ISO timestamp (PostgREST can't run
      // expressions on the server). Stale captures with no reviewed_at
      // are the bulk of the list in practice.
      const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      q = q.or(
        [
          `classification->>confidence.eq.low`,
          `classification->>session_intent.eq.ambiguous`,
          `classification->>kind.eq.ambiguous`,
          `and(reviewed_at.is.null,created_at.lt.${oneHourAgo})`,
        ].join(","),
      );
    }

    const { data, error } = await q;
    if (error) throw error;

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
