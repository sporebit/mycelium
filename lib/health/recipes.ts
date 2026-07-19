// Shared types and constants for the recipes/meal-planner surface.

export type Ingredient = {
  amount: string;
  unit: string | null;
  name: string;
  notes: string | null;
};

export type MethodStep = {
  step: number;
  instruction: string;
};

export type Recipe = {
  id: string;
  title: string;
  source_url: string | null;
  source_name: string | null;
  image_url: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  ingredients: Ingredient[];
  method: MethodStep[];
  tags: string[];
  cuisine: string | null;
  notes: string | null;
  created_at: string;
};

export type MealEntry = {
  id: string;
  planned_date: string;
  meal_type: string;
  recipe_id: string | null;
  custom_meal: string | null;
  servings: number;
  recipes: { id: string; title: string; image_url: string | null } | null;
};

export const MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "evening_meal",
  "snack_1",
  "snack_2",
] as const;

export const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  evening_meal: "Evening Meal",
  snack_1: "Snack 1",
  snack_2: "Snack 2",
};

export const RECIPES_INPUT_CLS =
  "w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3";
