import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function ensureOwned(
  supabase: ReturnType<typeof createServerClient>,
  sessionId: string,
  uid: string
): Promise<boolean> {
  const { data } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", uid)
    .maybeSingle();
  return !!data?.id;
}

type AddBody = {
  name?: string;
  notes?: string | null;
  rest_seconds?: number | null;
  duration_min?: number | null;
  distance_km?: number | null;
  intensity?: string | null;
  save_to_template?: boolean;
  client_uuid?: string;
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: sessionId } = await ctx.params;

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const supabase = createServerClient();
    if (!(await ensureOwned(supabase, sessionId, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (body.client_uuid) {
      const { data: dup } = await supabase
        .from("workout_session_exercises")
        .select("id")
        .eq("client_uuid", body.client_uuid)
        .maybeSingle();
      if (dup?.id) {
        return NextResponse.json({ session_exercise_id: dup.id });
      }
    }

    const { data: maxRow } = await supabase
      .from("workout_session_exercises")
      .select("position")
      .eq("session_id", sessionId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = ((maxRow?.position as number | undefined) ?? 0) + 1;

    const row: Record<string, unknown> = {
      session_id: sessionId,
      position: nextPos,
      name,
      notes: body.notes ?? null,
      rest_seconds: body.rest_seconds ?? 90,
      duration_min: body.duration_min ?? null,
      distance_km: body.distance_km ?? null,
      intensity: body.intensity ?? null,
      save_to_template: body.save_to_template ?? false,
      skipped: false,
    };
    if (body.client_uuid) row.client_uuid = body.client_uuid;

    const { data, error } = await supabase
      .from("workout_session_exercises")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      console.error("[/api/fitness/sessions/:id/exercises POST]", error);
      return NextResponse.json({ error: "create failed" }, { status: 500 });
    }
    return NextResponse.json({ session_exercise_id: data.id });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id/exercises POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
