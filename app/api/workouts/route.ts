import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  WORKOUT_SELECT,
  WORKOUT_KINDS,
  WORKOUT_SLOTS,
  type Workout,
  type WorkoutExercise,
  type WorkoutKind,
  type WorkoutSlot,
} from "@/lib/fitness/workouts";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const includeArchived = url.searchParams.get("archived") === "true";

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("workouts")
      .select(WORKOUT_SELECT)
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });
    if (!includeArchived) q = q.is("archived_at", null);
    if (kind && WORKOUT_KINDS.includes(kind as WorkoutKind)) {
      q = q.eq("default_kind", kind);
    }
    const { data, error } = await q;
    if (error) throw error;
    const workouts = (data ?? []) as Workout[];

    if (workouts.length > 0) {
      const ids = workouts.map((w) => w.id);

      const { data: exRows } = await supabase
        .from("workout_exercises")
        .select("workout_id")
        .in("workout_id", ids);
      const exCounts = new Map<string, number>();
      for (const r of (exRows ?? []) as Array<{ workout_id: string }>) {
        exCounts.set(r.workout_id, (exCounts.get(r.workout_id) ?? 0) + 1);
      }

      const { data: useRows } = await supabase
        .from("workout_programme_sessions")
        .select("id, workout_id")
        .in("workout_id", ids);
      const useCounts = new Map<string, number>();
      const psToWorkout = new Map<string, string>();
      for (const r of (useRows ?? []) as Array<{ id: string; workout_id: string }>) {
        useCounts.set(r.workout_id, (useCounts.get(r.workout_id) ?? 0) + 1);
        psToWorkout.set(r.id, r.workout_id);
      }

      // Session stats
      const psIds = [...psToWorkout.keys()];
      let sessionsByWorkout = new Map<string, Array<{ id: string; date: string }>>();
      if (psIds.length > 0) {
        const { data: sessions } = await supabase
          .from("workout_sessions")
          .select("id, date, programme_session_id")
          .in("programme_session_id", psIds)
          .in("status", ["completed", "attempted"])
          .order("date", { ascending: false });
        for (const s of (sessions ?? []) as Array<{ id: string; date: string; programme_session_id: string }>) {
          const wid = psToWorkout.get(s.programme_session_id);
          if (!wid) continue;
          const arr = sessionsByWorkout.get(wid) || [];
          arr.push({ id: s.id, date: s.date });
          sessionsByWorkout.set(wid, arr);
        }
      }

      // Volume sparkline data for recent sessions
      const recentIds: string[] = [];
      for (const [, wSessions] of sessionsByWorkout) {
        for (const s of wSessions.slice(0, 8)) recentIds.push(s.id);
      }
      const volumeBySession = new Map<string, number>();
      if (recentIds.length > 0) {
        const { data: sexRows } = await supabase
          .from("workout_session_exercises")
          .select("id, session_id")
          .in("session_id", recentIds);
        const seIds = (sexRows ?? []) as Array<{ id: string; session_id: string }>;
        if (seIds.length > 0) {
          const exToSession = new Map<string, string>();
          for (const e of seIds) exToSession.set(e.id, e.session_id);
          const { data: setRows } = await supabase
            .from("workout_sets")
            .select("session_exercise_id, weight, reps")
            .in("session_exercise_id", seIds.map((e) => e.id));
          for (const s of (setRows ?? []) as Array<{ session_exercise_id: string; weight: number | null; reps: number | null }>) {
            const sid = exToSession.get(s.session_exercise_id);
            if (sid && s.weight && s.reps) {
              volumeBySession.set(sid, (volumeBySession.get(sid) || 0) + s.weight * s.reps);
            }
          }
        }
      }

      for (const w of workouts) {
        w.exercise_count = exCounts.get(w.id) ?? 0;
        w.programme_use_count = useCounts.get(w.id) ?? 0;
        const wSessions = sessionsByWorkout.get(w.id) || [];
        w.times_performed = wSessions.length;
        w.last_performed = wSessions[0]?.date ?? null;
        w.recent_volumes = wSessions
          .slice(0, 8)
          .reverse()
          .map((s) => volumeBySession.get(s.id) || 0);
      }
    }

    return NextResponse.json({ workouts });
  } catch (err) {
    console.error("[/api/workouts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  default_kind?: WorkoutKind | null;
  default_slot?: WorkoutSlot | null;
  notes?: string | null;
  exercises?: Array<Partial<WorkoutExercise>>;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const default_kind =
    body.default_kind && WORKOUT_KINDS.includes(body.default_kind)
      ? body.default_kind
      : null;
  const default_slot =
    body.default_slot && WORKOUT_SLOTS.includes(body.default_slot)
      ? body.default_slot
      : null;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workouts")
      .insert({
        user_id: uid,
        name,
        default_kind,
        default_slot,
        notes: body.notes ?? null,
      })
      .select(WORKOUT_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    const workout = data as Workout;

    const exs = Array.isArray(body.exercises) ? body.exercises : [];
    if (exs.length > 0) {
      const rows = exs.map((e, i) => ({
        workout_id: workout.id,
        name: (e.name ?? "").trim() || "Unnamed",
        sets: typeof e.sets === "number" ? e.sets : 3,
        reps_per_set: e.reps_per_set ?? "8-12",
        rest_seconds: e.rest_seconds ?? 90,
        weight_kg: e.weight_kg ?? null,
        is_bodyweight: !!e.is_bodyweight,
        position: typeof e.position === "number" ? e.position : i,
        notes: e.notes ?? null,
      }));
      await supabase.from("workout_exercises").insert(rows);
    }
    return NextResponse.json({ workout });
  } catch (err) {
    console.error("[/api/workouts POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
