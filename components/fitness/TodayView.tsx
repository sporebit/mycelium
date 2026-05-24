"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import type {
  TemplateExercise,
  TodayResponse,
} from "@/lib/fitness/types";

const KIND_ICON: Record<string, string> = {
  cardio: "🏃",
  resistance: "💪",
  other: "·",
};

const SLOT_LABEL: Record<string, string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  extra: "EXTRA",
};

function exerciseLine(ex: TemplateExercise): string {
  // Cardio
  if (ex.default_duration_min !== null && (ex.default_sets === null || ex.default_sets === 0)) {
    const parts = [`${ex.default_duration_min} min`];
    if (ex.default_intensity) parts.push(ex.default_intensity);
    if (ex.default_distance_km) parts.push(`${ex.default_distance_km} km`);
    return parts.join(" · ");
  }
  // Resistance
  if (ex.default_sets !== null && ex.default_sets > 0) {
    const parts: string[] = [];
    parts.push(`${ex.default_sets}×${ex.default_reps ?? "?"}`);
    if (ex.default_weight !== null) {
      parts.push(`${ex.default_weight}${ex.default_weight_unit ?? "kg"}`);
    }
    if (ex.rest_seconds) parts.push(`rest ${ex.rest_seconds}s`);
    return parts.join(" · ");
  }
  // Warmup / finisher with sets=0 and a duration
  if (ex.default_duration_min !== null) {
    return `${ex.default_duration_min} min`;
  }
  return "—";
}

export function TodayView() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/fitness/today", { cache: "no-store" });
        if (!mounted) return;
        if (!res.ok) {
          setError(`Load failed (${res.status})`);
          return;
        }
        const j = (await res.json()) as TodayResponse;
        if (mounted) setData(j);
      } catch {
        if (mounted) setError("Network error");
      }
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  if (data.sessions.length === 0) {
    return (
      <Panel title="Fitness · Today" topRight={<Mono>{data.date}</Mono>}>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
          {data.programme_name
            ? `Rest day. No sessions scheduled in '${data.programme_name}' for today.`
            : "No programme active. Set one up in PHASES."}
        </p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.programme_name && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Programme · {data.programme_name}
        </div>
      )}

      {data.sessions.map((s) => (
        <Panel
          key={`${s.slot}-${s.programme_session_id}`}
          number={SLOT_LABEL[s.slot]}
          title={s.name}
          status={s.logged ? "LOGGED" : undefined}
          statusTone="ok"
          topRight={
            <span className="text-base" aria-hidden>
              {KIND_ICON[s.kind] ?? "·"}
            </span>
          }
          bottomCTA={
            <button
              type="button"
              disabled
              className="cursor-not-allowed opacity-50"
              title="Logging UI coming in Round 2"
            >
              LOG THIS SESSION (coming soon)
            </button>
          }
        >
          {s.exercises.length === 0 ? (
            <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
              No exercises in template.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-2">
              {s.exercises.map((ex) => (
                <li
                  key={ex.id}
                  className="py-2 first:pt-0 last:pb-0 flex items-start gap-3"
                >
                  <Mono className="text-[11px] text-ink-3 w-6 shrink-0 pt-0.5">
                    {ex.position}
                  </Mono>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-4 leading-snug">
                      {ex.name}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] mt-0.5">
                      {exerciseLine(ex)}
                      {ex.notes && (
                        <span className="ml-2 text-ink-3 normal-case tracking-normal italic">
                          {ex.notes}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ))}

      <button
        type="button"
        disabled
        className="self-start px-3 py-1.5 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 cursor-not-allowed opacity-50"
        title="Coming soon"
      >
        + ADD EXTRA SESSION
      </button>
    </div>
  );
}
