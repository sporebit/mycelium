import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FOOD_SELECT } from "@/lib/nutrition/db";
import { searchText } from "@/lib/nutrition/off";
import type { Food, FoodSearchResult } from "@/lib/nutrition/types-v2";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function foodToResult(food: Food): FoodSearchResult {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    off_id: food.off_id,
    source: food.source,
    kcal_per_100g: food.kcal_per_100g,
    protein_per_100g: food.protein_per_100g,
    carbs_per_100g: food.carbs_per_100g,
    fat_per_100g: food.fat_per_100g,
    servings: food.servings ?? [],
    in_library: true,
    is_favourite: food.is_favourite,
    use_count: food.use_count,
  };
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  // Default to UK products with English language. Passing ?global=true
  // (or scope=global) opts into the world index.
  const scope = url.searchParams.get("scope");
  const globalFlag = url.searchParams.get("global");
  const ukOnly =
    scope === "global" || globalFlag === "true" ? false : true;
  if (q.length < 2) {
    return NextResponse.json({ results: [], uk_only: ukOnly });
  }
  try {
    const supabase = createServerClient();
    // 1. user's library first — case-insensitive name match
    const { data: libRows } = await supabase
      .from("foods")
      .select(FOOD_SELECT)
      .eq("user_id", uid)
      .ilike("name", `%${q}%`)
      .order("use_count", { ascending: false })
      .limit(20);
    const lib = (libRows ?? []).map((r) => foodToResult(r as unknown as Food));

    // 2. OFF — UK index by default, global when explicitly requested.
    const offRaw = await searchText(q, { ukOnly });
    const seenOff = new Set<string>(
      lib.map((l) => l.off_id ?? "").filter(Boolean),
    );
    const off = offRaw.filter((r) => !r.off_id || !seenOff.has(r.off_id));
    const results = [...lib, ...off];

    // Heuristic hint: in UK-only mode with very few OFF hits, the user
    // is probably better off searching globally. UI surfaces this as a
    // small affordance below the search box.
    let hint: string | null = null;
    if (ukOnly && off.length < 3) {
      hint = "Few UK results — toggle off to search globally";
    }

    return NextResponse.json({ results, uk_only: ukOnly, hint });
  } catch (err) {
    console.error("[/api/nutrition/foods/search GET]", err);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
