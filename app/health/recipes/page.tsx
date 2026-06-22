"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Ingredient = { amount: string; unit: string | null; name: string; notes: string | null };
type MethodStep = { step: number; instruction: string };

type Recipe = {
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

type MealEntry = {
  id: string;
  planned_date: string;
  meal_type: string;
  recipe_id: string | null;
  custom_meal: string | null;
  servings: number;
  recipes: { id: string; title: string; image_url: string | null } | null;
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const MEAL_LABELS: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtWeekRange(mon: Date): string {
  const sun = addDays(mon, 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

export default function RecipesPage() {
  const [tab, setTab] = useState<"recipes" | "planner">("recipes");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");

  // Recipe form
  const [showAddModal, setShowAddModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formSourceName, setFormSourceName] = useState("");
  const [formSourceUrl, setFormSourceUrl] = useState("");
  const [formPrepTime, setFormPrepTime] = useState("");
  const [formCookTime, setFormCookTime] = useState("");
  const [formServings, setFormServings] = useState("4");
  const [formCuisine, setFormCuisine] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIngredients, setFormIngredients] = useState<Ingredient[]>([]);
  const [formMethod, setFormMethod] = useState<MethodStep[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const additionalFileRef = useRef<HTMLInputElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scanningPage, setScanningPage] = useState(0);

  // Meal planner
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [showMealPicker, setShowMealPicker] = useState<{ date: string; meal: string } | null>(null);
  const [mealSearch, setMealSearch] = useState("");
  const [customMeal, setCustomMeal] = useState("");

  // Shopping list
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<{ amount: string; unit: string | null; name: string }[]>([]);
  const [shoppingListId, setShoppingListId] = useState<string | null>(null);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);

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

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) for (const t of r.tags) set.add(t);
    return Array.from(set).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      if (tagFilter !== "all" && !r.tags.includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          (r.cuisine?.toLowerCase().includes(q) ?? false) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [recipes, search, tagFilter]);

  function resetForm() {
    setFormTitle(""); setFormSourceName(""); setFormSourceUrl("");
    setFormPrepTime(""); setFormCookTime(""); setFormServings("4");
    setFormCuisine(""); setFormTags(""); setFormNotes("");
    setFormIngredients([]); setFormMethod([]);
    setPageCount(0); setScanningPage(0);
  }

  function populateForm(r: Record<string, unknown>, merge = false) {
    const recipe = r as {
      title?: string; source_name?: string; source_url?: string;
      prep_time_minutes?: number; cook_time_minutes?: number;
      servings?: number; cuisine?: string; tags?: string[];
      notes?: string; ingredients?: Ingredient[]; method?: MethodStep[];
    };
    setFormTitle(recipe.title || (merge ? formTitle : "") || "");
    setFormSourceName(recipe.source_name || (merge ? formSourceName : "") || "");
    setFormSourceUrl(recipe.source_url || (merge ? formSourceUrl : "") || "");
    setFormPrepTime(recipe.prep_time_minutes?.toString() || (merge ? formPrepTime : "") || "");
    setFormCookTime(recipe.cook_time_minutes?.toString() || (merge ? formCookTime : "") || "");
    setFormServings(recipe.servings?.toString() || (merge ? formServings : "4") || "4");
    setFormCuisine(recipe.cuisine || (merge ? formCuisine : "") || "");
    setFormTags((recipe.tags || []).join(", ") || (merge ? formTags : "") || "");
    setFormNotes(recipe.notes || (merge ? formNotes : "") || "");
    if (recipe.ingredients?.length) setFormIngredients(recipe.ingredients);
    if (recipe.method?.length) setFormMethod(recipe.method);
  }

  function getCurrentFormData() {
    return {
      title: formTitle || null,
      source_name: formSourceName || null,
      source_url: formSourceUrl || null,
      prep_time_minutes: formPrepTime ? Number(formPrepTime) : null,
      cook_time_minutes: formCookTime ? Number(formCookTime) : null,
      servings: Number(formServings) || null,
      cuisine: formCuisine || null,
      tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: formNotes || null,
      ingredients: formIngredients,
      method: formMethod,
    };
  }

  async function handleScan(file: File) {
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/health/recipes/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok && data.recipe) {
        populateForm(data.recipe as Record<string, unknown>);
        setPageCount(1);
      }
    } finally {
      setScanning(false);
    }
  }

  async function handleAdditionalPage(file: File) {
    const page = pageCount + 1;
    setScanningPage(page);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("existing_data", JSON.stringify(getCurrentFormData()));
      const res = await fetch("/api/health/recipes/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok && data.recipe) {
        populateForm(data.recipe as Record<string, unknown>, true);
        setPageCount(page);
      }
    } finally {
      setScanningPage(0);
    }
  }

  async function handleSaveRecipe() {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/health/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          source_name: formSourceName || null,
          source_url: formSourceUrl || null,
          prep_time_minutes: formPrepTime ? Number(formPrepTime) : null,
          cook_time_minutes: formCookTime ? Number(formCookTime) : null,
          servings: Number(formServings) || 4,
          cuisine: formCuisine || null,
          tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
          notes: formNotes || null,
          ingredients: formIngredients,
          method: formMethod,
        }),
      });
      if (res.ok) {
        resetForm();
        setShowAddModal(false);
        loadRecipes();
      }
    } finally {
      setSaving(false);
    }
  }

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
    setMealSearch("");
    setCustomMeal("");
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
      setTelegramSent(false);
      setShowShoppingModal(true);
    }
  }

  async function sendToTelegram() {
    if (!shoppingListId) return;
    setSendingTelegram(true);
    try {
      const res = await fetch(`/api/health/shopping-lists/${shoppingListId}/send-telegram`, {
        method: "POST",
      });
      if (res.ok) setTelegramSent(true);
    } finally {
      setSendingTelegram(false);
    }
  }

  const inputCls = "w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3";

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

      {/* Tab 1 — Recipes */}
      {tab === "recipes" && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes…"
            className={`${inputCls} mb-3`}
          />

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-4">
              <button
                onClick={() => setTagFilter("all")}
                className={`px-2 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] border transition-colors ${
                  tagFilter === "all" ? "border-accent bg-accent/10 text-accent" : "border-ink-2 text-ink-3"
                }`}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? "all" : t)}
                  className={`px-2 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] border transition-colors ${
                    tagFilter === t ? "border-[#5de8e0] bg-[#5de8e0]/10 text-[#5de8e0]" : "border-ink-2 text-ink-3"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
              No recipes yet. Add your first one.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  href={`/health/recipes/${r.id}`}
                  className="group rounded-xl border border-ink-2 overflow-hidden hover:border-ink-3 transition-colors"
                >
                  <div
                    className="h-36 w-full bg-cover bg-center"
                    style={
                      r.image_url
                        ? { backgroundImage: `url(${r.image_url})` }
                        : { background: "linear-gradient(135deg, #5de8e0 0%, #3bb8b0 100%)" }
                    }
                  />
                  <div className="p-3">
                    <p className="text-sm text-ink-4 font-[family-name:var(--font-display)] group-hover:text-text-0 transition-colors truncate">
                      {r.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
                      {r.cuisine && <span>{r.cuisine}</span>}
                      {r.prep_time_minutes != null && <span>{r.prep_time_minutes}m prep</span>}
                      {r.cook_time_minutes != null && <span>{r.cook_time_minutes}m cook</span>}
                      <span>{r.servings} servings</span>
                    </div>
                    {r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.tags.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded-full bg-[#5de8e0]/10 text-[#5de8e0] text-[9px] font-[family-name:var(--font-mono)]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab 2 — Meal Planner */}
      {tab === "planner" && (
        <>
          {/* Week nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="text-ink-3 hover:text-ink-4 text-sm font-[family-name:var(--font-mono)]"
            >
              ← Prev
            </button>
            <p className="text-sm text-ink-4 font-[family-name:var(--font-display)]">
              {fmtWeekRange(weekStart)}
            </p>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="text-ink-3 hover:text-ink-4 text-sm font-[family-name:var(--font-mono)]"
            >
              Next →
            </button>
          </div>

          {loadingMeals ? (
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-8">Loading…</p>
          ) : (
            <>
              {/* Grid */}
              <div className="overflow-x-auto mb-4">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] text-left p-2 w-20" />
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = addDays(weekStart, i);
                        return (
                          <th key={i} className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] text-center p-2">
                            {fmtDay(d)}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {MEAL_TYPES.map((meal) => (
                      <tr key={meal} className="border-t border-ink-2">
                        <td className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] p-2">
                          {MEAL_LABELS[meal]}
                        </td>
                        {Array.from({ length: 7 }, (_, i) => {
                          const d = dateStr(addDays(weekStart, i));
                          const entry = mealEntries.find(
                            (e) => e.planned_date === d && e.meal_type === meal,
                          );
                          return (
                            <td key={i} className="p-1 text-center align-top">
                              {entry ? (
                                <div className="group relative px-1 py-1.5 rounded bg-[#5de8e0]/10 border border-[#5de8e0]/20">
                                  <p className="text-[10px] text-ink-4 font-[family-name:var(--font-display)] truncate">
                                    {entry.recipes?.title || entry.custom_meal || "—"}
                                  </p>
                                  <button
                                    onClick={() => deleteMealEntry(entry.id)}
                                    className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 h-4 w-4 rounded-full bg-danger/80 text-white text-[8px] flex items-center justify-center transition-opacity"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowMealPicker({ date: d, meal })}
                                  className="w-full py-1.5 rounded border border-dashed border-ink-2 text-ink-3 hover:border-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] transition-colors"
                                >
                                  +
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Generate shopping list */}
              <button
                onClick={generateShoppingList}
                disabled={mealEntries.filter((e) => e.recipe_id).length === 0}
                className="px-4 py-2 rounded-md bg-[#5de8e0]/15 border border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-[#5de8e0]/25 disabled:opacity-30 transition-colors"
              >
                GENERATE SHOPPING LIST
              </button>
            </>
          )}
        </>
      )}

      {/* Add recipe modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
              Add Recipe
            </h2>

            {/* Scan option */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={scanning}
                className="flex-1 py-3 rounded-lg border border-dashed border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] hover:bg-[#5de8e0]/5 transition-colors"
              >
                {scanning ? "READING RECIPE…" : "SCAN RECIPE"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleScan(f);
                }}
              />
            </div>

            {/* Add another page */}
            {pageCount > 0 && !scanning && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => additionalFileRef.current?.click()}
                  disabled={scanningPage > 0}
                  className="flex-1 py-3 rounded-lg border border-dashed border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] hover:bg-accent/5 transition-colors disabled:opacity-40"
                >
                  {scanningPage > 0
                    ? `READING PAGE ${scanningPage}…`
                    : `+ ADD ANOTHER PAGE (${pageCount} scanned)`}
                </button>
                <input
                  ref={additionalFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAdditionalPage(f);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">TITLE</label>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className={inputCls} placeholder="Recipe name" />
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">SOURCE NAME</label>
                <input value={formSourceName} onChange={(e) => setFormSourceName(e.target.value)} className={inputCls} placeholder="e.g. Gousto" />
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">SOURCE URL</label>
                <input value={formSourceUrl} onChange={(e) => setFormSourceUrl(e.target.value)} className={inputCls} placeholder="https://…" />
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">PREP (min)</label>
                <input type="number" value={formPrepTime} onChange={(e) => setFormPrepTime(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">COOK (min)</label>
                <input type="number" value={formCookTime} onChange={(e) => setFormCookTime(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">SERVINGS</label>
                <input type="number" value={formServings} onChange={(e) => setFormServings(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">CUISINE</label>
                <input value={formCuisine} onChange={(e) => setFormCuisine(e.target.value)} className={inputCls} placeholder="e.g. Italian" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">TAGS (comma separated)</label>
                <input value={formTags} onChange={(e) => setFormTags(e.target.value)} className={inputCls} placeholder="quick, chicken, healthy" />
              </div>
            </div>

            {/* Ingredients */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">INGREDIENTS</label>
                <button
                  onClick={() => setFormIngredients([...formIngredients, { amount: "", unit: null, name: "", notes: null }])}
                  className="text-[10px] text-accent font-[family-name:var(--font-mono)]"
                >
                  + ADD
                </button>
              </div>
              {formIngredients.map((ing, i) => (
                <div key={i} className="flex gap-1 mb-1">
                  <input
                    value={ing.amount}
                    onChange={(e) => {
                      const next = [...formIngredients];
                      next[i] = { ...next[i], amount: e.target.value };
                      setFormIngredients(next);
                    }}
                    className={`${inputCls} w-16`}
                    placeholder="Qty"
                  />
                  <input
                    value={ing.unit ?? ""}
                    onChange={(e) => {
                      const next = [...formIngredients];
                      next[i] = { ...next[i], unit: e.target.value || null };
                      setFormIngredients(next);
                    }}
                    className={`${inputCls} w-16`}
                    placeholder="Unit"
                  />
                  <input
                    value={ing.name}
                    onChange={(e) => {
                      const next = [...formIngredients];
                      next[i] = { ...next[i], name: e.target.value };
                      setFormIngredients(next);
                    }}
                    className={`${inputCls} flex-1`}
                    placeholder="Ingredient"
                  />
                  <button
                    onClick={() => setFormIngredients(formIngredients.filter((_, j) => j !== i))}
                    className="text-ink-3 hover:text-danger text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Method */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">METHOD</label>
                <button
                  onClick={() => setFormMethod([...formMethod, { step: formMethod.length + 1, instruction: "" }])}
                  className="text-[10px] text-accent font-[family-name:var(--font-mono)]"
                >
                  + ADD STEP
                </button>
              </div>
              {formMethod.map((s, i) => (
                <div key={i} className="flex gap-1 mb-1 items-start">
                  <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] mt-2.5 w-5 shrink-0">{s.step}.</span>
                  <textarea
                    value={s.instruction}
                    onChange={(e) => {
                      const next = [...formMethod];
                      next[i] = { ...next[i], instruction: e.target.value };
                      setFormMethod(next);
                    }}
                    className={`${inputCls} flex-1 resize-y min-h-[36px]`}
                    rows={1}
                  />
                  <button
                    onClick={() => {
                      const next = formMethod.filter((_, j) => j !== i).map((s, j) => ({ ...s, step: j + 1 }));
                      setFormMethod(next);
                    }}
                    className="text-ink-3 hover:text-danger text-xs px-1 mt-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">NOTES</label>
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { resetForm(); setShowAddModal(false); }}
                className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleSaveRecipe}
                disabled={saving || !formTitle.trim()}
                className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meal picker modal */}
      {showMealPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-1">
              {MEAL_LABELS[showMealPicker.meal]}
            </h2>
            <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)] mb-4">
              {new Date(showMealPicker.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
            </p>

            <input
              value={mealSearch}
              onChange={(e) => setMealSearch(e.target.value)}
              placeholder="Search recipes…"
              className={`${inputCls} mb-3`}
            />

            <div className="flex flex-col gap-1 mb-4 max-h-48 overflow-y-auto">
              {recipes
                .filter((r) => !mealSearch || r.title.toLowerCase().includes(mealSearch.toLowerCase()))
                .map((r) => (
                  <button
                    key={r.id}
                    onClick={() => addMealEntry(r.id, null)}
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
                  className={`${inputCls} flex-1`}
                  placeholder="e.g. Leftover curry"
                />
                <button
                  onClick={() => customMeal.trim() && addMealEntry(null, customMeal.trim())}
                  disabled={!customMeal.trim()}
                  className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
                >
                  ADD
                </button>
              </div>
            </div>

            <button
              onClick={() => { setShowMealPicker(null); setMealSearch(""); setCustomMeal(""); }}
              className="mt-3 w-full py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Shopping list modal */}
      {showShoppingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
              Shopping List
            </h2>

            <div className="flex flex-col gap-1 mb-4">
              {shoppingItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm">
                  <span className="text-ink-4 font-[family-name:var(--font-mono)] font-bold">
                    {item.amount}{item.unit ? ` ${item.unit}` : ""}
                  </span>
                  <span className="text-ink-4 font-[family-name:var(--font-display)]">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={sendToTelegram}
                disabled={sendingTelegram || telegramSent}
                className="flex-1 py-2 rounded-md bg-[#5de8e0]/15 border border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-[#5de8e0]/25 disabled:opacity-40 transition-colors"
              >
                {telegramSent ? "✓ SENT TO TELEGRAM" : sendingTelegram ? "SENDING…" : "SEND TO TELEGRAM"}
              </button>
              <button
                onClick={() => setShowShoppingModal(false)}
                className="px-3 py-2 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
