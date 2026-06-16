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

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 32;
  const stepX = w / (values.length - 1);
  const path = values
    .map((v, i) => {
      const x = i * stepX;
      const y = h - 4 - ((v - min) / range) * (h - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-8 shrink-0" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="var(--glow-0)" strokeWidth="1.5" />
    </svg>
  );
}

export function WorkoutsListClient() {
  const [filter, setFilter] = useState<Filter>("all");
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  async function load(archived: boolean) {
    const url = archived ? "/api/workouts?include_archived=true" : "/api/workouts";
    const r = await fetch(url);
    const j = (await r.json().catch(() => ({}))) as { workouts?: Workout[] };
    setWorkouts(Array.isArray(j.workouts) ? j.workouts : []);
  }

  useEffect(() => {
    let cancelled = false;
    const url = showArchived ? "/api/workouts?include_archived=true" : "/api/workouts";
    fetch(url)
      .then((r) => r.json())
      .then((j: { workouts?: Workout[] }) => {
        if (cancelled) return;
        setWorkouts(Array.isArray(j.workouts) ? j.workouts : []);
      })
      .catch(() => !cancelled && setWorkouts([]));
    return () => {
      cancelled = true;
    };
  }, [showArchived]);

  const visible = useMemo(() => {
    if (!workouts) return [];
    if (filter === "all") return workouts;
    return workouts.filter((w) => w.default_kind === filter);
  }, [workouts, filter]);

  async function archive(w: Workout) {
    setWorkouts((prev) => prev?.filter((x) => x.id !== w.id) ?? null);
    await fetch(`/api/workouts/${w.id}/archive`, { method: "POST" });
    void load(showArchived);
  }

  async function unarchive(w: Workout) {
    await fetch(`/api/workouts/${w.id}/unarchive`, { method: "POST" });
    void load(showArchived);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
              showArchived
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
            }`}
          >
            {showArchived ? "HIDE ARCHIVED" : "SHOW ARCHIVED"}
          </button>
          <Link
            href="/fitness/workouts/new"
            className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
          >
            + NEW WORKOUT
          </Link>
        </div>
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
          {visible.map((w) => {
            const isArchived = !!w.archived_at;
            return (
              <li key={w.id}>
                <div
                  className={`bg-ink-1 border border-ink-2 hover:border-ink-3 rounded-md p-4 flex flex-col gap-2 transition-colors group relative ${
                    isArchived ? "opacity-50" : ""
                  }`}
                >
                  {isArchived ? (
                    <button
                      type="button"
                      onClick={() => unarchive(w)}
                      className="absolute top-2 right-2 h-6 px-2 rounded-full flex items-center justify-center text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] text-accent hover:bg-accent/15 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      UNARCHIVE
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => archive(w)}
                      aria-label={`Archive ${w.name}`}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center text-ink-3 hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                    </button>
                  )}
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                      <Mono>{w.exercise_count ?? 0} ex</Mono>
                      {(w.times_performed ?? 0) > 0 && (
                        <Mono>{w.times_performed} sessions</Mono>
                      )}
                    </div>
                    <MiniSparkline values={w.recent_volumes ?? []} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    <Mono>
                      {w.last_performed
                        ? `Last ${w.last_performed}`
                        : "Never performed"}
                    </Mono>
                    <Link
                      href={`/fitness/workouts/${w.id}`}
                      className="text-accent hover:text-glow-1 transition-colors"
                    >
                      VIEW →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
