import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: { orderedIds?: string[] };
  try {
    body = (await req.json()) as { orderedIds?: string[] };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const ids = Array.isArray(body.orderedIds) ? body.orderedIds : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "orderedIds required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    const { data: owned } = await supabase
      .from("workouts")
      .select("id")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });
    // Apply positions in one batch. Each PATCH is independent so we
    // fire them in parallel — the race between positions is fine
    // because the desired final state is deterministic.
    await Promise.all(
      ids.map((exId, idx) =>
        supabase
          .from("workout_exercises")
          .update({ position: idx })
          .eq("id", exId)
          .eq("workout_id", id),
      ),
    );
    await supabase
      .from("workouts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/workouts/:id/exercises/reorder POST]", err);
    return NextResponse.json({ error: "reorder failed" }, { status: 500 });
  }
}
