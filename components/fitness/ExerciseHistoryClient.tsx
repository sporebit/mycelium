"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Mono } from "@/components/dashboard/Mono";
import { Panel } from "@/components/dashboard/Panel";
import { fromKg, toKg } from "@/lib/fitness/units";
import { isoWeekString } from "@/lib/util/week";
import { pickParam, updateUrlParam } from "@/lib/util/url-params";
import {
  FEEL_EMOJI,
  feelRatingToSeverity,
  formatRegion,
  formatSeverity,
  severityToColor,
} from "@/lib/fitness/pain";
import type {
  ExerciseBaseline,
  ExerciseHistoryEntry,
  ExerciseHistoryResponse,
  ExercisePainLog,
  WeightUnit,
} from "@/lib/fitness/types";

type PainLogWithDate = ExercisePainLog & { session_id: string; date: string };

type XMode = "session" | "date" | "weekly";
type YMode = "top" | "volume" | "epley";

const X_VALUES = ["session", "date", "weekly"] as const;
const Y_VALUES = ["top", "volume", "epley"] as const;

const X_TABS: { label: string; value: XMode }[] = [
  { label: "Session #", value: "session" },
  { label: "Date", value: "date" },
  { label: "Weekly", value: "weekly" },
];
const Y_TABS: { label: string; value: YMode }[] = [
  { label: "Top Weight", value: "top" },
  { label: "Volume", value: "volume" },
  { label: "Est. 1RM", value: "epley" },
];
const Y_TABS_BODYWEIGHT: { label: string; value: YMode }[] = [
  // Bodyweight exercises log added weight on top of body — relabel
  // the axis tab so the chart doesn't read as "weight lifted".
  { label: "Top + KG", value: "top" },
  { label: "Volume", value: "volume" },
  { label: "Est. 1RM", value: "epley" },
];

