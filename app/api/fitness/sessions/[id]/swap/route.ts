import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { SessionKind, TemplateExercise } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type Body = {
  target_programme_session_id?: string;
};

/**
 * Swap an existing session to a different template. Keeps any session_exercises
 * that have logged sets OR completed/skipped flags; removes any "empty"
 * exercises (no sets, no completion); inserts the new template's exercises
 * for the remainder (de-duped against retained names).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: sessionId } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const targetId = body.target_programme_session_id;
  if (!targetId) {
    return NextResponse.json(
      { error: "target_programme_session_id required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerClient();
    const { data: session } = await supabase
      .from("workout_sessions")
      .select(
        "id, user_id, programme_session_id, swapped_from_programme_session_id, kind, name"
      )
      .eq("id", sessionId)
      .eq("user_id", uid)
      .maybeSingle();
    if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
    const sess = session as {
      id: string;
      programme_session_id: string | null;
      swapped_from_programme_session_id: string | null;
      kind: SessionKind;
    };

    const { data: tgt } = await supabase
      .from("workout_programme_sessions")
      .select("id, name, kind")
      .eq("id", targetId)
      .maybeSingle();
    if (!tgt) {
      return NextResponse.json({ error: "target not found" }, { status: 404 });
    }
    const target = tgt as { id: string; name: string; kind: SessionKind };

    // Find current session_exercises and classify them
    const { data: existingEx } = await supabase
      .from("workout_session_exercises")
      .select("id, name, completed_at, skipped, position")
      .eq("session_id", sessionId);
    type ExRow = {
      id: string;
      name: string;
      completed_at: string | null;
      skipped: boolean;
      position: number;
    };
    const exs = (existingEx ?? []) as ExRow[];
    const keptIds: string[] = [];
    const removedIds: string[] = [];
    if (exs.length > 0) {
      const exIds = exs.map((e) => e.id);
      // Which have at least one set?
      const { data: setRows } = await supabase
        .from("workout_sets")
        .select("session_exercise_id")
        .in("session_exercise_id", exIds);
      const hasSets = new Set<string>();
      for (const r of (setRows ?? []) as Array<{ session_exercise_id: string }>) {
        hasSets.add(r.session_exercise_id);
      }
      for (const e of exs) {
        const dirty = hasSets.has(e.id) || !!e.completed_at || e.skipped;
        if (dirty) keptIds.push(e.id);
        else removedIds.push(e.id);
      }
    }

    const removedCount = removedIds.length;
    if (removedIds.length > 0) {
      await supabase
        .from("workout_session_exercises")
        .delete()
        .in("id", removedIds);
    }

    // Pull the new template's exercises, dedupe by lowercased name against
    // anything we're keeping.
    const { data: tplExs } = await supabase
      .from("workout_programme_exercises")
      .select(
        "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity"
      )
      .eq("programme_session_id", target.id)
      .order("position", { ascending: true });

    const keptNamesLower = new Set<string>();
    if (keptIds.length > 0) {
      const { data: kept } = await supabase
        .from("workout_session_exercises")
        .select("name")
        .in("id", keptIds);
      for (const r of (kept ?? []) as Array<{ name: string }>) {
        keptNamesLower.add(r.name.toLowerCase());
      }
    }
    // Compute the next position
    const { data: maxRow } = await supabase
      .from("workout_session_exercises")
      .select("position")
      .eq("session_id", sessionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextPos = ((maxRow?.position as number | undefined) ?? 0) + 1;

    let addedCount = 0;
    const toInsert = ((tplExs ?? []) as TemplateExercise[])
      .filter((t) => !keptNamesLower.has(t.name.toLowerCase()))
      .map((t) => ({
        session_id: sessionId,
        position: nextPos++,
        name: t.name,
        notes: t.notes,
        rest_seconds: t.rest_seconds ?? 90,
        duration_min: t.default_duration_min,
        distance_km: t.default_distance_km,
        intensity: t.default_intensity,
        programme_exercise_id: t.id,
        save_to_template: false,
        skipped: false,
      }));
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("workout_session_exercises")
        .insert(toInsert);
      if (!insErr) addedCount = toInsert.length;
    }

    // Update the session row itself
    const update: Record<string, unknown> = {
      programme_session_id: target.id,
      kind: target.kind,
      name: target.name,
      updated_at: new Date().toISOString(),
    };
    // Preserve the FIRST swapped_from if a swap has already happened
    if (!sess.swapped_from_programme_session_id && sess.programme_session_id) {
      update.swapped_from_programme_session_id = sess.programme_session_id;
    }
    await supabase
      .from("workout_sessions")
      .update(update)
      .eq("id", sessionId);

    return NextResponse.json({
      session_id: sessionId,
      kept_exercises: keptIds.length,
      added_exercises: addedCount,
      removed_exercises: removedCount,
    });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id/swap]", err);
    return NextResponse.json({ error: "swap failed" }, { status: 500 });
  }
}
