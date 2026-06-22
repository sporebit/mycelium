import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: list, error: fetchErr } = await supabase
      .from("shopping_lists")
      .select("items")
      .eq("id", id)
      .single();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const items = [...((list.items as unknown[]) ?? [])];
    const newItem = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      quantity: body.quantity || null,
      checked: false,
      added_by: body.added_by || "manual",
    };
    items.push(newItem);

    const { error } = await supabase
      .from("shopping_lists")
      .update({ items })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: newItem });
  } catch (err) {
    console.error("[shopping-lists items POST]", err);
    return NextResponse.json({ error: "add item failed" }, { status: 500 });
  }
}
