"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { NUTRITION_TARGETS } from "@/lib/config/nutrition";
import type { CardWidth } from "@/lib/dashboard/card-registry";
import type {
  MealGroup,
  NutritionLog,
  NutritionTargets,
} from "@/lib/nutrition/types-v2";
import { localDateKey } from "@/lib/util/date";

const DEFAULT_TARGETS: NutritionTargets = {
  kcal: NUTRITION_TARGETS.kcal,
  protein: NUTRITION_TARGETS.protein,
  carbs: NUTRITION_TARGETS.carbs,
  fat: NUTRITION_TARGETS.fat,
  fibre: 30,
  sugar: 50,
  saturated_fat: 20,
  salt: 6,
};

function Macro({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {label}
        </span>
        <Mono className="text-[11px] text-ink-4 tabular-nums">
          {Math.round(value)}/{target}g
        </Mono>
      </div>
      <div className="mt-1 h-1 rounded-full bg-ink-2 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Nutrition({ width = 1 }: { width?: CardWidth } = {}) {
  const [logs, setLogs] = useState<NutritionLog[] | null>(null);
  const [mealGroups, setMealGroups] = useState<MealGroup[]>([]);
  const targets = DEFAULT_TARGETS;
  const today = localDateKey();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/nutrition/logs?date=${today}`).then((r) => r.json()),
      fetch("/api/nutrition/meal-groups").then((r) => r.json()),
    ])
      .then(
        ([logsRes, groupsRes]: [
          { logs?: NutritionLog[] },
          { meal_groups?: MealGroup[] },
        ]) => {
          if (cancelled) return;
          setLogs(Array.isArray(logsRes.logs) ? logsRes.logs : []);
          setMealGroups(Array.isArray(groupsRes.meal_groups) ? groupsRes.meal_groups : []);
        },
      )
      .catch(() => !cancelled && setLogs([]));
    return () => {
      cancelled = true;
    };
  }, [today]);

  const totals = useMemo(() => {
    const out = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const l of logs ?? []) {
      out.kcal += l.kcal ?? 0;
      out.protein += l.protein_g ?? 0;
      out.carbs += l.carbs_g ?? 0;
      out.fat += l.fat_g ?? 0;
    }
    return out;
  }, [logs]);

  const groupTotals = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const l of logs ?? []) {
      m.set(l.meal_group_id, (m.get(l.meal_group_id) ?? 0) + (l.kcal ?? 0));
    }
    return m;
  }, [logs]);

  const delta = Math.round(totals.kcal - targets.kcal);
  const deltaLabel =
    delta < 0
      ? `${Math.abs(delta).toLocaleString()} deficit`
      : delta > 0
        ? `${delta.toLocaleString()} surplus`
        : "on target";
  const deltaTone = delta <= 0 ? "text-ok" : "text-warn";

  return (
    <Panel
      borderless
      title="NUTRITION"
      topRight={
        <Link
          href="/nutrition"
          className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
        >
          OPEN →
        </Link>
      }
    >
      <div className={width >= 3 ? "mt-2 grid grid-cols-2 gap-x-8" : "contents"}>
        <div>
          <div className="mt-2">
            <Mono className="block text-2xl text-ink-4 tabular-nums">
              {Math.round(totals.kcal).toLocaleString()}{" "}
              <span className="text-ink-3">
                of {targets.kcal.toLocaleString()}
              </span>
            </Mono>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
              KCAL · <span className={deltaTone}>{deltaLabel}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <Macro
              label="Protein"
              value={totals.protein}
              target={targets.protein}
            />
            <Macro label="Carbs" value={totals.carbs} target={targets.carbs} />
            <Macro label="Fat" value={totals.fat} target={targets.fat} />
          </div>
        </div>

        <div>
          <ul className="mt-4 flex flex-col divide-y divide-ink-2/60">
            {logs === null ? (
              <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
                Loading…
              </li>
            ) : logs.length === 0 ? (
              <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
                Nothing logged today
              </li>
            ) : (
              mealGroups.map((g) => {
                const kcal = groupTotals.get(g.id) ?? 0;
                if (kcal === 0) return null;
                return (
                  <li
                    key={g.id}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                      {g.name}
                    </span>
                    <Mono className="text-[11px] text-ink-4 tabular-nums">
                      {Math.round(kcal)} kcal
                    </Mono>
                  </li>
                );
              })
            )}
          </ul>

          <Link
            href="/nutrition"
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
          >
            + LOG FOOD
          </Link>
        </div>
      </div>
    </Panel>
  );
}
