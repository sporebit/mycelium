import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("venture_steps")
      .select("*")
      .eq("venture_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ steps: data });
  } catch (err) {
    console.error("[ventures/:id/steps GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("venture_steps")
      .insert({ ...body, venture_id: id })
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ step: data }, { status: 201 });
  } catch (err) {
    console.error("[ventures/:id/steps POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
