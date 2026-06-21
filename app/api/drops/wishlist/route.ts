import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const status = req.nextUrl.searchParams.get("status");

    let q = supabase
      .from("wishlist_items")
      .select("*, drops(brand, name, drop_type)")
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const brands = [...new Set((data ?? []).map((d) => d.brand))].sort();
    return NextResponse.json({ items: data ?? [], brands });
  } catch (err) {
    console.error("[drops/wishlist GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.brand) {
      return NextResponse.json({ error: "name and brand required" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("wishlist_items")
      .insert({
        drop_id: body.drop_id || null,
        name: body.name,
        brand: body.brand,
        category: body.category || null,
        colourway: body.colourway || null,
        size: body.size || null,
        status: body.status || "want",
        retail_price: body.retail_price || null,
        resale_price: body.resale_price || null,
        currency: body.currency || "GBP",
        image_url: body.image_url || null,
        product_url: body.product_url || null,
        stockx_url: body.stockx_url || null,
        grailed_url: body.grailed_url || null,
        notes: body.notes || null,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (err) {
    console.error("[drops/wishlist POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
