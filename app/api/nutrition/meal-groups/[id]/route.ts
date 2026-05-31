import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: { name?: string; position?: number };
  try {
    body = (await req.json()) as { name?: string; position?: number };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (typeof body.position === "number") {
    update.position = body.position;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("meal_groups")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select("id, user_id, name, position, created_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    return NextResponse.json({ meal_group: data });
  } catch (err) {
    console.error("[/api/nutrition/meal-groups/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("meal_groups")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/nutrition/meal-groups/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
