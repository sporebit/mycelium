"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Habit } from "@/lib/config/habits";
import { localDateKey } from "@/lib/util/date";
import { HabitsConfigModal } from "@/components/dashboard/HabitsConfigModal";
import { triggerGlowPulse } from "@/lib/motion";

type DayEntry = { date: string; completed: string[]; total: number };

const AMBER = "#f5b56d";

function cacheKeyForToday(): string {
  return `miles-habits-${localDateKey()}`;
}

function readLocalCache(): string[] {
  try {
    const raw = localStorage.getItem(cacheKeyForToday());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocalCache(value: string[]): void {
  try {
    localStorage.setItem(cacheKeyForToday(), JSON.stringify(value));
  } catch {}
}

function heatColour(rate: number): string {
  if (rate <= 0) return "rgba(245,181,109, 0.07)";
  if (rate < 0.4) return "rgba(245,181,109, 0.28)";
  if (rate < 0.75) return "rgba(245,181,109, 0.58)";
  return "rgba(245,181,109, 0.92)";
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function mondayWeekDay(iso: string): number {
  const d = new Date(iso + "T00:00:00").getDay();
  return d === 0 ? 6 : d - 1;
}

export default function HabitsPage() {
  const [history, setHistory] = useState<DayEntry[] | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [done, setDone] = useState<Set<string>>(() => new Set(readLocalCache()));
  const [editing, setEditing] = useState(false);
  const [hover, setHover] = useState<DayEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/habits-history?days=90")
      .then((r) => r.json())
      .then((j: { history?: DayEntry[]; habits?: Habit[] }) => {
        if (cancelled) return;
        if (Array.isArray(j.history)) setHistory(j.history);
        if (Array.isArray(j.habits)) setHabits(j.habits);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-log/today")
      .then((r) => r.json())
      .then((j: { notes?: { habits?: { done?: string[] } } }) => {
        if (cancelled) return;
        const arr = Array.isArray(j?.notes?.habits?.done)
          ? j.notes!.habits!.done!.filter((x: unknown) => typeof x === "string")
          : [];
        setDone(new Set(arr));
        writeLocalCache(arr);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function toggle(id: string) {
    const prev = new Set(done);
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    writeLocalCache([...next]);
    try {
      const res = await fetch("/api/daily-log/today", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habits: { done: [...next] } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDone(prev);
      writeLocalCache([...prev]);
    }
  }

  const today = localDateKey();
  const todayCount = done.size;
  const todayTotal = habits.length;
  const todayPct = todayTotal === 0 ? 0 : Math.round((todayCount / todayTotal) * 100);

  // ── Heatmap grid ──
  const weeks: (DayEntry | null)[][] = [];
  if (history && history.length > 0) {
    const firstDow = mondayWeekDay(history[0].date);
    let week: (DayEntry | null)[] = Array.from({ length: firstDow }, () => null);
    for (const entry of history) {
      week.push(entry);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
  }

  // Month labels
  const monthLabels: { col: number; label: string }[] = [];
  if (weeks.length > 0) {
    let lastMonth = -1;
    for (let col = 0; col < weeks.length; col++) {
      const firstDay = weeks[col].find((d) => d !== null);
      if (!firstDay) continue;
      const m = new Date(firstDay.date + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        monthLabels.push({
          col,
          label: new Date(firstDay.date + "T00:00:00").toLocaleDateString("en-GB", { month: "short" }),
        });
        lastMonth = m;
      }
    }
  }

  // ── Per-habit breakdown ──
  const habitStats = habits.map((h) => {
    let streak = 0;
    let d30 = 0;
    let d30Total = 0;
    let d90 = 0;
    let d90Total = 0;

    if (history) {
      for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i];
        const inDone = entry.completed.includes(h.id);
        const daysAgo = history.length - 1 - i;
        if (daysAgo < 30) {
          d30Total++;
          if (inDone) d30++;
        }
        d90Total++;
        if (inDone) d90++;

        if (i === history.length - 1 && entry.date === today && !done.has(h.id) && !inDone) {
          // today not yet done — check from yesterday
        } else if (daysAgo === 0 && done.has(h.id)) {
          // today is done via local state
        }
      }

      // Streak: consecutive days ending today (using live done state for today)
      for (let i = history.length - 1; i >= 0; i--) {
        const entry = history[i];
        const isToday = entry.date === today;
        const inDone = isToday ? done.has(h.id) : entry.completed.includes(h.id);
        if (inDone) streak++;
        else break;
      }
    }

    return {
      habit: h,
      streak,
      d30Rate: d30Total > 0 ? d30 / d30Total : 0,
      d90Rate: d90Total > 0 ? d90 / d90Total : 0,
    };
  });

  habitStats.sort((a, b) => b.d30Rate - a.d30Rate);

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-ink-4">
            Habits
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Daily practices tracked over time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 px-3 py-1.5 rounded-md border border-ink-2 text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 font-[family-name:var(--font-mono)] transition-colors"
        >
          Edit habits
        </button>
      </div>

      {/* Today section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Today
          </h2>
          <span className="text-[11px] font-[family-name:var(--font-mono)] text-ink-3 tabular-nums">
            {todayCount}/{todayTotal} · {todayPct}%
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {habits.map((h) => {
            const isDone = done.has(h.id);
            return (
              <button
                key={h.id}
                type="button"
                onClick={(e) => {
                  triggerGlowPulse(e.currentTarget);
                  void toggle(h.id);
                }}
                className={`text-left rounded-xl border px-4 py-3.5 min-h-[88px] flex flex-col gap-1 transition-colors ${
                  isDone
                    ? "border-accent/50 bg-accent/10 hover:bg-accent/15"
                    : "border-ink-2 bg-ink-0/40 hover:border-ink-3"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    aria-hidden
                    className={`h-4 w-4 rounded-sm border flex items-center justify-center text-[11px] leading-none transition-colors ${
                      isDone
                        ? "border-accent bg-accent text-ink-0"
                        : "border-ink-3"
                    }`}
                  >
                    {isDone ? "✓" : ""}
                  </span>
                  {h.target !== undefined && (
                    <span
                      className={`text-[10px] font-[family-name:var(--font-mono)] tabular-nums ${
                        isDone ? "text-accent" : "text-ink-3"
                      }`}
                    >
                      {isDone ? h.target : 0}/{h.target}
                      {h.unit ?? ""}
                    </span>
                  )}
                </div>
                <div className="text-base text-ink-4">{h.name}</div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                  {h.category}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 90-day heatmap */}
      {history && (
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
            Last 90 days
          </h2>
          <div className="overflow-x-auto">
            <div className="inline-flex flex-col gap-0">
              {/* Month labels */}
              <div className="relative" style={{ height: 16, marginBottom: 2 }}>
                {monthLabels.map((ml, i) => (
                  <span
                    key={i}
                    className="absolute text-[9px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em]"
                    style={{ left: ml.col * (14 + 3), top: 0 }}
                  >
                    {ml.label}
                  </span>
                ))}
              </div>
              {/* Grid: 7 rows × N columns */}
              <div style={{ display: "grid", gridTemplateRows: "repeat(7, 14px)", gridAutoFlow: "column", gridAutoColumns: 14, gap: 3 }}>
                {weeks.flatMap((week, colIdx) =>
                  week.map((entry, rowIdx) => {
                    if (!entry) {
                      return (
                        <div
                          key={`${colIdx}-${rowIdx}`}
                          style={{ width: 14, height: 14 }}
                        />
                      );
                    }
                    const rate = entry.total > 0 ? entry.completed.length / entry.total : 0;
                    return (
                      <div
                        key={entry.date}
                        onMouseEnter={() => setHover(entry)}
                        onMouseLeave={() => setHover(null)}
                        title={`${fmtDate(entry.date)}: ${entry.completed.length}/${entry.total}`}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          backgroundColor: heatColour(rate),
                          cursor: "default",
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>
          {/* Hover tooltip */}
          {hover && (
            <div className="mt-2 text-xs text-ink-3 font-[family-name:var(--font-mono)]">
              <span className="text-ink-4">{fmtDate(hover.date)}</span>
              {" — "}
              {hover.completed.length === 0
                ? "no habits logged"
                : hover.completed
                    .map((id) => habits.find((h) => h.id === id)?.name ?? id)
                    .join(", ")}
            </div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 text-[9px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em]">
            <span>Less</span>
            {[0, 0.2, 0.5, 0.85].map((r) => (
              <div
                key={r}
                style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: heatColour(r) }}
              />
            ))}
            <span>More</span>
          </div>
        </section>
      )}

      {/* Per-habit breakdown */}
      {history && habitStats.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
            Per-habit breakdown
          </h2>
          <div className="rounded-md border border-ink-2 overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_70px_70px] gap-0 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] bg-ink-0/40 px-4 py-2 border-b border-ink-2">
              <span>Habit</span>
              <span className="text-center">Streak</span>
              <span className="text-center">30d</span>
              <span className="text-center">90d</span>
            </div>
            {habitStats.map(({ habit, streak, d30Rate, d90Rate }) => (
              <div
                key={habit.id}
                className="grid grid-cols-[1fr_80px_70px_70px] gap-0 items-center px-4 py-3 border-b border-ink-2/40 last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-ink-4 truncate">{habit.name}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
                    {habit.category}
                  </span>
                </div>
                <div className="text-center font-[family-name:var(--font-mono)] tabular-nums text-sm">
                  {streak > 0 ? (
                    <span style={{ color: AMBER }}>{streak}d</span>
                  ) : (
                    <span className="text-ink-3/40">—</span>
                  )}
                </div>
                <div className="text-center font-[family-name:var(--font-mono)] tabular-nums text-sm text-ink-4">
                  {Math.round(d30Rate * 100)}%
                </div>
                <div className="text-center font-[family-name:var(--font-mono)] tabular-nums text-sm text-ink-4">
                  {Math.round(d90Rate * 100)}%
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Loading state */}
      {history === null && (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading history…
        </div>
      )}

      {editing && (
        <HabitsConfigModal
          habits={habits}
          onClose={() => setEditing(false)}
          onSaved={(next) => setHabits(next)}
        />
      )}
    </div>
  );
}
