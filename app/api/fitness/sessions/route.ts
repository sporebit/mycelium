import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/util/date";
import type { Slot, SessionKind, TemplateExercise } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type CreateBody = {
  programme_session_id?: string;
  slot?: Slot;
  kind?: SessionKind;
  name?: string;
  date?: string;
  session_type?: string;
  notes?: string;
  calories?: number;
  /** Set true to create the session without started_at (pre-start, eg swap). */
  pre_start?: boolean;
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

  const slot: Slot = body.slot ?? "extra";
  const kind: SessionKind = body.kind ?? "other";
  const date = body.date ?? localDateKey();
  const programmeSessionId = body.programme_session_id ?? null;

  if (!["morning", "afternoon", "evening", "extra"].includes(slot)) {
    return NextResponse.json({ error: "invalid slot" }, { status: 400 });
  }
  if (
    !["cardio", "conditioning", "resistance", "mobility", "other"].includes(
      kind
    )
  ) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Idempotency: if a session for (user, date, programme_session_id) already
    // exists, return that one instead of creating a duplicate. This is what
    // "RESUME" depends on.
    if (programmeSessionId) {
      const { data: existing } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("user_id", uid)
        .eq("date", date)
        .eq("programme_session_id", programmeSessionId)
        .maybeSingle();
      if (existing?.id) {
        return NextResponse.json({ session_id: existing.id, resumed: true });
      }
    }

    // Resolve a default name from the template if one isn't supplied
    let resolvedName = body.name ?? null;
    let templateExercises: TemplateExercise[] = [];
    if (programmeSessionId) {
      const { data: tplSession } = await supabase
        .from("workout_programme_sessions")
        .select("name")
        .eq("id", programmeSessionId)
        .maybeSingle();
      if (tplSession?.name && !resolvedName) resolvedName = tplSession.name;

      const { data: tplExs } = await supabase
        .from("workout_programme_exercises")
        .select(
          "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity, data_shape, with_weight"
        )
        .eq("programme_session_id", programmeSessionId)
        .order("position", { ascending: true });
      templateExercises = (tplExs ?? []) as TemplateExercise[];
    }

    // Compute next position for (user, date, slot) so multi-session slots stay ordered.
    let nextPosition = 0;
    {
      const { data: posRow } = await supabase
        .from("workout_sessions")
        .select("position")
        .eq("user_id", uid)
        .eq("date", date)
        .eq("slot", slot)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextPosition = ((posRow?.position as number | undefined) ?? -1) + 1;
    }

    const insertRow: Record<string, unknown> = {
      user_id: uid,
      date,
      slot,
      kind,
      name: resolvedName,
      programme_session_id: programmeSessionId,
      started_at: body.pre_start ? null : new Date().toISOString(),
      position: nextPosition,
    };
    if (body.session_type != null) insertRow.session_type = body.session_type;
    if (body.notes != null) insertRow.notes = body.notes;
    if (body.calories != null) insertRow.calories = body.calories;
    // For "simple" sessions like hiking / walks that the modal completes
    // outright, mark them done at creation time.
    if (body.pre_start === false && body.session_type) {
      // leave to caller to decide completion via /finish.
    }

    const { data: created, error: createErr } = await supabase
      .from("workout_sessions")
      .insert(insertRow)
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("[/api/fitness/sessions POST] insert", createErr);
      return NextResponse.json({ error: "create failed" }, { status: 500 });
    }

    if (templateExercises.length > 0) {
      const rows = templateExercises.map((t) => ({
        session_id: created.id,
        position: t.position,
        name: t.name,
        notes: t.notes,
        rest_seconds: t.rest_seconds ?? 90,
        duration_min: t.default_duration_min,
        distance_km: t.default_distance_km,
        intensity: t.default_intensity,
        programme_exercise_id: t.id,
        save_to_template: false,
        skipped: false,
        data_shape: t.data_shape ?? "sets_reps",
        with_weight: !!t.with_weight,
      }));
      const { error: exErr } = await supabase
        .from("workout_session_exercises")
        .insert(rows);
      if (exErr) {
        console.error("[/api/fitness/sessions POST] copy template", exErr);
      }
    }

    return NextResponse.json({ session_id: created.id, resumed: false });
  } catch (err) {
    console.error("[/api/fitness/sessions POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
