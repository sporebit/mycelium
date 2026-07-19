"use client";

import { useCallback, useEffect, useState } from "react";
import { dateStr, getMonday } from "@/lib/health/meal-planner-dates";
import type { MealEntry, Recipe } from "@/lib/health/recipes";
import { RecipeGrid } from "@/components/health/recipes/RecipeGrid";
import { MealPlannerGrid } from "@/components/health/recipes/MealPlannerGrid";
import { AddRecipeModal } from "@/components/health/recipes/AddRecipeModal";
import { MealPickerModal } from "@/components/health/recipes/MealPickerModal";
import { ShoppingListModal } from "@/components/health/recipes/ShoppingListModal";

export default function RecipesPage() {
  const [tab, setTab] = useState<"recipes" | "planner">("recipes");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");

  const [showAddModal, setShowAddModal] = useState(false);

  // Meal planner
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [showMealPicker, setShowMealPicker] = useState<{ date: string; meal: string } | null>(null);

  // Shopping list
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<{ amount: string; unit: string | null; name: string }[]>([]);
  const [shoppingListId, setShoppingListId] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    try {
      const res = await fetch("/api/health/recipes");
      const data = await res.json();
      setRecipes(data.recipes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRecipes(); }, [loadRecipes]);

  const loadMealPlan = useCallback(async () => {
    setLoadingMeals(true);
    try {
      const res = await fetch(`/api/health/meal-plan?week=${dateStr(weekStart)}`);
      const data = await res.json();
      setMealEntries(data.entries ?? []);
    } finally {
      setLoadingMeals(false);
    }
  }, [weekStart]);

  useEffect(() => {
    if (tab !== "planner") return;
    let cancelled = false;
    (async () => {
      setLoadingMeals(true);
      try {
        const res = await fetch(`/api/health/meal-plan?week=${dateStr(weekStart)}`);
        const data = await res.json();
        if (!cancelled) setMealEntries(data.entries ?? []);
      } finally {
        if (!cancelled) setLoadingMeals(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, weekStart]);

  async function addMealEntry(recipeId: string | null, custom: string | null) {
    if (!showMealPicker) return;
    await fetch("/api/health/meal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planned_date: showMealPicker.date,
        meal_type: showMealPicker.meal,
        recipe_id: recipeId,
        custom_meal: custom,
      }),
    });
    setShowMealPicker(null);
    loadMealPlan();
  }

  async function deleteMealEntry(id: string) {
    await fetch(`/api/health/meal-plan/${id}`, { method: "DELETE" });
    setMealEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function generateShoppingList() {
    const recipeIds = mealEntries
      .filter((e) => e.recipe_id)
      .map((e) => e.recipe_id!);
    const unique = [...new Set(recipeIds)];
    if (unique.length === 0) return;

    const res = await fetch("/api/health/shopping-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week_start: dateStr(weekStart), recipe_ids: unique }),
    });
    const data = await res.json();
    if (data.ok && data.list) {
      setShoppingItems(data.list.items ?? []);
      setShoppingListId(data.list.id);
      setShowShoppingModal(true);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">
        Loading…
      </p>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic">
          Recipes
        </h1>
        {tab === "recipes" && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors"
          >
            ADD RECIPE
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-ink-2">
        {(["recipes", "planner"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 -mb-px text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] border-b-2 transition-colors ${
              tab === t
                ? "border-accent text-ink-4"
                : "border-transparent text-ink-3 hover:text-ink-4"
            }`}
          >
            {t === "recipes" ? "RECIPES" : "MEAL PLANNER"}
          </button>
        ))}
      </div>

      {tab === "recipes" && (
        <RecipeGrid
          recipes={recipes}
          search={search}
          setSearch={setSearch}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
        />
      )}

      {tab === "planner" && (
        <MealPlannerGrid
          weekStart={weekStart}
          setWeekStart={setWeekStart}
          mealEntries={mealEntries}
          loadingMeals={loadingMeals}
          onCellClick={(date, meal) => setShowMealPicker({ date, meal })}
          onDeleteEntry={deleteMealEntry}
          onGenerateShoppingList={generateShoppingList}
        />
      )}

      {showAddModal && (
        <AddRecipeModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            loadRecipes();
          }}
        />
      )}

      {showMealPicker && (
        <MealPickerModal
          date={showMealPicker.date}
          meal={showMealPicker.meal}
          recipes={recipes}
          onClose={() => setShowMealPicker(null)}
          onAdd={addMealEntry}
        />
      )}

      {showShoppingModal && (
        <ShoppingListModal
          items={shoppingItems}
          listId={shoppingListId}
          onClose={() => setShowShoppingModal(false)}
        />
      )}
    </div>
  );
}
