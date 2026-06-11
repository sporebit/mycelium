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
  type WorkoutSessionSummary,
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

    // Session history via programme_sessions
    const psIds = usedIn.map((u) => u.programme_session_id);
    let sessions: WorkoutSessionSummary[] = [];
    if (psIds.length > 0) {
      const { data: wSessions } = await supabase
        .from("workout_sessions")
        .select("id, date, status, started_at, completed_at, programme_session_id")
        .in("programme_session_id", psIds)
        .in("status", ["completed", "attempted"])
        .order("date", { ascending: false })
        .limit(50);
      const wsRows = (wSessions ?? []) as Array<{
        id: string; date: string; status: string;
        started_at: string | null; completed_at: string | null;
      }>;
      if (wsRows.length > 0) {
        const wsIds = wsRows.map((s) => s.id);
        const { data: sexRows } = await supabase
          .from("workout_session_exercises")
          .select("id, session_id")
          .in("session_id", wsIds);
        const seArr = (sexRows ?? []) as Array<{ id: string; session_id: string }>;
        const volumeBySession = new Map<string, number>();
        const setsBySession = new Map<string, number>();
        if (seArr.length > 0) {
          const exToSession = new Map<string, string>();
          for (const e of seArr) exToSession.set(e.id, e.session_id);
          const { data: setRows } = await supabase
            .from("workout_sets")
            .select("session_exercise_id, weight, reps")
            .in("session_exercise_id", seArr.map((e) => e.id));
          for (const s of (setRows ?? []) as Array<{
            session_exercise_id: string; weight: number | null; reps: number | null;
          }>) {
            const sid = exToSession.get(s.session_exercise_id);
            if (!sid) continue;
            setsBySession.set(sid, (setsBySession.get(sid) || 0) + 1);
            if (s.weight && s.reps) {
              volumeBySession.set(sid, (volumeBySession.get(sid) || 0) + s.weight * s.reps);
            }
          }
        }
        sessions = wsRows.map((s) => {
          let durationMinutes: number | null = null;
          if (s.started_at && s.completed_at) {
            durationMinutes = Math.round(
              (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000,
            );
          }
          return {
            session_id: s.id,
            date: s.date,
            status: s.status,
            total_volume_kg: volumeBySession.get(s.id) || 0,
            set_count: setsBySession.get(s.id) || 0,
            duration_minutes: durationMinutes,
          };
        });
      }
    }

    const detail: WorkoutDetail = {
      ...workout,
      exercises: (exRows ?? []) as WorkoutExercise[],
      used_in: usedIn,
    };
    return NextResponse.json({ workout: detail, sessions });
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
