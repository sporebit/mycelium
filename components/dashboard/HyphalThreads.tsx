/**
 * Static hyphal threadline layer — a procedurally generated SVG of
 * branching threads that fade toward the viewport centre via a radial
 * mask. Three weights (main / branch / spur) layered with the
 * --hyphal-* CSS vars so future tuning happens in one place.
 *
 * Generation is deterministic (mulberry32 seeded with 42) and runs once
 * at module load, so the SVG ships verbatim from the server and never
 * recomputes. No client JS, no useMemo needed.
 */

type Pt = { x: number; y: number };
type Hypha = { p0: Pt; p1: Pt; p2: Pt; p3: Pt };

const VIEW_W = 1600;
const VIEW_H = 1200;
const MAIN_COUNT = 35;
const SEED = 42;

function mulberry32(seed: number): () => number {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bezPoint(h: Hypha, t: number): Pt {
  const u = 1 - t;
  return {
    x:
      u * u * u * h.p0.x +
      3 * u * u * t * h.p1.x +
      3 * u * t * t * h.p2.x +
      t * t * t * h.p3.x,
    y:
      u * u * u * h.p0.y +
      3 * u * u * t * h.p1.y +
      3 * u * t * t * h.p2.y +
      t * t * t * h.p3.y,
  };
}

function bezTangent(h: Hypha, t: number): Pt {
  const u = 1 - t;
  return {
    x:
      3 * u * u * (h.p1.x - h.p0.x) +
      6 * u * t * (h.p2.x - h.p1.x) +
      3 * t * t * (h.p3.x - h.p2.x),
    y:
      3 * u * u * (h.p1.y - h.p0.y) +
      6 * u * t * (h.p2.y - h.p1.y) +
      3 * t * t * (h.p3.y - h.p2.y),
  };
}

function generateMain(rng: () => number): Hypha {
  const edge = Math.floor(rng() * 4);
  let p0: Pt;
  let baseAngle: number;
  if (edge === 0) {
    p0 = { x: rng() * VIEW_W, y: -40 + rng() * 60 };
    baseAngle = Math.PI / 2;
  } else if (edge === 1) {
    p0 = { x: VIEW_W + 40 - rng() * 60, y: rng() * VIEW_H };
    baseAngle = Math.PI;
  } else if (edge === 2) {
    p0 = { x: rng() * VIEW_W, y: VIEW_H + 40 - rng() * 60 };
    baseAngle = -Math.PI / 2;
  } else {
    p0 = { x: -40 + rng() * 60, y: rng() * VIEW_H };
    baseAngle = 0;
  }
  const angle = baseAngle + (rng() - 0.5) * (Math.PI / 3); // ±30°
  const len = 400 + rng() * 300;
  const dx = Math.cos(angle) * len;
  const dy = Math.sin(angle) * len;
  const p3 = { x: p0.x + dx, y: p0.y + dy };
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);
  const w1 = (rng() - 0.5) * len * 0.4;
  const w2 = (rng() - 0.5) * len * 0.4;
  return {
    p0,
    p1: {
      x: p0.x + dx * 0.33 + perpX * w1,
      y: p0.y + dy * 0.33 + perpY * w1,
    },
    p2: {
      x: p0.x + dx * 0.66 + perpX * w2,
      y: p0.y + dy * 0.66 + perpY * w2,
    },
    p3,
  };
}

function generateBranch(
  parent: Hypha,
  rng: () => number,
  lenFactor: number
): Hypha {
  const t = 0.3 + rng() * 0.5;
  const start = bezPoint(parent, t);
  const tang = bezTangent(parent, t);
  const tangAngle = Math.atan2(tang.y, tang.x);
  const sign = rng() < 0.5 ? -1 : 1;
  const branchAngle =
    tangAngle + sign * ((Math.PI / 180) * (25 + rng() * 30));
  const parentLen = Math.hypot(
    parent.p3.x - parent.p0.x,
    parent.p3.y - parent.p0.y
  );
  const len = parentLen * lenFactor * (0.85 + rng() * 0.3);
  const dx = Math.cos(branchAngle) * len;
  const dy = Math.sin(branchAngle) * len;
  const p3 = { x: start.x + dx, y: start.y + dy };
  const perpX = -Math.sin(branchAngle);
  const perpY = Math.cos(branchAngle);
  const w1 = (rng() - 0.5) * len * 0.3;
  const w2 = (rng() - 0.5) * len * 0.3;
  return {
    p0: start,
    p1: {
      x: start.x + dx * 0.33 + perpX * w1,
      y: start.y + dy * 0.33 + perpY * w1,
    },
    p2: {
      x: start.x + dx * 0.66 + perpX * w2,
      y: start.y + dy * 0.66 + perpY * w2,
    },
    p3,
  };
}

function pathOf(h: Hypha): string {
  const f = (n: number) => n.toFixed(1);
  return `M ${f(h.p0.x)} ${f(h.p0.y)} C ${f(h.p1.x)} ${f(h.p1.y)}, ${f(h.p2.x)} ${f(h.p2.y)}, ${f(h.p3.x)} ${f(h.p3.y)}`;
}

const THREADS = (() => {
  const rng = mulberry32(SEED);
  const mains: Hypha[] = [];
  for (let i = 0; i < MAIN_COUNT; i++) mains.push(generateMain(rng));
  const branches: Hypha[] = [];
  const spurs: Hypha[] = [];
  for (const m of mains) {
    const nBranches = 2 + Math.floor(rng() * 3); // 2-4
    for (let i = 0; i < nBranches; i++) {
      const b = generateBranch(m, rng, 0.65);
      branches.push(b);
      const nSpurs = 1 + Math.floor(rng() * 2); // 1-2
      for (let j = 0; j < nSpurs; j++) {
        spurs.push(generateBranch(b, rng, 0.6));
      }
    }
  }
  return { mains, branches, spurs };
})();

export function HyphalThreads() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="thread-grad" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="black" />
            <stop offset="60%" stopColor="#444" />
            <stop offset="100%" stopColor="white" />
          </radialGradient>
          <mask id="thread-fade">
            <rect width="100%" height="100%" fill="url(#thread-grad)" />
          </mask>
        </defs>
        <g
          mask="url(#thread-fade)"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {THREADS.mains.map((h, i) => (
            <path
              key={`m${i}`}
              d={pathOf(h)}
              stroke="var(--hyphal-main)"
              strokeWidth={1.5}
            />
          ))}
          {THREADS.branches.map((h, i) => (
            <path
              key={`b${i}`}
              d={pathOf(h)}
              stroke="var(--hyphal-branch)"
              strokeWidth={1.0}
            />
          ))}
          {THREADS.spurs.map((h, i) => (
            <path
              key={`s${i}`}
              d={pathOf(h)}
              stroke="var(--hyphal-spur)"
              strokeWidth={0.5}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
