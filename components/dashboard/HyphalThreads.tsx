"use client";

/**
 * Hyphal threadlines V3 — dendritic, non-crossing growth.
 *
 * Phase 1 (on mount, 0–4s): all main threads + first-pass branches are
 * generated deterministically (mulberry32 seeded with 42) and rendered
 * via React, each animating its stroke-dashoffset from totalLength → 0
 * with a per-thread delay 0–800ms.
 *
 * Phase 2 (after Phase 1, indefinite): every 8–15s a new spur extends
 * from a random point along an existing thread. Phase 2 paths are
 * appended directly to the <g> element via DOM mutation (not React) to
 * avoid re-rendering the full network on every spur.
 *
 * Anastomosis: when a growing spur's endpoint lands within 15 viewBox
 * units of an existing segment, it terminates with a small fusion node
 * (r=1.5, same stroke, opacity 0.4) instead of continuing.
 *
 * prefers-reduced-motion: Phase 1 still runs (drawn instantly via the
 * CSS override) but Phase 2 is skipped entirely.
 */

import { useEffect, useRef } from "react";

type Pt = { x: number; y: number };
type Bezier = {
  a: Pt;
  b: Pt;
  c: Pt;
  d: Pt;
  width: number;
};
type LineSeg = { p1: Pt; p2: Pt };
type Thread = {
  beziers: Bezier[];
  cumLength: number[];
  totalLength: number;
};

const VIEW_W = 1600;
const VIEW_H = 1200;
const SEED = 42;
const MAIN_COUNT = 25;
const MAX_TOTAL_SEGMENTS = 800;
const WANDERER_CHANCE = 0.3;

const NUTRIENT_SOURCES: Pt[] = [
  { x: 0.3 * VIEW_W, y: 0.3 * VIEW_H },
  { x: 0.75 * VIEW_W, y: 0.3 * VIEW_H },
  { x: 0.25 * VIEW_W, y: 0.65 * VIEW_H },
  { x: 0.5 * VIEW_W, y: 0.65 * VIEW_H },
  { x: 0.78 * VIEW_W, y: 0.65 * VIEW_H },
  { x: 0.45 * VIEW_W, y: 0.9 * VIEW_H },
];

