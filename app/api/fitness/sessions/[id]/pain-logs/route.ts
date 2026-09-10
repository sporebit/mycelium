import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import type { ExercisePainLog } from "@/lib/fitness/types";

export const runtime = "nodejs";

const LOG_FIELDS =
  "id, session_id, session_exercise_id, exercise_name, severity, feel_rating, pain_regions, notes, logged_at, created_at, updated_at";

/**
 * GET /api/fitness/sessions/[id]/pain-logs — all pain logs for a
 * session (exercise-level + the session-level row, if any).
 *
 * Functionally a sibling of GET /api/fitness/pain-logs?session_id=X;
 * exposed under the session path so callers that already have the
 * session resource can fetch its pain logs without rebuilding the
 * URL.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    // Ownership check.
    const { data: session } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!session) {
      return NextResponse.json({ pain_logs: [] });
    }
    const { data: logs } = await supabase
      .from("exercise_pain_logs")
      .select(LOG_FIELDS)
      .eq("session_id", id)
      .is("deleted_at", null)
      .order("logged_at", { ascending: true });
    return NextResponse.json({
      pain_logs: (logs ?? []) as ExercisePainLog[],
    });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id/pain-logs]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
