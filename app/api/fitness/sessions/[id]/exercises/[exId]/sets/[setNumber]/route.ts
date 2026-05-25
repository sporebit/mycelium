import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { WeightUnit } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function ensureOwned(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  exId: string,
  uid: string
): Promise<boolean> {
  const { data } = await supabase
    .from("workout_session_exercises")
    .select("id, workout_sessions:session_id!inner(user_id, id)")
    .eq("id", exId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!data) return false;
  const joined = (data as { workout_sessions?: { user_id?: string } | { user_id?: string }[] })
    .workout_sessions;
  const ownerId = Array.isArray(joined) ? joined[0]?.user_id : joined?.user_id;
  return ownerId === uid;
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
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
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
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, sessionId, exId, uid))) {
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
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: sessionId, exId, setNumber } = await ctx.params;
  const n = Number(setNumber);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid set_number" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, sessionId, exId, uid))) {
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
