"use client";
// DRAFT: Real version needs OCR-of-recipe-cards pipeline + Telegram shopping-list send

import { useState } from "react";

type Recipe = {
  id: string;
  title: string;
  tags: string[];
  prepMinutes: number;
};

type MealSlot = "Breakfast" | "Lunch" | "Dinner" | "Snack";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MEAL_SLOTS: MealSlot[] = ["Breakfast", "Lunch", "Dinner", "Snack"];

const SAMPLE_RECIPES: Recipe[] = [
  { id: "r1", title: "Chicken Shawarma Bowl", tags: ["high-protein", "meal-prep"], prepMinutes: 35 },
  { id: "r2", title: "Overnight Oats", tags: ["quick", "breakfast"], prepMinutes: 5 },
  { id: "r3", title: "Thai Green Curry", tags: ["spicy", "batch-cook"], prepMinutes: 40 },
  { id: "r4", title: "Steak & Roasted Veg", tags: ["high-protein", "dinner"], prepMinutes: 30 },
  { id: "r5", title: "Greek Salad Wrap", tags: ["quick", "lunch"], prepMinutes: 10 },
];

type PlannerGrid = Record<string, Record<MealSlot, string | null>>;

function buildEmptyGrid(): PlannerGrid {
  const grid: PlannerGrid = {};
  for (const day of DAYS) {
    grid[day] = { Breakfast: null, Lunch: null, Dinner: null, Snack: null };
  }
  return grid;
}

const inputClass =
  "w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]";
const labelClass =
  "text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block";

export function RecipesClient() {
  const [recipes] = useState<Recipe[]>(SAMPLE_RECIPES);
  const [planner, setPlanner] = useState<PlannerGrid>(buildEmptyGrid);
  const [toast, setToast] = useState<string | null>(null);

  function assignRecipe(day: string, slot: MealSlot, recipeId: string | null) {
    setPlanner((prev) => ({
      ...prev,
      [day]: { ...prev[day], [slot]: recipeId },
    }));
  }

  function generateShoppingList() {
    setToast("Shopping list generation coming soon.");
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1100px]">
      <header>
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Recipes
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          Library and weekly meal planner.
        </p>
      </header>

      {toast && (
        <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-accent font-[family-name:var(--font-mono)]">
          {toast}
        </div>
      )}

      {/* Recipe library */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
          Library
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recipes.map((r) => (
            <div
              key={r.id}
              className="bg-ink-1 border border-ink-2 rounded-md p-4 flex flex-col gap-2"
            >
              <span className="text-sm text-ink-4 font-medium">{r.title}</span>
              <div className="flex flex-wrap gap-1">
                {r.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-accent/30 text-accent bg-accent/10"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] text-ink-3">
                {r.prepMinutes} min
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly planner */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Weekly Planner
          </h2>
          <button
            type="button"
            onClick={generateShoppingList}
            className="bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-4 py-2 rounded-md transition-colors"
          >
            Generate Shopping List
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-left p-2 font-normal">
                  Slot
                </th>
                {DAYS.map((d) => (
                  <th
                    key={d}
                    className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-left p-2 font-normal"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_SLOTS.map((slot) => (
                <tr key={slot} className="border-t border-ink-2">
                  <td className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] p-2 whitespace-nowrap">
                    {slot}
                  </td>
                  {DAYS.map((day) => (
                    <td key={day} className="p-1">
                      <select
                        value={planner[day]?.[slot] ?? ""}
                        onChange={(e) =>
                          assignRecipe(day, slot, e.target.value || null)
                        }
                        className={inputClass + " text-xs !px-1.5 !py-1"}
                      >
                        <option value="">--</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
