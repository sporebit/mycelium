import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { ExercisePainLog } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Pain logs for a named exercise across every completed session.
 * Returned with the session's date attached so the chart can plot over time.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { name: raw } = await ctx.params;
  const name = decodeURIComponent(raw).trim();
  if (!name) return NextResponse.json({ logs: [] });

  try {
    const supabase = createServerClient();
    // session_exercises with this name, joined to the parent session for date.
    const { data: exRows } = await supabase
      .from("workout_session_exercises")
      .select(
        "id, workout_sessions:session_id!inner(id, date, user_id, completed_at)"
      )
      .ilike("name", name);
    type ExRow = {
      id: string;
      workout_sessions:
        | { id: string; date: string; user_id: string; completed_at: string | null }
        | { id: string; date: string; user_id: string; completed_at: string | null }[];
    };
    const exMeta = new Map<string, { session_id: string; date: string }>();
    for (const r of (exRows ?? []) as ExRow[]) {
      const j = Array.isArray(r.workout_sessions) ? r.workout_sessions[0] : r.workout_sessions;
      if (!j) continue;
      if (j.user_id !== uid) continue;
      if (!j.completed_at) continue;
      exMeta.set(r.id, { session_id: j.id, date: j.date });
    }
    if (exMeta.size === 0) return NextResponse.json({ logs: [] });

    const { data: logs } = await supabase
      .from("exercise_pain_logs")
      .select("id, session_exercise_id, severity, feel_rating, pain_regions, notes, created_at, updated_at")
      .in("session_exercise_id", Array.from(exMeta.keys()));
    type Log = Omit<ExercisePainLog, "user_id">;
    const out = (logs ?? []).map((l) => {
      const meta = exMeta.get((l as Log).session_exercise_id)!;
      return {
        ...(l as Log),
        session_id: meta.session_id,
        date: meta.date,
      };
    });
    // Newest first
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return NextResponse.json({ logs: out });
  } catch (err) {
    console.error("[/api/fitness/pain-logs/exercise/:name]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

