import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { ExercisePainLog, FeelRating } from "@/lib/fitness/types";

export const runtime = "nodejs";

const LOG_FIELDS =
  "id, user_id, session_id, session_exercise_id, exercise_name, severity, feel_rating, pain_regions, notes, logged_at, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type PatchBody = {
  severity?: number | null;
  feel_rating?: FeelRating | null;
  pain_regions?: string[] | null;
  notes?: string | null;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.severity !== undefined) update.severity = body.severity;
  if (body.feel_rating !== undefined) update.feel_rating = body.feel_rating;
  if (body.pain_regions !== undefined) update.pain_regions = body.pain_regions;
  if (body.notes !== undefined) update.notes = body.notes;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("exercise_pain_logs")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(LOG_FIELDS)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ pain_log: data as ExercisePainLog });
  } catch (err) {
    console.error("[/api/fitness/pain-logs/:id PATCH]", err);
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
      .from("exercise_pain_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/pain-logs/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
