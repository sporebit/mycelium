"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import type {
  LastSession,
  LoggedSet,
  SessionDetail,
  SessionExercise,
  WeightUnit,
} from "@/lib/fitness/types";
import { RestTimer } from "./RestTimer";
import { FinishModal } from "./FinishModal";
import { suggestNextWeight, topSet } from "@/lib/fitness/progression";
import { localDateKey } from "@/lib/util/date";

const UNITS: WeightUnit[] = ["kg", "lbs", "stone"];
const UNIT_LABEL: Record<WeightUnit, string> = { kg: "KG", lbs: "LBS", stone: "ST" };

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function usesSetsGrid(ex: SessionExercise): boolean {
  const def = ex.template?.default_sets ?? null;
  if (def !== null && def > 0) return true;
  if (def !== null && def === 0) return false;
  // No template (ad-hoc) → default to sets grid unless duration was provided up front
  return !ex.duration_min;
}

function prescribedSetCount(ex: SessionExercise): number {
  const def = ex.template?.default_sets ?? null;
  const maxLogged = (ex.sets ?? []).reduce((m, s) => Math.max(m, s.set_number), 0);
  if (def && def > 0) return Math.max(def, maxLogged);
  return Math.max(3, maxLogged);
}

function targetLine(ex: SessionExercise): string {
  const t = ex.template;
  const parts: string[] = [];
  if (t?.default_sets && t.default_sets > 0) {
    parts.push(`${t.default_sets} × ${t.default_reps ?? "?"}`);
    if (t.default_weight != null) {
      parts.push(`${t.default_weight}${t.default_weight_unit ?? "kg"}`);
    }
    if (t.rest_seconds) parts.push(`${t.rest_seconds}s rest`);
  } else if (t?.default_duration_min) {
    parts.push(`${t.default_duration_min} min`);
    if (t.default_intensity) parts.push(t.default_intensity);
    if (t.default_distance_km) parts.push(`${t.default_distance_km} km`);
  } else {
    if (ex.duration_min) parts.push(`${ex.duration_min} min`);
  }
  return parts.join(" · ");
}

type Toast = { kind: "ok" | "error"; text: string } | null;

