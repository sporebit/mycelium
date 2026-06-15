import type { FoodSearchResult, FoodSource } from "./types-v2";

/**
 * USDA FoodData Central client.
 *
 * USDA's Foundation + SR Legacy datasets cover raw ingredients
 * exceptionally well — "ground beef, 95% lean", "rolled oats, whole
 * grain", etc. — which is where Open Food Facts' UK coverage thins
 * out. Add USDA_API_KEY to .env.local from
 * https://fdc.nal.usda.gov/api-key-signup and results show up
 * alongside OFF.
 *
 * When the key is missing we log once and return [] so the UI keeps
 * working with OFF + user library only.
 */

const USDA_NUTRIENT_IDS = {
  kcal: [1008, 208], // Foundation uses 1008, SR Legacy uses 208
  protein: [1003, 203],
  carbs: [1005, 205],
  fat: [1004, 204],
  fibre: [1079, 291],
  sugar: [2000, 269],
  saturated_fat: [1258, 606],
  sodium: [1093, 307],
} as const;

type UsdaNutrient = {
  nutrientId?: number;
  nutrientNumber?: string;
  value?: number;
  amount?: number;
};

type UsdaFood = {
  fdcId: number;
  description: string;
  brandName?: string | null;
  brandOwner?: string | null;
  dataType?: string;
  foodNutrients?: UsdaNutrient[];
};

let warnedNoKey = false;

function readNutrient(
  nutrients: UsdaNutrient[],
  candidates: readonly number[],
): number | null {
  for (const n of nutrients) {
    const id = n.nutrientId;
    if (id == null) continue;
    if (candidates.includes(id)) {
      const v = n.value ?? n.amount;
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return null;
}

function productToResult(p: UsdaFood): FoodSearchResult {
  const nutrients = p.foodNutrients ?? [];
  return {
    id: null,
    name: p.description?.trim() || "Unnamed",
    brand: p.brandName?.trim() || p.brandOwner?.trim() || null,
    barcode: null,
    off_id: null,
    // Source is USDA so the UI can label the row. Cast through the
    // type-v2 union — adding 'usda' as a recognised source means
    // downstream readers can decide to badge accordingly.
    source: "usda" as FoodSource,
    kcal_per_100g: readNutrient(nutrients, USDA_NUTRIENT_IDS.kcal),
    protein_per_100g: readNutrient(nutrients, USDA_NUTRIENT_IDS.protein),
    carbs_per_100g: readNutrient(nutrients, USDA_NUTRIENT_IDS.carbs),
    fat_per_100g: readNutrient(nutrients, USDA_NUTRIENT_IDS.fat),
    servings: [],
    in_library: false,
    // Convenience metadata for the search route's dedupe / sodium
    // → salt conversion if it wants it later.
    use_count: 0,
  };
}

export async function searchUsda(query: string): Promise<FoodSearchResult[]> {
  const key = process.env.USDA_API_KEY;
  if (!key) {
    if (!warnedNoKey) {
      console.warn(
        "[usda] USDA_API_KEY not set — skipping USDA search. Sign up at https://fdc.nal.usda.gov/api-key-signup",
      );
      warnedNoKey = true;
    }
    return [];
  }
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", key);
    url.searchParams.set("query", q);
    url.searchParams.set("dataType", "Foundation,SR Legacy");
    url.searchParams.set("pageSize", "10");
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) {
      console.error("[usda searchUsda] non-200", { status: r.status });
      return [];
    }
    const j = (await r.json()) as { foods?: UsdaFood[] };
    return (j.foods ?? []).map(productToResult);
  } catch (err) {
    console.error("[usda searchUsda] threw", err);
    return [];
  }
}
