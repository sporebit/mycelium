"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import {
  DAY_SHORT,
  type ProgrammeDetail,
  type TemplateExercise,
  type TemplateSession,
} from "@/lib/fitness/types";

const SLOTS: Array<"morning" | "afternoon"> = ["morning", "afternoon"];

function exerciseLine(ex: TemplateExercise): string {
  if (ex.default_duration_min !== null && (ex.default_sets ?? 0) === 0) {
    const parts = [`${ex.default_duration_min} min`];
    if (ex.default_intensity) parts.push(ex.default_intensity);
    return parts.join(" · ");
  }
  if ((ex.default_sets ?? 0) > 0) {
    const parts: string[] = [`${ex.default_sets}×${ex.default_reps ?? "?"}`];
    if (ex.default_weight !== null) {
      parts.push(`${ex.default_weight}${ex.default_weight_unit ?? "kg"}`);
    }
    return parts.join(" · ");
  }
  return ex.default_duration_min ? `${ex.default_duration_min} min` : "—";
}

export function ProgrammeEditor({ programmeId }: { programmeId: string }) {
  const [detail, setDetail] = useState<ProgrammeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`/api/fitness/programmes/${programmeId}`, {
          cache: "no-store",
        });
        if (!mounted) return;
        if (!res.ok) {
          setError(`Load failed (${res.status})`);
          return;
        }
        const j = (await res.json()) as { programme?: ProgrammeDetail };
        if (mounted) setDetail(j.programme ?? null);
      } catch {
        if (mounted) setError("Network error");
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [programmeId]);

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  const byDaySlot = new Map<string, TemplateSession>();
  for (const s of detail.sessions) {
    byDaySlot.set(`${s.day_of_week}-${s.slot}`, s);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/fitness/programmes"
            className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
          >
            ← Programmes
          </Link>
          <h1 className="mt-1 text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
            {detail.name}
          </h1>
          {detail.description && (
            <p className="mt-1 text-sm text-ink-3 italic font-[family-name:var(--font-display)] max-w-2xl">
              {detail.description}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {DAY_SHORT.map((dayLabel, dow) => (
          <div key={dow} className="flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] px-1">
              {dayLabel}
            </div>
            {SLOTS.map((slot) => {
              const s = byDaySlot.get(`${dow}-${slot}`);
              return (
                <div
                  key={slot}
                  className={`rounded-lg border p-3 min-h-[120px] flex flex-col gap-1 ${
                    s
                      ? "border-ink-2 bg-ink-1/60"
                      : "border-dashed border-ink-2 bg-ink-0/20"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    {slot === "morning" ? "AM" : "PM"}
                    {s && (
                      <span className="ml-2 text-accent">
                        {s.kind === "cardio" ? "CARDIO" : "RESIST"}
                      </span>
                    )}
                  </div>
                  {s ? (
                    <>
                      <div className="text-sm text-ink-4 leading-snug">
                        {s.name}
                      </div>
                      <Mono className="text-[10px] text-ink-3 mt-1">
                        {s.exercises?.length ?? 0} exercises
                      </Mono>
                    </>
                  ) : (
                    <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                      Empty
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Panel title="All sessions" topRight={<Mono>{detail.sessions.length}</Mono>}>
        <ul className="flex flex-col divide-y divide-ink-2">
          {detail.sessions.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-sm text-ink-4">
                  <Mono className="text-[10px] text-ink-3 mr-2">
                    {DAY_SHORT[s.day_of_week]} {s.slot === "morning" ? "AM" : "PM"}
                  </Mono>
                  {s.name}
                </span>
                <Mono className="text-[10px] text-ink-3 shrink-0">
                  {s.kind.toUpperCase()}
                </Mono>
              </div>
              {s.exercises && s.exercises.length > 0 && (
                <ol className="ml-4 mt-1 list-decimal text-xs text-ink-3 space-y-0.5">
                  {s.exercises.map((ex) => (
                    <li key={ex.id}>
                      <span className="text-ink-4">{ex.name}</span>
                      <span className="text-ink-3 ml-2 font-[family-name:var(--font-mono)] text-[10px]">
                        {exerciseLine(ex)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
        Full inline editing comes in Round 2. For now, edit sessions/exercises
        via the API or by re-seeding.
      </p>
    </div>
  );
}
