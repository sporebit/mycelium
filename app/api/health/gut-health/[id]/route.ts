import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const updates: Record<string, unknown> = {};
    if (body.bristol_type !== undefined) updates.bristol_type = body.bristol_type;
    if (body.time_of_day !== undefined) updates.time_of_day = body.time_of_day;
    if (body.felt_finished !== undefined) updates.felt_finished = body.felt_finished;
    if (body.wipe_type !== undefined) updates.wipe_type = body.wipe_type;
    if (body.discomfort !== undefined) updates.discomfort = body.discomfort;
    if (body.blood !== undefined) updates.blood = body.blood;
    if (body.urgent !== undefined) updates.urgent = body.urgent;
    if (body.notes !== undefined) updates.notes = body.notes;

    const { data, error } = await supabase
      .from("gut_health_logs")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data });
  } catch (err) {
    console.error("[gut-health PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const { error } = await supabase
      .from("gut_health_logs")
      .delete()
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[gut-health DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
