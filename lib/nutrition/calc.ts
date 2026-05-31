import type { Food, NutritionLog, Serving } from "./types-v2";

const PER_100G_FIELDS = [
  "kcal",
  "protein",
  "carbs",
  "fat",
  "fibre",
  "sugar",
  "saturated_fat",
  "salt",
] as const;

const PER_100G_EXTENDED = [
  "sodium",
  "energy_kj",
  "polyunsaturated_fat",
  "monounsaturated_fat",
  "trans_fat",
  "cholesterol",
  "vitamin_a",
  "vitamin_c",
  "calcium",
  "iron",
  "potassium",
] as const;

type CoreField = (typeof PER_100G_FIELDS)[number];

/** Compute nutrient totals for `quantityG` grams of `food`. */
export function nutrientsFor(
  food: Pick<
    Food,
    | "kcal_per_100g"
    | "protein_per_100g"
    | "carbs_per_100g"
    | "fat_per_100g"
    | "fibre_per_100g"
    | "sugar_per_100g"
    | "saturated_fat_per_100g"
    | "salt_per_100g"
    | "sodium_per_100g"
    | "energy_kj_per_100g"
    | "polyunsaturated_fat_per_100g"
    | "monounsaturated_fat_per_100g"
    | "trans_fat_per_100g"
    | "cholesterol_per_100g"
    | "vitamin_a_per_100g"
    | "vitamin_c_per_100g"
    | "calcium_per_100g"
    | "iron_per_100g"
    | "potassium_per_100g"
  >,
  quantityG: number,
): {
  core: Record<CoreField, number | null>;
  extended: Record<string, number | null>;
} {
  const factor = quantityG / 100;
  const core = {} as Record<CoreField, number | null>;
  for (const f of PER_100G_FIELDS) {
    const v = (food as Record<string, number | null>)[`${f}_per_100g`];
    core[f] = v == null ? null : round2(v * factor);
  }
  const extended: Record<string, number | null> = {};
  for (const f of PER_100G_EXTENDED) {
    const v = (food as Record<string, number | null>)[`${f}_per_100g`];
    extended[f] = v == null ? null : round2(v * factor);
  }
  return { core, extended };
}

export function logToInsertPayload(
  food: Food,
  quantityG: number,
  servingLabel: string | null,
  mealGroupId: string | null,
  date: string,
  userId: string,
) {
  const { core, extended } = nutrientsFor(food, quantityG);
  return {
    user_id: userId,
    food_id: food.id,
    meal_group_id: mealGroupId,
    date,
    food_name: food.name,
    brand: food.brand,
    quantity_g: quantityG,
    serving_label: servingLabel,
    kcal: core.kcal,
    protein_g: core.protein,
    carbs_g: core.carbs,
    fat_g: core.fat,
    fibre_g: core.fibre,
    sugar_g: core.sugar,
    saturated_fat_g: core.saturated_fat,
    salt_g: core.salt,
    extended_nutrients: extended,
  };
}

export function sumLogs(logs: NutritionLog[]): Record<CoreField, number> {
  const out: Record<CoreField, number> = {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fibre: 0,
    sugar: 0,
    saturated_fat: 0,
    salt: 0,
  };
  for (const log of logs) {
    out.kcal += log.kcal ?? 0;
    out.protein += log.protein_g ?? 0;
    out.carbs += log.carbs_g ?? 0;
    out.fat += log.fat_g ?? 0;
    out.fibre += log.fibre_g ?? 0;
    out.sugar += log.sugar_g ?? 0;
    out.saturated_fat += log.saturated_fat_g ?? 0;
    out.salt += log.salt_g ?? 0;
  }
  for (const k of Object.keys(out) as CoreField[]) out[k] = round2(out[k]);
  return out;
}

/** Pick the canonical serving — first non-default, else 100g. */
export function defaultServing(servings: Serving[]): Serving {
  if (servings.length > 0) return servings[0];
  return { label: "100g", grams: 100 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** MET-derived burn estimate when workout_sessions.calories is null.
 *  Rough cuts: resistance ≈ 300 kcal/hr, cardio ≈ 400 kcal/hr,
 *  everything else ≈ 200 kcal/hr. Tuned for a ~75kg active adult. */
export function estimateBurnedKcal(kind: string, durationMin: number): number {
  const ratePerHour =
    kind === "cardio" ? 400 : kind === "resistance" ? 300 : 200;
  return Math.round((ratePerHour * durationMin) / 60);
}
