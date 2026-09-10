import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeightUnit } from "@/lib/fitness/types";

export const runtime = "nodejs";

async function ensureOwned(
  supabase: SupabaseClient,
  sessionId: string,
  exId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("workout_session_exercises")
    .select("id")
    .eq("id", exId)
    .eq("session_id", sessionId)
    .maybeSingle();
  return !!data;
}

type PatchBody = {
  reps?: number | null;
  weight?: number | null;
  unit?: WeightUnit | null;
  completed_at?: string | null;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; exId: string; setNumber: string }> }
) {
  const { id: sessionId, exId, setNumber } = await ctx.params;
  const n = Number(setNumber);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid set_number" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.reps !== undefined) update.reps = body.reps;
  if (body.weight !== undefined) update.weight = body.weight;
  if (body.unit !== undefined) update.unit = body.unit;
  if (body.completed_at !== undefined) update.completed_at = body.completed_at;

  try {
    const supabase = await createUserClient();
    if (!(await ensureOwned(supabase, sessionId, exId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { error } = await supabase
      .from("workout_sets")
      .update(update)
      .eq("session_exercise_id", exId)
      .eq("set_number", n);
    if (error) {
      console.error("[set PATCH]", error);
      return NextResponse.json({ error: "update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[set PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; exId: string; setNumber: string }> }
) {
  const { id: sessionId, exId, setNumber } = await ctx.params;
  const n = Number(setNumber);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid set_number" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    if (!(await ensureOwned(supabase, sessionId, exId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { error } = await supabase
      .from("workout_sets")
      .delete()
      .eq("session_exercise_id", exId)
      .eq("set_number", n);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[set DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
