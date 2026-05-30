"use client";

/**
 * Hyphal threadlines V4 — canvas rendering.
 *
 * The previous SVG + stroke-dashoffset CSS animation never fired in
 * production. Canvas + requestAnimationFrame is the fix.
 *
 * Geometry is deterministic via mulberry32(42) so reload looks the
 * same: 25 main hyphae from viewport edges curving toward nutrient
 * anchors (which approximate the home-dashboard card positions),
 * each with 2–4 branches and 1–2 spurs, dendritic curvature, no
 * crossings, continuous taper from 1.4 → 0.3 px.
 *
 * Phase 1 (0–4s+stagger): each thread reveals progressively along
 * its arc length with an ease-out curve. Stagger thread i by 30·i ms.
 * Phase 2 (after Phase 1 settles): every 8–15s a new spur grows from
 * a random point on the existing network. Anastomosis: if a spur's
 * tip lands within 15 px of an existing point, the spur terminates
 * and a small fusion node renders at the fusion site.
 *
 * prefers-reduced-motion: Phase 1 still runs (otherwise the network
 * is invisible on first paint); Phase 2 is skipped.
 */

import { useEffect, useRef } from "react";

type Pt = { x: number; y: number };
type Bez = { a: Pt; b: Pt; c: Pt; d: Pt; width: number; length: number };
type LineSeg = { p1: Pt; p2: Pt };
type Thread = {
  beziers: Bez[];
  totalLength: number;
  /** ms after `spawnedAt` before drawing begins. */
  startDelay: number;
  /** ms from start to fully drawn. */
  duration: number;
  /** performance.now() when this thread entered the world. */
  spawnedAt: number;
  /** If anastomosis terminated this spur, the fusion point; drawn
   *  once the thread is fully revealed. */
  fusionPoint: Pt | null;
};

const SEED = 42;
const MAIN_COUNT = 25;
const MAX_TOTAL_SEGMENTS = 800;
const WANDERER_CHANCE = 0.3;

const PHASE1_DURATION = 4000;
const PHASE1_STAGGER_PER_THREAD = 30;
const PHASE2_START_OFFSET = 4500;
const SPUR_INTERVAL_MIN = 8000;
const SPUR_INTERVAL_MAX = 15000;
const SPUR_DURATION_MIN = 3000;
const SPUR_DURATION_MAX = 4000;
const FUSION_RADIUS = 15;

const DEG = Math.PI / 180;
const BACKOFF_OFFSETS = [0, 25 * DEG, -25 * DEG, 50 * DEG, -50 * DEG];

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

/** Polyline chord-length approximation of a cubic bezier. Cheap, and
 *  more than adequate for the per-thread length book-keeping we use
 *  to pick branch points and drive progressive draw. */
function approxBezierLength(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const N = 5;
  let prevX = a.x;
  let prevY = a.y;
  let total = 0;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const mt = 1 - t;
    const x =
      mt * mt * mt * a.x +
      3 * mt * mt * t * b.x +
      3 * mt * t * t * c.x +
      t * t * t * d.x;
    const y =
      mt * mt * mt * a.y +
      3 * mt * mt * t * b.y +
      3 * mt * t * t * c.y +
      t * t * t * d.y;
    total += Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  return total;
}

/** De Casteljau split — return control points for the first half of
 *  `bez` (parameter range 0..t). Used to render a partial bezier
 *  during progressive draw without sampling N polyline segments. */
function splitBezierAt(
  bez: Bez,
  t: number,
): { b: Pt; c: Pt; d: Pt } {
  const lerp = (p: Pt, q: Pt) => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
  });
  const p01 = lerp(bez.a, bez.b);
  const p12 = lerp(bez.b, bez.c);
  const p23 = lerp(bez.c, bez.d);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const p0123 = lerp(p012, p123);
  return { b: p01, c: p012, d: p0123 };
}

