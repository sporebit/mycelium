import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("cook_guides")
      .select("*")
      .eq("id", slug)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ guide: data });
  } catch (err) {
    console.error("[drops/cook-guides/[slug] GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("cook_guides")
      .update({
        ...body,
        last_updated: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", slug)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, guide: data });
  } catch (err) {
    console.error("[drops/cook-guides/[slug] PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const supabase = createServerClient();
    const { error } = await supabase.from("cook_guides").delete().eq("id", slug);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[drops/cook-guides/[slug] DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
