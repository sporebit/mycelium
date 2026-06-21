import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; adId: string }> },
) {
  try {
    const { adId } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("venture_ads")
      .update(body)
      .eq("id", adId)
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ad: data });
  } catch (err) {
    console.error("[ventures/:id/ads/:adId PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; adId: string }> },
) {
  try {
    const { adId } = await ctx.params;
    const supabase = createServerClient();
    const { error } = await supabase
      .from("venture_ads")
      .delete()
      .eq("id", adId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ventures/:id/ads/:adId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
