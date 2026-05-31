"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { DEFAULT_NUTRITION_TARGETS } from "@/lib/nutrition/types-v2";

type HistoryDay = {
  date: string;
  total_kcal: number;
  total_p: number;
  total_c: number;
  total_f: number;
  log_count: number;
  empty: boolean;
};

type HistoryPayload = {
  days: HistoryDay[];
  streak: number;
  avg_kcal: number;
  top_foods: { name: string; count: number }[];
};

function shortDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit" });
}

export function NutritionHistory() {
  const [range, setRange] = useState<"7" | "30">("7");
  const [data, setData] = useState<HistoryPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setData(null);
    });
    fetch(`/api/nutrition/history?days=${range}`)
      .then((r) => r.json())
      .then((j: HistoryPayload) => !cancelled && setData(j))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Recharts expects chronological order; the API returns most-recent-first.
  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data.days].reverse().map((d) => ({
      day: shortDay(d.date),
      kcal: Math.round(d.total_kcal),
      protein: Math.round(d.total_p),
      carbs: Math.round(d.total_c),
      fat: Math.round(d.total_f),
    }));
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-[family-name:var(--font-display)] italic text-ink-4">
          History
        </h2>
        <div className="inline-flex rounded-lg border border-ink-2 bg-ink-0/40 p-0.5">
          {(["7", "30"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] rounded-md transition-colors ${
                range === r ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      {data === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label={`Avg ${range}d`} value={`${data.avg_kcal.toLocaleString()}`} unit="kcal" />
            <Stat label="Streak" value={`${data.streak}`} unit="days" />
            <Stat
              label="Days logged"
              value={`${data.days.filter((d) => !d.empty).length}`}
              unit={`/ ${data.days.length}`}
            />
            <Stat
              label="Top food"
              value={data.top_foods[0]?.name ?? "—"}
              unit={data.top_foods[0] ? `${data.top_foods[0].count}×` : ""}
            />
          </div>

          <section className="rounded-md bg-ink-1 border border-ink-2 p-3">
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
              Daily calories
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--ink-3)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--ink-2)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--ink-3)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--ink-2)" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ink-1)",
                      border: "1px solid var(--ink-2)",
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="kcal" fill="var(--accent)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-1 text-right">
              target {DEFAULT_NUTRITION_TARGETS.kcal} kcal
            </div>
          </section>

          <section className="rounded-md bg-ink-1 border border-ink-2 p-3">
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
              Macro breakdown (g)
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--ink-3)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--ink-2)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--ink-3)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--ink-2)" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ink-1)",
                      border: "1px solid var(--ink-2)",
                      fontSize: 11,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="protein" stackId="m" fill="var(--ok)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="carbs" stackId="m" fill="var(--accent)" />
                  <Bar dataKey="fat" stackId="m" fill="var(--warn)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {data.top_foods.length > 0 && (
            <section className="rounded-md bg-ink-1 border border-ink-2 p-3">
              <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
                Most logged foods
              </h3>
              <ul className="flex flex-col divide-y divide-ink-2/60">
                {data.top_foods.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-ink-4 truncate">{f.name}</span>
                    <Mono className="text-[11px] text-ink-3 tabular-nums">
                      {f.count}×
                    </Mono>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md bg-ink-1 border border-ink-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </div>
      <div className="text-base text-ink-4 mt-0.5 font-[family-name:var(--font-mono)] tabular-nums truncate">
        {value}{" "}
        {unit && <span className="text-ink-3 text-[11px]">{unit}</span>}
      </div>
    </div>
  );
}