function nearestAnchor(p: Pt, anchors: Pt[]): Pt {
  let best = anchors[0];
  let bestDist = Infinity;
  for (const a of anchors) {
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

function pickEdgeOrigin(
  rng: () => number,
  W: number,
  H: number,
): { pos: Pt; initialAngle: number } {
  const edge = Math.floor(rng() * 4);
  if (edge === 0) {
    return {
      pos: { x: rng() * W, y: -10 + rng() * 30 },
      initialAngle: Math.PI / 2,
    };
  }
  if (edge === 1) {
    return {
      pos: { x: W + 10 - rng() * 30, y: rng() * H },
      initialAngle: Math.PI,
    };
  }
  if (edge === 2) {
    return {
      pos: { x: rng() * W, y: H + 10 - rng() * 30 },
      initialAngle: -Math.PI / 2,
    };
  }
  return {
    pos: { x: -10 + rng() * 30, y: rng() * H },
    initialAngle: 0,
  };
}

type GrowOpts = {
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
};

function growThread(opts: GrowOpts): { beziers: Bez[]; fused: Pt | null } {
  const beziers: Bez[] = [];
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
        opts.target.x - pos.x,
      );
      desiredAngle = angle + shortestAngleDelta(angle, tgtAngle) * 0.3;
    }
    desiredAngle += (opts.rng() - 0.5) * 20 * DEG;
    const turn = clamp(
      shortestAngleDelta(angle, desiredAngle),
      -15 * DEG,
      15 * DEG,
    );
    const desiredFinal = angle + turn;
    const segLen = opts.segLen * (0.85 + opts.rng() * 0.3);

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
      const width =
        opts.baseWidth + (opts.tipWidth - opts.baseWidth) * tMid;
      const length = approxBezierLength(pos, cp1, cp2, end);

      beziers.push({ a: pos, b: cp1, c: cp2, d: end, width, length });
      const lineSeg: LineSeg = { p1: pos, p2: end };
      opts.segIndex.push(lineSeg);
      prevLineSeg = lineSeg;

      pos = end;
      angle = tryAngle;
      placed = true;
      break;
    }
    if (!placed) break;

    if (opts.fusionRadius && opts.fusionRadius > 0) {
      let nearD = opts.fusionRadius * opts.fusionRadius;
      let near: Pt | null = null;
      for (let k = 0; k < opts.segIndex.length - 1; k++) {
        const s = opts.segIndex[k];
        const dx = pos.x - s.p2.x;
        const dy = pos.y - s.p2.y;
        const d = dx * dx + dy * dy;
        if (d < nearD) {
          nearD = d;
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

  return { beziers, fused };
}

function computeCumLengths(beziers: Bez[]): {
  cumLengths: number[];
  total: number;
} {
  const cumLengths: number[] = [];
  let total = 0;
  for (const b of beziers) {
    total += b.length;
    cumLengths.push(total);
  }
  return { cumLengths, total };
}

function pickBranchPoint(
  beziers: Bez[],
  cumLengths: number[],
  totalLength: number,
  t: number,
): { pos: Pt; tangentAngle: number; widthHere: number } {
  const target = t * totalLength;
  let idx = cumLengths.length - 1;
  for (let i = 0; i < cumLengths.length; i++) {
    if (cumLengths[i] >= target) {
      idx = i;
      break;
    }
  }
  const bez = beziers[idx];
  const prevCum = idx > 0 ? cumLengths[idx - 1] : 0;
  const segLen = cumLengths[idx] - prevCum;
  const localT = segLen > 0 ? (target - prevCum) / segLen : 0;
  const pos: Pt = {
    x: bez.a.x + (bez.d.x - bez.a.x) * localT,
    y: bez.a.y + (bez.d.y - bez.a.y) * localT,
  };
  const tangentAngle = Math.atan2(bez.d.y - bez.a.y, bez.d.x - bez.a.x);
  return { pos, tangentAngle, widthHere: bez.width };
}

function buildInitialNetwork(
  W: number,
  H: number,
): { threads: Thread[]; segIndex: LineSeg[] } {
  const rng = mulberry32(SEED);
  const segIndex: LineSeg[] = [];
  const threads: Thread[] = [];

  const nutrientSources: Pt[] = [
    { x: 0.3 * W, y: 0.3 * H },
    { x: 0.75 * W, y: 0.3 * H },
    { x: 0.25 * W, y: 0.65 * H },
    { x: 0.5 * W, y: 0.65 * H },
    { x: 0.78 * W, y: 0.65 * H },
    { x: 0.45 * W, y: 0.9 * H },
  ];

  function pushThread(beziers: Bez[]): Thread | null {
    if (beziers.length === 0) return null;
    const { total } = computeCumLengths(beziers);
    const thread: Thread = {
      beziers,
      totalLength: total,
      startDelay: threads.length * PHASE1_STAGGER_PER_THREAD,
      duration: PHASE1_DURATION,
      spawnedAt: 0,
      fusionPoint: null,
    };
    threads.push(thread);
    return thread;
  }

  const mains: Array<{
    beziers: Bez[];
    cumLengths: number[];
    total: number;
  }> = [];

  for (let i = 0; i < MAIN_COUNT; i++) {
    if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
    const { pos: origin, initialAngle: edgeAngle } = pickEdgeOrigin(rng, W, H);
    const wanderer = rng() < WANDERER_CHANCE;
    const target = wanderer ? null : nearestAnchor(origin, nutrientSources);
    const stopRadius = target ? (0.08 + rng() * 0.04) * W : 0;
    const segCount = 8 + Math.floor(rng() * 8);
    const initialAngle = edgeAngle + (rng() - 0.5) * 30 * DEG;
    const { beziers } = growThread({
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
    if (pushThread(beziers)) {
      const { cumLengths, total } = computeCumLengths(beziers);
      mains.push({ beziers, cumLengths, total });
    }
  }

  for (const main of mains) {
    if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
    const nBranches = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < nBranches; i++) {
      if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
      const t = 0.3 + rng() * 0.4;
      const bp = pickBranchPoint(
        main.beziers,
        main.cumLengths,
        main.total,
        t,
      );
      const sign = rng() < 0.5 ? -1 : 1;
      const offsetAngle = sign * (20 + rng() * 20) * DEG;
      const { beziers } = growThread({
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
      if (!pushThread(beziers)) continue;

      const { cumLengths: branchCum, total: branchTotal } =
        computeCumLengths(beziers);

      const nSpurs = 1 + Math.floor(rng() * 2);
      for (let j = 0; j < nSpurs; j++) {
        if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
        if (beziers.length < 2) break;
        const st = 0.3 + rng() * 0.4;
        const sp = pickBranchPoint(beziers, branchCum, branchTotal, st);
        const ssign = rng() < 0.5 ? -1 : 1;
        const soff = ssign * (25 + rng() * 15) * DEG;
        const { beziers: spurBez } = growThread({
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
        pushThread(spurBez);
      }
    }
  }

  return { threads, segIndex };
}

export function HyphalThreads() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = window.innerWidth;
    let H = window.innerHeight;
    let dpr = window.devicePixelRatio || 1;

    let threads: Thread[] = [];
    let segIndex: LineSeg[] = [];
    const spurRng = mulberry32(SEED ^ 0xc0ffee);
    let nextSpurAt = 0;
    let rafId = 0;
    let resizeRaf = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = window.devicePixelRatio || 1;
      canvas!.width = Math.floor(W * dpr);
      canvas!.height = Math.floor(H * dpr);
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function regenerate(now: number) {
      const built = buildInitialNetwork(W, H);
      for (const thread of built.threads) {
        thread.spawnedAt = now;
      }
      threads = built.threads;
      segIndex = built.segIndex;
      nextSpurAt =
        now +
        PHASE2_START_OFFSET +
        SPUR_INTERVAL_MIN +
        spurRng() * (SPUR_INTERVAL_MAX - SPUR_INTERVAL_MIN);
    }

    function spawnSpur(now: number) {
      if (segIndex.length >= MAX_TOTAL_SEGMENTS) return;
      const candidates = threads.filter((t) => t.beziers.length >= 2);
      if (candidates.length === 0) return;
      const parent = candidates[Math.floor(spurRng() * candidates.length)];
      const { cumLengths, total } = computeCumLengths(parent.beziers);
      const t = 0.2 + spurRng() * 0.6;
      const bp = pickBranchPoint(parent.beziers, cumLengths, total, t);
      const sign = spurRng() < 0.5 ? -1 : 1;
      const offset = sign * (20 + spurRng() * 25) * DEG;
      const segCount = 3 + Math.floor(spurRng() * 4);
      const { beziers, fused } = growThread({
        rng: spurRng,
        segIndex,
        origin: bp.pos,
        initialAngle: bp.tangentAngle + offset,
        target: null,
        stopRadius: 0,
        segCount,
        segLen: 24 + spurRng() * 16,
        baseWidth: Math.max(0.4, bp.widthHere * 0.8),
        tipWidth: 0.2,
        fusionRadius: FUSION_RADIUS,
      });
      if (beziers.length === 0) return;
      const { total: spurTotal } = computeCumLengths(beziers);
      const duration =
        SPUR_DURATION_MIN +
        spurRng() * (SPUR_DURATION_MAX - SPUR_DURATION_MIN);
      threads.push({
        beziers,
        totalLength: spurTotal,
        startDelay: 0,
        duration,
        spawnedAt: now,
        fusionPoint: fused,
      });
    }

    function drawThread(thread: Thread, now: number): boolean {
      const elapsed = now - thread.spawnedAt - thread.startDelay;
      if (elapsed <= 0) return false;
      const p = Math.min(1, elapsed / thread.duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const targetLen = thread.totalLength * eased;

      let drawn = 0;
      for (const bez of thread.beziers) {
        if (drawn >= targetLen) break;
        const remaining = targetLen - drawn;
        ctx!.lineWidth = bez.width;
        ctx!.beginPath();
        if (remaining >= bez.length) {
          ctx!.moveTo(bez.a.x, bez.a.y);
          ctx!.bezierCurveTo(
            bez.b.x,
            bez.b.y,
            bez.c.x,
            bez.c.y,
            bez.d.x,
            bez.d.y,
          );
        } else {
          const localT = bez.length > 0 ? remaining / bez.length : 1;
          const split = splitBezierAt(bez, localT);
          ctx!.moveTo(bez.a.x, bez.a.y);
          ctx!.bezierCurveTo(
            split.b.x,
            split.b.y,
            split.c.x,
            split.c.y,
            split.d.x,
            split.d.y,
          );
        }
        ctx!.stroke();
        drawn += bez.length;
      }
      return p >= 1;
    }

    function drawFusionNodes(now: number) {
      ctx!.fillStyle = "rgba(132,245,184,0.3)";
      for (const thread of threads) {
        if (!thread.fusionPoint) continue;
        const elapsed = now - thread.spawnedAt - thread.startDelay;
        if (elapsed < thread.duration) continue;
        ctx!.beginPath();
        ctx!.arc(
          thread.fusionPoint.x,
          thread.fusionPoint.y,
          2,
          0,
          Math.PI * 2,
        );
        ctx!.fill();
      }
    }

    function drawAll(now: number) {
      ctx!.clearRect(0, 0, W, H);
      ctx!.strokeStyle = "rgba(232,230,221,0.08)";
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      for (const thread of threads) drawThread(thread, now);
      drawFusionNodes(now);
    }

    function allPhase1Done(now: number): boolean {
      for (const thread of threads) {
        const elapsed = now - thread.spawnedAt - thread.startDelay;
        if (elapsed < thread.duration) return false;
      }
      return true;
    }

    resize();
    const initialNow = performance.now();
    regenerate(initialNow);

    let firstFrame = true;
    function frame(t: number) {
      if (firstFrame) {
        if (typeof window !== "undefined" && window.location?.hostname === "localhost") {
          console.log("[HyphalThreads] first frame", { t, threads: threads.length });
        }
        firstFrame = false;
      }
      if (!reduced && t >= nextSpurAt) {
        spawnSpur(t);
        nextSpurAt =
          t +
          SPUR_INTERVAL_MIN +
          spurRng() * (SPUR_INTERVAL_MAX - SPUR_INTERVAL_MIN);
      }
      drawAll(t);

      // In reduced-motion mode, stop animating once Phase 1 has fully
      // settled — there's nothing more to redraw.
      if (reduced && allPhase1Done(t)) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(frame);
    }

    function onResize() {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resize();
        regenerate(performance.now());
        if (rafId === 0) {
          // Reduced-motion mode had stopped the loop — restart so the
          // new geometry actually draws.
          rafId = requestAnimationFrame(frame);
        }
      });
    }

    window.addEventListener("resize", onResize);
    rafId = requestAnimationFrame(frame);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
