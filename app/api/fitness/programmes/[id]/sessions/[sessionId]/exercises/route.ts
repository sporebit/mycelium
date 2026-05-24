import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { TemplateExercise } from "@/lib/fitness/types";

export const runtime = "nodejs";

const EXERCISE_FIELDS =
  "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity";

const NUMERIC_FIELDS = new Set([
  "default_sets",
  "default_weight",
  "rest_seconds",
  "default_duration_min",
  "default_distance_km",
  "position",
]);
const STRING_FIELDS = new Set([
  "name",
  "notes",
  "default_reps",
  "default_weight_unit",
  "default_intensity",
]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function sessionBelongsToUser(
  programmeId: string,
  sessionId: string,
  uid: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data: programme } = await supabase
    .from("workout_programmes")
    .select("id")
    .eq("id", programmeId)
    .eq("user_id", uid)
    .maybeSingle();
  if (!programme) return false;
  const { data: session } = await supabase
    .from("workout_programme_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("programme_id", programmeId)
    .maybeSingle();
  return !!session;
}

function pickExercisePayload(
  body: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (STRING_FIELDS.has(k)) {
      if (v === null || typeof v === "string") out[k] = v;
    } else if (NUMERIC_FIELDS.has(k)) {
      if (v === null || typeof v === "number") out[k] = v;
    }
  }
  return out;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; sessionId: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: programmeId, sessionId } = await ctx.params;
  if (!(await sessionBelongsToUser(programmeId, sessionId, uid))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const payload = pickExercisePayload(body);
  if (typeof payload.name !== "string" || !payload.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  payload.programme_session_id = sessionId;
  if (payload.position === undefined) {
    // Append at end
    const supabase = createServerClient();
    const { data: last } = await supabase
      .from("workout_programme_exercises")
      .select("position")
      .eq("programme_session_id", sessionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    payload.position = ((last?.position as number | undefined) ?? 0) + 1;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_programme_exercises")
      .insert(payload)
      .select(EXERCISE_FIELDS)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ exercise: data as TemplateExercise });
  } catch (err) {
    console.error(
      "[/api/fitness/programmes/:id/sessions/:sessionId/exercises POST]",
      err
    );
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
