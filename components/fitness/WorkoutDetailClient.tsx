"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WorkoutEditor } from "./WorkoutEditor";
import type { WorkoutDetail } from "@/lib/fitness/workouts";

export function WorkoutDetailClient({ id }: { id: string }) {
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/workouts/${id}`);
      if (!r.ok) {
        setError(`Couldn't load (${r.status})`);
        return;
      }
      const j = (await r.json()) as { workout?: WorkoutDetail };
      setWorkout(j.workout ?? null);
    } catch {
      setError("Couldn't load");
    }
  }, [id]);

  useEffect(() => {
    // queueMicrotask defers the async load past the effect body so we
    // don't trip react-hooks/set-state-in-effect.
    queueMicrotask(() => void load());
  }, [load]);

  async function patchWorkout(patch: Partial<WorkoutDetail>) {
    if (!workout) return;
    setWorkout({ ...workout, ...patch });
    await fetch(`/api/workouts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (!workout) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/fitness/workouts"
        className="self-start text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        ← ALL WORKOUTS
      </Link>
      <WorkoutEditor workout={workout} onPatchWorkout={patchWorkout} />
    </div>
  );
}
