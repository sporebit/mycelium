"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import {
  KIND_ICON,
  KIND_LABEL,
  SLOT_LABEL,
  WORKOUT_KINDS,
  type Workout,
  type WorkoutKind,
} from "@/lib/fitness/workouts";

type Filter = "all" | WorkoutKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "ALL" },
  ...WORKOUT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k].toUpperCase() })),
];

export function WorkoutsListClient() {
  const [filter, setFilter] = useState<Filter>("all");
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);

  async function load() {
    const r = await fetch("/api/workouts");
    const j = (await r.json().catch(() => ({}))) as { workouts?: Workout[] };
    setWorkouts(Array.isArray(j.workouts) ? j.workouts : []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workouts")
      .then((r) => r.json())
      .then((j: { workouts?: Workout[] }) => {
        if (cancelled) return;
        setWorkouts(Array.isArray(j.workouts) ? j.workouts : []);
      })
      .catch(() => !cancelled && setWorkouts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!workouts) return [];
    if (filter === "all") return workouts;
    return workouts.filter((w) => w.default_kind === filter);
  }, [workouts, filter]);

  async function archive(w: Workout) {
    if (
      !window.confirm(
        `Archive "${w.name}"? Programmes referencing it will keep working until you re-link them.`,
      )
    )
      return;
    await fetch(`/api/workouts/${w.id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Workouts
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Reusable workout templates — once edited, every programme that
            schedules them updates automatically.
          </p>
        </div>
        <Link
          href="/fitness/workouts/new"
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          + NEW WORKOUT
        </Link>
      </header>

      <div className="flex items-center gap-1 rounded-md border border-ink-2 overflow-hidden self-start flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
                active
                  ? "bg-accent/15 text-accent"
                  : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {workouts === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-12 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {workouts.length === 0
              ? "No workouts yet. Tap + NEW WORKOUT to build your first template."
              : "No workouts match that filter."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((w) => (
            <li key={w.id}>
              <div className="bg-ink-1 border border-ink-2 hover:border-ink-3 rounded-md p-4 flex flex-col gap-2 transition-colors group">
                <Link
                  href={`/fitness/workouts/${w.id}`}
                  className="flex items-start gap-2"
                >
                  <span aria-hidden className="text-xl">
                    {w.default_kind ? KIND_ICON[w.default_kind] : "·"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-ink-4 truncate">{w.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
                      {w.default_kind ? KIND_LABEL[w.default_kind] : "—"}
                      {w.default_slot ? ` · ${SLOT_LABEL[w.default_slot]}` : ""}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                  <Mono>
                    {w.exercise_count ?? 0} ex
                    {w.programme_use_count != null
                      ? ` · used in ${w.programme_use_count}`
                      : ""}
                  </Mono>
                  <button
                    type="button"
                    onClick={() => archive(w)}
                    className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger transition-opacity"
                    aria-label="Archive workout"
                    title="Archive workout"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
