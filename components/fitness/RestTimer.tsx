"use client";

import { useEffect, useRef, useState } from "react";

function fmt(s: number): string {
  const m = Math.floor(Math.max(0, s) / 60);
  const r = Math.max(0, s) % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Floating bottom-of-viewport rest timer.
 *
 * Drives off a single `endsAt` epoch-ms prop so adjust/skip can be done by
 * mutating that prop without state-syncing effects. When `endsAt` is null the
 * component renders nothing.
 */
export function RestTimer({
  endsAt,
  onSkip,
  onStop,
  onAdjust,
}: {
  endsAt: number | null;
  onSkip: () => void;
  onStop: () => void;
  onAdjust: (deltaSec: number) => void;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const beepDone = useRef<number | null>(null);

  // Tick 1×/s while active. Updating `now` from setInterval keeps the render
  // pure (it reads state, not Date.now()).
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  // Beep + auto-stop when the timer crosses zero
  useEffect(() => {
    if (endsAt === null) return;
    if (beepDone.current === endsAt) return;
    const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
    if (remaining > 0) return;
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
    const t = setTimeout(() => onStop(), 3000);
    return () => clearTimeout(t);
  });

  if (endsAt === null) return null;

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const done = remaining === 0;

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-xl px-4 py-3 flex items-center gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.4)] transition-colors ${
        done ? "border-ok bg-ok/30" : "border-ink-2 bg-ink-1/95"
      }`}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
        REST
      </div>
      <div className="text-3xl font-[family-name:var(--font-mono)] tabular-nums text-ink-4 shrink-0">
        {fmt(remaining)}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => onAdjust(-15)}
        className="h-10 px-3 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4 hover:border-ink-3"
      >
        −15s
      </button>
      <button
        type="button"
        onClick={() => onAdjust(15)}
        className="h-10 px-3 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4 hover:border-ink-3"
      >
        +15s
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="h-10 px-3 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4 hover:border-ink-3"
      >
        SKIP
      </button>
      <button
        type="button"
        onClick={onStop}
        className="h-10 px-3 rounded-md bg-danger/15 border border-danger/40 text-danger text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:bg-danger/25"
      >
        STOP
      </button>
    </div>
  );
}
