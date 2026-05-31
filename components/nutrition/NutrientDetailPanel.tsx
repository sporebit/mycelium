"use client";

import { useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import type {
  NutritionLog,
  NutritionTargets,
} from "@/lib/nutrition/types-v2";

function sum(logs: NutritionLog[], field: keyof NutritionLog): number {
  let total = 0;
  for (const l of logs) {
    const v = l[field];
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return Math.round(total * 10) / 10;
}

export function NutrientDetailPanel({
  logs,
  targets,
}: {
  logs: NutritionLog[];
  targets: NutritionTargets;
}) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; eaten: number; target: number; unit: string }[] = [
    { label: "Calories", eaten: sum(logs, "kcal"), target: targets.kcal, unit: "kcal" },
    { label: "Protein", eaten: sum(logs, "protein_g"), target: targets.protein, unit: "g" },
    { label: "Carbs", eaten: sum(logs, "carbs_g"), target: targets.carbs, unit: "g" },
    { label: "Fat", eaten: sum(logs, "fat_g"), target: targets.fat, unit: "g" },
    { label: "Fibre", eaten: sum(logs, "fibre_g"), target: targets.fibre, unit: "g" },
    { label: "Sugar", eaten: sum(logs, "sugar_g"), target: targets.sugar, unit: "g" },
    { label: "Sat. fat", eaten: sum(logs, "saturated_fat_g"), target: targets.saturated_fat, unit: "g" },
    { label: "Salt", eaten: sum(logs, "salt_g"), target: targets.salt, unit: "g" },
  ];

  return (
    <section className="rounded-md bg-ink-1 border border-ink-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-ink-2/40 border-b border-ink-2"
      >
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-4 font-[family-name:var(--font-mono)]">
          Full nutrition breakdown
        </span>
        <span aria-hidden className="text-ink-3 text-[10px]">
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] border-b border-ink-2">
                <th className="text-left py-2 px-3">Nutrient</th>
                <th className="text-right py-2 px-3">Goal</th>
                <th className="text-right py-2 px-3">Eaten</th>
                <th className="text-right py-2 px-3">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const remaining = r.target - r.eaten;
                const tone =
                  remaining < 0
                    ? "text-danger"
                    : remaining < r.target * 0.1
                      ? "text-warn"
                      : "text-ok";
                return (
                  <tr key={r.label} className="border-b border-ink-2/60 last:border-b-0">
                    <td className="text-left py-2 px-3 text-ink-4">{r.label}</td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-3 tabular-nums">
                        {r.target}
                        {r.unit}
                      </Mono>
                    </td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-4 tabular-nums">
                        {r.eaten}
                        {r.unit}
                      </Mono>
                    </td>
                    <td className="text-right py-2 px-3">
                      <Mono className={`tabular-nums ${tone}`}>
                        {remaining >= 0 ? "" : ""}
                        {Math.round(remaining * 10) / 10}
                        {r.unit}
                      </Mono>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
