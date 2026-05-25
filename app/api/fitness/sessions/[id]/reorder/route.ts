import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type Body = {
  exercise_ids?: string[];
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: sessionId } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const ids = Array.isArray(body.exercise_ids) ? body.exercise_ids : null;
  if (!ids) {
    return NextResponse.json({ error: "exercise_ids required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    // Verify ownership + that every id belongs to this session
    const { data: session } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", uid)
      .maybeSingle();
    if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data: exs } = await supabase
      .from("workout_session_exercises")
      .select("id")
      .eq("session_id", sessionId);
    const valid = new Set<string>(
      ((exs ?? []) as Array<{ id: string }>).map((e) => e.id)
    );
    if (ids.some((id) => !valid.has(id))) {
      return NextResponse.json(
        { error: "id list contains foreign exercise" },
        { status: 400 }
      );
    }
    if (ids.length !== valid.size) {
      return NextResponse.json(
        { error: "id list must cover every exercise in the session" },
        { status: 400 }
      );
    }

    // Two-phase to avoid the unique-on-position collision while sequential
    // UPDATEs are in flight: stash all positions to negatives first, then
    // write the new positions. (We don't actually have a UNIQUE constraint
    // on position, but this also keeps history clean for any future one.)
    await Promise.all(
      ids.map((id, i) =>
        supabase
          .from("workout_session_exercises")
          .update({ position: -1 - i })
          .eq("id", id)
      )
    );
    await Promise.all(
      ids.map((id, i) =>
        supabase
          .from("workout_session_exercises")
          .update({ position: i + 1 })
          .eq("id", id)
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id/reorder]", err);
    return NextResponse.json({ error: "reorder failed" }, { status: 500 });
  }
}
