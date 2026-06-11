import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getExerciseMuscleGroup } from "@/lib/fitness/muscle-map";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export type ExerciseListItem = {
  name: string;
  slug: string;
  muscle_group: string;
  times_performed: number;
  pr_weight: number | null;
  pr_date: string | null;
  recent_weights: number[];
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();

    // Get all exercises with their session dates
    const { data: exRows, error } = await supabase
      .from("workout_session_exercises")
      .select("id, name, session_id")
      .eq("skipped", false)
      .order("name");
    if (error) throw error;
    if (!exRows || exRows.length === 0) {
      return NextResponse.json({ exercises: [] });
    }

    // Filter to only sessions belonging to this user
    const sessionIds = [...new Set(exRows.map((e: { session_id: string }) => e.session_id))];
    const { data: sessRows } = await supabase
      .from("workout_sessions")
      .select("id, date")
      .in("id", sessionIds)
      .eq("user_id", uid);
    const userSessionDates = new Map<string, string>();
    for (const s of (sessRows ?? []) as { id: string; date: string }[]) {
      userSessionDates.set(s.id, s.date);
    }

    // Group exercises by name
    type ExRow = { id: string; name: string; session_id: string };
    const byName = new Map<string, ExRow[]>();
    for (const ex of exRows as ExRow[]) {
      if (!userSessionDates.has(ex.session_id)) continue;
      const key = ex.name.toLowerCase().trim();
      const arr = byName.get(key) || [];
      arr.push(ex);
      byName.set(key, arr);
    }

    // Get top set weights for all exercise IDs
    const allExIds = exRows
      .filter((e: ExRow) => userSessionDates.has(e.session_id))
      .map((e: ExRow) => e.id);
    const weightByExId = new Map<string, number>();
    if (allExIds.length > 0) {
      // Batch in chunks to avoid URL length limits
      const chunks: string[][] = [];
      for (let i = 0; i < allExIds.length; i += 500) {
        chunks.push(allExIds.slice(i, i + 500));
      }
      for (const chunk of chunks) {
        const { data: setRows } = await supabase
          .from("workout_sets")
          .select("session_exercise_id, weight")
          .in("session_exercise_id", chunk)
          .not("weight", "is", null)
          .gt("weight", 0);
        for (const s of (setRows ?? []) as { session_exercise_id: string; weight: number }[]) {
          const cur = weightByExId.get(s.session_exercise_id) ?? 0;
          if (s.weight > cur) weightByExId.set(s.session_exercise_id, s.weight);
        }
      }
    }

    // Build result
    const exercises: ExerciseListItem[] = [];
    for (const [, rows] of byName) {
      const displayName = rows[0].name;
      const timesPerformed = rows.length;

      // Find PR
      let prWeight: number | null = null;
      let prDate: string | null = null;
      for (const r of rows) {
        const w = weightByExId.get(r.id);
        if (w && (prWeight === null || w > prWeight)) {
          prWeight = w;
          prDate = userSessionDates.get(r.session_id) ?? null;
        }
      }

      // Recent weights (last 8 sessions, top set each)
      const sortedByDate = [...rows].sort((a, b) => {
        const da = userSessionDates.get(a.session_id) ?? "";
        const db = userSessionDates.get(b.session_id) ?? "";
        return db.localeCompare(da);
      });
      const recentWeights = sortedByDate
        .slice(0, 8)
        .reverse()
        .map((r) => weightByExId.get(r.id) ?? 0);

      exercises.push({
        name: displayName,
        slug: slugify(displayName),
        muscle_group: getExerciseMuscleGroup(displayName),
        times_performed: timesPerformed,
        pr_weight: prWeight,
        pr_date: prDate,
        recent_weights: recentWeights,
      });
    }

    exercises.sort((a, b) => b.times_performed - a.times_performed);

    return NextResponse.json({ exercises });
  } catch (err) {
    console.error("[/api/fitness/exercises GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
