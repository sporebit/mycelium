import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { ProgrammePhase } from "@/lib/fitness/types";
import { parseIsoWeek } from "@/lib/util/week";

export const runtime = "nodejs";

const PHASE_FIELDS =
  "id, user_id, programme_id, start_week_iso, end_week_iso, created_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function validIsoWeek(s: unknown): s is string {
  return typeof s === "string" && parseIsoWeek(s) !== null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: { start_week_iso?: string; end_week_iso?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (body.start_week_iso !== undefined) {
    if (!validIsoWeek(body.start_week_iso)) {
      return NextResponse.json({ error: "start_week_iso must be YYYY-Www" }, { status: 400 });
    }
    update.start_week_iso = body.start_week_iso;
  }
  if (body.end_week_iso !== undefined) {
    if (body.end_week_iso !== null && !validIsoWeek(body.end_week_iso)) {
      return NextResponse.json({ error: "end_week_iso must be YYYY-Www or null" }, { status: 400 });
    }
    update.end_week_iso = body.end_week_iso;
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_programme_phases")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(PHASE_FIELDS)
      .single();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ phase: data as ProgrammePhase });
  } catch (err) {
    console.error("[/api/fitness/phases/:id PATCH]", err);
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
      .from("workout_programme_phases")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/phases/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
