import type { SupabaseClient } from "@supabase/supabase-js";
import type { Food, MealGroup, NutritionLog } from "./types-v2";

export const FOOD_SELECT =
  "id, user_id, name, brand, barcode, source, off_id, serving_size_g, serving_unit, servings, " +
  "kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fibre_per_100g, sugar_per_100g, " +
  "saturated_fat_per_100g, salt_per_100g, sodium_per_100g, energy_kj_per_100g, " +
  "polyunsaturated_fat_per_100g, monounsaturated_fat_per_100g, trans_fat_per_100g, " +
  "cholesterol_per_100g, vitamin_a_per_100g, vitamin_c_per_100g, calcium_per_100g, " +
  "iron_per_100g, potassium_per_100g, is_favourite, use_count, created_at, updated_at";

export const LOG_SELECT =
  "id, user_id, food_id, meal_group_id, date, food_name, brand, quantity_g, serving_label, " +
  "kcal, protein_g, carbs_g, fat_g, fibre_g, sugar_g, saturated_fat_g, salt_g, " +
  "extended_nutrients, logged_at, created_at";

const DEFAULT_GROUPS: { name: string; position: number }[] = [
  { name: "Breakfast", position: 0 },
  { name: "Lunch", position: 1 },
  { name: "Dinner", position: 2 },
  { name: "Snacks", position: 3 },
];

/**
 * Look up the user's meal groups, seeding the four defaults the very
 * first time a user accesses /nutrition. The migration also seeds for
 * a hardcoded uid, but env-var changes (or a different user_id) would
 * otherwise leave an empty list — this guards that.
 */
export async function ensureMealGroups(
  supabase: SupabaseClient,
  userId: string,
): Promise<MealGroup[]> {
  const { data, error } = await supabase
    .from("meal_groups")
    .select("id, user_id, name, position, created_at")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) throw error;
  if (data && data.length > 0) return data as MealGroup[];

  const rows = DEFAULT_GROUPS.map((g) => ({ ...g, user_id: userId }));
  const { data: seeded } = await supabase
    .from("meal_groups")
    .upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true })
    .select("id, user_id, name, position, created_at");
  return (seeded ?? []) as MealGroup[];
}

export function asFood(row: unknown): Food {
  return row as Food;
}

export function asLog(row: unknown): NutritionLog {
  return row as NutritionLog;
}
