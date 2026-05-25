import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type {
  SessionTypeLoggingMode,
  WorkoutSessionType,
} from "@/lib/fitness/types";

export const runtime = "nodejs";

const FIELDS =
  "id, user_id, type_key, label, is_builtin, typical_logging_mode, created_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type PatchBody = {
  label?: string;
  typical_logging_mode?: SessionTypeLoggingMode;
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

  const update: Record<string, unknown> = {};
  if (body.label != null) {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
    if (label.length > 30) return NextResponse.json({ error: "label too long" }, { status: 400 });
    update.label = label;
  }
  if (body.typical_logging_mode != null) {
    if (!["full", "simple"].includes(body.typical_logging_mode)) {
      return NextResponse.json({ error: "invalid mode" }, { status: 400 });
    }
    update.typical_logging_mode = body.typical_logging_mode;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_session_types")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(FIELDS)
      .single();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ type: data as WorkoutSessionType });
  } catch (err) {
    console.error("[/api/fitness/session-types/:id PATCH]", err);
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
    // Block built-ins
    const { data: t } = await supabase
      .from("workout_session_types")
      .select("id, type_key, is_builtin")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
    const row = t as { is_builtin: boolean; type_key: string };
    if (row.is_builtin) {
      return NextResponse.json({ error: "cannot delete built-in" }, { status: 400 });
    }
    // Block if any sessions reference this type
    const { data: refs } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", uid)
      .eq("session_type", row.type_key)
      .limit(1);
    if (refs && refs.length > 0) {
      return NextResponse.json(
        { error: "Type is in use by existing sessions" },
        { status: 409 }
      );
    }
    const { error } = await supabase
      .from("workout_session_types")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/session-types/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
