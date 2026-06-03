import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { toKg } from "@/lib/fitness/units";
import type { WeightUnit } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type FinishBody = {
  calories?: number | null;
  notes?: string | null;
  apply_template_updates?: boolean;
  save_as_workout?: boolean;
  workout_name?: string;
};

/**
 * Closes a session in one shot:
 *  1. PATCH session with completed_at + calories + notes
 *  2. Optionally walks any session_exercises with save_to_template = true and
 *     pushes their top-set values back to the parent template
 *     (UPDATE for template-backed rows, INSERT for ad-hoc rows).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: sessionId } = await ctx.params;

  let body: FinishBody;
  try {
    body = (await req.json().catch(() => ({}))) as FinishBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { data: sess } = await supabase
      .from("workout_sessions")
      .select("id, user_id, programme_session_id")
      .eq("id", sessionId)
      .eq("user_id", uid)
      .maybeSingle();
    if (!sess?.id) return NextResponse.json({ error: "not found" }, { status: 404 });

    const finishedAt = new Date().toISOString();
    const { error: patchErr } = await supabase
      .from("workout_sessions")
      .update({
        completed_at: finishedAt,
        calories: body.calories ?? null,
        notes: body.notes ?? null,
        updated_at: finishedAt,
      })
      .eq("id", sessionId);
    if (patchErr) {
      console.error("[finish] session update", patchErr);
      return NextResponse.json({ error: "patch failed" }, { status: 500 });
    }

    let templateUpdates = 0;
    let templateInserts = 0;
    if (body.apply_template_updates) {
      const { data: exRows } = await supabase
        .from("workout_session_exercises")
        .select(
          "id, position, name, notes, rest_seconds, duration_min, distance_km, intensity, programme_exercise_id, save_to_template"
        )
        .eq("session_id", sessionId)
        .eq("save_to_template", true);
      const exs = (exRows ?? []) as Array<{
        id: string;
        position: number;
        name: string;
        notes: string | null;
        rest_seconds: number | null;
        duration_min: number | null;
        distance_km: number | null;
        intensity: string | null;
        programme_exercise_id: string | null;
        save_to_template: boolean;
      }>;

      for (const ex of exs) {
        const { data: setRows } = await supabase
          .from("workout_sets")
          .select("set_number, reps, weight, unit, completed_at")
          .eq("session_exercise_id", ex.id)
          .not("completed_at", "is", null);
        type SetRow = {
          set_number: number;
          reps: number | null;
          weight: number | null;
          unit: WeightUnit | null;
        };
        const sets = (setRows ?? []) as SetRow[];
        let top: SetRow | null = null;
        let topKg = -Infinity;
        for (const s of sets) {
          if (s.weight == null) continue;
          const kg = toKg(s.weight, (s.unit ?? "kg") as WeightUnit);
          if (kg > topKg) {
            topKg = kg;
            top = s;
          }
        }

        if (ex.programme_exercise_id) {
          const patch: Record<string, unknown> = {};
          if (top?.weight != null) patch.default_weight = top.weight;
          if (top?.unit) patch.default_weight_unit = top.unit;
          if (top?.reps != null) patch.default_reps = String(top.reps);
          if (sets.length > 0) patch.default_sets = sets.length;
          if (Object.keys(patch).length > 0) {
            await supabase
              .from("workout_programme_exercises")
              .update(patch)
              .eq("id", ex.programme_exercise_id);
            templateUpdates++;
          }
        } else if (sess.programme_session_id) {
          // Ad-hoc add: insert as a new template row
          const { data: maxRow } = await supabase
            .from("workout_programme_exercises")
            .select("position")
            .eq("programme_session_id", sess.programme_session_id)
            .order("position", { ascending: false })
            .limit(1)
            .maybeSingle();
          const nextPos = ((maxRow?.position as number | undefined) ?? 0) + 1;
          const { data: inserted } = await supabase
            .from("workout_programme_exercises")
            .insert({
              programme_session_id: sess.programme_session_id,
              position: nextPos,
              name: ex.name,
              notes: ex.notes,
              default_sets: sets.length || null,
              default_reps: top?.reps != null ? String(top.reps) : null,
              default_weight: top?.weight ?? null,
              default_weight_unit: top?.unit ?? null,
              rest_seconds: ex.rest_seconds ?? 90,
              default_duration_min: ex.duration_min,
              default_distance_km: ex.distance_km,
              default_intensity: ex.intensity,
            })
            .select("id")
            .single();
          if (inserted?.id) {
            await supabase
              .from("workout_session_exercises")
              .update({ programme_exercise_id: inserted.id })
              .eq("id", ex.id);
            templateInserts++;
          }
        }
      }
    }

    let saved_workout_id: string | null = null;
    if (body.save_as_workout && !sess.programme_session_id) {
      const { data: sessionRow } = await supabase
        .from("workout_sessions")
        .select("name, kind")
        .eq("id", sessionId)
        .single();
      const wName = body.workout_name?.trim() || (sessionRow?.name as string) || "Workout";
      const wKind = (sessionRow?.kind as string) || "other";

      const { data: allExs } = await supabase
        .from("workout_session_exercises")
        .select("name, rest_seconds, is_bodyweight, position, notes")
        .eq("session_id", sessionId)
        .eq("skipped", false)
        .order("position", { ascending: true });

      if (allExs && allExs.length > 0) {
        const { data: wRow } = await supabase
          .from("workouts")
          .insert({ user_id: uid, name: wName, default_kind: wKind })
          .select("id")
          .single();
        if (wRow?.id) {
          saved_workout_id = wRow.id as string;
          const wExRows = (allExs as Array<{
            name: string;
            rest_seconds: number | null;
            is_bodyweight: boolean;
            position: number;
            notes: string | null;
          }>).map((ex, i) => ({
            workout_id: wRow.id,
            name: ex.name,
            rest_seconds: ex.rest_seconds ?? 90,
            is_bodyweight: !!ex.is_bodyweight,
            position: i,
            notes: ex.notes,
            sets: 3,
            reps_per_set: "8-12",
          }));
          await supabase.from("workout_exercises").insert(wExRows);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      template_updates: templateUpdates,
      template_inserts: templateInserts,
      saved_workout_id,
    });
  } catch (err) {
    console.error("[finish]", err);
    return NextResponse.json({ error: "finish failed" }, { status: 500 });
  }
}
