import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  PHIL_PROGRAMME_NAME,
  PHIL_PROGRAMME_SEED,
} from "@/lib/fitness/seed";
import { isoWeekString } from "@/lib/util/week";

export const runtime = "nodejs";

export async function POST() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  try {
    const supabase = createServerClient();

    // Idempotency: if a programme with this name already exists, skip.
    const { data: existing } = await supabase
      .from("workout_programmes")
      .select("id, name")
      .eq("user_id", uid)
      .eq("name", PHIL_PROGRAMME_NAME)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        skipped: true,
        reason: "programme already seeded",
        programme_id: existing.id,
      });
    }

    // 1. Insert programme
    const { data: programme, error: pErr } = await supabase
      .from("workout_programmes")
      .insert({
        user_id: uid,
        name: PHIL_PROGRAMME_SEED.name,
        description: PHIL_PROGRAMME_SEED.description,
      })
      .select("id")
      .single();
    if (pErr || !programme) {
      throw pErr ?? new Error("programme insert failed");
    }
    const programmeId = programme.id as string;

    // 2. Insert sessions, then exercises for each
    let sessionsCreated = 0;
    let exercisesCreated = 0;

    for (const session of PHIL_PROGRAMME_SEED.sessions) {
      const { data: sessRow, error: sErr } = await supabase
        .from("workout_programme_sessions")
        .insert({
          programme_id: programmeId,
          day_of_week: session.day_of_week,
          slot: session.slot,
          kind: session.kind,
          name: session.name,
          notes: session.notes ?? null,
        })
        .select("id")
        .single();
      if (sErr || !sessRow) {
        throw sErr ?? new Error("session insert failed");
      }
      sessionsCreated++;

      if (session.exercises.length > 0) {
        const rows = session.exercises.map((ex) => ({
          programme_session_id: sessRow.id,
          position: ex.position,
          name: ex.name,
          notes: ex.notes ?? null,
          default_sets: ex.default_sets ?? null,
          default_reps: ex.default_reps ?? null,
          default_weight: ex.default_weight ?? null,
          default_weight_unit: ex.default_weight_unit ?? null,
          rest_seconds: ex.rest_seconds ?? null,
          default_duration_min: ex.default_duration_min ?? null,
          default_distance_km: ex.default_distance_km ?? null,
          default_intensity: ex.default_intensity ?? null,
        }));
        const { error: eErr } = await supabase
          .from("workout_programme_exercises")
          .insert(rows);
        if (eErr) {
          throw eErr;
        }
        exercisesCreated += rows.length;
      }
    }

    // 3. Create the initial phase, starting this ISO week, ongoing
    const startWeek = isoWeekString(new Date());
    const { data: phase, error: phErr } = await supabase
      .from("workout_programme_phases")
      .insert({
        user_id: uid,
        programme_id: programmeId,
        start_week_iso: startWeek,
        end_week_iso: null,
      })
      .select("id, start_week_iso")
      .single();
    if (phErr || !phase) {
      throw phErr ?? new Error("phase insert failed");
    }

    return NextResponse.json({
      ok: true,
      programme_id: programmeId,
      sessions_created: sessionsCreated,
      exercises_created: exercisesCreated,
      phase_id: phase.id,
      start_week_iso: phase.start_week_iso,
    });
  } catch (err) {
    console.error("[/api/fitness/seed POST]", err);
    return NextResponse.json(
      { error: "seed failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
