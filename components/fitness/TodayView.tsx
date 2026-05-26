"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { ExtraSessionModal } from "./ExtraSessionModal";
import { SessionSwapDropdown } from "./SessionSwapDropdown";
import type {
  TemplateExercise,
  TodayResponse,
  WorkoutSessionType,
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

function jsDayToProgrammeDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

type Toast = { kind: "ok" | "error"; text: string } | null;

export function TodayView() {
  const router = useRouter();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [typesByKey, setTypesByKey] = useState<Record<string, WorkoutSessionType>>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const load = useCallback(async () => {
    try {
      const [tRes, typeRes] = await Promise.all([
        fetch("/api/fitness/today", { cache: "no-store" }),
        fetch("/api/fitness/session-types", { cache: "no-store" }),
      ]);
      if (!tRes.ok) {
        setError(`Load failed (${tRes.status})`);
        return;
      }
      const j = (await tRes.json()) as TodayResponse;
      setData(j);
      if (typeRes.ok) {
        const tj = (await typeRes.json()) as { types: WorkoutSessionType[] };
        const m: Record<string, WorkoutSessionType> = {};
        for (const t of tj.types ?? []) m[t.type_key] = t;
        setTypesByKey(m);
      }
    } catch {
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await load();
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

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

  const todayDow = jsDayToProgrammeDow(
    new Date(data.date.replace(/-/g, "/")).getDay()
  );

  return (
    <div className="flex flex-col gap-4">
      {data.programme_name && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Programme · {data.programme_name}
        </div>
      )}

      {data.sessions.length === 0 && data.extras.length === 0 ? (
        <Panel title="Fitness · Today" topRight={<Mono>{data.date}</Mono>}>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] leading-relaxed">
            {data.programme_name
              ? `Rest day. No sessions scheduled in '${data.programme_name}' for today.`
              : "No programme active. Set one up in PHASES."}
          </p>
        </Panel>
      ) : null}

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
        const typeLabel = s.session_type
          ? typesByKey[s.session_type]?.label ?? s.session_type
          : null;
        return (
          <Panel
            key={`${s.slot}-${s.programme_session_id}`}
            number={SLOT_LABEL[s.slot]}
            title={s.name}
            status={s.completed ? "COMPLETED" : s.in_progress ? "IN PROGRESS" : undefined}
            statusTone={tone}
            topRight={
              <span className="flex items-center gap-2">
                {typeLabel && (
                  <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                    {typeLabel}
                  </span>
                )}
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
                {!s.completed && (
                  <SessionSwapDropdown
                    slot={s.slot}
                    currentProgrammeSessionId={s.programme_session_id}
                    sessionId={s.logged_session_id}
                    hasLoggedWork={!!s.logged_session_id && s.in_progress}
                    todayDayOfWeek={todayDow}
                    programmeSessions={data.programme_sessions}
                    onSwapped={() => void load()}
                  />
                )}
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
            {s.swapped_from_programme_session_id && (
              <div className="text-[10px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)] mb-2">
                ↻ swapped from today&apos;s planned session
              </div>
            )}
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

      {/* Extras (logged today, slot=extra) */}
      {data.extras.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Extra sessions today
          </div>
          {data.extras.map((ex) => {
            const typeLabel = ex.session_type
              ? typesByKey[ex.session_type]?.label ?? ex.session_type
              : null;
            return (
              <Link
                key={ex.session_id}
                href={`/fitness/log/${ex.session_id}`}
                className="growth-in block rounded-md bg-ink-1 hover:bg-ink-2 transition-colors px-4 py-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span aria-hidden>{KIND_ICON[ex.kind] ?? "·"}</span>
                  <span className="text-sm text-ink-4 truncate">
                    {ex.name ?? "Extra session"}
                  </span>
                  {typeLabel && (
                    <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                      · {typeLabel}
                    </span>
                  )}
                  {ex.completed && (
                    <span className="text-[10px] uppercase tracking-[0.15em] text-ok font-[family-name:var(--font-mono)] ml-auto">
                      ✓
                      {ex.summary?.minutes != null
                        ? ` ${ex.summary.minutes}m`
                        : ""}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowExtra(true)}
        className="self-start px-3 py-1.5 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
      >
        + ADD EXTRA SESSION
      </button>

      {showExtra && (
        <ExtraSessionModal
          date={data.date}
          onClose={() => setShowExtra(false)}
          onSaved={(t) => {
            setShowExtra(false);
            if (t) setToast(t);
            void load();
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "ok"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
