import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const difficulty = req.nextUrl.searchParams.get("difficulty");
    const region = req.nextUrl.searchParams.get("region");

    let q = supabase
      .from("cook_guides")
      .select("*")
      .order("retailer", { ascending: true });

    if (difficulty) q = q.eq("difficulty", difficulty);
    if (region) q = q.eq("region", region);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ guides: data ?? [] });
  } catch (err) {
    console.error("[drops/cook-guides GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.retailer) {
      return NextResponse.json({ error: "retailer required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("cook_guides")
      .insert({
        retailer: body.retailer,
        retailer_url: body.retailer_url || null,
        region: body.region || "UK",
        difficulty: body.difficulty || null,
        account_age_required: body.account_age_required || null,
        payment_tips: body.payment_tips || null,
        size_selection_tips: body.size_selection_tips || null,
        checkout_tips: body.checkout_tips || null,
        raffle_tips: body.raffle_tips || null,
        vpn_recommended: body.vpn_recommended ?? false,
        bot_compatible: body.bot_compatible ?? false,
        success_rate: body.success_rate || null,
        notes: body.notes || null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, guide: data });
  } catch (err) {
    console.error("[drops/cook-guides POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
