import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { pushDropToGoogle } from "@/lib/google/sync";

export const runtime = "nodejs";

const DROP_TYPE_COLOURS: Record<string, string> = {
  drop: "#84f5b8",
  raffle: "#6db8f5",
  restock: "#f5b56d",
  collab: "#f56db5",
  exclusive: "#f56db5",
};

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const status = req.nextUrl.searchParams.get("status");
    const brand = req.nextUrl.searchParams.get("brand");
    const type = req.nextUrl.searchParams.get("type");

    let q = supabase
      .from("drops")
      .select("*")
      .order("drop_date", { ascending: true, nullsFirst: false });

    if (status) q = q.eq("status", status);
    if (brand) q = q.eq("brand", brand);
    if (type) q = q.eq("drop_type", type);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const brands = [...new Set((data ?? []).map((d) => d.brand))].sort();
    return NextResponse.json({ drops: data ?? [], brands });
  } catch (err) {
    console.error("[drops GET]", err);
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
      .from("drops")
      .insert({
        name: body.name,
        brand: body.brand,
        category: body.category || null,
        drop_type: body.drop_type || "drop",
        drop_date: body.drop_date || null,
        drop_date_confirmed: body.drop_date_confirmed ?? false,
        retail_price: body.retail_price || null,
        resale_price: body.resale_price || null,
        currency: body.currency || "GBP",
        status: body.status || "upcoming",
        image_url: body.image_url || null,
        product_url: body.product_url || null,
        notes: body.notes || null,
        region: body.region || "UK",
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (body.drop_date && body.drop_date_confirmed) {
      const colour = DROP_TYPE_COLOURS[body.drop_type || "drop"] ?? "#e8e6dd";
      const notes = [
        body.retail_price ? `Retail: £${body.retail_price}` : null,
        body.product_url ?? null,
      ]
        .filter(Boolean)
        .join("\n");

      await supabase.from("events").insert({
        title: `${body.brand} — ${body.name} (${body.drop_type || "drop"})`,
        start_at: body.drop_date,
        all_day: false,
        colour,
        notes: notes || null,
      });
    }

    if (data && body.drop_date && body.drop_date_confirmed) {
      pushDropToGoogle({
        id: (data as { id: string }).id,
        name: body.name,
        brand: body.brand,
        drop_date: body.drop_date,
        drop_type: body.drop_type,
        retail_price: body.retail_price,
        product_url: body.product_url,
        notes: body.notes,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, drop: data });
  } catch (err) {
    console.error("[drops POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
