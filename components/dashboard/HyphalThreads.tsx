/**
 * Hyphal threadlines V2 — dendritic, non-crossing growth toward
 * nutrient anchors that approximate the home-dashboard card layout.
 *
 * Each thread is a chain of short cubic Bézier segments. Direction is
 * the previous tangent lerped toward the chosen anchor, plus jitter,
 * clamped so curvature is gentle (≤15° per step). Before a segment is
 * placed, we test its endpoint-line against every existing segment;
 * crossings cause an angular back-off, and if no clear angle is found
 * the thread terminates (mimicking real hyphal fusion/avoidance).
 *
 * Stroke width tapers continuously per-segment from base (~1.4px) to
 * tip (~0.3px). Branches inherit the parent's width at the branch
 * point. A single --hyphal-stroke colour governs alpha; the visual
 * hierarchy is carried by width, not tiered opacity.
 *
 * Generation is deterministic (mulberry32 seeded with 42) and runs
 * once at module load, so the SVG ships verbatim from the server.
 */

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
}): Thread {
  const rng = opts.rng;
  const beziers: Bezier[] = [];
  let pos = opts.origin;
  let angle = opts.initialAngle;
  let prevLineSeg: LineSeg | null = null;

  for (let i = 0; i < opts.segCount; i++) {
    if (opts.segIndex.length >= MAX_TOTAL_SEGMENTS) break;

    // Bias direction toward target (30% lerp), with ±10° jitter
    let desiredAngle = angle;
    if (opts.target) {
      const tgtAngle = Math.atan2(
        opts.target.y - pos.y,
        opts.target.x - pos.x
      );
      desiredAngle = angle + shortestAngleDelta(angle, tgtAngle) * 0.3;
    }
    desiredAngle += (rng() - 0.5) * 20 * DEG;
    // Clamp curvature to ±15° per step
    const turn = clamp(
      shortestAngleDelta(angle, desiredAngle),
      -15 * DEG,
      15 * DEG
    );
    const desiredFinal = angle + turn;

    // Vary segment length a little
    const segLen = opts.segLen * (0.85 + rng() * 0.3);

    // Try the desired angle and back off if it would cross
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

      // Smooth cubic with tangent continuity at both ends
      const cp1: Pt = {
        x: pos.x + Math.cos(angle) * segLen * 0.35,
        y: pos.y + Math.sin(angle) * segLen * 0.35,
      };
      const cp2: Pt = {
        x: end.x - Math.cos(tryAngle) * segLen * 0.35,
        y: end.y - Math.sin(tryAngle) * segLen * 0.35,
      };

      // Per-segment width — midpoint of the linear taper from
      // baseWidth (at segment 0) to tipWidth (at segCount).
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

  return { beziers, cumLength, totalLength: acc };
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

type RenderSeg = { d: string; width: number };

function pathOf(b: Bezier): string {
  const f = (n: number) => n.toFixed(1);
  return `M ${f(b.a.x)} ${f(b.a.y)} C ${f(b.b.x)} ${f(b.b.y)}, ${f(b.c.x)} ${f(b.c.y)}, ${f(b.d.x)} ${f(b.d.y)}`;
}

const RENDER_SEGS: RenderSeg[] = (() => {
  const rng = mulberry32(SEED);
  const segIndex: LineSeg[] = [];
  const out: RenderSeg[] = [];
  const pushThread = (t: Thread) => {
    for (const b of t.beziers) out.push({ d: pathOf(b), width: b.width });
  };

  const mains: Thread[] = [];
  for (let i = 0; i < MAIN_COUNT; i++) {
    if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
    const { pos: origin, initialAngle: edgeAngle } = pickEdgeOrigin(rng);
    const wanderer = rng() < WANDERER_CHANCE;
    const target = wanderer ? null : nearestAnchor(origin);
    const stopRadius = target ? (0.08 + rng() * 0.04) * VIEW_W : 0;
    const segCount = 8 + Math.floor(rng() * 8); // 8-15
    // Initial direction inward, ±15°
    const initialAngle = edgeAngle + (rng() - 0.5) * 30 * DEG;
    const main = growThread({
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
      pushThread(main);
    }
  }

  for (const main of mains) {
    if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
    const nBranches = 2 + Math.floor(rng() * 3); // 2-4
    for (let i = 0; i < nBranches; i++) {
      if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
      const t = 0.3 + rng() * 0.4;
      const bp = pickBranchPoint(main, t);
      const sign = rng() < 0.5 ? -1 : 1;
      const offsetAngle = sign * (20 + rng() * 20) * DEG;
      const branch = growThread({
        rng,
        segIndex,
        origin: bp.pos,
        initialAngle: bp.tangentAngle + offsetAngle,
        target: null,
        stopRadius: 0,
        segCount: 4 + Math.floor(rng() * 5), // 4-8
        segLen: 32 + rng() * 18,
        baseWidth: bp.widthHere,
        tipWidth: 0.3,
      });
      if (branch.beziers.length === 0) continue;
      pushThread(branch);

      const nSpurs = 1 + Math.floor(rng() * 2); // 1-2
      for (let j = 0; j < nSpurs; j++) {
        if (segIndex.length >= MAX_TOTAL_SEGMENTS) break;
        if (branch.beziers.length < 2) break;
        const st = 0.3 + rng() * 0.4;
        const sp = pickBranchPoint(branch, st);
        const ssign = rng() < 0.5 ? -1 : 1;
        const soff = ssign * (25 + rng() * 15) * DEG;
        const spur = growThread({
          rng,
          segIndex,
          origin: sp.pos,
          initialAngle: sp.tangentAngle + soff,
          target: null,
          stopRadius: 0,
          segCount: 2 + Math.floor(rng() * 3), // 2-4
          segLen: 22 + rng() * 14,
          baseWidth: sp.widthHere,
          tipWidth: 0.3,
        });
        if (spur.beziers.length > 0) pushThread(spur);
      }
    }
  }

  return out;
})();

export function HyphalThreads() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g
          fill="none"
          stroke="var(--hyphal-stroke)"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {RENDER_SEGS.map((s, i) => (
            <path key={i} d={s.d} strokeWidth={s.width.toFixed(2)} />
          ))}
        </g>
      </svg>
    </div>
  );
}
