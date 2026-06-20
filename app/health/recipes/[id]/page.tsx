"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
};

function scaleAmount(amount: string, factor: number): string {
  const num = parseFloat(amount.replace(/[^\d.\/]/g, ""));
  if (isNaN(num)) return amount;
  if (amount.includes("/")) {
    const parts = amount.split("/");
    const numerator = parseFloat(parts[0]) * factor;
    const denominator = parseFloat(parts[1]);
    if (!isNaN(numerator) && !isNaN(denominator)) {
      const result = numerator / denominator;
      return result % 1 === 0 ? result.toString() : result.toFixed(1);
    }
  }
  const scaled = num * factor;
  return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);
}

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [servings, setServings] = useState(4);
  const [deleting, setDeleting] = useState(false);
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [planDate, setPlanDate] = useState("");
  const [planMeal, setPlanMeal] = useState("dinner");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/health/recipes/${id}`);
      const data = await res.json();
      if (data.recipe) {
        setRecipe(data.recipe);
        setServings(data.recipe.servings);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const scaleFactor = useMemo(() => {
    if (!recipe) return 1;
    return servings / recipe.servings;
  }, [recipe, servings]);

  async function handleDelete() {
    if (!confirm("Delete this recipe?")) return;
    setDeleting(true);
    await fetch(`/api/health/recipes/${id}`, { method: "DELETE" });
    router.push("/health/recipes");
  }

  async function handleAddToPlan() {
    if (!planDate) return;
    await fetch("/api/health/meal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planned_date: planDate,
        meal_type: planMeal,
        recipe_id: id,
        servings,
      }),
    });
    setAddingToPlan(false);
    setPlanDate("");
  }

  if (loading) {
    return (
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">
        Loading…
      </p>
    );
  }

  if (!recipe) {
    return (
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">
        Recipe not found.
      </p>
    );
  }

  const inputCls = "bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <div
        className="h-60 w-full rounded-xl mb-4 bg-cover bg-center"
        style={
          recipe.image_url
            ? { backgroundImage: `url(${recipe.image_url})` }
            : { background: "linear-gradient(135deg, #5de8e0 0%, #3bb8b0 100%)" }
        }
      />

      {/* Title + meta */}
      <h1 className="text-xl text-text-0 font-[family-name:var(--font-display)] italic mb-1">
        {recipe.title}
      </h1>
      {recipe.cuisine && (
        <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)] mb-1">{recipe.cuisine}</p>
      )}
      {recipe.source_name && (
        <p className="text-xs text-ink-3 font-[family-name:var(--font-display)] mb-3">
          Source:{" "}
          {recipe.source_url ? (
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              {recipe.source_name}
            </a>
          ) : (
            recipe.source_name
          )}
        </p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 py-3 border-y border-ink-2 mb-4 text-xs text-ink-3 font-[family-name:var(--font-mono)]">
        {recipe.prep_time_minutes != null && <span>{recipe.prep_time_minutes}m prep</span>}
        {recipe.cook_time_minutes != null && <span>{recipe.cook_time_minutes}m cook</span>}
        <span className="flex items-center gap-1">
          <button
            onClick={() => setServings(Math.max(1, servings - 1))}
            className="h-5 w-5 rounded border border-ink-2 text-ink-3 hover:text-ink-4 flex items-center justify-center text-xs"
          >
            −
          </button>
          <span className="text-ink-4 font-bold min-w-[20px] text-center">{servings}</span>
          <button
            onClick={() => setServings(servings + 1)}
            className="h-5 w-5 rounded border border-ink-2 text-ink-3 hover:text-ink-4 flex items-center justify-center text-xs"
          >
            +
          </button>
          servings
        </span>
      </div>

      {/* Ingredients */}
      <div className="mb-6">
        <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-3">
          INGREDIENTS
        </p>
        <div className="grid grid-cols-1 gap-1">
          {recipe.ingredients.map((ing, i) => (
            <div key={i} className="flex items-baseline gap-2 py-1 border-b border-ink-2/30 last:border-b-0">
              <span className="text-sm text-ink-4 font-[family-name:var(--font-mono)] font-bold shrink-0 w-20 text-right">
                {scaleAmount(ing.amount, scaleFactor)}{ing.unit ? ` ${ing.unit}` : ""}
              </span>
              <span className="text-sm text-ink-4 font-[family-name:var(--font-display)]">
                {ing.name}
                {ing.notes && <span className="text-ink-3 text-xs ml-1">({ing.notes})</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Method */}
      <div className="mb-6">
        <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-3">
          METHOD
        </p>
        <div className="flex flex-col gap-3">
          {recipe.method.map((s) => (
            <div key={s.step} className="flex gap-3 items-start">
              <div className="h-7 w-7 rounded-full bg-[#5de8e0]/15 text-[#5de8e0] flex items-center justify-center text-xs font-[family-name:var(--font-mono)] font-bold shrink-0 mt-0.5">
                {s.step}
              </div>
              <p className="text-sm text-ink-4 font-[family-name:var(--font-display)] leading-relaxed">
                {s.instruction}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {recipe.tags.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-[#5de8e0]/10 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)]">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {recipe.notes && (
        <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mb-4">
          {recipe.notes}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-ink-2 pt-4">
        <button
          onClick={() => setAddingToPlan(true)}
          className="px-4 py-2 rounded-md bg-[#5de8e0]/15 border border-[#5de8e0]/40 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-[#5de8e0]/25 transition-colors"
        >
          ADD TO MEAL PLAN
        </button>
        <button
          onClick={() => router.push("/health/recipes")}
          className="px-3 py-2 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          BACK
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-2 rounded-md border border-danger/40 text-danger hover:bg-danger/10 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40 transition-colors ml-auto"
        >
          DELETE
        </button>
      </div>

      {/* Add to plan modal */}
      {addingToPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
              Add to Meal Plan
            </h2>
            <div className="mb-3">
              <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">DATE</label>
              <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className={`w-full ${inputCls}`} />
            </div>
            <div className="mb-4">
              <label className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em]">MEAL</label>
              <div className="flex gap-1 mt-1">
                {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPlanMeal(m)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] border transition-colors ${
                      planMeal === m ? "border-accent bg-accent/10 text-accent" : "border-ink-2 text-ink-3"
                    }`}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAddingToPlan(false)} className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em]">CANCEL</button>
              <button onClick={handleAddToPlan} disabled={!planDate} className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40">ADD</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
