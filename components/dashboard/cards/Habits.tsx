"use client";

import { useEffect, useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { HABITS as DEFAULT_HABITS, type Habit } from "@/lib/config/habits";
import { localDateKey } from "@/lib/util/date";
import { HabitsConfigModal } from "../HabitsConfigModal";
import { triggerGlowPulse } from "@/lib/motion";
import type { CardWidth } from "@/lib/dashboard/card-registry";

function cacheKeyForToday(): string {
  return `miles-habits-${localDateKey()}`;
}

function readLocalCache(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((x: unknown): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeLocalCache(key: string, value: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function Habits({ width = 1 }: { width?: CardWidth } = {}) {
  // Lazy init reads localStorage on first render (client-only — readLocalCache
  // returns [] when window is undefined).
  const [done, setDone] = useState<Set<string>>(
    () => new Set(readLocalCache(cacheKeyForToday()))
  );
  const [habits, setHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load configured habits from sentinel row; falls back to DEFAULT_HABITS
  useEffect(() => {
    let mounted = true;
    fetch("/api/habits-config")
      .then((r) => r.json())
      .then((j: { habits?: Habit[] }) => {
        if (!mounted) return;
        if (Array.isArray(j?.habits) && j.habits.length > 0) {
          setHabits(j.habits);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Then fetch server — server wins
  useEffect(() => {
    let mounted = true;
    fetch("/api/daily-log/today")
      .then((r) => r.json())
      .then((j: { notes?: { habits?: { done?: string[] } } }) => {
        if (!mounted) return;
        const arr = Array.isArray(j?.notes?.habits?.done)
          ? j.notes!.habits!.done!.filter((x: unknown): x is string => typeof x === "string")
          : [];
        setDone(new Set(arr));
        writeLocalCache(cacheKeyForToday(), arr);
      })
      .catch(() => {
        /* keep localStorage state */
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  async function toggle(id: string) {
    const prev = new Set(done);
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    setDone(next);
    writeLocalCache(cacheKeyForToday(), [...next]);

    try {
      const res = await fetch("/api/daily-log/today", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habits: { done: [...next] } }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
    } catch (err) {
      setDone(prev);
      writeLocalCache(cacheKeyForToday(), [...prev]);
      setError(err instanceof Error ? err.message : "save failed");
    }
  }

  const count = done.size;
  const total = habits.length;
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  const allDone = total > 0 && count === total;

  return (
    <Panel
      borderless
      title="HABITS"
      topRight={
        <Mono>
          {count}/{total} · {pct}%
        </Mono>
      }
      bottomCTA={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-pointer hover:text-ink-4 font-[family-name:var(--font-mono)] uppercase tracking-[0.18em]"
        >
          EDIT HABITS →
        </button>
      }
    >
      {error && (
        <div
          role="status"
          className="mb-3 text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]"
        >
          ⚠ {error}
        </div>
      )}

      <div className="flex items-center gap-5">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="oklch(0.18 0 0)"
              strokeWidth="2.5"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={allDone ? "var(--glow-1)" : "var(--glow-0)"}
              strokeWidth="2.5"
              strokeDasharray={`${pct} 100`}
              strokeLinecap="round"
              pathLength={100}
              style={{
                transition:
                  "stroke-dasharray 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke 200ms ease-out",
                filter: allDone
                  ? "drop-shadow(0 0 6px var(--glow-1))"
                  : undefined,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              key={count}
              className={`font-[family-name:var(--font-display)] text-3xl font-medium tabular-nums transition-colors habit-count-pulse ${
                allDone ? "text-ok" : "text-text-0"
              }`}
            >
              {count}
            </span>
          </div>
        </div>

        <div className="flex-1">
          <div className="text-sm text-ink-4">
            {count === 0
              ? "No habits logged today"
              : allDone
                ? "All habits done — nice."
                : `${count} of ${total} logged`}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
            Tap a tile to toggle
          </div>
        </div>
      </div>

      <div
        className={`mt-5 grid gap-2 ${
          width >= 3 ? "grid-cols-6" : "grid-cols-3"
        }`}
      >
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
              className={`text-left rounded-xl border flex flex-col gap-1 transition-colors ${
                width >= 3 ? "px-4 py-3.5 min-h-[88px]" : "px-3 py-2.5"
              } ${
                isDone
                  ? "border-accent/50 bg-accent/10 hover:bg-accent/15"
                  : "border-ink-2 bg-ink-0/40 hover:border-ink-3"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  aria-hidden
                  className={`rounded-sm border flex items-center justify-center leading-none transition-colors ${
                    width >= 3
                      ? "h-4 w-4 text-[11px]"
                      : "h-3.5 w-3.5 text-[10px]"
                  } ${
                    isDone
                      ? "border-accent bg-accent text-ink-0"
                      : "border-ink-3"
                  }`}
                >
                  {isDone ? "✓" : ""}
                </span>
                {h.target !== undefined && (
                  <Mono
                    className={`text-[10px] ${isDone ? "text-accent" : "text-ink-3"}`}
                  >
                    {isDone ? h.target : 0}/{h.target}
                    {h.unit ?? ""}
                  </Mono>
                )}
              </div>
              <div
                className={`text-ink-4 ${width >= 3 ? "text-base" : "text-sm"}`}
              >
                {h.name}
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                {h.category}
              </div>
            </button>
          );
        })}
      </div>

      {editing && (
        <HabitsConfigModal
          habits={habits}
          onClose={() => setEditing(false)}
          onSaved={(next) => setHabits(next)}
        />
      )}
    </Panel>
  );
}
