/**
 * Net worth over time (master run §10). Pure: the daily snapshots and the
 * by-hand holdings in, a line out.
 *
 * The sheet's snapshot (finance_snapshots) is one figure a day, carried
 * forward on days without one. A holding (pension, house, mortgage, car)
 * is a figure with the day it was true, carried forward until the next
 * figure. The line is the sum of the two on every day either changed, so a
 * step in it is a real event: a refresh of the sheet, or a figure typed.
 * A mortgage is kept as a negative figure; the sum is just a sum.
 */

export const HOLDING_KINDS = ["pension", "property", "mortgage", "vehicle", "other"] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];
export const isHoldingKind = (v: unknown): v is HoldingKind => typeof v === "string" && (HOLDING_KINDS as readonly string[]).includes(v);
export const KIND_LABEL: Record<HoldingKind, string> = { pension: "Pension", property: "Property", mortgage: "Mortgage", vehicle: "Vehicle", other: "Other" };
/** Kinds that are owed, not owned: typed as a positive amount, kept as a negative. */
export const LIABILITY_KINDS: ReadonlySet<HoldingKind> = new Set<HoldingKind>(["mortgage"]);

/** The figure as stored, from the figure as typed: an amount owed goes in as a negative. */
export function storedPence(kind: HoldingKind, typedPence: number): number {
  const abs = Math.abs(Math.round(typedPence));
  return LIABILITY_KINDS.has(kind) ? -abs : abs;
}

export type HoldingValue = { holding_id: string; kind: HoldingKind; as_of: string; value_pence: number };
export type SnapshotPoint = { date: string; net_worth_pence: number };

/** Each holding's figure as it stood on `day`: the latest on or before it. Holdings with no figure yet are absent. */
export function holdingsAsOf(values: readonly HoldingValue[], day: string): Map<string, HoldingValue> {
  const out = new Map<string, HoldingValue>();
  for (const v of values) {
    if (v.as_of > day) continue;
    const cur = out.get(v.holding_id);
    if (!cur || v.as_of > cur.as_of) out.set(v.holding_id, v);
  }
  return out;
}

export type NetWorthPoint = {
  date: string;
  /** The sheet's figure carried to this day; null before the first snapshot. */
  sheet_pence: number | null;
  holdings_pence: number;
  by_kind: Partial<Record<HoldingKind, number>>;
  total_pence: number;
};

const sum = (xs: Iterable<number>) => {
  let t = 0;
  for (const x of xs) t += x;
  return t;
};

/**
 * The line: one point for every day on which the sheet or a holding
 * changed, oldest first. Nothing is interpolated; between two points the
 * figure is the earlier one.
 */
export function netWorthSeries(snapshots: readonly SnapshotPoint[], values: readonly HoldingValue[]): NetWorthPoint[] {
  const days = new Set<string>();
  for (const s of snapshots) days.add(s.date);
  for (const v of values) days.add(v.as_of);
  const sorted = [...days].sort();
  const snaps = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  let si = -1;
  const out: NetWorthPoint[] = [];
  for (const day of sorted) {
    while (si + 1 < snaps.length && snaps[si + 1].date <= day) si++;
    const sheet = si >= 0 ? snaps[si].net_worth_pence : null;
    const held = holdingsAsOf(values, day);
    const byKind: Partial<Record<HoldingKind, number>> = {};
    for (const h of held.values()) byKind[h.kind] = (byKind[h.kind] ?? 0) + h.value_pence;
    const holdings = sum([...held.values()].map((h) => h.value_pence));
    out.push({ date: day, sheet_pence: sheet, holdings_pence: holdings, by_kind: byKind, total_pence: (sheet ?? 0) + holdings });
  }
  return out;
}

/** The points with a day in each calendar month at most: the last one of the month. */
export function monthly(points: readonly NetWorthPoint[]): NetWorthPoint[] {
  const last = new Map<string, NetWorthPoint>();
  for (const p of points) last.set(p.date.slice(0, 7), p);
  return [...last.values()];
}

/** Whole days between a figure's day and today. */
export function ageDays(asOf: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000));
}

export type Freshness = "fresh" | "ageing" | "old";

/** Under six weeks a figure is current; under four months it is ageing; after that it is old and the page says so. */
export function freshness(asOf: string, today: string): Freshness {
  const d = ageDays(asOf, today);
  return d < 42 ? "fresh" : d < 120 ? "ageing" : "old";
}

/** "today", "3 weeks ago", "5 months ago": how old a figure is, in words. */
export function ageWords(asOf: string, today: string): string {
  const d = ageDays(asOf, today);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  const y = Math.floor(d / 365);
  return y === 1 ? "over a year ago" : `over ${y} years ago`;
}