export function LogClient({ initial }: { initial: SessionDetail }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [lastByEx, setLastByEx] = useState<Record<string, LastSession>>({});
  const [unitByEx, setUnitByEx] = useState<Record<string, WeightUnit>>(() => {
    // Lazy init from localStorage so we don't need an effect-setstate roundtrip.
    if (typeof window === "undefined") return {};
    const out: Record<string, WeightUnit> = {};
    for (const ex of initial.exercises) {
      const key = `mycelium.fitness.unit.${ex.programme_exercise_id ?? ex.id}`;
      try {
        const v = localStorage.getItem(key);
        if (v === "kg" || v === "lbs" || v === "stone") out[ex.id] = v;
      } catch {
        /* SSR / private mode */
      }
    }
    return out;
  });
  const [toast, setToast] = useState<Toast>(null);
  const [showFinish, setShowFinish] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [ageBannerDismissed, setAgeBannerDismissed] = useState(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedFlash, setSavedFlash] = useState(false);
  const weightInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const commentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const readOnly = !!session.completed_at;

  // Ordered exercises (snapshot already ordered by position)
  const exercises = session.exercises;

  // The "current" exercise — first non-completed, non-skipped (or whatever the user tapped)
  const current = useMemo<SessionExercise | null>(() => {
    if (activeId) {
      const found = exercises.find((e) => e.id === activeId);
      if (found) return found;
    }
    return (
      exercises.find((e) => !e.completed_at && !e.skipped) ??
      exercises[0] ??
      null
    );
  }, [activeId, exercises]);

  // ---------------------------------------------------------------------------
  // Elapsed clock
  useEffect(() => {
    if (readOnly) return;
    const startedAt = session.started_at
      ? new Date(session.started_at).getTime()
      : Date.now();
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.started_at, readOnly]);

  // ---------------------------------------------------------------------------
  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // Saved-flash auto-dismiss
  useEffect(() => {
    if (!savedFlash) return;
    const id = setTimeout(() => setSavedFlash(false), 900);
    return () => clearTimeout(id);
  }, [savedFlash]);

  function setUnitFor(ex: SessionExercise, unit: WeightUnit) {
    setUnitByEx((prev) => ({ ...prev, [ex.id]: unit }));
    try {
      const key = `mycelium.fitness.unit.${ex.programme_exercise_id ?? ex.id}`;
      localStorage.setItem(key, unit);
    } catch {
      /* ignore */
    }
  }

  function unitFor(ex: SessionExercise): WeightUnit {
    return (
      unitByEx[ex.id] ??
      (ex.template?.default_weight_unit as WeightUnit | undefined) ??
      "kg"
    );
  }

  // ---------------------------------------------------------------------------
  // Last-session lookup (in parallel, once on mount)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = exercises
        .map((e) => e.programme_exercise_id)
        .filter((x): x is string => !!x);
      const out: Record<string, LastSession> = {};
      await Promise.all(
        ids.map(async (pid) => {
          try {
            const r = await fetch(`/api/fitness/last-session/${pid}`, {
              cache: "no-store",
            });
            if (!r.ok) return;
            const j = (await r.json()) as { last: LastSession };
            if (j.last) {
              const target = exercises.find((e) => e.programme_exercise_id === pid);
              if (target) out[target.id] = j.last;
            }
          } catch {
            /* ignore */
          }
        })
      );
      if (!cancelled) setLastByEx(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Server helpers
  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/fitness/sessions/${session.id}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = (await r.json()) as { session: SessionDetail };
      setSession(j.session);
    } catch {
      /* ignore */
    }
  }, [session.id]);

  function noteSaving(state: "saving" | "saved" | "error") {
    setSaving(state);
    if (state === "saved") {
      setSavedFlash(true);
      setTimeout(() => setSaving("idle"), 700);
    }
  }

  // ---------------------------------------------------------------------------
  // SETS — log / un-log
  async function toggleSetDone(ex: SessionExercise, setNumber: number) {
    if (readOnly) return;
    const existing = (ex.sets ?? []).find((s) => s.set_number === setNumber);
    if (existing && existing.completed_at) {
      // un-log
      noteSaving("saving");
      const r = await fetch(
        `/api/fitness/sessions/${session.id}/exercises/${ex.id}/sets/${setNumber}`,
        { method: "DELETE" }
      );
      if (r.ok) {
        await reload();
        noteSaving("saved");
      } else {
        noteSaving("error");
        setToast({ kind: "error", text: "Could not un-log set" });
      }
      return;
    }

    // Read inputs from refs/state
    const wKey = setKey(ex.id, setNumber, "w");
    const rKey = setKey(ex.id, setNumber, "r");
    const weightRaw = inputDraft[wKey] ?? "";
    const repsRaw = inputDraft[rKey] ?? "";
    const weight = weightRaw === "" ? null : Number(weightRaw);
    const reps = repsRaw === "" ? null : Number(repsRaw);
    const unit = unitFor(ex);

    noteSaving("saving");
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}/sets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_number: setNumber, weight, reps, unit }),
      }
    );
    if (!r.ok) {
      noteSaving("error");
      setToast({ kind: "error", text: "Save failed — check connection" });
      return;
    }
    // Start a new rest timer (auto-stops any running one because endsAt resets)
    const restSec = ex.rest_seconds ?? 90;
    // eslint-disable-next-line react-hooks/purity -- timestamp captured inside async callback, not render
    setRestEndsAt(Date.now() + restSec * 1000);
    await reload();
    noteSaving("saved");

    // Auto-focus next un-logged weight input
    setTimeout(() => {
      const nextSetNumber = setNumber + 1;
      const nextKey = setKey(ex.id, nextSetNumber, "w");
      weightInputRefs.current[nextKey]?.focus();
    }, 50);
  }

  // ---------------------------------------------------------------------------
  // Local input draft state — avoids a controlled-input round-trip per keystroke.
  function setKey(exId: string, setNumber: number, field: "w" | "r"): string {
    return `${exId}:${setNumber}:${field}`;
  }
  const [inputDraft, setInputDraft] = useState<Record<string, string>>(() => {
    // Seed from already-logged sets so the inputs show the saved values.
    const out: Record<string, string> = {};
    for (const ex of initial.exercises) {
      for (const s of ex.sets ?? []) {
        if (!s.completed_at) continue;
        if (s.weight != null) out[setKey(ex.id, s.set_number, "w")] = String(s.weight);
        if (s.reps != null) out[setKey(ex.id, s.set_number, "r")] = String(s.reps);
      }
    }
    return out;
  });

  // Ad-hoc exercises start with no logged sets, so they don't need draft
  // seeding. Drafts for prescribed sets are seeded once via the useState
  // initializer above.

  // ---------------------------------------------------------------------------
  // EXERCISE-LEVEL
  async function markExerciseDone(ex: SessionExercise) {
    if (readOnly) return;
    noteSaving("saving");
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      }
    );
    if (!r.ok) {
      noteSaving("error");
      return;
    }
    await reload();
    noteSaving("saved");
    // advance to next pending
    const idx = exercises.findIndex((e) => e.id === ex.id);
    const next = exercises.slice(idx + 1).find((e) => !e.completed_at && !e.skipped);
    setActiveId(next?.id ?? null);
  }

  async function skipExercise(ex: SessionExercise) {
    if (readOnly) return;
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}/skip`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: true }),
      }
    );
    if (r.ok) {
      await reload();
      setToast({ kind: "ok", text: "Skipped" });
      const idx = exercises.findIndex((e) => e.id === ex.id);
      const next = exercises.slice(idx + 1).find((e) => !e.completed_at && !e.skipped);
      setActiveId(next?.id ?? null);
    } else setToast({ kind: "error", text: "Skip failed" });
  }

  async function removeExercise(ex: SessionExercise) {
    if (readOnly) return;
    if (!window.confirm(`Remove "${ex.name}" from today?`)) return;
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      { method: "DELETE" }
    );
    if (r.ok) {
      await reload();
      setToast({ kind: "ok", text: "Removed" });
    } else setToast({ kind: "error", text: "Remove failed" });
  }

  function scheduleCommentSave(ex: SessionExercise, value: string) {
    const key = `cmt:${ex.id}`;
    if (commentTimers.current[key]) clearTimeout(commentTimers.current[key]);
    commentTimers.current[key] = setTimeout(async () => {
      noteSaving("saving");
      const r = await fetch(
        `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: value || null }),
        }
      );
      noteSaving(r.ok ? "saved" : "error");
      if (r.ok) await reload();
    }, 500);
  }

  async function toggleSaveToTemplate(ex: SessionExercise) {
    if (readOnly) return;
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save_to_template: !ex.save_to_template }),
      }
    );
    if (r.ok) await reload();
  }

  // ---------------------------------------------------------------------------
  // DURATION-mode "DONE": save duration_min/distance_km/intensity + completed_at
  async function logDuration(
    ex: SessionExercise,
    fields: {
      duration_min: number | null;
      distance_km: number | null;
      intensity: string | null;
    }
  ) {
    if (readOnly) return;
    noteSaving("saving");
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          completed_at: new Date().toISOString(),
        }),
      }
    );
    if (!r.ok) {
      noteSaving("error");
      return;
    }
    await reload();
    noteSaving("saved");
    const idx = exercises.findIndex((e) => e.id === ex.id);
    const next = exercises.slice(idx + 1).find((e) => !e.completed_at && !e.skipped);
    setActiveId(next?.id ?? null);
  }

  // ---------------------------------------------------------------------------
  // SESSION-LEVEL
  async function abandonSession() {
    if (!window.confirm("Abandon this session? All logged sets will be deleted.")) {
      return;
    }
    const r = await fetch(`/api/fitness/sessions/${session.id}`, {
      method: "DELETE",
    });
    if (r.ok) router.push("/fitness");
    else setToast({ kind: "error", text: "Abandon failed" });
  }

  async function finishSession(args: {
    calories: number | null;
    notes: string | null;
    apply_template_updates: boolean;
  }) {
    const r = await fetch(`/api/fitness/sessions/${session.id}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (r.ok) router.push("/fitness?finished=1");
    else setToast({ kind: "error", text: "Finish failed" });
  }

  async function markYesterdayComplete() {
    const r = await fetch(`/api/fitness/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
    });
    if (r.ok) router.push("/fitness");
  }

  // ---------------------------------------------------------------------------
  // Stats for header
  const completedCount = exercises.filter((e) => e.completed_at || e.skipped).length;
  const hasAnyLoggedSet = useMemo(
    () => exercises.some((e) => (e.sets ?? []).some((s) => s.completed_at)),
    [exercises]
  );

  const todayKey = localDateKey();
  const isStale =
    !readOnly &&
    !ageBannerDismissed &&
    session.date < todayKey;

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen pb-32 sm:pb-24" data-readonly={readOnly}>
      <div className="max-w-[600px] mx-auto px-3 sm:px-4">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-ink-0/95 backdrop-blur-xl border-b border-ink-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/fitness")}
            className="text-ink-3 hover:text-ink-4 text-sm font-[family-name:var(--font-mono)]"
            aria-label="Back"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ink-4 truncate">
              {session.name ?? "Session"}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] flex items-center gap-2">
              <span>{session.slot}</span>
              {!readOnly && (
                <>
                  <span>·</span>
                  <Mono>{fmtElapsed(elapsed)}</Mono>
                </>
              )}
              <span>·</span>
              <span>
                {completedCount}/{exercises.length}
              </span>
              {savedFlash && (
                <span className="text-ok ml-1" aria-live="polite">
                  ✓
                </span>
              )}
              {saving === "error" && (
                <span className="text-danger ml-1">⚠</span>
              )}
              {readOnly && (
                <span className="text-ok ml-1">✓ COMPLETED</span>
              )}
            </div>
          </div>
          {!readOnly && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((v) => !v)}
                className="h-10 w-10 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4"
                aria-label="Menu"
              >
                ⋮
              </button>
              {showMenu && (
                <div
                  className="absolute right-0 top-12 w-56 bg-ink-1 border border-ink-2 rounded-md shadow-2xl z-40 flex flex-col py-1"
                  onMouseLeave={() => setShowMenu(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      void abandonSession();
                    }}
                    className="px-3 py-2 text-left text-sm text-danger hover:bg-ink-2/30"
                  >
                    Abandon session
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Yesterday-banner */}
        {isStale && (
          <div className="my-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-ink-4">
            <div className="font-[family-name:var(--font-display)] italic mb-2">
              This session is from {session.date}. Mark complete or start fresh?
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void markYesterdayComplete()}
                className="px-2 py-1 rounded-md border border-ok/40 text-ok text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em]"
              >
                MARK COMPLETE
              </button>
              <button
                type="button"
                onClick={() => setAgeBannerDismissed(true)}
                className="px-2 py-1 rounded-md border border-ink-2 text-ink-3 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em]"
              >
                CONTINUE
              </button>
              <button
                type="button"
                onClick={() => void abandonSession()}
                className="px-2 py-1 rounded-md border border-danger/40 text-danger text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em]"
              >
                DISCARD
              </button>
            </div>
          </div>
        )}

        {/* CURRENT EXERCISE */}
        {current && (
          <CurrentExerciseCard
            ex={current}
            readOnly={readOnly}
            unit={unitFor(current)}
            setUnit={(u) => setUnitFor(current, u)}
            last={lastByEx[current.id] ?? null}
            inputDraft={inputDraft}
            setInputDraft={setInputDraft}
            weightInputRefs={weightInputRefs}
            onToggleSet={toggleSetDone}
            onDone={markExerciseDone}
            onSkip={skipExercise}
            onCommentChange={scheduleCommentSave}
            onToggleSaveToTemplate={toggleSaveToTemplate}
            onLogDuration={logDuration}
            onStartRest={() =>
              setRestEndsAt(Date.now() + (current.rest_seconds ?? 90) * 1000)
            }
            restActive={restEndsAt !== null}
          />
        )}

        {/* REMAINING LIST */}
        <div className="mt-4 rounded-2xl border border-ink-2 bg-ink-1/60">
          <div className="px-3 py-2 border-b border-ink-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            All exercises ({exercises.length})
          </div>
          <ul className="flex flex-col">
            {exercises.map((ex) => {
              const isActive = current?.id === ex.id;
              return (
                <ExerciseRow
                  key={ex.id}
                  ex={ex}
                  isActive={isActive}
                  readOnly={readOnly}
                  onSelect={() => setActiveId(ex.id)}
                  onSkip={() => void skipExercise(ex)}
                  onRemove={() => void removeExercise(ex)}
                />
              );
            })}
          </ul>
          {!readOnly && (
            <div className="px-3 py-3 border-t border-ink-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex-1 h-11 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4 hover:border-ink-3"
              >
                + ADD EXERCISE
              </button>
              <button
                type="button"
                disabled
                title="Coming in next round"
                className="h-11 px-3 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] opacity-40 cursor-not-allowed"
              >
                🎤 VOICE
              </button>
            </div>
          )}
        </div>

        {/* FINISH bar */}
        {!readOnly && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowFinish(true)}
              disabled={!hasAnyLoggedSet}
              className="w-full h-14 rounded-md bg-ok/15 border border-ok/40 text-ok text-sm font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-ok/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              FINISH SESSION
            </button>
          </div>
        )}
      </div>

      {/* Rest timer */}
      {!readOnly && (
        <RestTimer
          endsAt={restEndsAt}
          onSkip={() => setRestEndsAt(null)}
          onStop={() => setRestEndsAt(null)}
          onAdjust={(d) =>
            setRestEndsAt((cur) => (cur == null ? null : cur + d * 1000))
          }
        />
      )}

      {/* Finish modal */}
      {showFinish && (
        <FinishModal
          session={session}
          onClose={() => setShowFinish(false)}
          onConfirm={async (args) => {
            await finishSession(args);
          }}
        />
      )}

      {/* Add ad-hoc */}
      {showAdd && (
        <AddExerciseModal
          onClose={() => setShowAdd(false)}
          onCreate={async (data) => {
            const r = await fetch(
              `/api/fitness/sessions/${session.id}/exercises`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              }
            );
            if (r.ok) {
              await reload();
              setShowAdd(false);
              setToast({ kind: "ok", text: "Exercise added" });
            } else setToast({ kind: "error", text: "Add failed" });
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
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

// ---------------------------------------------------------------------------
// CURRENT EXERCISE CARD — sets grid OR duration UI
// ---------------------------------------------------------------------------

function CurrentExerciseCard({
  ex,
  readOnly,
  unit,
  setUnit,
  last,
  inputDraft,
  setInputDraft,
  weightInputRefs,
  onToggleSet,
  onDone,
  onSkip,
  onCommentChange,
  onToggleSaveToTemplate,
  onLogDuration,
  onStartRest,
  restActive,
}: {
  ex: SessionExercise;
  readOnly: boolean;
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
  last: LastSession | null;
  inputDraft: Record<string, string>;
  setInputDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  weightInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  onToggleSet: (ex: SessionExercise, n: number) => void | Promise<void>;
  onDone: (ex: SessionExercise) => void;
  onSkip: (ex: SessionExercise) => void;
  onCommentChange: (ex: SessionExercise, value: string) => void;
  onToggleSaveToTemplate: (ex: SessionExercise) => void;
  onLogDuration: (
    ex: SessionExercise,
    fields: {
      duration_min: number | null;
      distance_km: number | null;
      intensity: string | null;
    }
  ) => void | Promise<void>;
  onStartRest: () => void;
  restActive: boolean;
}) {
  const sets = useMemo<LoggedSet[]>(() => ex.sets ?? [], [ex.sets]);
  const setsByNum = useMemo(
    () => new Map(sets.map((s) => [s.set_number, s] as const)),
    [sets]
  );
  const suggestion = useMemo(() => suggestNextWeight(ex.template, last), [
    ex.template,
    last,
  ]);
  const lastTop = useMemo(() => topSet(last), [last]);
  const grid = usesSetsGrid(ex);
  const N = grid ? prescribedSetCount(ex) : 0;

  const [duration, setDuration] = useState<string>(
    ex.duration_min != null ? String(ex.duration_min) : ""
  );
  const [distance, setDistance] = useState<string>(
    ex.distance_km != null ? String(ex.distance_km) : ""
  );
  const [intensity, setIntensity] = useState<string>(ex.intensity ?? "");
  const [commentDraft, setCommentDraft] = useState<string>(ex.comment ?? "");

  // Reset local draft when ex.id changes
  const lastExId = useRef<string>(ex.id);
  useEffect(() => {
    if (lastExId.current === ex.id) return;
    lastExId.current = ex.id;
    setDuration(ex.duration_min != null ? String(ex.duration_min) : "");
    setDistance(ex.distance_km != null ? String(ex.distance_km) : "");
    setIntensity(ex.intensity ?? "");
    setCommentDraft(ex.comment ?? "");
  }, [ex.id, ex.duration_min, ex.distance_km, ex.intensity, ex.comment]);

  function setKey(n: number, field: "w" | "r"): string {
    return `${ex.id}:${n}:${field}`;
  }
  function getDraft(n: number, field: "w" | "r"): string {
    return inputDraft[setKey(n, field)] ?? "";
  }
  function setDraft(n: number, field: "w" | "r", value: string) {
    setInputDraft((prev) => ({ ...prev, [setKey(n, field)]: value }));
  }

  const targets = targetLine(ex);

  return (
    <div className="mt-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-lg sm:text-xl text-ink-4 leading-tight">
            {ex.name}
          </div>
          {targets && (
            <div className="text-[11px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
              {targets}
            </div>
          )}
          {grid && suggestion && suggestion.delta_kg > 0 && (
            <div className="text-[11px] text-accent font-[family-name:var(--font-mono)] tracking-[0.1em] mt-1">
              ↪ +{suggestion.delta_kg}kg from last
            </div>
          )}
          {grid && lastTop && (
            <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
              Last: {lastTop.weight}
              {lastTop.unit} × {lastTop.reps}
              {last?.session_date ? ` on ${last.session_date}` : ""}
            </div>
          )}
          {ex.notes && (
            <div className="text-[11px] text-ink-3 italic font-[family-name:var(--font-display)] mt-1 leading-snug">
              {ex.notes}
            </div>
          )}
        </div>
        {grid && (
          <div className="flex rounded-md overflow-hidden border border-ink-2 shrink-0">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                disabled={readOnly}
                onClick={() => setUnit(u)}
                className={`px-2 py-1.5 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] ${
                  unit === u
                    ? "bg-accent/20 text-accent"
                    : "text-ink-3 hover:text-ink-4"
                }`}
              >
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
        )}
      </div>

      {grid ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-[2.5rem_1fr_1fr_5rem] gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] pl-1">
            <span>Set</span>
            <span>Weight</span>
            <span>Reps</span>
            <span className="text-right">Done</span>
          </div>
          {Array.from({ length: N }, (_, i) => i + 1).map((n) => {
            const logged = setsByNum.get(n);
            const isLogged = !!logged?.completed_at;
            const placeholderSet = last?.sets.find((s) => s.set_number === n);
            const placeholderW =
              placeholderSet?.weight != null ? String(placeholderSet.weight) : "";
            const placeholderR =
              placeholderSet?.reps != null ? String(placeholderSet.reps) : "";
            return (
              <div
                key={n}
                className={`grid grid-cols-[2.5rem_1fr_1fr_5rem] gap-2 items-center rounded-md border px-1 py-1 transition-colors ${
                  isLogged
                    ? "border-ok/50 bg-ok/10"
                    : "border-ink-2 bg-ink-0/30"
                }`}
              >
                <span className="text-center text-sm font-[family-name:var(--font-mono)] text-ink-3">
                  {n}
                </span>
                <input
                  ref={(el) => {
                    weightInputRefs.current[setKey(n, "w")] = el;
                  }}
                  inputMode="decimal"
                  type="text"
                  disabled={readOnly}
                  value={getDraft(n, "w")}
                  onChange={(e) =>
                    setDraft(n, "w", e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder={placeholderW || "—"}
                  className="bg-transparent border border-ink-2 rounded-md text-base text-ink-4 px-2 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums min-w-0"
                />
                <input
                  inputMode="numeric"
                  type="text"
                  disabled={readOnly}
                  value={getDraft(n, "r")}
                  onChange={(e) =>
                    setDraft(n, "r", e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder={placeholderR || "—"}
                  className="bg-transparent border border-ink-2 rounded-md text-base text-ink-4 px-2 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums min-w-0"
                />
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => void onToggleSet(ex, n)}
                  className={`h-10 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] ${
                    isLogged
                      ? "bg-ok/20 border border-ok/50 text-ok"
                      : "bg-accent/10 border border-accent/40 text-accent"
                  } disabled:opacity-40`}
                >
                  {isLogged ? "✓" : "DONE"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 col-span-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Duration (min)
            </span>
            <input
              inputMode="numeric"
              type="text"
              disabled={readOnly}
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={String(ex.template?.default_duration_min ?? "—")}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Distance (km)
            </span>
            <input
              inputMode="decimal"
              type="text"
              disabled={readOnly}
              value={distance}
              onChange={(e) =>
                setDistance(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder={
                ex.template?.default_distance_km != null
                  ? String(ex.template.default_distance_km)
                  : "—"
              }
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Intensity
            </span>
            <input
              type="text"
              disabled={readOnly}
              value={intensity}
              onChange={(e) => setIntensity(e.target.value)}
              placeholder={ex.template?.default_intensity ?? "easy / moderate / hard"}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-accent"
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          rows={2}
          disabled={readOnly}
          value={commentDraft}
          onChange={(e) => {
            setCommentDraft(e.target.value);
            onCommentChange(ex, e.target.value);
          }}
          placeholder="How did this feel?"
          className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-accent resize-none"
        />
        <label className="flex items-center gap-2 text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em]">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={ex.save_to_template}
            onChange={() => onToggleSaveToTemplate(ex)}
          />
          Save changes to template
        </label>
      </div>

      {!readOnly && (
        <div className="mt-3 flex gap-2 items-center">
          {grid && !restActive && (
            <button
              type="button"
              onClick={onStartRest}
              className="h-12 px-3 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4"
            >
              START REST
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              grid
                ? onDone(ex)
                : void onLogDuration(ex, {
                    duration_min: duration === "" ? null : Number(duration),
                    distance_km: distance === "" ? null : Number(distance),
                    intensity: intensity.trim() || null,
                  })
            }
            className="flex-1 h-12 rounded-md bg-accent/20 border border-accent/50 text-accent text-sm font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/30"
          >
            {ex.completed_at ? "✓ DONE" : "DONE — NEXT >"}
          </button>
        </div>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onSkip(ex)}
          className="mt-2 text-[11px] text-ink-3 hover:text-danger underline-offset-2 font-[family-name:var(--font-mono)] tracking-[0.1em]"
        >
          Skip this
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-row in the "all exercises" list
// ---------------------------------------------------------------------------

function ExerciseRow({
  ex,
  isActive,
  readOnly,
  onSelect,
  onSkip,
  onRemove,
}: {
  ex: SessionExercise;
  isActive: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onSkip: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completed = !!ex.completed_at;
  const loggedSets = (ex.sets ?? []).filter((s) => s.completed_at).length;
  const target = ex.template?.default_sets ?? null;

  const icon = ex.skipped
    ? "✗"
    : completed
    ? "✓"
    : isActive
    ? "▶"
    : "▢";
  const tone = ex.skipped
    ? "text-ink-3"
    : completed
    ? "text-ok"
    : isActive
    ? "text-accent"
    : "text-ink-3";

  function pointerDown() {
    if (readOnly) return;
    longPressTimer.current = setTimeout(() => {
      setMenuOpen(true);
      longPressTimer.current = null;
    }, 500);
  }
  function pointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => {
          if (menuOpen) return;
          onSelect();
        }}
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
        className={`w-full text-left flex items-center gap-3 px-3 py-3 border-b border-ink-2 last:border-b-0 ${
          isActive ? "bg-accent/5" : "hover:bg-ink-2/20"
        } ${ex.skipped ? "opacity-50" : ""}`}
      >
        <span className={`text-base shrink-0 ${tone}`} aria-hidden>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm truncate ${completed ? "text-ink-3" : "text-ink-4"}`}>
            {ex.name}
          </div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
            {target ? `${loggedSets}/${target} sets` : `${loggedSets} sets`}
            {ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ""}
            {ex.save_to_template ? " · → tpl" : ""}
          </div>
        </div>
      </button>
      {menuOpen && !readOnly && (
        <div
          className="absolute right-2 top-2 z-20 bg-ink-1 border border-ink-2 rounded-md shadow-2xl flex"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSkip();
            }}
            className="px-3 py-2 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] text-warn hover:bg-ink-2/30"
          >
            SKIP
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
            className="px-3 py-2 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] text-danger hover:bg-ink-2/30"
          >
            REMOVE
          </button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add ad-hoc exercise modal
// ---------------------------------------------------------------------------

function AddExerciseModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    rest_seconds: number;
    save_to_template: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [rest, setRest] = useState("90");
  const [saveTpl, setSaveTpl] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        rest_seconds: Number(rest) || 90,
        save_to_template: saveTpl,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <h2 className="text-lg italic font-[family-name:var(--font-display)] text-ink-4">
            Add exercise
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-xl leading-none"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Name
            </span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lat pulldown"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Rest (seconds)
            </span>
            <input
              inputMode="numeric"
              type="text"
              value={rest}
              onChange={(e) => setRest(e.target.value.replace(/[^0-9]/g, ""))}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)]"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-4">
            <input
              type="checkbox"
              checked={saveTpl}
              onChange={(e) => setSaveTpl(e.target.checked)}
            />
            Save to template
          </label>
        </div>
        <footer className="px-5 py-4 border-t border-ink-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em]"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={!name.trim() || busy}
            onClick={() => void submit()}
            className="flex-[2] h-12 rounded-md bg-accent/20 border border-accent/50 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40"
          >
            {busy ? "SAVING…" : "ADD"}
          </button>
        </footer>
      </div>
    </div>
  );
}
