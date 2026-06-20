import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ recipes: data });
  } catch (err) {
    console.error("[recipes GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("recipes")
      .insert({
        title: body.title,
        source_url: body.source_url || null,
        source_name: body.source_name || null,
        image_url: body.image_url || null,
        prep_time_minutes: body.prep_time_minutes ?? null,
        cook_time_minutes: body.cook_time_minutes ?? null,
        servings: body.servings ?? 4,
        ingredients: body.ingredients ?? [],
        method: body.method ?? [],
        tags: body.tags ?? [],
        cuisine: body.cuisine || null,
        notes: body.notes || null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, recipe: data });
  } catch (err) {
    console.error("[recipes POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
