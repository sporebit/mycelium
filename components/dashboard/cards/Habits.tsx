"use client";

import { useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { HABITS as DEFAULT_HABITS, type Habit } from "@/lib/config/habits";
import { HabitsConfigModal } from "../HabitsConfigModal";
import { triggerGlowPulse } from "@/lib/motion";
import type { CardWidth } from "@/lib/dashboard/card-registry";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";

const DAILY_LOG_KEY = "/api/daily-log/today";
const HABITS_CONFIG_KEY = "/api/habits-config";

type DailyLogResponse = {
  date: string;
  mood: string | null;
  notes: { habits?: { done?: string[] } } & Record<string, unknown>;
};

type HabitsConfigResponse = { habits?: Habit[] };

export function Habits({ width = 1 }: { width?: CardWidth } = {}) {
  const [editing, setEditing] = useState(false);
  const { data: daily } = useApi<DailyLogResponse>(DAILY_LOG_KEY);
  const { data: cfg } = useApi<HabitsConfigResponse>(HABITS_CONFIG_KEY);

  const habits: Habit[] =
    cfg?.habits && cfg.habits.length > 0 ? cfg.habits : DEFAULT_HABITS;
  const doneList: string[] = daily?.notes?.habits?.done ?? [];
  const done = new Set(doneList);

  async function toggle(id: string) {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const nextList = [...next];

    await mutateApi<DailyLogResponse>(
      DAILY_LOG_KEY,
      (current) => ({
        date: current?.date ?? "",
        mood: current?.mood ?? null,
        notes: {
          ...(current?.notes ?? {}),
          habits: { done: nextList },
        },
      }),
      async () => {
        const res = await fetch(DAILY_LOG_KEY, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ habits: { done: nextList } }),
        });
        if (!res.ok) throw new Error(`save failed (${res.status})`);
      },
    );
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
          onSaved={() =>
            mutateApi<HabitsConfigResponse>(
              HABITS_CONFIG_KEY,
              (current) => current ?? { habits: [] },
              async () => {},
              { revalidate: true },
            )
          }
        />
      )}
    </Panel>
  );
}
