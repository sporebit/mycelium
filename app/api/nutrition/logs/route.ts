import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FOOD_SELECT, LOG_SELECT } from "@/lib/nutrition/db";
import { logToInsertPayload } from "@/lib/nutrition/calc";
import type { Food, NutritionLog } from "@/lib/nutrition/types-v2";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("nutrition_logs")
      .select(LOG_SELECT)
      .eq("user_id", uid)
      .eq("date", date)
      .order("logged_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ logs: (data ?? []) as unknown as NutritionLog[] });
  } catch (err) {
    console.error("[/api/nutrition/logs GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreatePayload = {
  food_id?: string;
  meal_group_id?: string | null;
  date?: string;
  quantity_g?: number;
  serving_label?: string | null;
  // For ad-hoc entries with no food row
  food_name?: string;
  brand?: string | null;
  manual_nutrients?: {
    kcal?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
  };
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: CreatePayload;
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const date = body.date;
  const quantityG = body.quantity_g;
  if (!date || typeof quantityG !== "number" || quantityG <= 0) {
    return NextResponse.json({ error: "date + quantity_g required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();

    let payload: Record<string, unknown>;
    if (body.food_id) {
      const { data: food, error: foodErr } = await supabase
        .from("foods")
        .select(FOOD_SELECT)
        .eq("id", body.food_id)
        .eq("user_id", uid)
        .maybeSingle();
      if (foodErr || !food) {
        return NextResponse.json({ error: "food not found" }, { status: 400 });
      }
      payload = logToInsertPayload(
        food as unknown as Food,
        quantityG,
        body.serving_label ?? null,
        body.meal_group_id ?? null,
        date,
        uid,
      );

      // Bump use_count and auto-favourite at 3+ uses.
      const f = food as unknown as Food;
      const nextCount = (f.use_count ?? 0) + 1;
      const nextFav = f.is_favourite || nextCount >= 3;
      await supabase
        .from("foods")
        .update({ use_count: nextCount, is_favourite: nextFav })
        .eq("id", f.id);
    } else {
      // Ad-hoc entry — caller supplied raw nutrients.
      const m = body.manual_nutrients ?? {};
      payload = {
        user_id: uid,
        food_id: null,
        meal_group_id: body.meal_group_id ?? null,
        date,
        food_name: body.food_name?.trim() || "Untitled",
        brand: body.brand ?? null,
        quantity_g: quantityG,
        serving_label: body.serving_label ?? null,
        kcal: m.kcal ?? null,
        protein_g: m.protein_g ?? null,
        carbs_g: m.carbs_g ?? null,
        fat_g: m.fat_g ?? null,
      };
    }

    const { data, error } = await supabase
      .from("nutrition_logs")
      .insert(payload)
      .select(LOG_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ log: data });
  } catch (err) {
    console.error("[/api/nutrition/logs POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
