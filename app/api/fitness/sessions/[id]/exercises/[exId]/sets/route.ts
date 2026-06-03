import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { WeightUnit } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type SetBody = {
  set_number?: number;
  reps?: number | null;
  weight?: number | null;
  unit?: WeightUnit | null;
  hold_seconds?: number | null;
  duration_min?: number | null;
  distance_km?: number | null;
  client_uuid?: string;
};

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
  // workout_sessions join may come back as object or array depending on the
  // PostgREST shape — normalise.
  const joined = (data as { workout_sessions?: { user_id?: string } | { user_id?: string }[] })
    .workout_sessions;
  const ownerId = Array.isArray(joined) ? joined[0]?.user_id : joined?.user_id;
  return ownerId === uid;
}

/**
 * Upsert a set (set_number is the natural key alongside session_exercise_id).
 * The DB has a unique constraint on (session_exercise_id, set_number) so we
 * use upsert with that conflict target.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; exId: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: sessionId, exId } = await ctx.params;

  let body: SetBody;
  try {
    body = (await req.json()) as SetBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const setNumber = Number(body.set_number);
  if (!Number.isInteger(setNumber) || setNumber < 1) {
    return NextResponse.json({ error: "set_number required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, sessionId, exId, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (body.client_uuid) {
      const { data: dup } = await supabase
        .from("workout_sets")
        .select("id")
        .eq("client_uuid", body.client_uuid)
        .maybeSingle();
      if (dup?.id) {
        return NextResponse.json({ ok: true });
      }
    }

    const row: Record<string, unknown> = {
      session_exercise_id: exId,
      set_number: setNumber,
      reps: body.reps ?? null,
      weight: body.weight ?? null,
      unit: body.unit ?? null,
      hold_seconds: body.hold_seconds ?? null,
      duration_min: body.duration_min ?? null,
      distance_km: body.distance_km ?? null,
      completed_at: new Date().toISOString(),
    };
    if (body.client_uuid) row.client_uuid = body.client_uuid;

    const { error } = await supabase
      .from("workout_sets")
      .upsert(row, { onConflict: "session_exercise_id,set_number" });
    if (error) {
      console.error("[sets POST]", error);
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[sets POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
