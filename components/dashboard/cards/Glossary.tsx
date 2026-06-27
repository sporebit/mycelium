"use client";

import { usePathname } from "next/navigation";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import type { CardWidth } from "@/lib/dashboard/card-registry";

type NodeKey =
  | "mycelium"
  | "stroma"
  | "compost"
  | "fitness"
  | "finances"
  | "operator";

type NodeDef = {
  key: NodeKey;
  label: string;
  /** Centre point in viewBox units (200x140). */
  cx: number;
  cy: number;
  /** Radius in viewBox units. */
  r: number;
  /** Which section route this node represents. */
  href: string;
  match: (pathname: string) => boolean;
};

const NODES: NodeDef[] = [
  // Centre — the whole organism
  {
    key: "mycelium",
    label: "MYCELIUM",
    cx: 100,
    cy: 70,
    r: 14,
    href: "/",
    match: (p) => p === "/",
  },
  // Top-right
  {
    key: "stroma",
    label: "BRAIN",
    cx: 158,
    cy: 28,
    r: 8.5,
    href: "/brain",
    match: (p) => p === "/brain" || p.startsWith("/brain/"),
  },
  // Left
  {
    key: "compost",
    label: "ORGANISATION",
    cx: 22,
    cy: 70,
    r: 8.5,
    href: "/organisation",
    match: (p) => p === "/organisation" || p.startsWith("/organisation/"),
  },
  // Bottom-right
  {
    key: "fitness",
    label: "FITNESS",
    cx: 158,
    cy: 112,
    r: 8.5,
    href: "/fitness",
    match: (p) => p === "/fitness" || p.startsWith("/fitness/"),
  },
  // Bottom-left
  {
    key: "finances",
    label: "FINANCES",
    cx: 42,
    cy: 112,
    r: 8.5,
    href: "/finance",
    match: (p) => p === "/finance" || p.startsWith("/finance/"),
  },
  // Top-left
  {
    key: "operator",
    label: "OPERATOR",
    cx: 42,
    cy: 28,
    r: 8.5,
    href: "/",
    match: () => false,
  },
];

/** Hyphal thread from centre node to a peripheral node — gently curved
 *  cubic Bézier with two control points pushed off the straight line to
 *  give an organic wander. */
function threadPath(from: NodeDef, to: NodeDef): string {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  // Perpendicular vector for the wander offset
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const wobble = 6;
  const c1x = from.cx + dx * 0.35 + px * wobble;
  const c1y = from.cy + dy * 0.35 + py * wobble;
  const c2x = from.cx + dx * 0.65 - px * wobble;
  const c2y = from.cy + dy * 0.65 - py * wobble;
  return `M ${from.cx} ${from.cy} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${to.cx} ${to.cy}`;
}

type Entry = {
  term: string;
  myco: string;
  maps: string;
};

const ENTRIES: Entry[] = [
  {
    term: "MYCELIUM",
    myco: "the organism itself, the whole network",
    maps: "the app",
  },
  {
    term: "STROMA",
    myco: "connective tissue the fungal body grows through",
    maps: "AI memory, Q&A, routing rules (was: Brain)",
  },
  {
    term: "COMPOST",
    myco: "where raw material decomposes into nutrients",
    maps: "captures decomposing into tasks, decisions, people",
  },
  {
    term: "HYPHAE",
    myco: "individual sensing/growing threads",
    maps: "individual captures, the raw input flowing into the network",
  },
  {
    term: "SPORE",
    myco: "a single reproductive unit, a seed",
    maps: "a single capture sent via voice or text",
  },
  {
    term: "FRUITING",
    myco: "when the network surfaces something visible",
    maps: "the dashboard, what the organism shows you",
  },
  {
    term: "OPERATOR",
    myco: "the organism that tends the network",
    maps: "you, Phil",
  },
  {
    term: "SUBSTRATE",
    myco: "the medium you grow in",
    maps: "your data and history",
  },
  {
    term: "ANASTOMOSIS",
    myco: "when two hyphae fuse to share signals",
    maps: "when captures connect to people, tasks, decisions",
  },
];

