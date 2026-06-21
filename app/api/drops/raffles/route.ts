import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const result = req.nextUrl.searchParams.get("result");

    let q = supabase
      .from("raffle_entries")
      .select("*")
      .order("created_at", { ascending: false });

    if (result) q = q.eq("result", result);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    console.error("[drops/raffles GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.item_name || !body.brand || !body.retailer) {
      return NextResponse.json(
        { error: "item_name, brand, and retailer required" },
        { status: 400 },
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("raffle_entries")
      .insert({
        drop_id: body.drop_id || null,
        wishlist_item_id: body.wishlist_item_id || null,
        retailer: body.retailer,
        item_name: body.item_name,
        brand: body.brand,
        size: body.size || null,
        entry_date: body.entry_date || new Date().toISOString(),
        deadline: body.deadline || null,
        result: body.result || "pending",
        retail_price: body.retail_price || null,
        payment_url: body.payment_url || null,
        notes: body.notes || null,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data });
  } catch (err) {
    console.error("[drops/raffles POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
