"use client";

import { useState } from "react";
import {
  FEEL_OPTIONS,
  PAIN_REGION_OPTIONS,
  feelRatingNeedsSeverity,
} from "@/lib/fitness/pain";
import { triggerGlowPulse } from "@/lib/motion";
import type {
  ExerciseBaseline,
  ExercisePainLog,
  FeelRating,
} from "@/lib/fitness/types";

export function PainLogModal({
  exerciseName,
  sessionExerciseId,
  baseline,
  existing,
  onClose,
  onSaved,
}: {
  exerciseName: string;
  sessionExerciseId: string;
  baseline: ExerciseBaseline | null;
  /** Existing log to edit (null when creating new). */
  existing: ExercisePainLog | null;
  onClose: () => void;
  onSaved: (log: ExercisePainLog) => void;
}) {
  const [feel, setFeel] = useState<FeelRating | null>(
    existing?.feel_rating ?? null
  );
  const [severity, setSeverity] = useState<number | null>(
    existing?.severity ?? null
  );
  const [regions, setRegions] = useState<string[]>(
    existing?.pain_regions ?? baseline?.pain_regions ?? []
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showSeverity = feelRatingNeedsSeverity(feel);

  function toggleRegion(key: string) {
    setRegions((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  }

  async function submit() {
    if (busy) return;
    if (!feel) {
      setError("Pick a feel rating");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/fitness/pain-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_exercise_id: sessionExerciseId,
          feel_rating: feel,
          severity: showSeverity ? severity : null,
          pain_regions: regions.length > 0 ? regions : null,
          notes: notes.trim() || null,
        }),
      });
      if (!r.ok) {
        setError("Save failed");
        return;
      }
      const j = (await r.json()) as { pain_log: ExercisePainLog };
      onSaved(j.pain_log);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[65] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="growth-in w-full sm:max-w-md bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <div>
            <h2 className="text-lg italic font-[family-name:var(--font-display)] text-ink-4">
              How does it feel?
            </h2>
            <p className="text-[11px] text-ink-3 mt-0.5 truncate">
              {exerciseName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-xl leading-none"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          {/* Feel rating chips */}
          <div className="flex flex-wrap gap-1.5">
            {FEEL_OPTIONS.map((o) => {
              const active = feel === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={(e) => {
                    triggerGlowPulse(e.currentTarget);
                    setFeel(o.value);
                  }}
                  className={`px-2.5 py-2 rounded-md border text-xs font-[family-name:var(--font-mono)] tracking-[0.1em] flex items-center gap-1.5 transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-ink-2 text-ink-4 hover:border-ink-3"
                  }`}
                >
                  <span aria-hidden>{o.emoji}</span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>

          {/* Severity slider when relevant */}
          {showSeverity && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] flex items-center justify-between">
                <span>Severity (0–10)</span>
                <span className="text-ink-4">{severity ?? "—"}</span>
              </span>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={severity ?? 0}
                onChange={(e) => setSeverity(Number(e.target.value))}
                className="w-full accent-[var(--glow-0)]"
              />
            </label>
          )}

          {/* Region multi-select */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Region(s)
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
              {PAIN_REGION_OPTIONS.map((opt) => {
                const active = regions.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleRegion(opt.key)}
                    className={`px-2.5 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.1em] transition-colors ${
                      active
                        ? "border-warn/50 bg-warn/15 text-warn"
                        : "border-ink-2 text-ink-4 hover:border-ink-3"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Notes
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context…"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 resize-none"
            />
          </label>

          {error && (
            <p className="text-xs text-danger font-[family-name:var(--font-mono)]">
              {error}
            </p>
          )}
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
            disabled={busy || !feel}
            onClick={(e) => {
              triggerGlowPulse(e.currentTarget);
              void submit();
            }}
            className="flex-[2] h-12 rounded-md bg-accent/20 border border-accent/50 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40"
          >
            {busy ? "SAVING…" : "SAVE"}
          </button>
        </footer>
      </div>
    </div>
  );
}
