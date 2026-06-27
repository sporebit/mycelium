import type { Food, FoodSearchResult, Serving } from "./types-v2";

/**
 * Open Food Facts client. Two entry points — `lookupBarcode` (exact) and
 * `searchText` (fuzzy). Both default to the UK subdomain with English
 * language so results match the user's locale; pass `ukOnly: false` to
 * fall back to the global index.
 *
 * Network failure / empty result must return null/[] rather than throw —
 * the UI degrades to "manual entry" when OFF is unavailable. Detailed
 * diagnostics are emitted via console.error on every failure so the
 * server logs explain *why* the lookup didn't work.
 */

type OffNutriments = Record<string, number | string | undefined> & {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  "saturated-fat_100g"?: number;
  salt_100g?: number;
  sodium_100g?: number;
  "energy-kj_100g"?: number;
  "polyunsaturated-fat_100g"?: number;
  "monounsaturated-fat_100g"?: number;
  "trans-fat_100g"?: number;
  cholesterol_100g?: number;
  "vitamin-a_100g"?: number;
  "vitamin-c_100g"?: number;
  calcium_100g?: number;
  iron_100g?: number;
  potassium_100g?: number;
};

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  nutriments?: OffNutriments;
  serving_size?: string;
  image_url?: string;
  serving_quantity?: number | string;
  countries_tags?: string[];
};

