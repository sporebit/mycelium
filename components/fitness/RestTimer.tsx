"use client";

import { useEffect, useRef, useState } from "react";

function fmt(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Full-screen rest timer overlay.
 *
 * Driven by a single `endsAt` epoch-ms prop. When `endsAt` is null nothing
 * renders. When set, the overlay covers the viewport with the live countdown.
 * When the timer hits zero we fire haptic + audio feedback, then fade out the
 * overlay and call `onStop` after 200ms so the parent can null out endsAt.
 */
export function RestTimer({
  endsAt,
  exerciseName,
  setNumber,
  totalSets,
  onSkip,
  onStop,
  onAdjust,
}: {
  endsAt: number | null;
  exerciseName?: string;
  setNumber?: number;
  totalSets?: number;
  onSkip: () => void;
  onStop: () => void;
  onAdjust: (deltaSec: number) => void;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const beepDone = useRef<number | null>(null);

  // 1-second ticker while active. The setState happens inside the interval
  // callback, not in the effect body, so it doesn't trip the purity rule.
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining =
    endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = endsAt !== null && remaining === 0;

  // When the timer crosses zero: vibrate, beep, schedule auto-close.
  useEffect(() => {
    if (endsAt === null || !done) return;
    if (beepDone.current === endsAt) return;
    beepDone.current = endsAt;
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(200);
      }
    } catch {
      /* ignored */
    }
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => {});
      }, 180);
    } catch {
      /* respect mute / no audio */
    }
    const t = setTimeout(() => onStop(), 200);
    return () => clearTimeout(t);
  }, [endsAt, done, onStop]);

  if (endsAt === null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rest timer"
      className={`fixed inset-0 z-[80] flex items-center justify-center px-6 py-8 transition-opacity duration-200 backdrop-blur-xl ${
        done ? "opacity-0 bg-ok/20" : "opacity-100 bg-black/95"
      }`}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
        {exerciseName && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)]">
              Resting after
            </span>
            <span className="text-xl text-ink-4 italic font-[family-name:var(--font-display)]">
              {exerciseName}
            </span>
            {setNumber && totalSets ? (
              <span className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
                Set {setNumber} of {totalSets}
              </span>
            ) : null}
          </div>
        )}

        <div
          className={`text-[clamp(6rem,28vw,11rem)] leading-none font-[family-name:var(--font-mono)] tabular-nums ${
            done ? "text-ok" : "text-accent"
          }`}
        >
          {fmt(remaining)}
        </div>

        <div className="flex items-center gap-2 w-full max-w-sm">
          <button
            type="button"
            onClick={() => onAdjust(-15)}
            disabled={done}
            className="flex-1 h-14 rounded-md border border-ink-2 text-ink-4 text-sm font-[family-name:var(--font-mono)] tracking-[0.15em] hover:border-ink-3 disabled:opacity-40"
          >
            −15s
          </button>
          <button
            type="button"
            onClick={() => onAdjust(15)}
            disabled={done}
            className="flex-1 h-14 rounded-md border border-ink-2 text-ink-4 text-sm font-[family-name:var(--font-mono)] tracking-[0.15em] hover:border-ink-3 disabled:opacity-40"
          >
            +15s
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 h-14 rounded-md bg-accent/15 border border-accent/40 text-accent text-sm font-[family-name:var(--font-mono)] tracking-[0.15em] hover:bg-accent/25"
          >
            SKIP
          </button>
        </div>
      </div>
    </div>
  );
}
