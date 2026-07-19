"use client";

import { useState } from "react";
import {
  MEAL_LABELS,
  RECIPES_INPUT_CLS,
  type Recipe,
} from "@/lib/health/recipes";

export function MealPickerModal({
  date,
  meal,
  recipes,
  onClose,
  onAdd,
}: {
  date: string;
  meal: string;
  recipes: Recipe[];
  onClose: () => void;
  onAdd: (recipeId: string | null, custom: string | null) => void;
}) {
  const [mealSearch, setMealSearch] = useState("");
  const [customMeal, setCustomMeal] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6">
        <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-1">
          {MEAL_LABELS[meal]}
        </h2>
        <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)] mb-4">
          {new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
        </p>

        <input
          value={mealSearch}
          onChange={(e) => setMealSearch(e.target.value)}
          placeholder="Search recipes…"
          className={`${RECIPES_INPUT_CLS} mb-3`}
        />

        <div className="flex flex-col gap-1 mb-4 max-h-48 overflow-y-auto">
          {recipes
            .filter((r) => !mealSearch || r.title.toLowerCase().includes(mealSearch.toLowerCase()))
            .map((r) => (
              <button
                key={r.id}
                onClick={() => onAdd(r.id, null)}
                className="text-left px-3 py-2 rounded-lg hover:bg-ink-1 text-sm text-ink-4 font-[family-name:var(--font-display)] transition-colors"
              >
                {r.title}
                {r.cuisine && <span className="text-ink-3 text-xs ml-2">{r.cuisine}</span>}
              </button>
            ))}
        </div>

        <div className="border-t border-ink-2 pt-3">
          <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-1">OR CUSTOM MEAL</p>
          <div className="flex gap-2">
            <input
              value={customMeal}
              onChange={(e) => setCustomMeal(e.target.value)}
              className={`${RECIPES_INPUT_CLS} flex-1`}
              placeholder="e.g. Leftover curry"
            />
            <button
              onClick={() => customMeal.trim() && onAdd(null, customMeal.trim())}
              disabled={!customMeal.trim()}
              className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
            >
              ADD
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
