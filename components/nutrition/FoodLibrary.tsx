"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import type { Food } from "@/lib/nutrition/types-v2";

export function FoodLibrary({
  onError,
}: {
  onError: (msg: string) => void;
}) {
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [filter, setFilter] = useState("");
  const [favsOnly, setFavsOnly] = useState(false);
  const [edit, setEdit] = useState<Food | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/nutrition/foods")
      .then((r) => r.json())
      .then((j: { foods?: Food[] }) => {
        if (cancelled) return;
        setFoods(Array.isArray(j.foods) ? j.foods : []);
      })
      .catch(() => !cancelled && setFoods([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!foods) return [];
    const q = filter.trim().toLowerCase();
    return foods
      .filter((f) => (favsOnly ? f.is_favourite : true))
      .filter((f) =>
        q
          ? `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(q)
          : true,
      );
  }, [foods, filter, favsOnly]);

  async function patchFood(id: string, patch: Partial<Food>) {
    const prev = foods ?? [];
    setFoods((cur) =>
      (cur ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
    try {
      const r = await fetch(`/api/nutrition/foods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await r.json().catch(() => ({}))) as {
        food?: Food;
        error?: string;
      };
      if (!r.ok || !j.food) throw new Error(j.error ?? "update failed");
      setFoods((cur) => (cur ?? []).map((f) => (f.id === id ? j.food! : f)));
      if (edit?.id === id) setEdit(j.food!);
    } catch (err) {
      setFoods(prev);
      onError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function deleteFood(id: string) {
    if (!window.confirm("Delete this food from your library?")) return;
    const prev = foods ?? [];
    setFoods((cur) => (cur ?? []).filter((f) => f.id !== id));
    if (edit?.id === id) setEdit(null);
    try {
      const r = await fetch(`/api/nutrition/foods/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
    } catch {
      setFoods(prev);
      onError("Delete failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter foods…"
          className="px-3 py-1.5 rounded-md border border-ink-2 bg-ink-0/40 text-sm text-ink-4 placeholder:text-ink-3 outline-none focus:border-ink-3 w-64"
        />
        <button
          type="button"
          onClick={() => setFavsOnly((v) => !v)}
          className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
            favsOnly
              ? "bg-warn/15 border-warn/40 text-warn"
              : "bg-ink-0/40 border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
          }`}
        >
          {favsOnly ? "★ FAVS ONLY" : "ALL"}
        </button>
      </div>

      {foods === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-12 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {foods.length === 0
              ? "Your library is empty. Use the SEARCH tab to look up foods and tap + to save them."
              : "No foods match your filter."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((f) => (
            <li
              key={f.id}
              className="bg-ink-1 border border-ink-2 hover:border-ink-3 rounded-md px-3 py-2 flex items-center gap-3 transition-colors"
            >
              <button
                type="button"
                onClick={() => void patchFood(f.id, { is_favourite: !f.is_favourite })}
                aria-label={f.is_favourite ? "Unstar" : "Star"}
                className={`text-base shrink-0 ${
                  f.is_favourite ? "text-warn" : "text-ink-3 hover:text-warn"
                }`}
              >
                {f.is_favourite ? "★" : "☆"}
              </button>
              <button
                type="button"
                onClick={() => setEdit(f)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="text-sm text-ink-4 truncate">{f.name}</div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] truncate">
                  {f.brand ? `${f.brand} · ` : ""}
                  {f.kcal_per_100g != null ? `${Math.round(f.kcal_per_100g)} kcal/100g` : "kcal —"}
                  {f.protein_per_100g != null ? ` · P ${Math.round(f.protein_per_100g)}g` : ""}
                </div>
              </button>
              <Mono className="text-[10px] text-ink-3 tabular-nums">
                {f.use_count}×
              </Mono>
              <button
                type="button"
                onClick={() => void deleteFood(f.id)}
                aria-label="Delete"
                className="text-ink-3 hover:text-danger text-base"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {edit && (
        <FoodEditDialog
          food={edit}
          onClose={() => setEdit(null)}
          onSave={(patch) => void patchFood(edit.id, patch)}
        />
      )}
    </div>
  );
}

function FoodEditDialog({
  food,
  onClose,
  onSave,
}: {
  food: Food;
  onClose: () => void;
  onSave: (patch: Partial<Food>) => void;
}) {
  const [name, setName] = useState(food.name);
  const [brand, setBrand] = useState(food.brand ?? "");
  const [kcal, setKcal] = useState(food.kcal_per_100g ?? 0);
  const [protein, setProtein] = useState(food.protein_per_100g ?? 0);
  const [carbs, setCarbs] = useState(food.carbs_per_100g ?? 0);
  const [fat, setFat] = useState(food.fat_per_100g ?? 0);

  function save() {
    onSave({
      name,
      brand: brand || null,
      kcal_per_100g: kcal,
      protein_per_100g: protein,
      carbs_per_100g: carbs,
      fat_per_100g: fat,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm cursor-default"
      />
      <div className="relative w-full max-w-md rounded-lg bg-ink-1 border border-ink-2 shadow-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-[family-name:var(--font-display)] italic text-ink-4">
            Edit food
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink-4">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
          <Field label="Brand">
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
          <Field label="kcal / 100g">
            <input
              type="number"
              min={0}
              value={kcal}
              onChange={(e) => setKcal(Number(e.target.value) || 0)}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
          <Field label="Protein / 100g">
            <input
              type="number"
              min={0}
              value={protein}
              onChange={(e) => setProtein(Number(e.target.value) || 0)}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
          <Field label="Carbs / 100g">
            <input
              type="number"
              min={0}
              value={carbs}
              onChange={(e) => setCarbs(Number(e.target.value) || 0)}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
          <Field label="Fat / 100g">
            <input
              type="number"
              min={0}
              value={fat}
              onChange={(e) => setFat(Number(e.target.value) || 0)}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={save}
            className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
          >
            SAVE
          </button>
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
