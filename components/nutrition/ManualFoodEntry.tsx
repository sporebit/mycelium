"use client";

import { useState } from "react";
import type { Food } from "@/lib/nutrition/types-v2";

export type ScanPrefill = {
  product_name: string;
  brand: string | null;
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  fibre_per_100g: number | null;
  sugar_per_100g: number | null;
  saturated_fat_per_100g: number | null;
  salt_per_100g: number | null;
  serving_size_g: number | null;
  total_weight_g: number | null;
  confidence: "high" | "medium" | "low";
};

export function ManualFoodEntry({
  barcode,
  prefill,
  onSaved,
  onClose,
  onRetry,
  retrying,
}: {
  barcode: string;
  prefill?: ScanPrefill | null;
  onSaved: (food: Food) => void;
  onClose: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [name, setName] = useState(prefill?.product_name ?? "");
  const [brand, setBrand] = useState(prefill?.brand ?? "");
  const [kcal, setKcal] = useState(
    prefill?.kcal_per_100g != null ? String(prefill.kcal_per_100g) : "",
  );
  const [protein, setProtein] = useState(
    prefill?.protein_per_100g != null ? String(prefill.protein_per_100g) : "",
  );
  const [carbs, setCarbs] = useState(
    prefill?.carbs_per_100g != null ? String(prefill.carbs_per_100g) : "",
  );
  const [fat, setFat] = useState(
    prefill?.fat_per_100g != null ? String(prefill.fat_per_100g) : "",
  );
  const [fibre, setFibre] = useState(
    prefill?.fibre_per_100g != null ? String(prefill.fibre_per_100g) : "",
  );
  const [sugar, setSugar] = useState(
    prefill?.sugar_per_100g != null ? String(prefill.sugar_per_100g) : "",
  );
  const [satFat, setSatFat] = useState(
    prefill?.saturated_fat_per_100g != null
      ? String(prefill.saturated_fat_per_100g)
      : "",
  );
  const [salt, setSalt] = useState(
    prefill?.salt_per_100g != null ? String(prefill.salt_per_100g) : "",
  );
  const [servingG, setServingG] = useState(
    prefill?.serving_size_g != null ? String(prefill.serving_size_g) : "",
  );
  const [totalWeightG, setTotalWeightG] = useState(
    prefill?.total_weight_g != null ? String(prefill.total_weight_g) : "",
  );
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function n(v: string): number | null {
    if (!v.trim()) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }

  const weight = n(totalWeightG);

  function calcTotal(per100: string): string {
    const v = n(per100);
    if (v == null || weight == null || weight === 0) return "—";
    return ((v * weight) / 100).toFixed(1);
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/nutrition/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || null,
          barcode,
          source: "manual",
          kcal_per_100g: n(kcal),
          protein_per_100g: n(protein),
          carbs_per_100g: n(carbs),
          fat_per_100g: n(fat),
          fibre_per_100g: n(fibre),
          sugar_per_100g: n(sugar),
          saturated_fat_per_100g: n(satFat),
          salt_per_100g: n(salt),
          serving_size_g: n(servingG) ?? 100,
          is_favourite: saveToLibrary,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        food?: Food;
        error?: string;
      };
      if (!r.ok || !j.food) {
        setError(j.error ?? "Save failed.");
        return;
      }
      onSaved(j.food);
    } finally {
      setSaving(false);
    }
  }

  const confTone =
    prefill?.confidence === "high"
      ? "text-ok bg-ok/15 border-ok/40"
      : prefill?.confidence === "medium"
        ? "text-warn bg-warn/15 border-warn/40"
        : "text-danger bg-danger/15 border-danger/40";

  return (
    <div className="fixed inset-0 z-[210] flex items-end md:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-label="Add food manually"
        className="relative w-full max-w-md max-h-[90vh] rounded-t-xl md:rounded-xl bg-ink-1 border border-ink-2 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            {prefill ? "Label scanned" : "Add manually"}
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

        <div className="flex flex-col gap-3 p-4 overflow-y-auto">
          {prefill && (
            <div
              className={`text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] px-2 py-1.5 rounded-md border ${confTone}`}
            >
              Label scanned · confidence: {prefill.confidence}
              {prefill.confidence !== "high" && " — please double-check values"}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              {prefill ? (
                <>
                  Review the extracted values for barcode{" "}
                  <span className="text-ink-4 font-[family-name:var(--font-mono)] not-italic">
                    {barcode}
                  </span>
                  .
                </>
              ) : (
                <>
                  We couldn&apos;t find barcode{" "}
                  <span className="text-ink-4 font-[family-name:var(--font-mono)] not-italic">
                    {barcode}
                  </span>
                  . Add it manually so next time it&apos;s instant.
                </>
              )}
            </p>
            {!prefill && (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="self-start mt-1 text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 disabled:opacity-40 font-[family-name:var(--font-mono)]"
              >
                {retrying ? "LOOKING…" : "↺ LOOKUP AGAIN"}
              </button>
            )}
          </div>

          <Field label="Name *">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tesco 5% Beef Mince"
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
          <Field label="Brand">
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Tesco"
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="kcal / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
            <Field label="Protein / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
            <Field label="Carbs / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
            <Field label="Fat / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
            <Field label="Fibre / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={fibre}
                onChange={(e) => setFibre(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
            <Field label="Sugar / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={sugar}
                onChange={(e) => setSugar(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
            <Field label="Sat. fat / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={satFat}
                onChange={(e) => setSatFat(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
            <Field label="Salt / 100g">
              <input
                type="number"
                inputMode="decimal"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
          </div>

          {prefill?.total_weight_g != null ? (
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] px-2 py-1.5 rounded-md bg-ink-2">
              Total package: {prefill.total_weight_g}g
            </div>
          ) : (
            <Field label="Total weight (g)">
              <input
                type="number"
                inputMode="decimal"
                value={totalWeightG}
                onChange={(e) => setTotalWeightG(e.target.value)}
                placeholder="e.g. 500"
                className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
              />
            </Field>
          )}

          <Field label="Serving size (g)">
            <input
              type="number"
              inputMode="decimal"
              value={servingG}
              onChange={(e) => setServingG(e.target.value)}
              placeholder="100"
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>

          {weight != null && weight > 0 && (
            <div className="rounded-md bg-ink-0/40 border border-ink-2 px-3 py-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] block mb-1.5">
                Package totals ({weight}g)
              </span>
              <div className="grid grid-cols-4 gap-2 text-[10px] font-[family-name:var(--font-mono)] text-ink-4 tabular-nums">
                <span>{calcTotal(kcal)} kcal</span>
                <span>P {calcTotal(protein)}g</span>
                <span>C {calcTotal(carbs)}g</span>
                <span>F {calcTotal(fat)}g</span>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 mt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={saveToLibrary}
              onChange={(e) => setSaveToLibrary(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-sm text-ink-4">Save to my library</span>
          </label>

          {error && (
            <p className="text-[11px] text-danger font-[family-name:var(--font-mono)] uppercase tracking-[0.18em]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !name.trim()}
              className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
            >
              {saving ? "SAVING…" : "SAVE & USE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      {children}
    </label>
  );
}
