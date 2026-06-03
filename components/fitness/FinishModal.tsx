"use client";

import { useState } from "react";
import type { SessionDetail, SessionExercise } from "@/lib/fitness/types";
import { toKg } from "@/lib/fitness/units";
import { triggerGlowPulse } from "@/lib/motion";

function fmtMin(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0) return `${h}h ${r}m`;
  return `${m}m`;
}

export function FinishModal({
  session,
  onClose,
  onConfirm,
}: {
  session: SessionDetail;
  onClose: () => void;
  onConfirm: (args: {
    calories: number | null;
    notes: string | null;
    apply_template_updates: boolean;
    save_as_workout?: boolean;
    workout_name?: string;
  }) => Promise<void>;
}) {
  const [calories, setCalories] = useState<string>(
    session.calories != null ? String(session.calories) : ""
  );
  const [notes, setNotes] = useState<string>(session.notes ?? "");
  const saveToTemplate = session.exercises.filter((e) => e.save_to_template);
  const [applyTpl, setApplyTpl] = useState<boolean>(saveToTemplate.length > 0);
  const isBlankSession = !session.programme_session_id;
  const hasExercises = session.exercises.filter((e) => !e.skipped).length > 0;
  const [saveAsWorkout, setSaveAsWorkout] = useState(false);
  const [workoutName, setWorkoutName] = useState(session.name ?? "");
  const [busy, setBusy] = useState(false);

  let totalSets = 0;
  let totalVolKg = 0;
  for (const ex of session.exercises) {
    for (const s of ex.sets ?? []) {
      if (!s.completed_at) continue;
      totalSets++;
      if (s.weight != null && s.reps != null) {
        totalVolKg += toKg(s.weight, (s.unit ?? "kg") as never) * s.reps;
      }
    }
  }

  const startedAt = session.started_at ? new Date(session.started_at) : null;
  // Capture "now" once when the modal opens so the displayed total time is stable.
  const [openedAt] = useState<number>(() => Date.now());
  const elapsedMs = startedAt ? openedAt - startedAt.getTime() : 0;

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const cal = calories.trim() === "" ? null : Number(calories);
      await onConfirm({
        calories: Number.isFinite(cal) ? (cal as number) : null,
        notes: notes.trim() === "" ? null : notes.trim(),
        apply_template_updates: applyTpl,
        save_as_workout: saveAsWorkout,
        workout_name: workoutName.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="growth-in w-full sm:max-w-md bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <h2 className="text-lg italic font-[family-name:var(--font-display)] text-ink-4">
            Finish session
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-xl leading-none"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Sets" value={String(totalSets)} />
            <Stat label="Time" value={startedAt ? fmtMin(elapsedMs) : "—"} />
            <Stat label="Volume" value={`${totalVolKg.toFixed(0)} kg`} />
          </dl>

          {saveToTemplate.length > 0 && (
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-md border border-accent/40 bg-accent/10">
              <input
                type="checkbox"
                checked={applyTpl}
                onChange={(e) => setApplyTpl(e.target.checked)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-4">
                  Save changes to template ({saveToTemplate.length})
                </div>
                <ul className="text-[11px] text-ink-3 mt-1 font-[family-name:var(--font-mono)] tracking-[0.08em]">
                  {saveToTemplate.map((e: SessionExercise) => (
                    <li key={e.id} className="truncate">
                      · {e.name}
                    </li>
                  ))}
                </ul>
              </div>
            </label>
          )}

          {isBlankSession && hasExercises && (
            <div className="flex flex-col gap-2 p-3 rounded-md border border-ink-2 bg-ink-0/40">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsWorkout}
                  onChange={(e) => setSaveAsWorkout(e.target.checked)}
                />
                <span className="text-sm text-ink-4">Save as reusable workout</span>
              </label>
              {saveAsWorkout && (
                <input
                  type="text"
                  value={workoutName}
                  onChange={(e) => setWorkoutName(e.target.value)}
                  placeholder="Workout name"
                  className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)]"
                />
              )}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Calories (optional)
            </span>
            <input
              inputMode="numeric"
              value={calories}
              onChange={(e) => setCalories(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="—"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)]"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              How did it feel?
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 resize-none"
            />
          </label>
        </div>
        <footer className="px-5 py-4 border-t border-ink-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] hover:text-ink-4"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              triggerGlowPulse(e.currentTarget);
              void submit();
            }}
            className="flex-[2] h-12 rounded-md bg-ok/15 border border-ok/40 text-ok text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-ok/25 disabled:opacity-50"
          >
            {busy ? "SAVING…" : "SAVE & FINISH"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded-md border border-ink-2 bg-ink-0/40">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      <span className="text-base font-[family-name:var(--font-mono)] text-ink-4 tabular-nums">
        {value}
      </span>
    </div>
  );
}
