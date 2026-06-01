import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { WORKOUT_EX_SELECT } from "@/lib/fitness/workouts";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

const ALLOWED = new Set([
  "name",
  "sets",
  "reps_per_set",
  "rest_seconds",
  "weight_kg",
  "is_bodyweight",
  "position",
  "notes",
]);

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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; exerciseId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, exerciseId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    update[k] = v;
  }
  try {
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, id, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { data, error } = await supabase
      .from("workout_exercises")
      .update(update)
      .eq("id", exerciseId)
      .eq("workout_id", id)
      .select(WORKOUT_EX_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    await supabase
      .from("workouts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ exercise: data });
  } catch (err) {
    console.error("[/api/workouts/:id/exercises/:exerciseId PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; exerciseId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, exerciseId } = await ctx.params;
  try {
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, id, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { error } = await supabase
      .from("workout_exercises")
      .delete()
      .eq("id", exerciseId)
      .eq("workout_id", id);
    if (error) throw error;
    await supabase
      .from("workouts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/workouts/:id/exercises/:exerciseId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
