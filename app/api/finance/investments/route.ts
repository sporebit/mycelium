import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ investments: data });
  } catch (err) {
    console.error("[investments GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.category || body.quantity == null || body.buy_price == null) {
      return NextResponse.json(
        { error: "name, category, quantity, and buy_price required" },
        { status: 400 },
      );
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("investments")
      .insert({
        name: body.name,
        ticker: body.ticker || null,
        category: body.category,
        sub_category: body.sub_category || null,
        quantity: body.quantity,
        buy_price: body.buy_price,
        buy_currency: body.buy_currency || "GBP",
        buy_date: body.buy_date || null,
        current_price: body.current_price ?? null,
        platform: body.platform || null,
        notes: body.notes || null,
        image_url: body.image_url || null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, investment: data });
  } catch (err) {
    console.error("[investments POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
