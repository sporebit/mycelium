import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FOOD_SELECT } from "@/lib/nutrition/db";
import type { Food } from "@/lib/nutrition/types-v2";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const favouritesOnly = url.searchParams.get("favourites") === "true";

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("foods")
      .select(FOOD_SELECT)
      .eq("user_id", uid)
      .order("use_count", { ascending: false })
      .order("name", { ascending: true })
      .limit(200);
    if (favouritesOnly) q = q.eq("is_favourite", true);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ foods: (data ?? []) as unknown as Food[] });
  } catch (err) {
    console.error("[/api/nutrition/foods GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: Partial<Food>;
  try {
    body = (await req.json()) as Partial<Food>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    const insertPayload = {
      user_id: uid,
      name,
      brand: body.brand ?? null,
      barcode: body.barcode ?? null,
      source: body.source ?? "manual",
      off_id: body.off_id ?? null,
      serving_size_g: body.serving_size_g ?? 100,
      serving_unit: body.serving_unit ?? "g",
      servings: body.servings ?? [],
      kcal_per_100g: body.kcal_per_100g ?? null,
      protein_per_100g: body.protein_per_100g ?? null,
      carbs_per_100g: body.carbs_per_100g ?? null,
      fat_per_100g: body.fat_per_100g ?? null,
      fibre_per_100g: body.fibre_per_100g ?? null,
      sugar_per_100g: body.sugar_per_100g ?? null,
      saturated_fat_per_100g: body.saturated_fat_per_100g ?? null,
      salt_per_100g: body.salt_per_100g ?? null,
      sodium_per_100g: body.sodium_per_100g ?? null,
      energy_kj_per_100g: body.energy_kj_per_100g ?? null,
      polyunsaturated_fat_per_100g: body.polyunsaturated_fat_per_100g ?? null,
      monounsaturated_fat_per_100g: body.monounsaturated_fat_per_100g ?? null,
      trans_fat_per_100g: body.trans_fat_per_100g ?? null,
      cholesterol_per_100g: body.cholesterol_per_100g ?? null,
      vitamin_a_per_100g: body.vitamin_a_per_100g ?? null,
      vitamin_c_per_100g: body.vitamin_c_per_100g ?? null,
      calcium_per_100g: body.calcium_per_100g ?? null,
      iron_per_100g: body.iron_per_100g ?? null,
      potassium_per_100g: body.potassium_per_100g ?? null,
      is_favourite: body.is_favourite ?? false,
    };

    // For OFF lookups, upsert on (user, off_id) so re-saving the same
    // product just refreshes the cached panel rather than duplicating.
    const conflictTarget = insertPayload.off_id
      ? "user_id,off_id"
      : insertPayload.barcode
        ? "user_id,barcode"
        : undefined;
    const { data, error } = await supabase
      .from("foods")
      .upsert(insertPayload, { onConflict: conflictTarget })
      .select(FOOD_SELECT)
      .single();
    if (error) throw error;
    return NextResponse.json({ food: data });
  } catch (err) {
    console.error("[/api/nutrition/foods POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
