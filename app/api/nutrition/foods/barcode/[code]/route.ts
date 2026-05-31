import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { FOOD_SELECT } from "@/lib/nutrition/db";
import { fetchFullProduct, offToFoodInsert } from "@/lib/nutrition/off";
import type { Food } from "@/lib/nutrition/types-v2";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Barcode lookup. Returns the cached row if we already have one, else
 * calls Open Food Facts and upserts the result so subsequent scans hit
 * the cache.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { code } = await ctx.params;
  if (!code) {
    return NextResponse.json({ error: "barcode required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    // 1. Cache: user's foods by barcode
    const { data: cached } = await supabase
      .from("foods")
      .select(FOOD_SELECT)
      .eq("user_id", uid)
      .eq("barcode", code)
      .maybeSingle();
    if (cached) {
      return NextResponse.json({
        food: cached as unknown as Food,
        cached: true,
      });
    }

    // 2. OFF live lookup
    const full = await fetchFullProduct(code);
    if (!full) {
      return NextResponse.json({ food: null, cached: false }, { status: 404 });
    }
    // Upsert into the cache
    const insertPayload = offToFoodInsert(full.result, uid, full.nutriments);
    const { data, error } = await supabase
      .from("foods")
      .upsert(insertPayload, { onConflict: "user_id,off_id" })
      .select(FOOD_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("upsert failed");
    return NextResponse.json({
      food: data as unknown as Food,
      cached: false,
    });
  } catch (err) {
    console.error("[/api/nutrition/foods/barcode/:code GET]", err);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
}
