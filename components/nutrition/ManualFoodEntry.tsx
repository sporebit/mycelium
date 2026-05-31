"use client";

import { useState } from "react";
import type { Food } from "@/lib/nutrition/types-v2";

/**
 * Fallback entry form shown when an OFF barcode lookup misses. The
 * barcode field is pre-filled and read-only so the saved row carries
 * it forward and future scans of the same product hit the cache. Each
 * macro field is per-100g — same convention as the rest of the
 * nutrition system.
 */
export function ManualFoodEntry({
  barcode,
  onSaved,
  onClose,
  onRetry,
  retrying,
}: {
  barcode: string;
  onSaved: (food: Food) => void;
  onClose: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [kcal, setKcal] = useState<string>("");
  const [protein, setProtein] = useState<string>("");
  const [carbs, setCarbs] = useState<string>("");
  const [fat, setFat] = useState<string>("");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function n(v: string): number | null {
    if (!v.trim()) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
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
        className="relative w-full max-w-md rounded-t-xl md:rounded-xl bg-ink-1 border border-ink-2 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Add manually
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

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              We couldn&apos;t find barcode{" "}
              <span className="text-ink-4 font-[family-name:var(--font-mono)] not-italic">
                {barcode}
              </span>
              . Add it manually so next time it&apos;s instant.
            </p>
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="self-start mt-1 text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 disabled:opacity-40 font-[family-name:var(--font-mono)]"
            >
              {retrying ? "LOOKING…" : "↺ LOOKUP AGAIN"}
            </button>
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
          </div>

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
              onClick={save}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      {children}
    </label>
  );
}
