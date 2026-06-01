import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { WORKOUT_EX_SELECT, type WorkoutExercise } from "@/lib/fitness/workouts";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function ensureOwned(
  supabase: ReturnType<typeof createServerClient>,
  workoutId: string,
  uid: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("user_id", uid)
    .maybeSingle();
  return !!data?.id;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, id, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { data, error } = await supabase
      .from("workout_exercises")
      .select(WORKOUT_EX_SELECT)
      .eq("workout_id", id)
      .order("position", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ exercises: (data ?? []) as WorkoutExercise[] });
  } catch (err) {
    console.error("[/api/workouts/:id/exercises GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = Partial<WorkoutExercise>;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, id, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // Append at end by default
    const { data: maxRow } = await supabase
      .from("workout_exercises")
      .select("position")
      .eq("workout_id", id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos =
      typeof body.position === "number"
        ? body.position
        : ((maxRow?.position as number | undefined) ?? -1) + 1;
    const { data, error } = await supabase
      .from("workout_exercises")
      .insert({
        workout_id: id,
        name,
        sets: typeof body.sets === "number" ? body.sets : 3,
        reps_per_set: body.reps_per_set ?? "8-12",
        rest_seconds: body.rest_seconds ?? 90,
        weight_kg: body.weight_kg ?? null,
        is_bodyweight: !!body.is_bodyweight,
        position: nextPos,
        notes: body.notes ?? null,
      })
      .select(WORKOUT_EX_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    // bump workout updated_at so list ordering reflects the change
    await supabase
      .from("workouts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ exercise: data });
  } catch (err) {
    console.error("[/api/workouts/:id/exercises POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
