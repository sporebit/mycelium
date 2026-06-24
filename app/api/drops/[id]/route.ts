import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { pushDropToGoogle, removeGoogleEvent } from "@/lib/google/sync";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ drop: data });
  } catch (err) {
    console.error("[drops/[id] GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("drops")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data) {
      const d = data as {
        id: string; name: string; brand: string; drop_date: string | null;
        drop_date_confirmed: boolean; drop_type: string; retail_price: number | null;
        product_url: string | null; notes: string | null; google_event_id: string | null;
        status: string;
      };
      if (d.status === "ended" && d.google_event_id) {
        removeGoogleEvent("drops", d.google_event_id).catch(() => {});
      } else if (d.drop_date && d.drop_date_confirmed) {
        pushDropToGoogle({
          id: d.id,
          name: d.name,
          brand: d.brand,
          drop_date: d.drop_date,
          drop_type: d.drop_type,
          retail_price: d.retail_price,
          product_url: d.product_url,
          notes: d.notes,
          google_event_id: d.google_event_id,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, drop: data });
  } catch (err) {
    console.error("[drops/[id] PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();

    const { data: existing } = await supabase
      .from("drops")
      .select("google_event_id")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase.from("drops").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (existing?.google_event_id) {
      removeGoogleEvent("drops", existing.google_event_id).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[drops/[id] DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
