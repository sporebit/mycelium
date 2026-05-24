"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import {
  NUTRITION_TARGETS,
  CUTOFF_HOUR,
} from "@/lib/config/nutrition";
import {
  sumMeals,
  kcalFromMacros,
  type Meal,
  type NutritionTargets,
} from "@/lib/types/nutrition";

type DailyLogPayload = {
  notes?: {
    nutrition?: {
      meals?: unknown;
      targets?: Partial<NutritionTargets>;
    };
  };
};

const DEFAULT_TARGETS: NutritionTargets = {
  kcal: NUTRITION_TARGETS.kcal,
  p: NUTRITION_TARGETS.protein,
  c: NUTRITION_TARGETS.carbs,
  f: NUTRITION_TARGETS.fat,
};

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function cutoffStatus(now: Date): { label: string; tone: "ok" | "warn" } {
  const cutoff = new Date(now);
  cutoff.setHours(CUTOFF_HOUR, 0, 0, 0);
  if (now >= cutoff) return { label: "PAST CUTOFF", tone: "warn" };
  const diff = cutoff.getTime() - now.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return { label: `CUTOFF in ${h}h ${m}m`, tone: "ok" };
}

function safeMeal(raw: unknown): Meal | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.n !== "string") return null;
  if (typeof m.t !== "string") return null;
  return {
    id: m.id,
    t: m.t,
    n: m.n,
    kcal: typeof m.kcal === "number" ? m.kcal : 0,
    p: typeof m.p === "number" ? m.p : 0,
    c: typeof m.c === "number" ? m.c : 0,
    f: typeof m.f === "number" ? m.f : 0,
    estimated: m.estimated === true,
  };
}

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
        <Mono className="text-[11px] text-ink-4">
          {value}/{target}g
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

function MealRow({
  meal,
  expanded,
  onClick,
  onChange,
  onDelete,
}: {
  meal: Meal;
  expanded: boolean;
  onClick: () => void;
  onChange: (next: Meal) => void;
  onDelete: () => void;
}) {
  // Local-only override while user is typing in the kcal field. Null when
  // the user isn't actively editing kcal — display falls back to meal.kcal.
  const [kcalDraft, setKcalDraft] = useState<number | null>(null);
  const redistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending redistribute timer when meal switches identity or unmounts.
  useEffect(() => {
    return () => {
      if (redistTimer.current) clearTimeout(redistTimer.current);
    };
  }, []);

  function changeKcal(v: number) {
    setKcalDraft(v);
    if (redistTimer.current) clearTimeout(redistTimer.current);
    const name = meal.n;
    redistTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/nutrition/redistribute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, kcal: v }),
        });
        if (!res.ok) {
          onChange({ ...meal, kcal: v, estimated: false });
          setKcalDraft(null);
          return;
        }
        const j = (await res.json()) as { p: number; c: number; f: number };
        onChange({ ...meal, kcal: v, p: j.p, c: j.c, f: j.f, estimated: false });
        setKcalDraft(null);
      } catch {
        onChange({ ...meal, kcal: v, estimated: false });
        setKcalDraft(null);
      }
    }, 600);
  }

  function changeMacro(field: "p" | "c" | "f", v: number) {
    const next = { ...meal, [field]: v, estimated: false };
    next.kcal = kcalFromMacros(next.p, next.c, next.f);
    onChange(next);
  }

  const displayKcal = kcalDraft ?? meal.kcal;

  return (
    <li className="border-b border-ink-2 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 py-2 text-left hover:bg-ink-2/30 transition-colors px-1 rounded-md"
      >
        <Mono className="text-[11px] text-ink-3 w-12 shrink-0">{meal.t}</Mono>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink-4 truncate">
            {meal.n}
            {meal.estimated && (
              <span className="ml-2 text-[9px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                AI
              </span>
            )}
          </div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
            <Mono>{meal.p}P</Mono> · <Mono>{meal.c}C</Mono> ·{" "}
            <Mono>{meal.f}F</Mono>
          </div>
        </div>
        <Mono className="text-[12px] text-ink-4 shrink-0">{meal.kcal}</Mono>
      </button>

      {expanded && (
        <div className="px-1 py-2 grid grid-cols-4 gap-2 items-end border-t border-ink-2/50">
          <NumberField
            label="kcal"
            value={displayKcal}
            onChange={(v) => changeKcal(v)}
          />
          <NumberField
            label="P"
            value={meal.p}
            onChange={(v) => changeMacro("p", v)}
          />
          <NumberField
            label="C"
            value={meal.c}
            onChange={(v) => changeMacro("c", v)}
          />
          <NumberField
            label="F"
            value={meal.f}
            onChange={(v) => changeMacro("f", v)}
          />
          <div className="col-span-4 flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-danger hover:bg-danger/10 rounded-md font-[family-name:var(--font-mono)]"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)] tabular-nums"
        onClick={(e) => e.stopPropagation()}
      />
    </label>
  );
}

