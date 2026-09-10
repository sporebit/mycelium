import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const update: Record<string, unknown> = {};

    if (typeof body.message === "string") update.message = body.message.trim();
    if (typeof body.due_at === "string") update.due_at = body.due_at;
    if (body.recurrence !== undefined)
      update.recurrence =
        typeof body.recurrence === "string"
          ? body.recurrence.trim() || null
          : null;
    if (typeof body.cancelled === "boolean") update.cancelled = body.cancelled;

    const { data, error } = await supabase
      .from("reminders")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ reminder: data });
  } catch (err) {
    console.error("[/api/reminders/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/reminders/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
