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
    if (body.title !== undefined) updates.title = body.title;
    if (body.items !== undefined) updates.items = body.items;
    if (body.default_list !== undefined) updates.default_list = body.default_list;

    const { data, error } = await supabase
      .from("shopping_lists")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, list: data });
  } catch (err) {
    console.error("[shopping-lists PATCH]", err);
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
      .from("shopping_lists")
      .delete()
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[shopping-lists DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
