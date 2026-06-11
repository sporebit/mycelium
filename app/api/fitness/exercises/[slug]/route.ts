import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getExerciseMuscles } from "@/lib/fitness/muscle-map";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function unslugify(slug: string): string {
  return slug.replace(/-/g, " ");
}

export type ExerciseSetRow = {
  date: string;
  session_name: string | null;
  set_number: number;
  reps: number | null;
  weight: number | null;
  unit: string | null;
  notes: string | null;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { slug } = await ctx.params;
  const searchName = unslugify(slug);

  try {
    const supabase = createServerClient();

    // Find all session exercises matching this name (case-insensitive)
    const { data: exRows, error } = await supabase
      .from("workout_session_exercises")
      .select("id, name, session_id, notes, comment")
      .ilike("name", searchName)
      .eq("skipped", false);
    if (error) throw error;
    if (!exRows || exRows.length === 0) {
      return NextResponse.json({ error: "exercise not found" }, { status: 404 });
    }

    // Filter to user's sessions and get dates
    const sessionIds = [...new Set(exRows.map((e: { session_id: string }) => e.session_id))];
    const { data: sessRows } = await supabase
      .from("workout_sessions")
      .select("id, date, name")
      .in("id", sessionIds)
      .eq("user_id", uid)
      .order("date", { ascending: false });
    const sessionInfo = new Map<string, { date: string; name: string | null }>();
    for (const s of (sessRows ?? []) as { id: string; date: string; name: string | null }[]) {
      sessionInfo.set(s.id, { date: s.date, name: s.name });
    }

    const userExIds = exRows
      .filter((e: { session_id: string }) => sessionInfo.has(e.session_id))
      .map((e: { id: string }) => e.id);

    // Get all sets
    const allSets: ExerciseSetRow[] = [];
    let prWeight: number | null = null;
    let prDate: string | null = null;
    let totalSets = 0;
    let firstDate: string | null = null;
    const sessionTopWeights: { date: string; weight: number }[] = [];

    if (userExIds.length > 0) {
      const { data: setRows } = await supabase
        .from("workout_sets")
        .select("session_exercise_id, set_number, reps, weight, unit")
        .in("session_exercise_id", userExIds)
        .order("set_number", { ascending: true });

      const setsByEx = new Map<string, Array<{ set_number: number; reps: number | null; weight: number | null; unit: string | null }>>();
      for (const s of (setRows ?? []) as { session_exercise_id: string; set_number: number; reps: number | null; weight: number | null; unit: string | null }[]) {
        const arr = setsByEx.get(s.session_exercise_id) || [];
        arr.push(s);
        setsByEx.set(s.session_exercise_id, arr);
        totalSets++;
      }

      // Build per-session data
      type ExRow = { id: string; name: string; session_id: string; notes: string | null; comment: string | null };
      const sortedExes = (exRows as ExRow[])
        .filter((e) => sessionInfo.has(e.session_id))
        .sort((a, b) => {
          const da = sessionInfo.get(a.session_id)?.date ?? "";
          const db = sessionInfo.get(b.session_id)?.date ?? "";
          return db.localeCompare(da);
        });

      for (const ex of sortedExes) {
        const info = sessionInfo.get(ex.session_id);
        if (!info) continue;
        const sets = setsByEx.get(ex.id) || [];
        let topWeight = 0;
        for (const s of sets) {
          allSets.push({
            date: info.date,
            session_name: info.name,
            set_number: s.set_number,
            reps: s.reps,
            weight: s.weight,
            unit: s.unit,
            notes: ex.notes || ex.comment || null,
          });
          if (s.weight && s.weight > topWeight) topWeight = s.weight;
          if (s.weight && (prWeight === null || s.weight > prWeight)) {
            prWeight = s.weight;
            prDate = info.date;
          }
        }
        sessionTopWeights.push({ date: info.date, weight: topWeight });
        if (!firstDate || info.date < firstDate) firstDate = info.date;
      }
    }

    const displayName = (exRows as { name: string }[])[0].name;
    const muscleInfo = getExerciseMuscles(displayName);

    return NextResponse.json({
      name: displayName,
      slug,
      muscle_group: muscleInfo.primary,
      muscles: muscleInfo.muscles,
      secondary_muscles: muscleInfo.secondary ?? [],
      pr_weight: prWeight,
      pr_date: prDate,
      total_sets: totalSets,
      first_date: firstDate,
      session_count: sessionInfo.size,
      session_top_weights: sessionTopWeights,
      sets: allSets,
    });
  } catch (err) {
    console.error("[/api/fitness/exercises/:slug GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
