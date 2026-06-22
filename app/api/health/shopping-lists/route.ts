import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("shopping_lists")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lists: data });
  } catch (err) {
    console.error("[shopping-lists GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type Ingredient = {
  amount: string;
  unit: string | null;
  name: string;
  notes: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServerClient();

    // Simple list creation mode (no recipe_ids)
    if (!body.recipe_ids) {
      const { data, error } = await supabase
        .from("shopping_lists")
        .insert({
          title: body.title || "Shopping List",
          items: body.items ?? [],
          default_list: body.default_list ?? false,
        })
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, list: data });
    }

    // Recipe-based creation mode
    const { week_start, recipe_ids } = body as {
      week_start: string;
      recipe_ids: string[];
    };

    if (!week_start || !Array.isArray(recipe_ids) || recipe_ids.length === 0) {
      return NextResponse.json(
        { error: "week_start and recipe_ids[] required" },
        { status: 400 },
      );
    }

    const { data: recipes, error: recErr } = await supabase
      .from("recipes")
      .select("id, title, ingredients")
      .in("id", recipe_ids);
    if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });

    const merged = new Map<string, { amount: string; unit: string | null; name: string }>();
    for (const recipe of recipes ?? []) {
      const ingredients = (recipe.ingredients ?? []) as Ingredient[];
      for (const ing of ingredients) {
        const key = ing.name.toLowerCase().trim();
        if (merged.has(key)) {
          const existing = merged.get(key)!;
          existing.amount = `${existing.amount} + ${ing.amount}`;
        } else {
          merged.set(key, {
            amount: ing.amount,
            unit: ing.unit,
            name: ing.name,
          });
        }
      }
    }

    const items = Array.from(merged.values());
    const weekDate = new Date(week_start);
    const title = `Shopping List — Week of ${weekDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;

    const { data, error } = await supabase
      .from("shopping_lists")
      .insert({ title, items, week_start })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, list: data });
  } catch (err) {
    console.error("[shopping-lists POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
