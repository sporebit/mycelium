"use client";

import { useCallback, useMemo, useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";
import { apiWrite, jsonBody, reportApiError } from "@/lib/data/apiWrite";

const RECIPES_KEY = "/api/health/recipes";
import { dateStr, getMonday } from "@/lib/health/meal-planner-dates";
import type { MealEntry, Recipe } from "@/lib/health/recipes";
import { RecipeGrid } from "@/components/health/recipes/RecipeGrid";
import { MealPlannerGrid } from "@/components/health/recipes/MealPlannerGrid";
import { AddRecipeModal } from "@/components/health/recipes/AddRecipeModal";
import { MealPickerModal } from "@/components/health/recipes/MealPickerModal";
import { ShoppingListModal } from "@/components/health/recipes/ShoppingListModal";

export default function RecipesPage() {
  const [tab, setTab] = useState<"recipes" | "planner">("recipes");
  const { data: recipesData, isLoading: loading, mutate: mutateRecipes } =
    useApi<{ recipes?: Recipe[] }>(RECIPES_KEY);
  const recipes = useMemo<Recipe[]>(
    () => (Array.isArray(recipesData?.recipes) ? recipesData.recipes : []),
    [recipesData],
  );
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");

  const [showAddModal, setShowAddModal] = useState(false);

  // Meal planner
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  // Null key until the planner tab is open, so the week is only fetched when
  // it is actually shown. Each week is its own cache entry.
  const mealKey =
    tab === "planner" ? `/api/health/meal-plan?week=${dateStr(weekStart)}` : null;
  const { data: mealData, isLoading: loadingMeals, mutate: mutateMeals } =
    useApi<{ entries?: MealEntry[] }>(mealKey);
  const mealEntries = useMemo<MealEntry[]>(
    () => (Array.isArray(mealData?.entries) ? mealData.entries : []),
    [mealData],
  );
  const [showMealPicker, setShowMealPicker] = useState<{ date: string; meal: string } | null>(null);

  // Shopping list
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<{ amount: string; unit: string | null; name: string }[]>([]);
  const [shoppingListId, setShoppingListId] = useState<string | null>(null);

  const loadRecipes = useCallback(() => void mutateRecipes(), [mutateRecipes]);

  const loadMealPlan = useCallback(() => void mutateMeals(), [mutateMeals]);

  async function addMealEntry(recipeId: string | null, custom: string | null) {
    if (!showMealPicker) return;
    try {
      await apiWrite("/api/health/meal-plan", {
        method: "POST",
        ...jsonBody({
          planned_date: showMealPicker.date,
          meal_type: showMealPicker.meal,
          recipe_id: recipeId,
          custom_meal: custom,
        }),
      });
      setShowMealPicker(null);
      loadMealPlan();
    } catch (e) {
      reportApiError(e, "Could not add to the meal plan");
    }
  }

  async function deleteMealEntry(id: string) {
    if (!mealKey) return;
    await mutateApi<{ entries?: MealEntry[] }>(
      mealKey,
      (cur) => ({
        ...cur,
        entries: (cur?.entries ?? []).filter((e) => e.id !== id),
      }),
      () => apiWrite(`/api/health/meal-plan/${id}`, { method: "DELETE" }),
      { onError: (e) => reportApiError(e, "Could not remove that meal") },
    );
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
