import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { WORKOUT_KINDS, WORKOUT_SLOTS, type WorkoutKind, type WorkoutSlot } from "@/lib/fitness/workouts";
import type { TemplateSession } from "@/lib/fitness/types";

export const runtime = "nodejs";

const SESSION_FIELDS = "id, programme_id, day_of_week, slot, kind, name, notes, position, workout_id";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function userOwnsProgramme(
  programmeId: string,
  uid: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("workout_programmes")
    .select("id")
    .eq("id", programmeId)
    .eq("user_id", uid)
    .maybeSingle();
  return !!data;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; sessionId: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: programmeId, sessionId } = await ctx.params;
  if (!(await userOwnsProgramme(programmeId, uid))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (body.notes !== undefined) update.notes = body.notes ?? null;
  if (typeof body.kind === "string" && WORKOUT_KINDS.includes(body.kind as WorkoutKind)) {
    update.kind = body.kind;
  }
  if (typeof body.slot === "string" && WORKOUT_SLOTS.includes(body.slot as WorkoutSlot)) {
    update.slot = body.slot;
  }
  if (
    typeof body.day_of_week === "number" &&
    body.day_of_week >= 0 &&
    body.day_of_week <= 6
  ) {
    update.day_of_week = body.day_of_week;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_programme_sessions")
      .update(update)
      .eq("id", sessionId)
      .eq("programme_id", programmeId)
      .select(SESSION_FIELDS)
      .single();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ session: data as TemplateSession });
  } catch (err) {
    console.error("[/api/fitness/programmes/:id/sessions/:sessionId PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; sessionId: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: programmeId, sessionId } = await ctx.params;
  if (!(await userOwnsProgramme(programmeId, uid))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("workout_programme_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("programme_id", programmeId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/programmes/:id/sessions/:sessionId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
