export type FoodSource = "open_food_facts" | "manual" | "usda";

export type Serving = { label: string; grams: number };

export type Food = {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: FoodSource;
  off_id: string | null;
  serving_size_g: number;
  serving_unit: string;
  servings: Serving[];
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  fibre_per_100g: number | null;
  sugar_per_100g: number | null;
  saturated_fat_per_100g: number | null;
  salt_per_100g: number | null;
  sodium_per_100g: number | null;
  energy_kj_per_100g: number | null;
  polyunsaturated_fat_per_100g: number | null;
  monounsaturated_fat_per_100g: number | null;
  trans_fat_per_100g: number | null;
  cholesterol_per_100g: number | null;
  vitamin_a_per_100g: number | null;
  vitamin_c_per_100g: number | null;
  calcium_per_100g: number | null;
  iron_per_100g: number | null;
  potassium_per_100g: number | null;
  is_favourite: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
};

/** Search-result variant — partial Food, optionally not yet saved. */
export type FoodSearchResult = {
  /** Internal id when saved in this user's library; null when result
   *  comes straight from Open Food Facts and hasn't been cached yet. */
  id: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  off_id: string | null;
  source: FoodSource;
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  servings: Serving[];
  in_library: boolean;
  is_favourite?: boolean;
  use_count?: number;
};

export type MealGroup = {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
};

export type NutritionLog = {
  id: string;
  user_id: string;
  food_id: string | null;
  meal_group_id: string | null;
  date: string;
  food_name: string;
  brand: string | null;
  quantity_g: number;
  serving_label: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  sugar_g: number | null;
  saturated_fat_g: number | null;
  salt_g: number | null;
  extended_nutrients: Record<string, number | null> | null;
  logged_at: string;
  created_at: string;
};

export type NutritionTargets = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  sugar: number;
  saturated_fat: number;
  salt: number;
};

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  kcal: 2800,
  protein: 180,
  carbs: 300,
  fat: 80,
  fibre: 30,
  sugar: 50,
  saturated_fat: 20,
  salt: 6,
};
