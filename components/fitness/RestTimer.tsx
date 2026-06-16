"use client";

import { useEffect, useRef, useState } from "react";

function fmt(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function ProgressRing({
  progress,
  size = 28,
}: {
  progress: number;
  size?: number;
}) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, progress)));
  return (
    <svg width={size} height={size} className="rotate-[-90deg] shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--ink-2, #333)"
        strokeWidth="2.5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#84f5b8"
        strokeWidth="2.5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
}

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
  const [isMinimised, setIsMinimised] = useState(false);
  const [totalDur, setTotalDur] = useState(0);
  const beepDone = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevEndsAtRef = useRef<number | null>(null);

  // Detect timer start / adjustment / stop transitions.
  // Refs are only accessed inside effects (not during render).
  useEffect(() => {
    const wasNull = prevEndsAtRef.current === null;
    prevEndsAtRef.current = endsAt;

    if (endsAt === null) return;
    if (wasNull) {
      setIsMinimised(false);
      setTotalDur(Math.max(1, Math.ceil((endsAt - Date.now()) / 1000)));
    } else {
      setTotalDur((prev) => {
        const r = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        return r > prev ? r : prev;
      });
    }
  }, [endsAt]);

  // Create AudioContext on timer start (within user-gesture activation window)
  useEffect(() => {
    if (endsAt === null) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new (
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        )();
      } else if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    } catch {
      /* no audio support */
    }
  }, [endsAt]);

  // 1-second ticker while active
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining =
    endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = endsAt !== null && remaining === 0;
  const progress =
    totalDur > 0 ? Math.min(1, Math.max(0, 1 - remaining / totalDur)) : 0;

  // When the timer crosses zero: chime, vibrate, schedule auto-close.
  useEffect(() => {
    if (endsAt === null || !done) return;
    if (beepDone.current === endsAt) return;
    beepDone.current = endsAt;

    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {
      /* ignored */
    }

    try {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        const playTone = (
          freq: number,
          startTime: number,
          dur: number,
        ) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          gain.gain.value = 0.08;
          osc.start(startTime);
          osc.stop(startTime + dur);
        };
        const t = ctx.currentTime;
        playTone(880, t, 0.15);
        playTone(1100, t + 0.2, 0.15);
      }
    } catch {
      /* respect mute / no audio */
    }

    const t = setTimeout(() => onStop(), 200);
    return () => clearTimeout(t);
  }, [endsAt, done, onStop]);

  if (endsAt === null) return null;

  /* ── Compact bottom bar ───────────────────────────────────── */

  if (isMinimised) {
    return (
      <div
        role="timer"
        aria-label="Rest timer"
        className={`fixed bottom-0 left-0 right-0 z-[80] flex items-center gap-3 px-4 py-2.5 bg-ink-1 border-t border-ink-2 transition-opacity duration-200 ${
          done ? "opacity-0" : "opacity-100"
        }`}
      >
        <ProgressRing progress={progress} />
        <span
          className={`text-lg font-[family-name:var(--font-mono)] tabular-nums ${
            done ? "text-ok" : "text-[#84f5b8]"
          }`}
        >
          {fmt(remaining)}
        </span>
        {exerciseName ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] truncate flex-1 min-w-0">
            {exerciseName}
            {setNumber && totalSets ? ` · ${setNumber}/${totalSets}` : ""}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={onSkip}
          className="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-accent hover:bg-accent/15 transition-colors"
        >
          SKIP
        </button>
        <button
          type="button"
          onClick={() => setIsMinimised(false)}
          className="h-8 w-8 rounded-full flex items-center justify-center text-ink-3 hover:text-ink-4 hover:bg-ink-2/40 transition-colors shrink-0"
          aria-label="Expand timer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 10l4-4 4 4" />
          </svg>
        </button>
      </div>
    );
  }

  /* ── Full-screen overlay ──────────────────────────────────── */

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rest timer"
      className={`fixed inset-0 z-[80] flex items-center justify-center px-6 py-8 transition-opacity duration-200 backdrop-blur-xl ${
        done ? "opacity-0 bg-ok/20" : "opacity-100 bg-black/95"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsMinimised(true)}
        className="absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center text-ink-3 hover:text-ink-4 hover:bg-white/10 transition-colors"
        aria-label="Minimise timer"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

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
