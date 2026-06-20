import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get("week");
    const supabase = createServerClient();

    let query = supabase
      .from("meal_plan")
      .select("*, recipes(id, title, image_url)")
      .order("planned_date", { ascending: true });

    if (week) {
      const start = new Date(week);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      query = query
        .gte("planned_date", start.toISOString().slice(0, 10))
        .lte("planned_date", end.toISOString().slice(0, 10));
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data });
  } catch (err) {
    console.error("[meal-plan GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.planned_date || !body.meal_type) {
      return NextResponse.json({ error: "planned_date and meal_type required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("meal_plan")
      .insert({
        planned_date: body.planned_date,
        meal_type: body.meal_type,
        recipe_id: body.recipe_id || null,
        custom_meal: body.custom_meal || null,
        servings: body.servings ?? 1,
      })
      .select("*, recipes(id, title, image_url)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entry: data });
  } catch (err) {
    console.error("[meal-plan POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
