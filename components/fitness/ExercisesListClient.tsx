"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABEL,
  type MuscleGroup,
} from "@/lib/fitness/muscle-map";
import type { ExerciseListItem } from "@/app/api/fitness/exercises/route";

type Filter = "all" | MuscleGroup;

function MiniSparkline({ values }: { values: number[] }) {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length < 2) return null;
  const max = Math.max(...nonZero);
  const min = Math.min(...nonZero);
  const range = max - min || 1;
  const w = 60;
  const h = 28;
  const stepX = w / (values.length - 1);
  const path = values
    .map((v, i) => {
      const x = i * stepX;
      const y = h - 3 - ((Math.max(v, min) - min) / range) * (h - 6);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-[60px] h-7 shrink-0" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="var(--glow-0)" strokeWidth="1.5" />
    </svg>
  );
}

export function ExercisesListClient() {
  const [exercises, setExercises] = useState<ExerciseListItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fitness/exercises")
      .then((r) => r.json())
      .then((j: { exercises?: ExerciseListItem[] }) => {
        if (!cancelled) setExercises(j.exercises ?? []);
      })
      .catch(() => !cancelled && setExercises([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!exercises) return [];
    let result = exercises;
    if (filter !== "all") {
      result = result.filter((e) => e.muscle_group === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    return result;
  }, [exercises, filter, search]);

  const availableGroups = useMemo(() => {
    if (!exercises) return [];
    const groups = new Set(exercises.map((e) => e.muscle_group));
    return MUSCLE_GROUPS.filter((g) => groups.has(g));
  }, [exercises]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Exercises
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Every exercise you've logged — progression tracking and personal bests.
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          className="w-48 bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-1.5 outline-none focus:border-ink-3 placeholder:text-ink-3"
        />
      </header>

      <div className="flex items-center gap-1 rounded-md border border-ink-2 overflow-x-auto self-start flex-nowrap">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`shrink-0 px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
            filter === "all"
              ? "bg-accent/15 text-accent"
              : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
          }`}
        >
          ALL
        </button>
        {availableGroups.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setFilter(g)}
            className={`shrink-0 px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
              filter === g
                ? "bg-accent/15 text-accent"
                : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
            }`}
          >
            {MUSCLE_GROUP_LABEL[g].toUpperCase()}
          </button>
        ))}
      </div>

      {exercises === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-12 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {exercises.length === 0
              ? "No exercises logged yet."
              : "No exercises match that filter."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((ex) => (
            <li key={ex.slug}>
              <Link
                href={`/fitness/exercises/${ex.slug}`}
                className="block bg-ink-1 border border-ink-2 hover:border-ink-3 rounded-md p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-ink-4 truncate">{ex.name}</div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5 inline-block px-1.5 py-0.5 rounded border border-ink-2">
                      {MUSCLE_GROUP_LABEL[ex.muscle_group as MuscleGroup] ?? ex.muscle_group}
                    </span>
                  </div>
                  <MiniSparkline values={ex.recent_weights} />
                </div>
                <div className="mt-3 rounded-lg bg-ink-0/40 border border-ink-2 h-[100px] flex items-center justify-center">
                  <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] uppercase">
                    Animation coming soon
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                  <Mono>
                    {ex.pr_weight
                      ? `PR ${ex.pr_weight}kg`
                      : "No weight PR"}
                    {ex.pr_date ? ` · ${ex.pr_date}` : ""}
                  </Mono>
                  <Mono>{ex.times_performed}x</Mono>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