function activeKey(pathname: string): NodeKey {
  for (const n of NODES) {
    if (n.key === "mycelium") continue;
    if (n.match(pathname)) return n.key;
  }
  return "mycelium";
}

function OrganismDiagram({
  pathname,
  large = false,
}: {
  pathname: string;
  large?: boolean;
}) {
  const active = activeKey(pathname);
  const centre = NODES[0];
  return (
    <svg
      viewBox="0 0 200 140"
      preserveAspectRatio="xMidYMid meet"
      className={`w-full ${large ? "max-h-[280px]" : "max-h-[200px]"}`}
      role="img"
      aria-label="Myphelium2 organism diagram"
    >
      {/* Hyphal threads — centre out to each peripheral node */}
      <g
        fill="none"
        stroke="var(--hyphal-stroke)"
        strokeWidth={0.6}
        strokeLinecap="round"
      >
        {NODES.slice(1).map((n) => (
          <path key={`t-${n.key}`} d={threadPath(centre, n)} opacity={0.9} />
        ))}
        {/* Faint connecting edges between adjacent peripheral nodes for
            the impression of a network rather than a star */}
        {[
          [1, 2],
          [2, 4],
          [4, 3],
          [3, 5],
          [5, 1],
        ].map(([i, j], idx) => (
          <path
            key={`edge-${idx}`}
            d={threadPath(NODES[i], NODES[j])}
            opacity={0.35}
            strokeDasharray="1.5 2"
          />
        ))}
      </g>

      {/* Nodes */}
      {NODES.map((n) => {
        const isActive = active === n.key;
        return (
          <g key={n.key}>
            {isActive && (
              <circle
                cx={n.cx}
                cy={n.cy}
                r={n.r + 4}
                fill="none"
                stroke="var(--accent, #cba956)"
                strokeWidth={0.8}
                opacity={0.7}
                className="glossary-pulse"
              />
            )}
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.r}
              fill={isActive ? "var(--glow-2, #cba956)" : "var(--ink-1)"}
              stroke={isActive ? "var(--accent, #cba956)" : "var(--ink-3)"}
              strokeWidth={0.7}
            />
            <text
              x={n.cx}
              y={n.cy + 1.2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={n.key === "mycelium" ? 5.5 : 4.2}
              fontFamily="var(--font-mono), monospace"
              letterSpacing="0.08em"
              fill={isActive ? "var(--text-0)" : "var(--ink-4)"}
            >
              {n.label}
            </text>
            <title>{n.label}</title>
          </g>
        );
      })}
    </svg>
  );
}

function EntryList({
  twoCols = false,
}: {
  twoCols?: boolean;
}) {
  return (
    <ul
      className={
        twoCols
          ? "grid grid-cols-2 gap-x-4 gap-y-3"
          : "flex flex-col gap-3"
      }
    >
      {ENTRIES.map((e) => (
        <li key={e.term} className="flex flex-col gap-0.5">
          <Mono className="text-[11px] tracking-[0.18em] text-glow-2">
            {e.term}
          </Mono>
          <p className="text-[12px] italic text-ink-3 font-[family-name:var(--font-display)] leading-snug">
            {e.myco}
          </p>
          <p className="text-[12px] text-ink-4 leading-snug">
            <span className="text-ink-3">→ </span>
            {e.maps}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Glossary({ width = 1 }: { width?: CardWidth } = {}) {
  const pathname = usePathname();
  return (
    <Panel borderless title="GLOSSARY" topRight={<Mono>ORGANISM</Mono>}>
      {width === 1 ? (
        <OrganismDiagram pathname={pathname} />
      ) : width === 2 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
          <OrganismDiagram pathname={pathname} />
          <div className="max-h-[320px] overflow-y-auto pr-1">
            <EntryList />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] gap-6 items-start">
          <OrganismDiagram pathname={pathname} large />
          <div className="max-h-[360px] overflow-y-auto pr-1">
            <EntryList twoCols />
          </div>
        </div>
      )}
    </Panel>
  );
}