const SLOT_LABEL: Record<string, string> = {
  morning: "AM",
  afternoon: "PM",
  extra: "EX",
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]} ${d}`;
}
function fmtUnitLabel(unit: WeightUnit): string {
  return unit === "stone" ? "st" : unit;
}
function fmtNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** Convert a kg-internal value to the user's display unit. */
function displayValue(kg: number, unit: WeightUnit): number {
  return fromKg(kg, unit);
}

type Point = {
  /** Y-axis numerical value (in display unit). */
  y: number;
  /** Sort key used to order data on the X axis. */
  sortKey: number | string;
  /** Label shown on the X axis tick. */
  xLabel: string;
  /** Optional: which entry this point came from (single-session points only). */
  entry?: ExerciseHistoryEntry;
  /** True if this point represents a PR for the chosen Y metric. */
  isPR: boolean;
  /** Resolved pain severity for this point (drives dot colour). Null when unknown. */
  severity?: number | null;
};

function severityForSession(
  sessionId: string,
  painBySessionId: Map<string, PainLogWithDate>
): number | null {
  const log = painBySessionId.get(sessionId);
  if (!log) return null;
  if (log.severity != null) return log.severity;
  if (log.feel_rating) return feelRatingToSeverity(log.feel_rating);
  return null;
}

function buildPoints(
  entries: ExerciseHistoryEntry[],
  xMode: XMode,
  yMode: YMode,
  unit: WeightUnit,
  painBySessionId: Map<string, PainLogWithDate>
): Point[] {
  // Sort ASC so the chart reads left-to-right oldest-to-newest
  const asc = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  // Compute the y-value (in kg internally) for each entry
  const withY = asc.map((e) => {
    let yKg: number | null = null;
    if (yMode === "top" && e.top_set) {
      yKg = toKg(e.top_set.weight, e.top_set.unit);
    } else if (yMode === "volume") {
      yKg = e.volume_kg;
    } else if (yMode === "epley" && e.est_1rm_kg != null) {
      yKg = e.est_1rm_kg;
    }
    return { entry: e, yKg };
  });

  // Detect "PR up to and including" for highlighting — running max
  let runMax = -Infinity;
  const flagged = withY.map((p) => {
    let isPR = false;
    if (p.yKg != null && p.yKg > runMax) {
      runMax = p.yKg;
      isPR = true;
    }
    return { ...p, isPR };
  });

  if (xMode === "session") {
    return flagged
      .filter((p) => p.yKg != null)
      .map((p, i) => ({
        y:
          yMode === "volume"
            ? p.yKg as number // keep volume in kg
            : displayValue(p.yKg as number, unit),
        sortKey: i + 1,
        xLabel: String(i + 1),
        entry: p.entry,
        isPR: p.isPR,
        severity: severityForSession(p.entry.session_id, painBySessionId),
      }));
  }

  if (xMode === "date") {
    return flagged
      .filter((p) => p.yKg != null)
      .map((p) => ({
        y:
          yMode === "volume"
            ? p.yKg as number
            : displayValue(p.yKg as number, unit),
        sortKey: p.entry.date,
        xLabel: fmtDateShort(p.entry.date),
        entry: p.entry,
        isPR: p.isPR,
        severity: severityForSession(p.entry.session_id, painBySessionId),
      }));
  }

  // Weekly: group by ISO week, take the best (max) Y value per week
  type Bucket = {
    week: string;
    best: { yKg: number; entry: ExerciseHistoryEntry; isPR: boolean } | null;
  };
  const byWeek = new Map<string, Bucket>();
  for (const p of flagged) {
    if (p.yKg == null) continue;
    const week = isoWeekString(new Date(`${p.entry.date}T12:00:00Z`));
    const cur = byWeek.get(week) ?? { week, best: null };
    if (cur.best == null || p.yKg > cur.best.yKg) {
      cur.best = { yKg: p.yKg, entry: p.entry, isPR: p.isPR };
    }
    byWeek.set(week, cur);
  }
  const weeks = Array.from(byWeek.values())
    .filter((b) => b.best !== null)
    .sort((a, b) => (a.week < b.week ? -1 : 1));
  return weeks.map((b) => {
    const best = b.best!;
    return {
      y: yMode === "volume" ? best.yKg : displayValue(best.yKg, unit),
      sortKey: b.week,
      xLabel: b.week.replace(/^\d{4}-/, ""), // "W22"
      entry: best.entry,
      isPR: best.isPR,
      severity: severityForSession(best.entry.session_id, painBySessionId),
    };
  });
}

function yAxisLabel(yMode: YMode, unit: WeightUnit): string {
  if (yMode === "top") return fmtUnitLabel(unit);
  if (yMode === "volume") return "kg";
  return fmtUnitLabel(unit);
}

type TooltipPayloadItem = { payload?: Point | unknown };
type TooltipArgs = {
  active?: boolean;
  payload?: readonly TooltipPayloadItem[];
};

function ChartTooltipContent({
  active,
  payload,
  yMode,
  unit,
}: TooltipArgs & { yMode: YMode; unit: WeightUnit }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload as Point | undefined;
  if (!p) return null;
  const e = p.entry;
  if (!e) {
    return (
      <div className="rounded-md border border-ink-2 bg-ink-1/95 backdrop-blur-md px-3 py-2 text-xs font-[family-name:var(--font-mono)] text-ink-4">
        {p.xLabel}: <span className="text-accent">{fmtNumber(p.y, 1)}</span>{" "}
        {yMode === "volume" ? "kg" : fmtUnitLabel(unit)}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-ink-2 bg-ink-1/95 backdrop-blur-md px-3 py-2 text-xs font-[family-name:var(--font-mono)] text-ink-4 max-w-xs">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 mb-1">
        {fmtDate(e.date)} · {SLOT_LABEL[e.slot] ?? ""}
      </div>
      <div>
        {e.sets_logged} sets
        {e.top_set ? (
          <>
            {" · top: "}
            <span className="text-ink-4">
              {e.top_set.weight}
              {fmtUnitLabel(e.top_set.unit)} × {e.top_set.reps}
            </span>
          </>
        ) : null}
        {" · volume: "}
        <span className="text-ink-4">{fmtNumber(e.volume_kg)} kg</span>
      </div>
      {e.comment && (
        <div className="text-[11px] text-ink-3 italic font-[family-name:var(--font-display)] mt-1 leading-snug">
          {e.comment}
        </div>
      )}
      {p.isPR && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-warn mt-1">
          ★ Personal best
        </div>
      )}
    </div>
  );
}

// Recharts custom dot renderer. Renders a star for PR points and colours
// every dot by pain severity (green/amber/orange/red) when a log exists.
type DotProps = {
  cx?: number;
  cy?: number;
  payload?: Point;
  index?: number;
};
function DotRenderer(props: DotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return <g />;
  const colour = severityToColor(payload?.severity ?? null);
  if (payload?.isPR) {
    // 5-point star, filled with the pain colour
    const points: string[] = [];
    const outer = 8;
    const inner = 3.2;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      points.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    return (
      <polygon
        points={points.join(" ")}
        fill={colour}
        stroke="var(--warn)"
        strokeWidth={1}
        key={`pr-${cx}-${cy}`}
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={colour}
      stroke={colour}
      key={`d-${cx}-${cy}`}
    />
  );
}

type PainPoint = {
  y: number;
  xLabel: string;
  sortKey: number | string;
  log?: PainLogWithDate;
};

function buildPainPoints(
  logs: PainLogWithDate[],
  xMode: XMode,
  /** Mapping from session_id → display index used by the weight chart, so
   *  the two charts share the X-axis exactly when in "Session #" mode. */
  sessionIndex: Map<string, number>
): PainPoint[] {
  const asc = [...logs].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  function severityOf(l: PainLogWithDate): number | null {
    if (l.severity != null) return l.severity;
    if (l.feel_rating) return feelRatingToSeverity(l.feel_rating);
    return null;
  }

  // Per R3b: collapse multiple logs in the same session to the max
  // severity. Keeps the chart honest when the user logged pain on more
  // than one exercise in the same session.
  function collapseBySession(): Map<string, { sev: number; log: PainLogWithDate }> {
    const bySession = new Map<string, { sev: number; log: PainLogWithDate }>();
    for (const l of asc) {
      const sev = severityOf(l);
      if (sev == null) continue;
      const cur = bySession.get(l.session_id);
      if (!cur || sev > cur.sev) bySession.set(l.session_id, { sev, log: l });
    }
    return bySession;
  }

  if (xMode === "session") {
    const bySession = collapseBySession();
    const out: PainPoint[] = [];
    for (const [sid, v] of bySession) {
      const idx = sessionIndex.get(sid);
      if (idx == null) continue;
      out.push({ y: v.sev, xLabel: String(idx), sortKey: idx, log: v.log });
    }
    out.sort((a, b) => (a.sortKey as number) - (b.sortKey as number));
    return out;
  }
  if (xMode === "date") {
    const bySession = collapseBySession();
    const out: PainPoint[] = [];
    for (const v of bySession.values()) {
      out.push({
        y: v.sev,
        xLabel: fmtDateShort(v.log.date),
        sortKey: v.log.date,
        log: v.log,
      });
    }
    out.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    return out;
  }
  // Weekly: max severity per ISO week
  const byWeek = new Map<string, { sev: number; log: PainLogWithDate }>();
  for (const l of asc) {
    const sev = severityOf(l);
    if (sev == null) continue;
    const week = isoWeekString(new Date(`${l.date}T12:00:00Z`));
    const cur = byWeek.get(week);
    if (!cur || sev > cur.sev) byWeek.set(week, { sev, log: l });
  }
  return Array.from(byWeek.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([w, v]) => ({
      y: v.sev,
      xLabel: w.replace(/^\d{4}-/, ""),
      sortKey: w,
      log: v.log,
    }));
}

function PainDotRenderer(props: DotProps & { payload?: PainPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return <g />;
  const colour = severityToColor(payload?.y ?? null);
  return (
    <circle cx={cx} cy={cy} r={4} fill={colour} stroke={colour} key={`p-${cx}-${cy}`} />
  );
}

type PainTooltipArgs = {
  active?: boolean;
  payload?: readonly { payload?: PainPoint | unknown }[];
};
function PainTooltipContent({ active, payload }: PainTooltipArgs) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload as PainPoint | undefined;
  if (!p?.log) return null;
  const l = p.log;
  const regions =
    l.pain_regions && l.pain_regions.length > 0
      ? l.pain_regions.map(formatRegion).join(", ")
      : null;
  const emoji = l.feel_rating ? FEEL_EMOJI[l.feel_rating] : "·";
  return (
    <div className="rounded-md border border-ink-2 bg-ink-1/95 backdrop-blur-md px-3 py-2 text-xs font-[family-name:var(--font-mono)] text-ink-4 max-w-xs">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 mb-1">
        {fmtDate(l.date)}
      </div>
      <div>
        {emoji} {l.feel_rating ?? ""}
        {l.severity != null ? ` · ${l.severity}/10` : ""}
      </div>
      {regions && (
        <div className="text-[11px] text-ink-3 mt-1">{regions.toLowerCase()}</div>
      )}
      {l.notes && (
        <div className="text-[11px] text-ink-3 italic font-[family-name:var(--font-display)] mt-1 leading-snug">
          {l.notes}
        </div>
      )}
    </div>
  );
}

export function ExerciseHistoryClient({
  encodedName,
}: {
  encodedName: string;
}) {
  const name = useMemo(() => {
    try {
      return decodeURIComponent(encodedName);
    } catch {
      return encodedName;
    }
  }, [encodedName]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const xMode: XMode = pickParam(searchParams, "xaxis", X_VALUES, "session");
  const yMode: YMode = pickParam(searchParams, "yaxis", Y_VALUES, "top");

  function setXMode(v: XMode) {
    updateUrlParam(
      router,
      pathname,
      searchParams,
      "xaxis",
      v === "session" ? null : v
    );
  }
  function setYMode(v: YMode) {
    updateUrlParam(
      router,
      pathname,
      searchParams,
      "yaxis",
      v === "top" ? null : v
    );
  }

  const [data, setData] = useState<ExerciseHistoryResponse | null>(null);
  const [baseline, setBaseline] = useState<ExerciseBaseline | null>(null);
  const [painLogs, setPainLogs] = useState<PainLogWithDate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hRes, bRes, pRes] = await Promise.all([
          fetch(`/api/fitness/exercise-history?name=${encodeURIComponent(name)}`, {
            cache: "no-store",
          }),
          fetch(`/api/fitness/baselines/${encodeURIComponent(name)}`, {
            cache: "no-store",
          }),
          fetch(`/api/fitness/pain-logs/exercise/${encodeURIComponent(name)}`, {
            cache: "no-store",
          }),
        ]);
        if (!hRes.ok) {
          if (!cancelled) setError(`Load failed (${hRes.status})`);
          return;
        }
        const j = (await hRes.json()) as ExerciseHistoryResponse;
        if (cancelled) return;
        setData(j);
        if (bRes.ok) {
          const bj = (await bRes.json()) as { baseline: ExerciseBaseline | null };
          if (!cancelled) setBaseline(bj.baseline);
        }
        if (pRes.ok) {
          const pj = (await pRes.json()) as { logs: PainLogWithDate[] };
          if (!cancelled) setPainLogs(Array.isArray(pj.logs) ? pj.logs : []);
        }
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  type AliasRow = { id: string; canonical_name: string; alias: string; created_at: string };
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [aliasesOpen, setAliasesOpen] = useState(false);
  const [newAlias, setNewAlias] = useState("");

  const canonicalName = data?.exercise_name ?? name;

  const fetchAliases = useCallback(async () => {
    const res = await fetch(
      `/api/fitness/exercise-aliases?name=${encodeURIComponent(canonicalName)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const j = (await res.json()) as { aliases: AliasRow[] };
      setAliases(j.aliases ?? []);
    }
  }, [canonicalName]);

  useEffect(() => {
    if (!canonicalName) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/fitness/exercise-aliases?name=${encodeURIComponent(canonicalName)}`,
        { cache: "no-store" }
      );
      if (cancelled) return;
      if (res.ok) {
        const j = (await res.json()) as { aliases: AliasRow[] };
        if (!cancelled) setAliases(j.aliases ?? []);
      }
    })();
    return () => { cancelled = true; };
  }, [canonicalName]);

  async function addAlias() {
    const trimmed = newAlias.trim();
    if (!trimmed) return;
    const res = await fetch("/api/fitness/exercise-aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonical_name: canonicalName, alias: trimmed }),
    });
    if (res.ok) {
      setNewAlias("");
      fetchAliases();
    }
  }

  async function removeAlias(id: string) {
    const res = await fetch(`/api/fitness/exercise-aliases/${id}`, {
      method: "DELETE",
    });
    if (res.ok) fetchAliases();
  }

  const unit = data?.modal_unit ?? "kg";

  // Map session_id → pain log for fast lookup from the chart dot renderer
  const painBySessionId = useMemo(() => {
    const m = new Map<string, PainLogWithDate>();
    for (const l of painLogs) m.set(l.session_id, l);
    return m;
  }, [painLogs]);

  const points = useMemo(
    () =>
      data
        ? buildPoints(data.sessions, xMode, yMode, unit, painBySessionId)
        : [],
    [data, xMode, yMode, unit, painBySessionId]
  );

  // Session_id → 1-based display index, mirrors the weight chart's "Session #"
  // X-axis so the pain chart aligns when both are set to that mode.
  const sessionIndex = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    const asc = [...data.sessions].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
    asc.forEach((s, i) => m.set(s.session_id, i + 1));
    return m;
  }, [data]);

  const painPoints = useMemo(
    () => buildPainPoints(painLogs, xMode, sessionIndex),
    [painLogs, xMode, sessionIndex]
  );

  const yLabel = yAxisLabel(yMode, unit);

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Link
          href="/fitness/history"
          className="text-[11px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.18em] self-start"
        >
          ← HISTORY
        </Link>
        <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
          {data.exercise_name}
        </h1>
        {data.template_notes && (
          <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
            {data.template_notes}
          </p>
        )}
      </div>

      {/* Aliases */}
      <div>
        <button
          type="button"
          onClick={() => setAliasesOpen((v) => !v)}
          className="text-[11px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase cursor-pointer"
        >
          {aliasesOpen ? "- ALIASES" : "+ ALIASES"}
          {aliases.length > 0 && ` (${aliases.length})`}
        </button>
        {aliasesOpen && (
          <div className="mt-2 flex flex-col gap-2">
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aliases.map((a) => (
                  <span
                    key={a.id}
                    className="text-[11px] bg-ink-1 border border-ink-2 rounded-md px-2 py-1 font-[family-name:var(--font-mono)] text-ink-4 inline-flex items-center gap-1"
                  >
                    {a.alias}
                    <button
                      type="button"
                      onClick={() => removeAlias(a.id)}
                      className="text-ink-3 hover:text-danger text-xs"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addAlias();
                }}
                placeholder="Add alias..."
                className="rounded-md bg-ink-0 border border-ink-2 px-2 py-1 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
              />
              <button
                type="button"
                onClick={addAlias}
                className="bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-2 py-1 rounded-md"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {baseline?.has_known_issues && <BaselineCard baseline={baseline} />}

      {data.sessions.length === 0 ? (
        <Panel title="No history">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            You haven&apos;t logged this exercise yet. Once you complete a
            session that includes &quot;{data.exercise_name}&quot;, it&apos;ll
            show up here.
          </p>
        </Panel>
      ) : (
        <>
          {/* PR badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PRBadge
              icon="🏆"
              label={data.is_bodyweight ? "Peak added weight" : "Peak weight"}
              value={
                data.peak_weight
                  ? `${data.peak_weight.weight}${fmtUnitLabel(
                      data.peak_weight.unit
                    )}`
                  : "—"
              }
              sub={
                data.peak_weight
                  ? `set on ${fmtDate(data.peak_weight.date)} (× ${data.peak_weight.reps} reps)`
                  : null
              }
              href={
                data.peak_weight
                  ? `/fitness/log/${data.peak_weight.session_id}`
                  : null
              }
            />
            <PRBadge
              icon="📊"
              label="Volume PR"
              value={
                data.volume_pr
                  ? `${fmtNumber(data.volume_pr.volume_kg)} kg`
                  : "—"
              }
              sub={
                data.volume_pr
                  ? `session on ${fmtDate(data.volume_pr.date)} (${data.volume_pr.set_count} sets total)`
                  : null
              }
              href={
                data.volume_pr
                  ? `/fitness/log/${data.volume_pr.session_id}`
                  : null
              }
            />
          </div>

          {/* Chart */}
          <Panel
            title="Progression"
            topRight={<Mono>{data.sessions.length} sessions</Mono>}
          >
            <div className="flex flex-col gap-3">
              <ToggleRow
                label="X-AXIS"
                value={xMode}
                onChange={setXMode}
                options={X_TABS}
              />
              <ToggleRow
                label="Y-AXIS"
                value={yMode}
                onChange={setYMode}
                options={data.is_bodyweight ? Y_TABS_BODYWEIGHT : Y_TABS}
              />

              {data.sessions.length === 1 && (
                <p className="text-[11px] text-ink-3 italic font-[family-name:var(--font-display)]">
                  Need more sessions to see progression.
                </p>
              )}

              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={points}
                    margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="2 4"
                      stroke="var(--ink-2)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="xLabel"
                      stroke="var(--text-2)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--ink-2)" }}
                    />
                    <YAxis
                      stroke="var(--text-2)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--ink-2)" }}
                      width={48}
                      label={{
                        value: yLabel,
                        angle: -90,
                        position: "insideLeft",
                        offset: 12,
                        style: {
                          fill: "var(--text-2)",
                          fontSize: 10,
                          letterSpacing: "0.15em",
                          textTransform: "uppercase",
                        },
                      }}
                    />
                    <Tooltip
                      content={(p: TooltipArgs) => (
                        <ChartTooltipContent
                          {...p}
                          yMode={yMode}
                          unit={unit}
                        />
                      )}
                      cursor={{ stroke: "var(--ink-2)", strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="y"
                      stroke="var(--glow-0)"
                      strokeWidth={2}
                      dot={DotRenderer}
                      activeDot={{
                        r: 5,
                        fill: "var(--glow-0)",
                        stroke: "var(--ink-1)",
                      }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Panel>

          {/* Pain over time — gated by ≥2 logs per R3b spec so a single
              data point doesn't try to render as a trend line. */}
          {painLogs.length >= 2 && (
          <Panel
            title="Pain over time"
            topRight={
              <Mono>{painLogs.length} log{painLogs.length === 1 ? "" : "s"}</Mono>
            }
          >
            {painPoints.length === 0 ? (
              <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                No pain logs for this exercise yet.
              </p>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={painPoints}
                    margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="2 4"
                      stroke="var(--ink-2)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="xLabel"
                      stroke="var(--text-2)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--ink-2)" }}
                    />
                    <YAxis
                      domain={[0, 10]}
                      stroke="var(--text-2)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--ink-2)" }}
                      width={32}
                      ticks={[0, 2, 4, 6, 8, 10]}
                    />
                    <Tooltip
                      content={(p: PainTooltipArgs) => (
                        <PainTooltipContent {...p} />
                      )}
                      cursor={{
                        stroke: "var(--ink-2)",
                        strokeWidth: 1,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="y"
                      stroke="var(--text-2)"
                      strokeWidth={1.5}
                      dot={PainDotRenderer}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
          )}

          {/* Recent table */}
          <Panel
            title="Recent sessions"
            topRight={<Mono>{Math.min(20, data.sessions.length)}</Mono>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    <th className="text-left py-2 pr-3">Date</th>
                    <th className="text-right py-2 px-3">Sets</th>
                    <th className="text-right py-2 px-3">Top Set</th>
                    <th className="text-right py-2 px-3">Volume</th>
                    <th className="text-center py-2 px-3">Pain</th>
                    <th className="text-left py-2 pl-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.slice(0, 20).map((s) => {
                    const log = painBySessionId.get(s.session_id);
                    const sev =
                      log?.severity ??
                      (log?.feel_rating ? feelRatingToSeverity(log.feel_rating) : null);
                    const emoji = log?.feel_rating
                      ? FEEL_EMOJI[log.feel_rating]
                      : null;
                    const regionTip =
                      log?.pain_regions && log.pain_regions.length > 0
                        ? log.pain_regions.map(formatRegion).join(", ")
                        : "";
                    return (
                    <tr
                      key={s.id}
                      className="border-t border-ink-2 hover:bg-ink-2/20"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/fitness/log/${s.session_id}`}
                          className="text-ink-4 hover:text-accent"
                        >
                          <Mono className="text-[11px]">{fmtDate(s.date)}</Mono>
                          <span className="text-[10px] text-ink-3 ml-2 uppercase tracking-[0.15em] font-[family-name:var(--font-mono)]">
                            {SLOT_LABEL[s.slot] ?? ""}
                          </span>
                          {s.is_peak_weight_pr && (
                            <span
                              className="ml-2 text-warn"
                              title="Peak weight PR"
                            >
                              ★
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-right font-[family-name:var(--font-mono)] tabular-nums text-ink-4">
                        {s.sets_logged}
                      </td>
                      <td className="py-2 px-3 text-right font-[family-name:var(--font-mono)] tabular-nums text-ink-4">
                        {s.top_set
                          ? `${s.top_set.weight}${fmtUnitLabel(s.top_set.unit)} × ${s.top_set.reps}`
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-[family-name:var(--font-mono)] tabular-nums text-ink-4">
                        {s.volume_kg > 0 ? `${fmtNumber(s.volume_kg)} kg` : "—"}
                      </td>
                      <td
                        className="py-2 px-3 text-center font-[family-name:var(--font-mono)]"
                        title={regionTip}
                      >
                        {log ? (
                          <span style={{ color: severityToColor(sev) }}>
                            {emoji ?? "·"}
                            {sev != null ? ` ${sev}` : ""}
                          </span>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                      <td
                        className="py-2 pl-3 text-xs text-ink-3 italic font-[family-name:var(--font-display)] max-w-[14rem] truncate"
                        title={s.comment ?? ""}
                      >
                        {s.comment ?? ""}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function BaselineCard({ baseline }: { baseline: ExerciseBaseline }) {
  const sev = formatSeverity(baseline);
  const regions =
    baseline.pain_regions && baseline.pain_regions.length > 0
      ? baseline.pain_regions.map(formatRegion).join(", ")
      : null;
  return (
    <div className="rounded-2xl border border-warn/40 bg-warn/10 p-4 flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-[0.22em] text-warn font-[family-name:var(--font-mono)] flex items-center gap-2">
        <span aria-hidden>⚠</span> Known history
      </div>
      <div className="text-sm text-ink-4 mt-1">
        Has issues
        {sev ? <span className="text-ink-3"> · typical {sev}</span> : null}
      </div>
      {regions && (
        <div className="text-[12px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.08em]">
          Regions: <span className="text-ink-4">{regions.toLowerCase()}</span>
        </div>
      )}
      {baseline.conditional_notes && (
        <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1 leading-snug">
          {baseline.conditional_notes}
        </p>
      )}
    </div>
  );
}

function ToggleRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T }[];
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)] w-16 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] border transition-colors ${
                active
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PRBadge({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string | null;
  href: string | null;
}) {
  const inner = (
    <div className="flex flex-col gap-1 p-4 rounded-2xl border border-ink-2 bg-ink-1/60 hover:border-ink-3 transition-colors">
      <div className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)]">
        <span aria-hidden className="mr-1.5">
          {icon}
        </span>
        {label}
      </div>
      <div className="text-3xl text-accent font-[family-name:var(--font-mono)] tabular-nums leading-tight">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-ink-3 italic font-[family-name:var(--font-display)]">
          {sub}
        </div>
      )}
    </div>
  );
  if (!href) return inner;
  return <Link href={href}>{inner}</Link>;
}