const USER_AGENT = "Myphelium2-Local/1.0";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Pull "30g" → 30, "1 oz (28g)" → 28. Lossy but good enough for OFF. */
function parseGrams(servingSize?: string): number | null {
  if (!servingSize) return null;
  const paren = servingSize.match(/\(([^)]*?)g/i);
  if (paren) {
    const n = parseFloat(paren[1]);
    if (Number.isFinite(n)) return n;
  }
  const direct = servingSize.match(/([\d.]+)\s*g\b/i);
  if (direct) {
    const n = parseFloat(direct[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function productServings(p: OffProduct): Serving[] {
  const list: Serving[] = [];
  const grams = parseGrams(p.serving_size);
  if (grams && grams > 0) {
    list.push({ label: p.serving_size?.trim() || `1 serving`, grams });
  } else if (typeof p.serving_quantity === "number" && p.serving_quantity > 0) {
    list.push({ label: "1 serving", grams: p.serving_quantity });
  }
  return list;
}

/**
 * Map an OFF product to our internal shape. In UK-only mode we drop
 * products with no English name — those are typically French/German
 * listings that leak into the global pool.
 */
function productToResult(
  p: OffProduct,
  opts: { ukOnly: boolean },
): FoodSearchResult | null {
  const englishName = (p.product_name_en || "").trim();
  const fallbackName = (p.product_name || "").trim();
  if (opts.ukOnly && !englishName) return null;
  const name = englishName || fallbackName || "Unnamed";
  const n = p.nutriments ?? {};
  return {
    id: null,
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    barcode: p.code ?? null,
    off_id: p.code ?? null,
    source: "open_food_facts",
    kcal_per_100g: num(n["energy-kcal_100g"]),
    protein_per_100g: num(n.proteins_100g),
    carbs_per_100g: num(n.carbohydrates_100g),
    fat_per_100g: num(n.fat_100g),
    servings: productServings(p),
    in_library: false,
  };
}

function offSubdomain(ukOnly: boolean): string {
  return ukOnly ? "uk.openfoodfacts.org" : "world.openfoodfacts.org";
}

/**
 * Validates that a string looks like a product barcode. OFF accepts
 * EAN-8 (8), UPC-A (12), EAN-13 (13), and the rare GTIN-14. Anything
 * else is almost certainly a QR code or arbitrary text that snuck in
 * via @zxing/browser's MultiFormatReader.
 */
export function isLikelyBarcode(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  return trimmed.length === 8 || trimmed.length === 12 || trimmed.length === 13 || trimmed.length === 14;
}

export async function lookupBarcode(
  barcode: string,
  opts: { ukOnly?: boolean } = {},
): Promise<FoodSearchResult | null> {
  const ukOnly = opts.ukOnly ?? true;
  const host = offSubdomain(ukOnly);
  const trimmed = barcode.trim();
  const url = `https://${host}/api/v3/product/${encodeURIComponent(trimmed)}.json?lc=en`;
  try {
    console.log("[off lookupBarcode] start", { barcode: trimmed, url });
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    console.log("[off lookupBarcode] response", {
      barcode: trimmed,
      status: r.status,
      ok: r.ok,
    });
    if (!r.ok) {
      // OFF returns 404 for unknown barcodes with a body that's still
      // JSON — surface a snippet for debugging without dumping the
      // whole payload.
      const body = await r.text().catch(() => "");
      console.error("[off lookupBarcode] non-200", {
        barcode: trimmed,
        status: r.status,
        body: body.slice(0, 200),
      });
      return null;
    }
    const j = (await r.json()) as { product?: OffProduct; status?: number };
    if (!j.product) {
      console.error("[off lookupBarcode] no product", { barcode: trimmed });
      return null;
    }
    return productToResult(j.product, { ukOnly: false });
  } catch (err) {
    console.error("[off lookupBarcode] threw", {
      barcode: trimmed,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function searchText(
  query: string,
  opts: { ukOnly?: boolean } = {},
): Promise<FoodSearchResult[]> {
  const ukOnly = opts.ukOnly ?? true;
  const q = query.trim();
  if (q.length < 2) return [];
  const host = offSubdomain(ukOnly);
  try {
    const url = new URL(`https://${host}/cgi/search.pl`);
    url.searchParams.set("search_terms", q);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "20");
    url.searchParams.set("lc", "en");
    url.searchParams.set("lang", "en");
    if (ukOnly) {
      url.searchParams.set("countries_tags_en", "united-kingdom");
    }
    url.searchParams.set(
      "fields",
      "code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,image_url,countries_tags",
    );
    const r = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!r.ok) {
      console.error("[off searchText] non-200", {
        query: q,
        status: r.status,
        url: url.toString(),
      });
      return [];
    }
    const j = (await r.json()) as { products?: OffProduct[] };
    return (j.products ?? [])
      .map((p) => productToResult(p, { ukOnly }))
      .filter((r): r is FoodSearchResult => r !== null);
  } catch (err) {
    console.error("[off searchText] threw", {
      query: q,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Convert an OFF lookup into our `foods` insert payload (sans id/user). */
export function offToFoodInsert(
  result: FoodSearchResult,
  userId: string,
  fullNutriments?: OffNutriments,
): Omit<Food, "id" | "created_at" | "updated_at"> {
  const n = fullNutriments ?? {};
  return {
    user_id: userId,
    name: result.name,
    brand: result.brand,
    barcode: result.barcode,
    source: "open_food_facts",
    off_id: result.off_id,
    serving_size_g: result.servings[0]?.grams ?? 100,
    serving_unit: "g",
    servings: result.servings,
    kcal_per_100g: result.kcal_per_100g,
    protein_per_100g: result.protein_per_100g,
    carbs_per_100g: result.carbs_per_100g,
    fat_per_100g: result.fat_per_100g,
    fibre_per_100g: num(n.fiber_100g),
    sugar_per_100g: num(n.sugars_100g),
    saturated_fat_per_100g: num(n["saturated-fat_100g"]),
    salt_per_100g: num(n.salt_100g),
    sodium_per_100g: num(n.sodium_100g),
    energy_kj_per_100g: num(n["energy-kj_100g"]),
    polyunsaturated_fat_per_100g: num(n["polyunsaturated-fat_100g"]),
    monounsaturated_fat_per_100g: num(n["monounsaturated-fat_100g"]),
    trans_fat_per_100g: num(n["trans-fat_100g"]),
    cholesterol_per_100g: num(n.cholesterol_100g),
    vitamin_a_per_100g: num(n["vitamin-a_100g"]),
    vitamin_c_per_100g: num(n["vitamin-c_100g"]),
    calcium_per_100g: num(n.calcium_100g),
    iron_per_100g: num(n.iron_100g),
    potassium_per_100g: num(n.potassium_100g),
    is_favourite: false,
    use_count: 0,
  };
}

export async function fetchFullProduct(
  barcode: string,
  opts: { ukOnly?: boolean } = {},
): Promise<{
  result: FoodSearchResult;
  nutriments: OffNutriments;
} | null> {
  const ukOnly = opts.ukOnly ?? true;
  const host = offSubdomain(ukOnly);
  const trimmed = barcode.trim();
  const url = `https://${host}/api/v3/product/${encodeURIComponent(trimmed)}.json?lc=en`;
  try {
    console.log("[off fetchFullProduct] start", { barcode: trimmed, url });
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    console.log("[off fetchFullProduct] response", {
      barcode: trimmed,
      status: r.status,
      ok: r.ok,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error("[off fetchFullProduct] non-200", {
        barcode: trimmed,
        status: r.status,
        body: body.slice(0, 200),
      });
      return null;
    }
    const j = (await r.json()) as { product?: OffProduct };
    if (!j.product) {
      console.error("[off fetchFullProduct] no product", { barcode: trimmed });
      return null;
    }
    // Barcode lookups never apply the ukOnly name filter — the product
    // is on the user's shelf, so the name we already have is the one
    // they want regardless of which language OFF stored it under.
    const mapped = productToResult(j.product, { ukOnly: false });
    if (!mapped) return null;
    return {
      result: mapped,
      nutriments: j.product.nutriments ?? {},
    };
  } catch (err) {
    console.error("[off fetchFullProduct] threw", {
      barcode: trimmed,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
