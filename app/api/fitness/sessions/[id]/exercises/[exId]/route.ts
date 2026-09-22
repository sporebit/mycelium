import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function ensureOwned(
  supabase: SupabaseClient,
  sessionId: string,
  exId: string
): Promise<boolean> {
  const { data: sess } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess?.id) return false;
  const { data: ex } = await supabase
    .from("workout_session_exercises")
    .select("id")
    .eq("id", exId)
    .eq("session_id", sessionId)
    .maybeSingle();
  return !!ex?.id;
}

type PatchBody = {
  name?: string;
  comment?: string | null;
  notes?: string | null;
  skipped?: boolean;
  superset_group?: number | null;
  save_to_template?: boolean;
  rest_seconds?: number | null;
  duration_min?: number | null;
  distance_km?: number | null;
  intensity?: string | null;
  completed_at?: string | null;
  is_bodyweight?: boolean;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; exId: string }> }
) {
  const { id: sessionId, exId } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.comment !== undefined) update.comment = body.comment;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.skipped !== undefined) update.skipped = body.skipped;
  if (body.save_to_template !== undefined)
    update.save_to_template = body.save_to_template;
  if (body.rest_seconds !== undefined) update.rest_seconds = body.rest_seconds;
  if (body.superset_group === null || (typeof body.superset_group === "number" && Number.isInteger(body.superset_group) && body.superset_group > 0)) update.superset_group = body.superset_group;
  if (body.duration_min !== undefined) update.duration_min = body.duration_min;
  if (body.distance_km !== undefined) update.distance_km = body.distance_km;
  if (body.intensity !== undefined) update.intensity = body.intensity;
  if (body.completed_at !== undefined) update.completed_at = body.completed_at;
  if (typeof body.is_bodyweight === "boolean")
    update.is_bodyweight = body.is_bodyweight;

  try {
    const supabase = await createUserClient();
    if (!(await ensureOwned(supabase, sessionId, exId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { error } = await supabase
      .from("workout_session_exercises")
      .update(update)
      .eq("id", exId);
    if (error) {
      console.error("[/api/fitness/sessions/:id/exercises/:exId PATCH]", error);
      return NextResponse.json({ error: "update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id/exercises/:exId PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; exId: string }> }
) {
  const { id: sessionId, exId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    if (!(await ensureOwned(supabase, sessionId, exId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { error } = await supabase
      .from("workout_session_exercises")
      .delete()
      .eq("id", exId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id/exercises/:exId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
