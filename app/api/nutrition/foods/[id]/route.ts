import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FOOD_SELECT } from "@/lib/nutrition/db";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "name",
  "brand",
  "barcode",
  "serving_size_g",
  "serving_unit",
  "servings",
  "kcal_per_100g",
  "protein_per_100g",
  "carbs_per_100g",
  "fat_per_100g",
  "fibre_per_100g",
  "sugar_per_100g",
  "saturated_fat_per_100g",
  "salt_per_100g",
  "sodium_per_100g",
  "is_favourite",
  "use_count",
]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) update[k] = v;
  }
  update.updated_at = new Date().toISOString();
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("foods")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(FOOD_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    return NextResponse.json({ food: data });
  } catch (err) {
    console.error("[/api/nutrition/foods/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("foods")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/nutrition/foods/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
