"use client";

import { useMemo, useState } from "react";
import type {
  FoodSearchResult,
  MealGroup,
  Serving,
} from "@/lib/nutrition/types-v2";

/**
 * After a food is picked from the search list, this view collects the
 * quantity + serving + meal-group and emits a log payload upward.
 */
export function ServingPicker({
  food,
  mealGroups,
  defaultMealGroupId,
  onCancel,
  onLog,
  saving,
}: {
  food: FoodSearchResult;
  mealGroups: MealGroup[];
  defaultMealGroupId: string | null;
  onCancel: () => void;
  onLog: (payload: {
    quantityG: number;
    servingLabel: string | null;
    mealGroupId: string | null;
    save: boolean;
  }) => void;
  saving: boolean;
}) {
  const servings = useMemo<Serving[]>(() => {
    const base: Serving[] = [{ label: "100 g", grams: 100 }];
    for (const s of food.servings ?? []) {
      // De-dupe against the base 100g entry
      if (s.grams !== 100 || s.label.trim() !== "100 g") base.push(s);
    }
    return base;
  }, [food]);

  const [pickedIdx, setPickedIdx] = useState(0);
  const [quantity, setQuantity] = useState(servings[0].grams);
  const [mealGroupId, setMealGroupId] = useState<string | null>(
    defaultMealGroupId,
  );

  function pickServing(idx: number) {
    setPickedIdx(idx);
    setQuantity(servings[idx].grams);
  }

  const previewFactor = quantity / 100;
  const previewKcal =
    food.kcal_per_100g != null
      ? Math.round(food.kcal_per_100g * previewFactor)
      : null;
  const previewProtein =
    food.protein_per_100g != null
      ? Math.round(food.protein_per_100g * previewFactor)
      : null;
  const previewCarbs =
    food.carbs_per_100g != null
      ? Math.round(food.carbs_per_100g * previewFactor)
      : null;
  const previewFat =
    food.fat_per_100g != null
      ? Math.round(food.fat_per_100g * previewFactor)
      : null;

  function submit() {
    if (saving) return;
    const label = servings[pickedIdx].label;
    onLog({
      quantityG: quantity,
      servingLabel: label,
      mealGroupId,
      save: !food.in_library,
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <button
        type="button"
        onClick={onCancel}
        className="self-start text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        ← Back to results
      </button>

      <div>
        <h3 className="text-base text-ink-4 font-[family-name:var(--font-display)] italic">
          {food.name}
        </h3>
        {food.brand && (
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
            {food.brand}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Quantity (g)
          </span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => {
              const n = Number(e.target.value);
              setQuantity(Number.isFinite(n) ? n : 0);
            }}
            className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Serving
          </span>
          <select
            value={pickedIdx}
            onChange={(e) => pickServing(Number(e.target.value))}
            className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          >
            {servings.map((s, idx) => (
              <option key={`${s.label}-${idx}`} value={idx}>
                {s.label} ({s.grams} g)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-md bg-ink-0/40 border border-ink-2 p-3 grid grid-cols-4 gap-2 text-center">
        <PreviewCell label="kcal" value={previewKcal} />
        <PreviewCell label="P" value={previewProtein} suffix="g" />
        <PreviewCell label="C" value={previewCarbs} suffix="g" />
        <PreviewCell label="F" value={previewFat} suffix="g" />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Meal group
        </span>
        <select
          value={mealGroupId ?? ""}
          onChange={(e) => setMealGroupId(e.target.value || null)}
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
        >
          <option value="">— None —</option>
          {mealGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 transition-colors"
        >
          CANCEL
        </button>
        <button
          type="button"
          disabled={saving || quantity <= 0}
          onClick={submit}
          className="px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          {saving ? "LOGGING…" : "LOG"}
        </button>
      </div>
    </div>
  );
}

function PreviewCell({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </div>
      <div className="text-sm text-ink-4 font-[family-name:var(--font-mono)] tabular-nums">
        {value === null ? "—" : `${value}${suffix ?? ""}`}
      </div>
    </div>
  );
}
