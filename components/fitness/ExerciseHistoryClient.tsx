"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import type {
  ExerciseHistoryEntry,
  ExerciseHistoryResponse,
  WeightUnit,
} from "@/lib/fitness/types";

type XMode = "session" | "date" | "weekly";
type YMode = "weight" | "volume" | "1rm";

const X_TABS: { label: string; value: XMode }[] = [
  { label: "Session #", value: "session" },
  { label: "Date", value: "date" },
  { label: "Weekly", value: "weekly" },
];
const Y_TABS: { label: string; value: YMode }[] = [
  { label: "Top Weight", value: "weight" },
  { label: "Volume", value: "volume" },
  { label: "Est. 1RM", value: "1rm" },
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
};

function buildPoints(
  entries: ExerciseHistoryEntry[],
  xMode: XMode,
  yMode: YMode,
  unit: WeightUnit
): Point[] {
  // Sort ASC so the chart reads left-to-right oldest-to-newest
  const asc = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  // Compute the y-value (in kg internally) for each entry
  const withY = asc.map((e) => {
    let yKg: number | null = null;
    if (yMode === "weight" && e.top_set) {
      yKg = toKg(e.top_set.weight, e.top_set.unit);
    } else if (yMode === "volume") {
      yKg = e.volume_kg;
    } else if (yMode === "1rm" && e.est_1rm_kg != null) {
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
    };
  });
}

function yAxisLabel(yMode: YMode, unit: WeightUnit): string {
  if (yMode === "weight") return fmtUnitLabel(unit);
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

// Recharts custom dot renderer. Renders a star for PR points.
type DotProps = {
  cx?: number;
  cy?: number;
  payload?: Point;
  index?: number;
};
function DotRenderer(props: DotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return <g />;
  if (payload?.isPR) {
    // 5-point gold star
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
        fill="var(--color-warn)"
        stroke="var(--color-warn)"
        strokeWidth={0.5}
        key={`pr-${cx}-${cy}`}
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill="var(--color-accent)"
      stroke="var(--color-accent)"
      key={`d-${cx}-${cy}`}
    />
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

  const [data, setData] = useState<ExerciseHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xMode, setXMode] = useState<XMode>("session");
  const [yMode, setYMode] = useState<YMode>("weight");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/fitness/exercise-history?name=${encodeURIComponent(name)}`,
          { cache: "no-store" }
        );
        if (!r.ok) {
          if (!cancelled) setError(`Load failed (${r.status})`);
          return;
        }
        const j = (await r.json()) as ExerciseHistoryResponse;
        if (!cancelled) setData(j);
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const unit = data?.modal_unit ?? "kg";
  const points = useMemo(
    () => (data ? buildPoints(data.sessions, xMode, yMode, unit) : []),
    [data, xMode, yMode, unit]
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
              label="Peak weight"
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
                options={Y_TABS}
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
                      stroke="var(--color-ink-2)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="xLabel"
                      stroke="var(--color-ink-3)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-ink-2)" }}
                    />
                    <YAxis
                      stroke="var(--color-ink-3)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-ink-2)" }}
                      width={48}
                      label={{
                        value: yLabel,
                        angle: -90,
                        position: "insideLeft",
                        offset: 12,
                        style: {
                          fill: "var(--color-ink-3)",
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
                      cursor={{ stroke: "var(--color-ink-2)", strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="y"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={DotRenderer}
                      activeDot={{
                        r: 5,
                        fill: "var(--color-accent)",
                        stroke: "var(--color-ink-1)",
                      }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Panel>

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
                    <th className="text-left py-2 pl-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.slice(0, 20).map((s) => (
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
                        className="py-2 pl-3 text-xs text-ink-3 italic font-[family-name:var(--font-display)] max-w-[14rem] truncate"
                        title={s.comment ?? ""}
                      >
                        {s.comment ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
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
