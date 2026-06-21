import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("venture_inspiration")
      .select("*")
      .order("created_at", { ascending: false });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data });
  } catch (err) {
    console.error("[ventures/inspiration GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("venture_inspiration")
      .insert(body)
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    console.error("[ventures/inspiration POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
