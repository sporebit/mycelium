import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type {
  Programme,
  ProgrammeDetail,
  TemplateExercise,
  TemplateSession,
} from "@/lib/fitness/types";

export const runtime = "nodejs";

const PROGRAMME_FIELDS = "id, user_id, name, description, created_at, updated_at";
const SESSION_FIELDS =
  "id, programme_id, day_of_week, slot, kind, name, notes";
const EXERCISE_FIELDS =
  "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function loadDetail(
  programmeId: string,
  uid: string
): Promise<ProgrammeDetail | null> {
  const supabase = createServerClient();
  const { data: programme, error } = await supabase
    .from("workout_programmes")
    .select(PROGRAMME_FIELDS)
    .eq("id", programmeId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !programme) return null;

  const { data: sessions } = await supabase
    .from("workout_programme_sessions")
    .select(SESSION_FIELDS)
    .eq("programme_id", programmeId)
    .order("day_of_week", { ascending: true })
    .order("slot", { ascending: true });

  const sessionList = (sessions ?? []) as TemplateSession[];
  const sessionIds = sessionList.map((s) => s.id);

  let exMap = new Map<string, TemplateExercise[]>();
  if (sessionIds.length > 0) {
    const { data: exs } = await supabase
      .from("workout_programme_exercises")
      .select(EXERCISE_FIELDS)
      .in("programme_session_id", sessionIds)
      .order("position", { ascending: true });
    exMap = new Map();
    for (const ex of (exs ?? []) as TemplateExercise[]) {
      const list = exMap.get(ex.programme_session_id) ?? [];
      list.push(ex);
      exMap.set(ex.programme_session_id, list);
    }
  }

  return {
    ...(programme as Programme),
    sessions: sessionList.map((s) => ({ ...s, exercises: exMap.get(s.id) ?? [] })),
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const detail = await loadDetail(id, uid);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ programme: detail });
  } catch (err) {
    console.error("[/api/fitness/programmes/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: { name?: string; description?: string };
  try {
    body = (await req.json()) as { name?: string; description?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (body.description !== undefined) update.description = body.description ?? null;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_programmes")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(PROGRAMME_FIELDS)
      .single();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ programme: data as Programme });
  } catch (err) {
    console.error("[/api/fitness/programmes/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("workout_programmes")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/programmes/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
