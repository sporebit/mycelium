import type {
  CategoryTag,
  FinanceCategory,
  FinanceHistoryPoint,
  FinanceSnapshot,
} from "./types";

const LIQUID_TAGS: CategoryTag[] = ["liquid", "receivable"];
const INVESTED_TAGS: CategoryTag[] = ["equities", "crypto", "private"];
const LIABILITY_TAGS: CategoryTag[] = ["liability", "personal_debt"];

export type Breakdown = {
  liquid: { total: number; items: FinanceCategory[] };
  invested: { total: number; items: FinanceCategory[] };
  liabilities: { total: number; items: FinanceCategory[] };
};

function sumOf(items: FinanceCategory[]): number {
  return items.reduce((s, c) => s + c.value, 0);
}

export function breakDown(snapshot: FinanceSnapshot): Breakdown {
  const liquid = snapshot.categories.filter((c) => LIQUID_TAGS.includes(c.tag));
  const invested = snapshot.categories.filter((c) =>
    INVESTED_TAGS.includes(c.tag)
  );
  const liabilities = snapshot.categories.filter((c) =>
    LIABILITY_TAGS.includes(c.tag)
  );
  return {
    liquid: { total: sumOf(liquid), items: liquid },
    invested: { total: sumOf(invested), items: invested },
    liabilities: { total: sumOf(liabilities), items: liabilities },
  };
}

export function fmtCurrency(value: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function fmtSigned(value: number, currency = "GBP"): string {
  const abs = Math.abs(value);
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${fmtCurrency(abs, currency)}`;
}

export function fmtPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

/**
 * Find the most recent history point at or before the given target date.
 * History is assumed to be sorted newest-first.
 */
export function findClosestBefore(
  history: FinanceHistoryPoint[],
  targetDateKey: string
): FinanceHistoryPoint | null {
  for (const point of history) {
    if (point.date <= targetDateKey) return point;
  }
  return null;
}

export function liveTone(
  isoTimestamp: string | null
): "ok" | "warn" | "danger" | "muted" {
  if (!isoTimestamp) return "muted";
  const ageMs = Date.now() - new Date(isoTimestamp).getTime();
  const h = ageMs / 3_600_000;
  if (h < 26) return "ok";
  if (h < 24 * 7) return "warn";
  return "danger";
}

export function liveStatusLabel(
  tone: "ok" | "warn" | "danger" | "muted"
): string {
  if (tone === "ok") return "LIVE";
  if (tone === "warn") return "STALE";
  if (tone === "danger") return "VERY STALE";
  return "NO DATA";
}

export function relativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "never";
  const ageMs = Date.now() - new Date(isoTimestamp).getTime();
  const m = ageMs / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d ago`;
  const mo = d / 30;
  return `${Math.floor(mo)}mo ago`;
}
