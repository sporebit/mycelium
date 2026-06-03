"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KIND_VISUALS } from "@/lib/fitness/kind";
import { triggerGlowPulse } from "@/lib/motion";
import { localDateKey } from "@/lib/util/date";
import type { TemplateKind, TodayResponse } from "@/lib/fitness/types";
import type { Workout } from "@/lib/fitness/workouts";

const KINDS: TemplateKind[] = ["resistance", "cardio", "conditioning", "mobility"];

type Template =
  | { source: "programme"; id: string; name: string; kind: TemplateKind; dayLabel: string }
  | { source: "library"; id: string; name: string; kind: string; exerciseCount: number };

export function WorkoutNowClient() {
  const router = useRouter();
  const [step, setStep] = useState<"kind" | "pick">("kind");
  const [selectedKind, setSelectedKind] = useState<TemplateKind | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [todayRes, workoutsRes] = await Promise.all([
          fetch(`/api/fitness/today?date=${localDateKey()}`, { cache: "no-store" }),
          fetch("/api/workouts", { cache: "no-store" }),
        ]);
        if (!mounted) return;

        const tpls: Template[] = [];
        const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

        if (todayRes.ok) {
          const j = (await todayRes.json()) as TodayResponse;
          for (const s of j.programme_sessions) {
            tpls.push({
              source: "programme",
              id: s.id,
              name: s.name,
              kind: s.kind,
              dayLabel: DAY_SHORT[s.day_of_week] ?? "",
            });
          }
        }

        if (workoutsRes.ok) {
          const j = (await workoutsRes.json()) as { workouts?: Workout[] };
          for (const w of j.workouts ?? []) {
            if (w.archived_at) continue;
            tpls.push({
              source: "library",
              id: w.id,
              name: w.name,
              kind: w.default_kind ?? "other",
              exerciseCount: w.exercise_count ?? 0,
            });
          }
        }

        if (mounted) {
          setTemplates(tpls);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(
    () => templates.filter((t) => t.kind === selectedKind),
    [templates, selectedKind],
  );

  const programmeTemplates = useMemo(
    () => filtered.filter((t): t is Extract<Template, { source: "programme" }> => t.source === "programme"),
    [filtered],
  );

  const libraryTemplates = useMemo(
    () => filtered.filter((t): t is Extract<Template, { source: "library" }> => t.source === "library"),
    [filtered],
  );

  const createSession = useCallback(
    async (opts: { programme_session_id?: string; workout_id?: string }) => {
      if (creating || !selectedKind) return;
      setCreating(true);
      setError(null);
      try {
        const kv = KIND_VISUALS[selectedKind];
        const payload: Record<string, unknown> = {
          date: localDateKey(),
          slot: "extra",
          kind: selectedKind,
          name: `${kv.label} session`,
        };
        if (opts.programme_session_id) payload.programme_session_id = opts.programme_session_id;
        if (opts.workout_id) payload.workout_id = opts.workout_id;

        const r = await fetch("/api/fitness/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = (await r.json()) as { session_id?: string; error?: string };
        if (!r.ok || !j.session_id) {
          setError(j.error ?? "Failed to create session");
          return;
        }
        router.push(`/fitness/log/${j.session_id}`);
      } catch {
        setError("Network error");
      } finally {
        setCreating(false);
      }
    },
    [creating, selectedKind, router],
  );

  if (step === "kind") {
    return (
      <div className="flex flex-col gap-6 max-w-lg mx-auto">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Workout Now
        </h1>
        <p className="text-sm text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.04em]">
          What kind of session?
        </p>
        <div className="grid grid-cols-2 gap-3">
          {KINDS.map((k) => {
            const kv = KIND_VISUALS[k];
            return (
              <button
                key={k}
                type="button"
                onClick={(e) => {
                  triggerGlowPulse(e.currentTarget);
                  setSelectedKind(k);
                  setStep("pick");
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border ${kv.borderClass} ${kv.bgClass} p-6 min-h-[120px] transition-all hover:scale-[1.02] active:scale-[0.98]`}
              >
                <span className="text-3xl" aria-hidden>{kv.icon}</span>
                <span className={`text-sm font-[family-name:var(--font-mono)] tracking-[0.15em] uppercase ${kv.textClass}`}>
                  {kv.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStep("kind")}
          className="text-ink-3 hover:text-text-0 text-sm"
          aria-label="Back"
        >
          ← Back
        </button>
        <h1 className="font-[family-name:var(--font-display)] italic text-xl text-text-0 flex-1">
          {selectedKind && KIND_VISUALS[selectedKind].icon}{" "}
          {selectedKind && KIND_VISUALS[selectedKind].label}
        </h1>
      </div>

      {error && (
        <p className="text-xs text-danger font-[family-name:var(--font-mono)]">{error}</p>
      )}

      {/* Start blank */}
      <button
        type="button"
        disabled={creating}
        onClick={(e) => {
          triggerGlowPulse(e.currentTarget);
          void createSession({});
        }}
        className="w-full flex items-center gap-3 bg-ink-1 rounded-xl border border-dashed border-ink-3 px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors"
      >
        <span className="text-lg text-ink-3">+</span>
        <div className="flex-1 text-left">
          <div className="text-sm text-text-0">Start blank</div>
          <div className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] uppercase tracking-[0.12em]">
            Add exercises as you go
          </div>
        </div>
      </button>

      {loading ? (
        <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)] text-center py-8">
          Loading templates…
        </p>
      ) : (
        <>
          {/* Programme templates */}
          {programmeTemplates.length > 0 && (
            <>
              <SectionHeading>From programme</SectionHeading>
              <div className="flex flex-col gap-2">
                {programmeTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={creating}
                    onClick={(e) => {
                      triggerGlowPulse(e.currentTarget);
                      void createSession({ programme_session_id: t.id });
                    }}
                    className="w-full flex items-center gap-3 bg-ink-1 rounded-xl border border-ink-2 px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors text-left"
                  >
                    <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] w-8">
                      {t.dayLabel}
                    </span>
                    <span className="flex-1 text-sm text-text-0 truncate">{t.name}</span>
                    <Chevron />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Library workouts */}
          {libraryTemplates.length > 0 && (
            <>
              <SectionHeading>From library</SectionHeading>
              <div className="flex flex-col gap-2">
                {libraryTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={creating}
                    onClick={(e) => {
                      triggerGlowPulse(e.currentTarget);
                      void createSession({ workout_id: t.id });
                    }}
                    className="w-full flex items-center gap-3 bg-ink-1 rounded-xl border border-ink-2 px-4 min-h-[56px] hover:bg-ink-2/40 transition-colors text-left"
                  >
                    <span className="flex-1 text-sm text-text-0 truncate">{t.name}</span>
                    <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] uppercase tracking-[0.12em]">
                      {t.exerciseCount} ex
                    </span>
                    <Chevron />
                  </button>
                ))}
              </div>
            </>
          )}

          {programmeTemplates.length === 0 && libraryTemplates.length === 0 && (
            <p className="text-xs text-ink-3 font-[family-name:var(--font-mono)] text-center py-4 italic">
              No saved {selectedKind} workouts yet — start blank and build one
            </p>
          )}
        </>
      )}

      {creating && (
        <p className="text-xs text-accent font-[family-name:var(--font-mono)] text-center animate-pulse">
          Creating session…
        </p>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-2 px-1">
      {children}
    </h2>
  );
}

function Chevron() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-ink-3"
    >
      <path d="M5 3 L9 7 L5 11" />
    </svg>
  );
}
