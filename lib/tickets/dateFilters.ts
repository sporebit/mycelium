/**
 * The dates list (claude/tasks-merge-spec.md M4–M6): four from–to ranges over
 * the ticket's life — Raised (created_at), Started (started_at), Finished
 * (completed_at, or cancelled_at for a cancelled ticket) and Closed
 * (verified_at) — plus a whitelisted sort. Pure: no I/O, so the query
 * parser is unit-tested on its own.
 *
 * A bare date (YYYY-MM-DD) is a London calendar day: `from` is its first
 * instant, `to` its last. A full ISO timestamp is taken as given. Anything
 * else is ignored rather than refused — a bad chip never blanks the table.
 */

export const DATE_RANGE_KEYS = ["created", "started", "completed", "closed"] as const;
export type DateRangeKey = (typeof DATE_RANGE_KEYS)[number];

/** The column each range filters. "completed" is special-cased in the query (completed_at OR cancelled_at). */
export const DATE_RANGE_COLUMN: Record<DateRangeKey, string> = {
  created: "created_at",
  started: "started_at",
  completed: "completed_at",
  closed: "verified_at",
};

export type DateRange = { from: string | null; to: string | null };
export type DateRanges = Partial<Record<DateRangeKey, DateRange>>;

export const SORT_COLUMNS = [
  "created_at",
  "started_at",
  "completed_at",
  "verified_at",
  "cancelled_at",
  "updated_at",
  "deadline_on",
  "scheduled_on",
  "title",
  "ticket_key",
  "seq",
  "points",
  "priority_score",
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDir = "asc" | "desc";
export type Sort = { column: SortColumn; dir: SortDir };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC offset London has at a given instant, in minutes (0 in winter, 60 in summer). */
function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The first or last instant of a London calendar day, as a UTC ISO string. */
export function londonDayBound(day: string, edge: "start" | "end"): string | null {
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const naive = edge === "start" ? Date.UTC(y, m - 1, d, 0, 0, 0, 0) : Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  if (Number.isNaN(naive)) return null;
  // Date.UTC rolls an impossible day over (2026-13-40 → 2027-02-09); refuse those.
  const check = new Date(naive);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  // The offset at the naive instant is right except within an hour of a DST
  // change; a second pass with the corrected instant settles it.
  const guess = naive - londonOffsetMinutes(new Date(naive)) * 60_000;
  const exact = naive - londonOffsetMinutes(new Date(guess)) * 60_000;
  return new Date(exact).toISOString();
}

/** One bound: a London day edge, a full timestamp, or null. */
export function parseBound(raw: string | null | undefined, edge: "start" | "end"): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (DAY_RE.test(v)) return londonDayBound(v, edge);
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/** `created_from`, `created_to`, `started_from`, … → ranges. Missing or bad values are simply absent. */
export function parseDateRanges(get: (key: string) => string | null | undefined): DateRanges {
  const out: DateRanges = {};
  for (const key of DATE_RANGE_KEYS) {
    const from = parseBound(get(`${key}_from`), "start");
    const to = parseBound(get(`${key}_to`), "end");
    if (from || to) out[key] = { from, to };
  }
  return out;
}

export function isSortColumn(v: unknown): v is SortColumn {
  return typeof v === "string" && (SORT_COLUMNS as readonly string[]).includes(v);
}

/** `sort` + `dir` → a whitelisted sort, or null when `sort` is absent or unknown. dir defaults to desc for dates, asc for text. */
export function parseSort(sort: string | null | undefined, dir: string | null | undefined): Sort | null {
  if (!isSortColumn(sort)) return null;
  const textual = sort === "title" || sort === "ticket_key";
  const d: SortDir = dir === "asc" || dir === "desc" ? dir : textual ? "asc" : "desc";
  return { column: sort, dir: d };
}

/** YYYY-MM-DD HH:MM:SS in Europe/London (M4), or "" for null. */
export function formatLondonDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
