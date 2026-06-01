import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  WORKOUT_SELECT,
  WORKOUT_EX_SELECT,
  WORKOUT_KINDS,
  WORKOUT_SLOTS,
  type Workout,
  type WorkoutDetail,
  type WorkoutExercise,
  type WorkoutKind,
  type WorkoutSlot,
} from "@/lib/fitness/workouts";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

const ALLOWED_FIELDS = new Set([
  "name",
  "default_kind",
  "default_slot",
  "notes",
  "archived_at",
]);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workouts")
      .select(WORKOUT_SELECT)
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const workout = data as Workout;
    const { data: exRows } = await supabase
      .from("workout_exercises")
      .select(WORKOUT_EX_SELECT)
      .eq("workout_id", id)
      .order("position", { ascending: true });
    const { data: useRows } = await supabase
      .from("workout_programme_sessions")
      .select(
        "id, programme_id, day_of_week, slot, workout_programmes:programme_id(name)",
      )
      .eq("workout_id", id);
    type UseRow = {
      id: string;
      programme_id: string;
      day_of_week: number;
      slot: string;
      workout_programmes:
        | { name: string }
        | { name: string }[]
        | null;
    };
    const usedIn = ((useRows ?? []) as UseRow[]).map((r) => {
      const p = Array.isArray(r.workout_programmes)
        ? r.workout_programmes[0]
        : r.workout_programmes;
      return {
        programme_id: r.programme_id,
        programme_name: p?.name ?? "(programme)",
        programme_session_id: r.id,
        day_of_week: r.day_of_week,
        slot: r.slot,
      };
    });
    const detail: WorkoutDetail = {
      ...workout,
      exercises: ((exRows ?? []) as WorkoutExercise[]),
      used_in: usedIn,
    };
    return NextResponse.json({ workout: detail });
  } catch (err) {
    console.error("[/api/workouts/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === "default_kind") {
      if (v !== null && !WORKOUT_KINDS.includes(v as WorkoutKind)) continue;
    }
    if (k === "default_slot") {
      if (v !== null && !WORKOUT_SLOTS.includes(v as WorkoutSlot)) continue;
    }
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workouts")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(WORKOUT_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    return NextResponse.json({ workout: data });
  } catch (err) {
    console.error("[/api/workouts/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    // Soft-delete via archived_at; programme references stay intact
    // (we don't dangle by cascading) but the workout disappears from
    // the library list.
    const { error } = await supabase
      .from("workouts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/workouts/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
