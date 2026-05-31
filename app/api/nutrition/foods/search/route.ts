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
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
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

    // 2. OFF, then de-dupe against existing library OFF ids.
    const offRaw = await searchText(q);
    const seenOff = new Set<string>(
      lib.map((l) => l.off_id ?? "").filter(Boolean),
    );
    const off = offRaw.filter(
      (r) => !r.off_id || !seenOff.has(r.off_id),
    );
    return NextResponse.json({ results: [...lib, ...off] });
  } catch (err) {
    console.error("[/api/nutrition/foods/search GET]", err);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