function mulberry32(seed: number): () => number {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ccw(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function shortestAngleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function nearestAnchor(p: Pt): Pt {
  let best = NUTRIENT_SOURCES[0];
  let bestDist = Infinity;
  for (const a of NUTRIENT_SOURCES) {
    const dx = a.x - p.x;
    const dy = a.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

function pickEdgeOrigin(rng: () => number): { pos: Pt; initialAngle: number } {
  const edge = Math.floor(rng() * 4);
  if (edge === 0) {
    return {
      pos: { x: rng() * VIEW_W, y: -10 + rng() * 30 },
      initialAngle: Math.PI / 2,
    };
  }
  if (edge === 1) {
    return {
      pos: { x: VIEW_W + 10 - rng() * 30, y: rng() * VIEW_H },
      initialAngle: Math.PI,
    };
  }
  if (edge === 2) {
    return {
      pos: { x: rng() * VIEW_W, y: VIEW_H + 10 - rng() * 30 },
      initialAngle: -Math.PI / 2,
    };
  }
  return {
    pos: { x: -10 + rng() * 30, y: rng() * VIEW_H },
    initialAngle: 0,
  };
}

const DEG = Math.PI / 180;
const BACKOFF_OFFSETS = [0, 25 * DEG, -25 * DEG, 50 * DEG, -50 * DEG];

function growThread(opts: {
  rng: () => number;
  segIndex: LineSeg[];
  origin: Pt;
  initialAngle: number;
  target: Pt | null;
  stopRadius: number;
  segCount: number;
  segLen: number;
  baseWidth: number;
  tipWidth: number;
  fusionRadius?: number;
}): { thread: Thread; fused: Pt | null } {
  const rng = opts.rng;
  const beziers: Bezier[] = [];
  let pos = opts.origin;
  let angle = opts.initialAngle;
  let prevLineSeg: LineSeg | null = null;
  let fused: Pt | null = null;

  for (let i = 0; i < opts.segCount; i++) {
    if (opts.segIndex.length >= MAX_TOTAL_SEGMENTS) break;

    let desiredAngle = angle;
    if (opts.target) {
      const tgtAngle = Math.atan2(
        opts.target.y - pos.y,
        opts.target.x - pos.x
      );
      desiredAngle = angle + shortestAngleDelta(angle, tgtAngle) * 0.3;
    }
    desiredAngle += (rng() - 0.5) * 20 * DEG;
    const turn = clamp(
      shortestAngleDelta(angle, desiredAngle),
      -15 * DEG,
      15 * DEG
    );
    const desiredFinal = angle + turn;
    const segLen = opts.segLen * (0.85 + rng() * 0.3);

    let placed = false;
    for (const off of BACKOFF_OFFSETS) {
      const tryAngle = desiredFinal + off;
      const end: Pt = {
        x: pos.x + Math.cos(tryAngle) * segLen,
        y: pos.y + Math.sin(tryAngle) * segLen,
      };

      let crosses = false;
      for (const s of opts.segIndex) {
        if (prevLineSeg && s === prevLineSeg) continue;
        if (segmentsCross(pos, end, s.p1, s.p2)) {
          crosses = true;
          break;
        }
      }
      if (crosses) continue;

      const cp1: Pt = {
        x: pos.x + Math.cos(angle) * segLen * 0.35,
        y: pos.y + Math.sin(angle) * segLen * 0.35,
      };
      const cp2: Pt = {
        x: end.x - Math.cos(tryAngle) * segLen * 0.35,
        y: end.y - Math.sin(tryAngle) * segLen * 0.35,
      };

      const tMid = (i + 0.5) / opts.segCount;
      const width = opts.baseWidth + (opts.tipWidth - opts.baseWidth) * tMid;

      const bez: Bezier = { a: pos, b: cp1, c: cp2, d: end, width };
      beziers.push(bez);
      const lineSeg: LineSeg = { p1: pos, p2: end };
      opts.segIndex.push(lineSeg);
      prevLineSeg = lineSeg;

      pos = end;
      angle = tryAngle;
      placed = true;
      break;
    }
    if (!placed) break;

    // Anastomosis check — if our tip is close enough to an existing
    // segment endpoint we stop and mark the fusion point.
    if (opts.fusionRadius && opts.fusionRadius > 0) {
      let near: Pt | null = null;
      let nearD = opts.fusionRadius * opts.fusionRadius;
      for (let k = 0; k < opts.segIndex.length - 1; k++) {
        const s = opts.segIndex[k];
        const dx1 = pos.x - s.p2.x;
        const dy1 = pos.y - s.p2.y;
        const d1 = dx1 * dx1 + dy1 * dy1;
        if (d1 < nearD) {
          nearD = d1;
          near = s.p2;
        }
      }
      if (near) {
        fused = near;
        break;
      }
    }

    if (opts.target && opts.stopRadius > 0) {
      const dx = pos.x - opts.target.x;
      const dy = pos.y - opts.target.y;
      if (Math.hypot(dx, dy) < opts.stopRadius) break;
    }
  }

  let acc = 0;
  const cumLength: number[] = [];
  for (const b of beziers) {
    acc += Math.hypot(b.d.x - b.a.x, b.d.y - b.a.y);
    cumLength.push(acc);
  }

  return { thread: { beziers, cumLength, totalLength: acc }, fused };
}

function pickBranchPoint(
  thread: Thread,
  t: number
): { pos: Pt; tangentAngle: number; widthHere: number } {
  const target = t * thread.totalLength;
  let idx = thread.cumLength.length - 1;
  for (let i = 0; i < thread.cumLength.length; i++) {
    if (thread.cumLength[i] >= target) {
      idx = i;
      break;
    }
  }
  const seg = thread.beziers[idx];
  const prevCum = idx > 0 ? thread.cumLength[idx - 1] : 0;
  const segLen = thread.cumLength[idx] - prevCum;
  const localT = segLen > 0 ? (target - prevCum) / segLen : 0;
  const pos: Pt = {
    x: seg.a.x + (seg.d.x - seg.a.x) * localT,
    y: seg.a.y + (seg.d.y - seg.a.y) * localT,
  };
  const tangentAngle = Math.atan2(seg.d.y - seg.a.y, seg.d.x - seg.a.x);
  return { pos, tangentAngle, widthHere: seg.width };
}

type RenderSeg = { d: string; width: number; length: number; delay: number };

function pathOf(b: Bezier): string {
  const f = (n: number) => n.toFixed(1);
  return `M ${f(b.a.x)} ${f(b.a.y)} C ${f(b.b.x)} ${f(b.b.y)}, ${f(b.c.x)} ${f(b.c.y)}, ${f(b.d.x)} ${f(b.d.y)}`;
}

/** Bezier arc length via Gauss–Legendre — sufficient accuracy for the
 *  ~60-point dasharray we use for stroke draw-on. We approximate with
 *  the straight chord length (the geometry rarely curves enough to need
 *  more, and dasharray only needs to be slightly larger than the actual
 *  length for the animation to land at 0). */
function approxBezierLength(b: Bezier): number {
  return Math.hypot(b.d.x - b.a.x, b.d.y - b.a.y) * 1.15;
}

/** Initial network generation — runs once at module load. Returns the
 *  Phase 1 render segments plus the threads + segment index needed to
 *  seed Phase 2 in the browser. */
function generateInitialNetwork(): {
  segs: RenderSeg[];
  threads: Thread[];
  segIndex: LineSeg[];
} {
  const rng = mulberry32(SEED);
  const phaseRng = mulberry32(SEED);
  const segIndex: LineSeg[] = [];
  const out: RenderSeg[] = [];
  const threads: Thread[] = [];

  const pushThread = (t: Thread, baseDelay: number) => {
    threads.push(t);
    for (const b of t.beziers) {
      out.push({
        d: pathOf(b),
        width: b.width,
        length: approxBezierLength(b),
        delay: baseDelay,
      });
    }
  };

  const mains: Thread[] = [];
  for (let i = 0; i < MAIN_COUNT; i++) {
    if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
    const { pos: origin, initialAngle: edgeAngle } = pickEdgeOrigin(rng);
    const wanderer = rng() < WANDERER_CHANCE;
    const target = wanderer ? null : nearestAnchor(origin);
    const stopRadius = target ? (0.08 + rng() * 0.04) * VIEW_W : 0;
    const segCount = 8 + Math.floor(rng() * 8);
    const initialAngle = edgeAngle + (rng() - 0.5) * 30 * DEG;
    const { thread: main } = growThread({
      rng,
      segIndex,
      origin,
      initialAngle,
      target,
      stopRadius,
      segCount,
      segLen: 60 + rng() * 30,
      baseWidth: 1.4,
      tipWidth: 0.3,
    });
    if (main.beziers.length > 0) {
      mains.push(main);
      pushThread(main, phaseRng() * 800);
    }
  }

  for (const main of mains) {
    if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
    const nBranches = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < nBranches; i++) {
      if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
      const t = 0.3 + rng() * 0.4;
      const bp = pickBranchPoint(main, t);
      const sign = rng() < 0.5 ? -1 : 1;
      const offsetAngle = sign * (20 + rng() * 20) * DEG;
      const { thread: branch } = growThread({
        rng,
        segIndex,
        origin: bp.pos,
        initialAngle: bp.tangentAngle + offsetAngle,
        target: null,
        stopRadius: 0,
        segCount: 4 + Math.floor(rng() * 5),
        segLen: 32 + rng() * 18,
        baseWidth: bp.widthHere,
        tipWidth: 0.3,
      });
      if (branch.beziers.length === 0) continue;
      pushThread(branch, phaseRng() * 800);

      const nSpurs = 1 + Math.floor(rng() * 2);
      for (let j = 0; j < nSpurs; j++) {
        if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
        if (branch.beziers.length < 2) break;
        const st = 0.3 + rng() * 0.4;
        const sp = pickBranchPoint(branch, st);
        const ssign = rng() < 0.5 ? -1 : 1;
        const soff = ssign * (25 + rng() * 15) * DEG;
        const { thread: spur } = growThread({
          rng,
          segIndex,
          origin: sp.pos,
          initialAngle: sp.tangentAngle + soff,
          target: null,
          stopRadius: 0,
          segCount: 2 + Math.floor(rng() * 3),
          segLen: 22 + rng() * 14,
          baseWidth: sp.widthHere,
          tipWidth: 0.3,
        });
        if (spur.beziers.length > 0) pushThread(spur, phaseRng() * 800);
      }
    }
  }

  return { segs: out, threads, segIndex };
}

const INITIAL = generateInitialNetwork();

const SVG_NS = "http://www.w3.org/2000/svg";
const FUSION_RADIUS = 15;

function appendBezier(
  g: SVGGElement,
  bez: Bezier,
  growthMs: number
): void {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathOf(bez));
  path.setAttribute("stroke-width", bez.width.toFixed(2));
  const len = approxBezierLength(bez);
  path.setAttribute("stroke-dasharray", `${len.toFixed(1)} ${len.toFixed(1)}`);
  path.setAttribute("stroke-dashoffset", len.toFixed(1));
  path.style.animation = `hypha-grow ${(growthMs / 1000).toFixed(2)}s ease-out forwards`;
  g.appendChild(path);
}

function appendFusionNode(g: SVGGElement, p: Pt): void {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", p.x.toFixed(1));
  c.setAttribute("cy", p.y.toFixed(1));
  c.setAttribute("r", "1.5");
  c.setAttribute("fill", "none");
  c.setAttribute("stroke", "var(--hyphal-stroke)");
  c.setAttribute("opacity", "0.4");
  g.appendChild(c);
}

export function HyphalThreads() {
  const gRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const g = gRef.current;
    if (!g) return;

    // Live state shared with the browser PRNG for Phase 2 growth. We
    // seed the runtime RNG with a different value so we don't repeat
    // the Phase 1 sequence, and we mutate `segIndex` in place so each
    // new spur sees the full network for collision detection.
    const rng = mulberry32(SEED + 1);
    const segIndex: LineSeg[] = INITIAL.segIndex.slice();
    const threads: Thread[] = INITIAL.threads.slice();
    let cancelled = false;
    let timeoutId: number | null = null;

    function pickThread(): Thread | null {
      const candidates = threads.filter((t) => t.beziers.length >= 2);
      if (candidates.length === 0) return null;
      return candidates[Math.floor(rng() * candidates.length)];
    }

    function growOneSpur() {
      if (cancelled) return;
      if (segIndex.length >= MAX_TOTAL_SEGMENTS) return;
      const parent = pickThread();
      if (!parent || !gRef.current) {
        schedule();
        return;
      }
      const t = 0.2 + rng() * 0.6;
      const bp = pickBranchPoint(parent, t);
      const sign = rng() < 0.5 ? -1 : 1;
      const offset = sign * (20 + rng() * 25) * DEG;
      const segCount = 3 + Math.floor(rng() * 4);
      const { thread: spur, fused } = growThread({
        rng,
        segIndex,
        origin: bp.pos,
        initialAngle: bp.tangentAngle + offset,
        target: null,
        stopRadius: 0,
        segCount,
        segLen: 24 + rng() * 16,
        baseWidth: Math.max(0.4, bp.widthHere * 0.8),
        tipWidth: 0.2,
        fusionRadius: FUSION_RADIUS,
      });

      if (spur.beziers.length > 0) {
        threads.push(spur);
        const perSeg = 600 + rng() * 400; // 600–1000ms per segment ~ total 3–5s for 5 segs
        spur.beziers.forEach((b, i) => {
          window.setTimeout(() => {
            if (cancelled || !gRef.current) return;
            appendBezier(gRef.current, b, perSeg);
          }, i * perSeg);
        });
        if (fused && gRef.current) {
          window.setTimeout(() => {
            if (cancelled || !gRef.current) return;
            appendFusionNode(gRef.current, fused);
          }, spur.beziers.length * perSeg);
        }
      }

      schedule();
    }

    function schedule() {
      if (cancelled) return;
      const wait = 8000 + rng() * 7000; // 8–15s
      timeoutId = window.setTimeout(growOneSpur, wait);
    }

    // Don't start Phase 2 until the initial draw has settled.
    timeoutId = window.setTimeout(() => {
      schedule();
    }, 4500);

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g
          ref={gRef}
          fill="none"
          stroke="var(--hyphal-stroke)"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {INITIAL.segs.map((s, i) => (
            <path
              key={i}
              d={s.d}
              strokeWidth={s.width.toFixed(2)}
              strokeDasharray={`${s.length.toFixed(1)} ${s.length.toFixed(1)}`}
              strokeDashoffset={s.length.toFixed(1)}
              className="hypha-grow"
              style={{ animationDelay: `${s.delay.toFixed(0)}ms` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
