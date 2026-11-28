"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MotionLevel } from "@/lib/guides/motion";
import type { PhaseState } from "@/lib/guides/progress";
import { useCountUp } from "./useMotion";

export type ThreadPhase = { id: string; title: string; pct: number; state: PhaseState; done?: number; total?: number; minutes?: number };

/** A point on a cubic Bezier at t (close enough to arc length for a short branch). */
function bez(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The thread (design §3.2.2, brief 12b): a trunk whose drawn length is the
 * overall percentage, one branch per phase rising from it at even spacing,
 * each drawn to its phase's percentage; a finished phase's branch ends in a
 * fruit that draws in once. The open phase's tip pulses softly three times
 * (never under reduced motion). A branch is a button that scrolls to its
 * phase. Drawn in pixels from the measured size, so circles stay round.
 */
export function Thread({
  phases,
  pct,
  minutesLeft,
  level,
  mini = false,
  onBranch,
  className = "",
}: {
  phases: ThreadPhase[];
  pct: number;
  minutesLeft?: number;
  level: MotionLevel;
  mini?: boolean;
  onBranch?: (id: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: mini ? 28 : 72 });
  useIsoLayout(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fruits already on the tree when the page opened do not draw in again.
  const [initiallyDone] = useState(() => new Set(phases.filter((p) => p.state === "done").map((p) => p.id)));

  const shown = useCountUp(pct, level);
  const { w, h } = size;
  const pad = mini ? 4 : 10;
  const trunkY = h - (mini ? 5 : 12);
  const top = mini ? 4 : 10;
  const x0 = pad;
  const x1 = Math.max(x0 + 10, w - pad - (mini ? 0 : 6));
  const n = Math.max(1, phases.length);
  const lean = mini ? 6 : 16;
  const stroke = mini ? 1.5 : 2.5;
  const open = phases.find((p) => p.state === "open");
  const label = `${pct} percent done${typeof minutesLeft === "number" && pct < 100 ? `, about ${minutesLeft} minutes left` : ""}${
    open ? `. Phase ${phases.indexOf(open) + 1} of ${phases.length}${open.total ? `, ${open.done ?? 0} of ${open.total} steps` : ""}${open.minutes ? `, about ${open.minutes} minutes` : ""}` : ""
  }.`;

  return (
    <div className={`flex items-center gap-3 sm:gap-5 ${className}`}>
      <div ref={box} className={`relative min-w-0 flex-1 ${mini ? "h-[28px]" : "h-[56px] sm:h-[72px]"}`}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 overflow-visible" role="group" aria-label={label}>
          {/* the trunk: faint track, then the moss drawn to the overall percentage */}
          <line x1={x0} y1={trunkY} x2={x1} y2={trunkY} className="fg-stroke-line" strokeWidth={stroke} strokeLinecap="round" />
          <line
            x1={x0}
            y1={trunkY}
            x2={x1}
            y2={trunkY}
            className="fg-stroke-moss fg-thread-line"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - pct / 100}
          />
          {phases.map((p, i) => {
            const bx = x0 + ((i + 0.5) * (x1 - x0)) / n;
            const c1y = trunkY - (trunkY - top) * 0.55;
            const c2y = top + (trunkY - top) * 0.15;
            const d = `M ${bx} ${trunkY} C ${bx} ${c1y}, ${bx + lean * 0.4} ${c2y}, ${bx + lean} ${top}`;
            const frac = Math.max(0, Math.min(1, p.pct / 100));
            const tipX = bez(frac, bx, bx, bx + lean * 0.4, bx + lean);
            const tipY = bez(frac, trunkY, c1y, c2y, top);
            const fresh = p.state === "done" && !initiallyDone.has(p.id);
            const words = `Phase ${i + 1} of ${phases.length}: ${p.title}${p.total ? `, ${p.done ?? 0} of ${p.total} steps` : ""}${p.minutes ? `, about ${p.minutes} minutes` : ""}`;
            const body = (
              <>
                <path d={d} className="fg-stroke-line" strokeWidth={stroke} fill="none" strokeLinecap="round" />
                <path
                  d={d}
                  className="fg-stroke-moss fg-thread-line"
                  strokeWidth={stroke}
                  fill="none"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - frac}
                />
                {p.state === "done" && (
                  <circle cx={bx + lean} cy={top} r={mini ? 2.6 : 5} className={`fg-fill-moss ${fresh ? "fg-fruit-in" : ""}`} data-testid={mini ? undefined : `fruit-${p.id}`} />
                )}
                {p.state === "open" && !mini && <circle cx={tipX} cy={tipY} r={3.5} className="fg-fill-moss fg-tip-pulse" />}
                {!mini && <path d={d} stroke="transparent" strokeWidth={18} fill="none" />}
              </>
            );
            if (!onBranch || mini) return <g key={p.id}>{body}</g>;
            return (
              <g
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={words}
                className="fg-branch cursor-pointer"
                onClick={() => onBranch(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onBranch(p.id);
                  }
                }}
              >
                <title>{words}</title>
                {body}
              </g>
            );
          })}
        </svg>
      </div>
      {!mini && (
        <div className="shrink-0 text-right" aria-hidden>
          <div className="fg-mono fg-ink text-[26px] leading-none sm:text-[34px]" data-testid="guide-pct">
            {shown}
            <span className="fg-soft text-[16px] sm:text-[20px]">%</span>
          </div>
          {typeof minutesLeft === "number" && (
            <div className="fg-ui fg-soft mt-1 text-[12px]">
              {pct >= 100 ? "finished" : <>about <span className="fg-mono">{minutesLeft}</span> min left</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
