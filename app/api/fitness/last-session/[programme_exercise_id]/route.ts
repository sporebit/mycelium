import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { LastSession, LoggedSet } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Most-recent prior session's sets for a given programme_exercise_id.
 * Walks session_exercises with that programme_exercise_id, ordered by their
 * session's date desc, returning the first one that has at least one logged
 * set (completed_at not null on the set).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ programme_exercise_id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { programme_exercise_id } = await ctx.params;

  try {
    const supabase = createServerClient();
    // Find candidate session-exercise rows, join to workout_sessions for the date.
    const { data: rows } = await supabase
      .from("workout_session_exercises")
      .select(
        "id, workout_sessions:session_id!inner(id, date, user_id, completed_at)"
      )
      .eq("programme_exercise_id", programme_exercise_id);

    type Row = {
      id: string;
      workout_sessions:
        | { id: string; date: string; user_id: string; completed_at: string | null }
        | { id: string; date: string; user_id: string; completed_at: string | null }[];
    };
    const candidates: Array<{ exId: string; date: string }> = [];
    for (const r of (rows ?? []) as Row[]) {
      const sess = Array.isArray(r.workout_sessions)
        ? r.workout_sessions[0]
        : r.workout_sessions;
      if (!sess) continue;
      if (sess.user_id !== uid) continue;
      candidates.push({ exId: r.id, date: sess.date });
    }
    if (candidates.length === 0) {
      return NextResponse.json({ last: null as LastSession });
    }
    // Newest first
    candidates.sort((a, b) => (a.date < b.date ? 1 : -1));

    for (const c of candidates) {
      const { data: setRows } = await supabase
        .from("workout_sets")
        .select("set_number, reps, weight, unit, completed_at")
        .eq("session_exercise_id", c.exId)
        .not("completed_at", "is", null)
        .order("set_number", { ascending: true });
      const sets = (setRows ?? []) as LoggedSet[];
      if (sets.length > 0) {
        const out: LastSession = { session_date: c.date, sets };
        return NextResponse.json({ last: out });
      }
    }

    return NextResponse.json({ last: null as LastSession });
  } catch (err) {
    console.error("[/api/fitness/last-session]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