export function Nutrition() {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [targets, setTargets] = useState<NutritionTargets>(DEFAULT_TARGETS);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    fetch("/api/daily-log/today")
      .then((r) => r.json())
      .then((j: DailyLogPayload) => {
        if (!mounted) return;
        const raw = j?.notes?.nutrition;
        const list: Meal[] = Array.isArray(raw?.meals)
          ? (raw!.meals as unknown[])
              .map(safeMeal)
              .filter((m): m is Meal => !!m)
          : [];
        setMeals(list);
        if (raw?.targets) {
          setTargets({
            kcal: raw.targets.kcal ?? DEFAULT_TARGETS.kcal,
            p: raw.targets.p ?? DEFAULT_TARGETS.p,
            c: raw.targets.c ?? DEFAULT_TARGETS.c,
            f: raw.targets.f ?? DEFAULT_TARGETS.f,
          });
        }
      })
      .catch(() => mounted && setMeals([]));
    return () => {
      mounted = false;
    };
  }, []);

  async function persistMeals(next: Meal[]): Promise<boolean> {
    try {
      const res = await fetch("/api/daily-log/today", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nutrition: { meals: next, targets },
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function updateMeals(next: Meal[]) {
    const prev = meals ?? [];
    setMeals(next);
    const ok = await persistMeals(next);
    if (!ok) {
      setMeals(prev);
      setError("Save failed");
    }
  }

  async function logMeal() {
    const text = input.trim();
    if (!text || submitting) return;
    setSubmitting(true);

    try {
      const cmdMatch = text.match(/^estimate\s+(\d+)\s*cals?\s*:\s*(.+)$/i);
      let estimate: { name: string; kcal: number; p: number; c: number; f: number };

      if (cmdMatch) {
        const kcal = parseInt(cmdMatch[1], 10);
        const name = cmdMatch[2].trim();
        const r = await fetch("/api/nutrition/redistribute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, kcal }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "redistribute failed");
          return;
        }
        const j = (await r.json()) as { p: number; c: number; f: number };
        estimate = { name, kcal, ...j };
      } else {
        const r = await fetch("/api/nutrition/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "estimate failed");
          return;
        }
        estimate = (await r.json()) as typeof estimate;
      }

      const meal: Meal = {
        id: crypto.randomUUID(),
        t: hhmm(new Date()),
        n: estimate.name,
        kcal: estimate.kcal,
        p: estimate.p,
        c: estimate.c,
        f: estimate.f,
        estimated: true,
      };
      await updateMeals([...(meals ?? []), meal]);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "log failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleMealChange(next: Meal) {
    const cur = meals ?? [];
    const updated = cur.map((m) => (m.id === next.id ? next : m));
    void updateMeals(updated);
  }

  function handleMealDelete(id: string) {
    const cur = meals ?? [];
    void updateMeals(cur.filter((m) => m.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  const totals = sumMeals(meals ?? []);
  const delta = totals.kcal - targets.kcal;
  const deltaLabel =
    delta < 0
      ? `${Math.abs(delta).toLocaleString()} deficit`
      : delta > 0
        ? `${delta.toLocaleString()} surplus`
        : "on target";
  const deltaTone = delta <= 0 ? "text-ok" : "text-warn";

  const cutoff = cutoffStatus(now);

  return (
    <Panel
      number="08"
      title="NUTRITION"
      topRight={
        <span className="flex items-center gap-1">
          <span aria-hidden>‹</span>
          <Mono>TODAY</Mono>
          <span aria-hidden>›</span>
        </span>
      }
    >
      {error && (
        <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]">
        <span className="text-ink-4 border-b border-accent pb-1">TODAY</span>
        <Link
          href="/health"
          className="text-ink-3 hover:text-ink-4 transition-colors pb-1"
        >
          HISTORY
        </Link>
      </div>

      <div className="mt-4">
        <Mono className="block text-2xl text-ink-4">
          {totals.kcal.toLocaleString()}{" "}
          <span className="text-ink-3">of {targets.kcal.toLocaleString()}</span>
        </Mono>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
          KCAL · <span className={deltaTone}>{deltaLabel}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <Macro label="Protein" value={totals.p} target={targets.p} />
        <Macro label="Carbs" value={totals.c} target={targets.c} />
        <Macro label="Fat" value={totals.f} target={targets.f} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          logMeal();
        }}
        className="mt-4 rounded-xl border border-ink-2 bg-ink-0/40 px-3 py-2.5 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={submitting}
          placeholder={
            submitting
              ? "Estimating…"
              : "Log a meal — try 'estimate 500 cals: salad'"
          }
          className="flex-1 bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={!input.trim() || submitting}
          className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-ink-4 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
        >
          {submitting ? "…" : "LOG ↵"}
        </button>
      </form>

      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        <span className="flex items-center gap-1">
          <span
            aria-hidden
            className={cutoff.tone === "warn" ? "text-warn" : "text-ok"}
          >
            ●
          </span>
          CUTOFF · {String(CUTOFF_HOUR).padStart(2, "0")}:00
        </span>
        <Mono className={cutoff.tone === "warn" ? "text-warn" : "text-ink-3"}>
          {cutoff.label}
        </Mono>
      </div>

      <ul className="mt-3 flex flex-col">
        {meals === null ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
            Loading…
          </li>
        ) : meals.length === 0 ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 text-center">
            No meals logged today
          </li>
        ) : (
          meals.map((m) => (
            <MealRow
              key={m.id}
              meal={m}
              expanded={expandedId === m.id}
              onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
              onChange={handleMealChange}
              onDelete={() => handleMealDelete(m.id)}
            />
          ))
        )}
      </ul>
    </Panel>
  );
}
