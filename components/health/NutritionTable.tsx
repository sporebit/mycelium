"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { localDateKey } from "@/lib/util/date";
import type { Meal } from "@/lib/types/nutrition";

type DayRow = {
  date: string;
  total_kcal: number;
  total_p: number;
  total_c: number;
  total_f: number;
  meal_count: number;
  meals: Meal[];
  empty: boolean;
};

function fmtDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function NutritionTable() {
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    fetch("/api/nutrition?days=30")
      .then((r) => r.json())
      .then((j: { days?: DayRow[] }) =>
        setDays(Array.isArray(j?.days) ? j.days : [])
      )
      .catch(() => setDays([]));
  }, []);

  function toggle(date: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const today = localDateKey();

  const nonEmpty = (days ?? []).filter((d) => !d.empty);
  const avg =
    nonEmpty.length > 0
      ? {
          kcal: Math.round(
            nonEmpty.reduce((s, d) => s + d.total_kcal, 0) / nonEmpty.length
          ),
          p: Math.round(
            nonEmpty.reduce((s, d) => s + d.total_p, 0) / nonEmpty.length
          ),
          c: Math.round(
            nonEmpty.reduce((s, d) => s + d.total_c, 0) / nonEmpty.length
          ),
          f: Math.round(
            nonEmpty.reduce((s, d) => s + d.total_f, 0) / nonEmpty.length
          ),
          meals:
            Math.round(
              (nonEmpty.reduce((s, d) => s + d.meal_count, 0) /
                nonEmpty.length) *
                10
            ) / 10,
        }
      : null;

  return (
    <Panel
      number="H1"
      title="NUTRITION HISTORY"
      topRight={<Mono>LAST 30 DAYS</Mono>}
    >
      {days === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : nonEmpty.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Log meals on the dashboard to see history here
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] border-b border-ink-2">
                <th className="text-left py-2 pr-3">Date</th>
                <th className="text-right py-2 px-3">Kcal</th>
                <th className="text-right py-2 px-3">P</th>
                <th className="text-right py-2 px-3">C</th>
                <th className="text-right py-2 px-3">F</th>
                <th className="text-right py-2 pl-3">Meals</th>
              </tr>
            </thead>
            <tbody>
              {avg && (
                <tr className="border-b border-ink-2 bg-ink-2/20">
                  <td className="py-2 pr-3 text-[10px] uppercase tracking-[0.18em] text-accent font-[family-name:var(--font-mono)]">
                    Avg ({nonEmpty.length}d)
                  </td>
                  <td className="text-right py-2 px-3">
                    <Mono className="text-ink-4">
                      {avg.kcal.toLocaleString()}
                    </Mono>
                  </td>
                  <td className="text-right py-2 px-3">
                    <Mono className="text-ink-4">{avg.p}g</Mono>
                  </td>
                  <td className="text-right py-2 px-3">
                    <Mono className="text-ink-4">{avg.c}g</Mono>
                  </td>
                  <td className="text-right py-2 px-3">
                    <Mono className="text-ink-4">{avg.f}g</Mono>
                  </td>
                  <td className="text-right py-2 pl-3">
                    <Mono className="text-ink-4">{avg.meals}</Mono>
                  </td>
                </tr>
              )}
              {(days ?? []).map((d) => {
                const isToday = d.date === today;
                const isOpen = expanded.has(d.date);
                return (
                  <RowFragment
                    key={d.date}
                    row={d}
                    isToday={isToday}
                    isOpen={isOpen}
                    onToggle={() => toggle(d.date)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function RowFragment({
  row,
  isToday,
  isOpen,
  onToggle,
}: {
  row: DayRow;
  isToday: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-ink-2 cursor-pointer hover:bg-ink-2/20 transition-colors ${
          row.empty ? "opacity-50" : ""
        } ${isToday ? "bg-accent/5" : ""}`}
      >
        <td className="py-2 pr-3 text-ink-4">
          {isToday && (
            <span className="text-[9px] uppercase tracking-[0.18em] text-accent font-[family-name:var(--font-mono)] mr-2">
              TODAY
            </span>
          )}
          {fmtDate(row.date)}
        </td>
        <td className="text-right py-2 px-3">
          <Mono className={row.empty ? "text-ink-3" : "text-ink-4"}>
            {row.empty ? "—" : row.total_kcal.toLocaleString()}
          </Mono>
        </td>
        <td className="text-right py-2 px-3">
          <Mono className={row.empty ? "text-ink-3" : "text-ink-4"}>
            {row.empty ? "—" : `${row.total_p}g`}
          </Mono>
        </td>
        <td className="text-right py-2 px-3">
          <Mono className={row.empty ? "text-ink-3" : "text-ink-4"}>
            {row.empty ? "—" : `${row.total_c}g`}
          </Mono>
        </td>
        <td className="text-right py-2 px-3">
          <Mono className={row.empty ? "text-ink-3" : "text-ink-4"}>
            {row.empty ? "—" : `${row.total_f}g`}
          </Mono>
        </td>
        <td className="text-right py-2 pl-3">
          <Mono className={row.empty ? "text-ink-3" : "text-ink-4"}>
            {row.meal_count}
          </Mono>
        </td>
      </tr>
      {isOpen && row.meals.length > 0 && (
        <tr className="border-b border-ink-2 bg-ink-0/40">
          <td colSpan={6} className="px-3 py-2">
            <ul className="flex flex-col gap-1">
              {row.meals.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 text-[12px]"
                >
                  <Mono className="text-ink-3 w-12 shrink-0">{m.t}</Mono>
                  <span className="flex-1 truncate text-ink-4">{m.n}</span>
                  <Mono className="text-ink-3 text-[10px]">
                    {m.p}P · {m.c}C · {m.f}F
                  </Mono>
                  <Mono className="text-ink-4 w-12 text-right">{m.kcal}</Mono>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
