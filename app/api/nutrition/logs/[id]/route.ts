import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { FOOD_SELECT, LOG_SELECT } from "@/lib/nutrition/db";
import { nutrientsFor } from "@/lib/nutrition/calc";
import type { Food } from "@/lib/nutrition/types-v2";

export const runtime = "nodejs";

type PatchBody = {
  quantity_g?: number;
  meal_group_id?: string | null;
  serving_label?: string | null;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const update: Record<string, unknown> = {};
    if (typeof body.meal_group_id !== "undefined") {
      update.meal_group_id = body.meal_group_id;
    }
    if (typeof body.serving_label !== "undefined") {
      update.serving_label = body.serving_label;
    }
    // Quantity changes recompute the macro snapshot from the linked food.
    if (typeof body.quantity_g === "number" && body.quantity_g > 0) {
      update.quantity_g = body.quantity_g;
      const { data: log } = await supabase
        .from("nutrition_logs")
        .select("food_id")
        .eq("id", id)
        .maybeSingle();
      const foodId = (log as { food_id: string | null } | null)?.food_id;
      if (foodId) {
        const { data: food } = await supabase
          .from("foods")
          .select(FOOD_SELECT)
          .eq("id", foodId)
          .maybeSingle();
        if (food) {
          const { core, extended } = nutrientsFor(
            food as unknown as Food,
            body.quantity_g,
          );
          update.kcal = core.kcal;
          update.protein_g = core.protein;
          update.carbs_g = core.carbs;
          update.fat_g = core.fat;
          update.fibre_g = core.fibre;
          update.sugar_g = core.sugar;
          update.saturated_fat_g = core.saturated_fat;
          update.salt_g = core.salt;
          update.extended_nutrients = extended;
        }
      }
    }
    const { data, error } = await supabase
      .from("nutrition_logs")
      .update(update)
      .eq("id", id)
      .select(LOG_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    return NextResponse.json({ log: data });
  } catch (err) {
    console.error("[/api/nutrition/logs/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("nutrition_logs")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/nutrition/logs/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
