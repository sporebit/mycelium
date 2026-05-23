export type Meal = {
  id: string;
  t: string; // HH:MM
  n: string; // name
  kcal: number;
  p: number;
  c: number;
  f: number;
  estimated: boolean;
};

export type NutritionTargets = {
  kcal: number;
  p: number;
  c: number;
  f: number;
};

export type NutritionDay = {
  meals: Meal[];
  targets?: NutritionTargets;
};

export function sumMeals(meals: Meal[]): {
  kcal: number;
  p: number;
  c: number;
  f: number;
} {
  return meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + (Number.isFinite(m.kcal) ? m.kcal : 0),
      p: acc.p + (Number.isFinite(m.p) ? m.p : 0),
      c: acc.c + (Number.isFinite(m.c) ? m.c : 0),
      f: acc.f + (Number.isFinite(m.f) ? m.f : 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
}

export function kcalFromMacros(p: number, c: number, f: number): number {
  return Math.round(4 * p + 4 * c + 9 * f);
}
