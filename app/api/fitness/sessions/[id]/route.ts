import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { loadSessionDetail } from "@/lib/fitness/session-detail";
import { SESSION_STATUSES, type SessionStatus } from "@/lib/fitness/types";
import { markStaleSessionsAttempted } from "@/lib/fitness/mark-stale-attempted";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    // Piggyback the stale-session sweep so opening any session detail
    // page also reconciles older active rows. Cheap partial-indexed
    // update; soft-fails if it doesn't land.
    await markStaleSessionsAttempted(supabase, uid);
    const detail = await loadSessionDetail(supabase, id, uid);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ session: detail });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type PatchBody = {
  calories?: number | null;
  notes?: string | null;
  free_form_text?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  name?: string | null;
  status?: SessionStatus;
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
  if (body.calories !== undefined) update.calories = body.calories;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.free_form_text !== undefined) update.free_form_text = body.free_form_text;
  if (body.name !== undefined) update.name = body.name;
  if (body.started_at !== undefined) update.started_at = body.started_at;
  if (body.completed_at !== undefined) {
    update.completed_at = body.completed_at;
    // Keep status in sync with completed_at when the caller doesn't pass
    // an explicit status: clearing completed_at reverts to 'active',
    // setting it advances to 'completed'.
    if (body.status === undefined) {
      update.status = body.completed_at ? "completed" : "active";
    }
  }
  if (body.status !== undefined) {
    if (!SESSION_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_sessions")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id PATCH]", err);
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
      .from("workout_sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/sessions/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
