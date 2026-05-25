import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/** Toggle-able skip endpoint (POST with optional { skipped: false } to unskip). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; exId: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: sessionId, exId } = await ctx.params;

  let skipped = true;
  try {
    const body = (await req.json().catch(() => ({}))) as { skipped?: boolean };
    if (typeof body.skipped === "boolean") skipped = body.skipped;
  } catch {
    /* default to true */
  }

  try {
    const supabase = createServerClient();
    // Ownership check via join
    const { data: ex } = await supabase
      .from("workout_session_exercises")
      .select("id, session_id, workout_sessions:session_id(user_id)")
      .eq("id", exId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (!ex?.id) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { error } = await supabase
      .from("workout_session_exercises")
      .update({ skipped })
      .eq("id", exId);
    if (error) {
      console.error("[skip POST]", error);
      return NextResponse.json({ error: "update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, skipped });
  } catch (err) {
    console.error("[skip POST]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
