import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ItemShape = Record<string, unknown>;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();

    const { data: list, error: fetchErr } = await supabase
      .from("shopping_lists")
      .select("items")
      .eq("id", id)
      .single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const items = ((list.items as ItemShape[]) ?? []).map((item) => {
      if (item.id === itemId) {
        return { ...item, ...body };
      }
      return item;
    });

    const { error } = await supabase
      .from("shopping_lists")
      .update({ items })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[shopping-lists item PATCH]", err);
    return NextResponse.json({ error: "update item failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await ctx.params;
    const supabase = createServerClient();

    const { data: list, error: fetchErr } = await supabase
      .from("shopping_lists")
      .select("items")
      .eq("id", id)
      .single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const items = ((list.items as ItemShape[]) ?? []).filter(
      (item) => item.id !== itemId,
    );

    const { error } = await supabase
      .from("shopping_lists")
      .update({ items })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[shopping-lists item DELETE]", err);
    return NextResponse.json({ error: "delete item failed" }, { status: 500 });
  }
}
