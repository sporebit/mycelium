"use client";

import { useState } from "react";
import type {
  Food,
  FoodSearchResult,
  MealGroup,
  NutritionLog,
} from "@/lib/nutrition/types-v2";
import { BarcodeScanner } from "./BarcodeScanner";
import { ServingPicker } from "./ServingPicker";
import { ManualFoodEntry } from "./ManualFoodEntry";

/**
 * Camera-first quick log. Skips the search/add-food sheet entirely:
 * scanner → serving picker → POST /api/nutrition/logs.
 *
 * If the OFF barcode lookup misses, we don't dead-end with an error —
 * the manual-entry modal opens pre-filled with the scanned code so
 * the user can fill the panel themselves. Saved manual rows are
 * cached against the barcode so the same product hits instantly next
 * time.
 *
 * `defaultMealGroupName` lets the caller pick a group by name when the
 * id isn't known up front (e.g. dashboard card chooses by time of day).
 */
export function QuickBarcodeLog({
  open,
  date,
  mealGroups,
  defaultMealGroupId,
  defaultMealGroupName,
  onClose,
  onLogged,
  onError,
}: {
  open: boolean;
  date: string;
  mealGroups: MealGroup[];
  defaultMealGroupId?: string | null;
  defaultMealGroupName?: string | null;
  onClose: () => void;
  onLogged: (log: NutritionLog) => void;
  onError: (msg: string) => void;
}) {
  const [picked, setPicked] = useState<FoodSearchResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [missedBarcode, setMissedBarcode] = useState<string | null>(null);

  if (!open) return null;

  const resolvedGroupId =
    defaultMealGroupId ??
    (defaultMealGroupName
      ? (mealGroups.find(
          (g) => g.name.toLowerCase() === defaultMealGroupName.toLowerCase(),
        )?.id ?? null)
      : null);

  function foodToSearchResult(food: Food): FoodSearchResult {
    return {
      id: food.id,
      name: food.name,
      brand: food.brand,
      barcode: food.barcode,
      off_id: food.off_id,
      source: food.source,
      kcal_per_100g: food.kcal_per_100g,
      protein_per_100g: food.protein_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fat_per_100g: food.fat_per_100g,
      servings: food.servings ?? [],
      in_library: true,
      is_favourite: food.is_favourite,
      use_count: food.use_count,
    };
  }

  async function lookup(code: string): Promise<boolean> {
    setLooking(true);
    try {
      const r = await fetch(
        `/api/nutrition/foods/barcode/${encodeURIComponent(code)}`,
      );
      const j = (await r.json().catch(() => ({}))) as {
        food?: Food;
        error?: string;
      };
      if (!r.ok || !j.food) return false;
      setPicked(foodToSearchResult(j.food));
      return true;
    } catch (err) {
      console.error("[QuickBarcodeLog lookup]", err);
      return false;
    } finally {
      setLooking(false);
    }
  }

  async function handleScanned(code: string) {
    const ok = await lookup(code);
    if (!ok) {
      // Don't dead-end — drop into manual entry with the barcode
      // primed. The user can fill it in once and we'll cache the row
      // for next time.
      setMissedBarcode(code);
    }
  }

  async function logPicked(payload: {
    quantityG: number;
    servingLabel: string | null;
    mealGroupId: string | null;
  }) {
    if (!picked || !picked.id) {
      onError("Couldn't resolve food.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/nutrition/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_id: picked.id,
          meal_group_id: payload.mealGroupId,
          date,
          quantity_g: payload.quantityG,
          serving_label: payload.servingLabel,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        log?: NutritionLog;
        error?: string;
      };
      if (!r.ok || !j.log) {
        onError(j.error ?? "Couldn't log.");
        return;
      }
      onLogged(j.log);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // Manual entry takes precedence when an OFF lookup missed.
  if (missedBarcode) {
    return (
      <ManualFoodEntry
        barcode={missedBarcode}
        retrying={looking}
        onRetry={async () => {
          // One more shot at OFF before the user gives up and types
          // the panel themselves. If it lands, we drop straight into
          // the serving picker.
          const ok = await lookup(missedBarcode);
          if (ok) setMissedBarcode(null);
        }}
        onSaved={(food) => {
          setMissedBarcode(null);
          setPicked(foodToSearchResult(food));
        }}
        onClose={() => {
          setMissedBarcode(null);
          onClose();
        }}
      />
    );
  }

  // While we have a picked food, render the serving-picker modal over
  // the scanner. Otherwise render the scanner.
  if (picked) {
    return (
      <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm cursor-default"
        />
        <div
          role="dialog"
          aria-label="Confirm log"
          className="relative w-full max-w-md rounded-t-xl md:rounded-xl bg-ink-1 border border-ink-2 shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Confirm
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-3 hover:text-ink-4"
            >
              ✕
            </button>
          </div>
          <ServingPicker
            food={picked}
            mealGroups={mealGroups}
            defaultMealGroupId={resolvedGroupId}
            onCancel={onClose}
            onLog={logPicked}
            saving={saving}
          />
        </div>
      </div>
    );
  }

  if (looking) {
    return (
      <div className="fixed inset-0 z-[200] bg-ink-0/95 backdrop-blur-sm flex items-center justify-center">
        <span className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Looking up barcode…
        </span>
      </div>
    );
  }

  return <BarcodeScanner onDetected={handleScanned} onClose={onClose} />;
}

/** Choose a default meal-group name from the wall clock — used when the
 *  caller can't pre-pick a group (e.g. dashboard card). */
export function defaultGroupNameForTime(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "Breakfast";
  if (h >= 11 && h < 15) return "Lunch";
  if (h >= 17 && h < 21) return "Dinner";
  return "Snacks";
}
