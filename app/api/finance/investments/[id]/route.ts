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
    const allowed = [
      "name", "ticker", "category", "sub_category", "quantity",
      "buy_price", "buy_currency", "buy_date", "current_price",
      "current_price_updated_at", "platform", "notes", "image_url",
      "sold", "sell_price", "sell_date",
    ];
    const updates: Record<string, unknown> = {};
    for (const f of allowed) {
      if (f in body) updates[f] = body[f];
    }
    const { data, error } = await supabase
      .from("investments")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, investment: data });
  } catch (err) {
    console.error("[investments/:id PATCH]", err);
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
    const { error } = await supabase.from("investments").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[investments/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
