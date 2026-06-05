import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveExerciseNames } from "@/lib/fitness/resolve-aliases";
import type { ExercisePainLog } from "@/lib/fitness/types";

export const runtime = "nodejs";

const LOG_FIELDS =
  "id, user_id, session_id, session_exercise_id, exercise_name, severity, feel_rating, pain_regions, notes, logged_at, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Pain logs for a named exercise across every completed session.
 * Returned with the session's date attached so the chart can plot
 * severity over time.
 *
 * The exercise_name column on exercise_pain_logs (added by migration
 * 0022) makes this a direct lookup — no join chain through
 * workout_session_exercises required.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { name: raw } = await ctx.params;
  const name = decodeURIComponent(raw).trim();
  if (!name) return NextResponse.json({ logs: [] });

  try {
    const supabase = createServerClient();
    const names = await resolveExerciseNames(supabase, uid, name);
    const orFilter = names.map(n => `exercise_name.ilike.${n}`).join(",");
    const { data: logRows } = await supabase
      .from("exercise_pain_logs")
      .select(LOG_FIELDS)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .or(orFilter)
      .order("logged_at", { ascending: false });
    const logs = (logRows ?? []) as ExercisePainLog[];
    if (logs.length === 0) return NextResponse.json({ logs: [] });

    // Attach the session's date so the chart can plot over time. Only
    // include logs whose session is completed (chart shows historical
    // progression, not in-flight sessions).
    const sessionIds = Array.from(new Set(logs.map((l) => l.session_id)));
    const { data: sessionRows } = await supabase
      .from("workout_sessions")
      .select("id, date, completed_at")
      .in("id", sessionIds)
      .not("completed_at", "is", null);
    const sessionMeta = new Map<string, string>();
    for (const s of (sessionRows ?? []) as Array<{
      id: string;
      date: string;
      completed_at: string | null;
    }>) {
      sessionMeta.set(s.id, s.date);
    }
    const out = logs
      .filter((l) => sessionMeta.has(l.session_id))
      .map((l) => ({
        ...l,
        date: sessionMeta.get(l.session_id)!,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return NextResponse.json({ logs: out });
  } catch (err) {
    console.error("[/api/fitness/pain-logs/exercise/:name]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
