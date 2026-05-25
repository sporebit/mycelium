"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import type { TemplateExercise, TodayResponse } from "@/lib/fitness/types";

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
  if (
    ex.default_duration_min !== null &&
    (ex.default_sets === null || ex.default_sets === 0)
  ) {
    const parts = [`${ex.default_duration_min} min`];
    if (ex.default_intensity) parts.push(ex.default_intensity);
    if (ex.default_distance_km) parts.push(`${ex.default_distance_km} km`);
    return parts.join(" · ");
  }
  if (ex.default_sets !== null && ex.default_sets > 0) {
    const parts: string[] = [];
    parts.push(`${ex.default_sets}×${ex.default_reps ?? "?"}`);
    if (ex.default_weight !== null) {
      parts.push(`${ex.default_weight}${ex.default_weight_unit ?? "kg"}`);
    }
    if (ex.rest_seconds) parts.push(`rest ${ex.rest_seconds}s`);
    return parts.join(" · ");
  }
  if (ex.default_duration_min !== null) return `${ex.default_duration_min} min`;
  return "—";
}

export function TodayView() {
  const router = useRouter();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/fitness/today", { cache: "no-store" });
        if (!mounted) return;
        if (!res.ok) {
          if (mounted) setError(`Load failed (${res.status})`);
          return;
        }
        const j = (await res.json()) as TodayResponse;
        if (mounted) setData(j);
      } catch {
        if (mounted) setError("Network error");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function startOrResume(s: TodayResponse["sessions"][number]) {
    if (!s.programme_session_id) return;
    setStarting(s.programme_session_id);
    try {
      const r = await fetch("/api/fitness/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programme_session_id: s.programme_session_id,
          slot: s.slot,
          kind: s.kind,
          name: s.name,
          date: data?.date,
        }),
      });
      if (!r.ok) {
        setError("Could not start session");
        return;
      }
      const j = (await r.json()) as { session_id: string };
      router.push(`/fitness/log/${j.session_id}`);
    } finally {
      setStarting(null);
    }
  }

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

      {data.sessions.map((s) => {
        const label = s.completed
          ? `LOGGED · ${s.summary?.sets ?? 0} sets${
              s.summary?.minutes != null ? ` · ${s.summary.minutes}m` : ""
            }`
          : s.in_progress
          ? "RESUME →"
          : "START SESSION →";
        const tone = s.completed ? "ok" : s.in_progress ? "warn" : undefined;
        const knownCount = s.known_issues_count ?? 0;
        return (
          <Panel
            key={`${s.slot}-${s.programme_session_id}`}
            number={SLOT_LABEL[s.slot]}
            title={s.name}
            status={s.completed ? "COMPLETED" : s.in_progress ? "IN PROGRESS" : undefined}
            statusTone={tone}
            topRight={
              <span className="flex items-center gap-2">
                {knownCount > 0 && (
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-warn"
                    title={`${knownCount} exercise${knownCount === 1 ? "" : "s"} in this session ${knownCount === 1 ? "has" : "have"} known pain history`}
                    aria-label={`${knownCount} exercises with known pain history`}
                  />
                )}
                <span className="text-base" aria-hidden>
                  {KIND_ICON[s.kind] ?? "·"}
                </span>
              </span>
            }
            bottomCTA={
              s.completed && s.logged_session_id ? (
                <Link
                  href={`/fitness/log/${s.logged_session_id}`}
                  className="hover:text-ink-4 transition-colors"
                >
                  {label}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={starting === s.programme_session_id}
                  onClick={() => void startOrResume(s)}
                  className="hover:text-ink-4 disabled:opacity-40"
                >
                  {starting === s.programme_session_id ? "STARTING…" : label}
                </button>
              )
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
        );
      })}
    </div>
  );
}
