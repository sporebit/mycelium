import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { MOBILITY_SEED } from "@/lib/fitness/seed-mobility";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Idempotent: for every programme the user owns, create an evening mobility
 * template session on Mon-Fri if one doesn't already exist, and seed each
 * newly-created session with the 10-exercise mobility library. Also creates
 * empty exercise_baselines rows for the new mobility exercise names so the
 * pain-tracking integration can hang off them later.
 */
export async function POST() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();
    const { data: programmeRows, error: progErr } = await supabase
      .from("workout_programmes")
      .select("id")
      .eq("user_id", uid);
    if (progErr) {
      console.error("[seed-mobility]", progErr);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    const programmes = (programmeRows ?? []) as Array<{ id: string }>;

    let sessionsCreated = 0;
    let exercisesCreated = 0;

    for (const programme of programmes) {
      for (let dow = 0; dow < 5; dow++) {
        // Skip if any evening session already exists for this (programme, dow)
        const { data: existing } = await supabase
          .from("workout_programme_sessions")
          .select("id")
          .eq("programme_id", programme.id)
          .eq("day_of_week", dow)
          .eq("slot", "evening")
          .limit(1);
        if (existing && existing.length > 0) continue;

        const { data: created, error: insErr } = await supabase
          .from("workout_programme_sessions")
          .insert({
            programme_id: programme.id,
            day_of_week: dow,
            slot: "evening",
            kind: "mobility",
            name: "Mobility",
            position: 0,
          })
          .select("id")
          .single();
        if (insErr || !created) {
          console.error("[seed-mobility] session insert", insErr);
          continue;
        }
        sessionsCreated += 1;

        const rows = MOBILITY_SEED.map((m, idx) => ({
          programme_session_id: created.id,
          position: idx,
          name: m.name,
          notes: m.notes,
          default_sets: m.default_sets,
          default_reps: m.default_reps,
          default_weight: null,
          default_weight_unit: null,
          rest_seconds: m.rest_seconds,
          default_duration_min: m.default_duration_min,
          default_distance_km: null,
          default_intensity: m.default_intensity,
          data_shape: m.data_shape,
          with_weight: m.with_weight,
        }));
        const { error: exErr } = await supabase
          .from("workout_programme_exercises")
          .insert(rows);
        if (exErr) {
          console.error("[seed-mobility] exercises insert", exErr);
          continue;
        }
        exercisesCreated += rows.length;
      }
    }

    // Empty baseline rows for the new mobility names (so the baselines API
    // has something to return when the logger fetches by name).
    let baselinesCreated = 0;
    for (const m of MOBILITY_SEED) {
      const { data: existing } = await supabase
        .from("exercise_baselines")
        .select("id")
        .eq("user_id", uid)
        .ilike("exercise_name", m.name)
        .maybeSingle();
      if (existing?.id) continue;
      const { error } = await supabase.from("exercise_baselines").insert({
        user_id: uid,
        exercise_name: m.name,
        has_known_issues: false,
        typical_severity_min: null,
        typical_severity_max: null,
        pain_regions: null,
        conditional_notes: null,
      });
      if (!error) baselinesCreated += 1;
    }

    return NextResponse.json({
      ok: true,
      programmes_seen: programmes.length,
      evening_sessions_created: sessionsCreated,
      mobility_exercises_inserted: exercisesCreated,
      baselines_created: baselinesCreated,
    });
  } catch (err) {
    console.error("[seed-mobility]", err);
    return NextResponse.json({ error: "seed failed" }, { status: 500 });
  }
}
