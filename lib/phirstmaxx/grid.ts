/**
 * PhirstMaxx — the weekly grid's arithmetic (claude/phirstmaxx-spec.md §4).
 * Pure: no I/O, no React. The grid is always 7 days (Monday first) × 48
 * half-hour rows, and every row is a Europe/London wall-clock time: row 18
 * is 09:00 in London whatever the season.
 *
 * Cells are keyed "d:r" (day index 0–6, row 0–47). A row's instant is the
 * London wall-clock time it names; a row ends where the next row starts,
 * and row 48 of a day is 00:00 of the next.
 *
 * Clock changes — the two Sundays a year London's wall clock is not a
 * simple 48 half hours:
 * - Spring forward (last Sunday in March, e.g. 2026-03-29): 01:00–01:59
 *   does not exist. Rows 2 and 3 (01:00, 01:30) map to the same instant as
 *   row 4 (02:00 BST = 01:00 UTC) and are zero-length; ranges built from
 *   them are skipped, and a range running through them simply loses that
 *   hour. That day has 23 hours.
 * - Fall back (last Sunday in October, e.g. 2026-10-25): 01:00–01:59 occurs
 *   twice. The rows take the first occurrence (BST), so the 01:30 row runs
 *   from 00:30 UTC to 02:00 UTC, 90 minutes: the repeated hour collapses
 *   into it. An instant in the second 01:00–01:59 lands in the 01:30 row.
 *   That day has 25 hours.
 */
import type { PmBlock } from "./types";

export const SLOT_MINUTES = 30;
export const ROWS = 48;
export const DAYS = 7;

export type Cell = { d: number; r: number };
export type Range = { start: number; end: number };

const MINUTE = 60_000;

export const cellKey = (d: number, r: number): string => `${d}:${r}`;
export function parseKey(key: string): Cell {
  const [d, r] = key.split(":").map(Number);
  return { d, r };
}

// ---------------------------------------------------------------------------
// Dates and London wall clock

export function shiftDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The Monday (YYYY-MM-DD) of the week holding that London day. */
export function weekStartOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return shiftDate(dateKey, -((dow + 6) % 7));
}

export function shiftWeek(weekStart: string, n: number): string {
  return shiftDate(weekStart, 7 * n);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: DAYS }, (_, i) => shiftDate(weekStart, i));
}

let fmt: Intl.DateTimeFormat | null = null;
/** The London date and minutes past midnight of an instant. */
export function londonWall(ms: number): { date: string; minutes: number } {
  fmt ??= new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

/**
 * The instant of a London wall-clock time. London is UTC+0 or UTC+1, so
 * the answer is the naive UTC reading or an hour before it; when both read
 * back correctly (the repeated hour) the earlier wins, and when neither does
 * (the missing hour) the next half hour that exists is used.
 */
export function londonInstant(dateKey: string, minutes: number): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  for (let mins = minutes; mins <= minutes + 120; mins += SLOT_MINUTES) {
    const naive = Date.UTC(y, m - 1, d) + mins * MINUTE;
    for (const cand of [naive - 60 * MINUTE, naive]) {
      const w = londonWall(cand);
      const back = Date.UTC(...ymd(w.date)) + w.minutes * MINUTE;
      if (back === naive) return cand;
    }
  }
  return Date.UTC(y, m - 1, d) + minutes * MINUTE;
}

function ymd(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split("-").map(Number);
  return [y, m - 1, d];
}

// ---------------------------------------------------------------------------
// Slots

const cache = new Map<string, number[][]>();
/** Row boundaries per day: 49 instants each, [d][48] === [d + 1][0]. Cached per week. */
export function weekBoundaries(weekStart: string): number[][] {
  const hit = cache.get(weekStart);
  if (hit) return hit;
  const days = weekDays(weekStart);
  const out = days.map((day, i) => {
    const row: number[] = [];
    for (let r = 0; r < ROWS; r++) row.push(londonInstant(day, r * SLOT_MINUTES));
    row.push(londonInstant(i + 1 < DAYS ? days[i + 1] : shiftDate(day, 1), 0));
    return row;
  });
  if (cache.size > 24) cache.clear();
  cache.set(weekStart, out);
  return out;
}

/** Epoch ms of the London half hour at (dayIndex, row). Row 48 is the next midnight. */
export function slotToInstant(weekStart: string, dayIndex: number, row: number): number {
  const b = weekBoundaries(weekStart);
  if (dayIndex >= 0 && dayIndex < DAYS && row >= 0 && row <= ROWS) return b[dayIndex][row];
  return londonInstant(shiftDate(weekStart, dayIndex), row * SLOT_MINUTES);
}

/** The slot holding an instant, or null when it is outside the week. */
export function instantToSlot(weekStart: string, ms: number): Cell | null {
  const b = weekBoundaries(weekStart);
  for (let d = 0; d < DAYS; d++) {
    if (ms < b[d][0] || ms >= b[d][ROWS]) continue;
    // The last row starting at or before ms: on the spring Sunday that is
    // the 02:00 row, never the zero-length 01:00 / 01:30 ones.
    let r = ROWS - 1;
    while (r > 0 && b[d][r] > ms) r--;
    return { d, r };
  }
  return null;
}

/** "HH:mm" of a row. */
export function rowLabel(row: number): string {
  const m = row * SLOT_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The row an "HH:mm" falls in (rounded down to the half hour). */
export function rowOfTime(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  if (Number.isNaN(h)) return 0;
  return Math.max(0, Math.min(ROWS - 1, Math.floor(((h % 24) * 60 + (m || 0)) / SLOT_MINUTES)));
}

// ---------------------------------------------------------------------------
// Selection

/** Every cell key in the rectangle between two cells, inclusive. */
export function rectangle(a: Cell, b: Cell): string[] {
  const out: string[] = [];
  const [d0, d1] = [Math.min(a.d, b.d), Math.max(a.d, b.d)];
  const [r0, r1] = [Math.min(a.r, b.r), Math.max(a.r, b.r)];
  for (let d = d0; d <= d1; d++) for (let r = r0; r <= r1; r++) out.push(cellKey(d, r));
  return out;
}

/** True when every cell of the rectangle is already selected (re-painting it removes it). */
export function rectangleIsSelected(selected: ReadonlySet<string>, rect: string[]): boolean {
  return rect.length > 0 && rect.every((k) => selected.has(k));
}

/** Paint a rectangle: if it is all highlighted already, remove it; otherwise add it. */
export function toggleRectangle(selected: ReadonlySet<string>, rect: string[]): Set<string> {
  const next = new Set(selected);
  if (rectangleIsSelected(selected, rect)) for (const k of rect) next.delete(k);
  else for (const k of rect) next.add(k);
  return next;
}

/**
 * The highlighted cells as instant ranges: a run of adjacent rows on one day
 * is one range; a run reaching row 47 ends at the next midnight. Zero-length
 * ranges (only the missing spring hour) are dropped. Sorted by start.
 */
export function rangesFromSelection(weekStart: string, cells: ReadonlySet<string>): Range[] {
  const b = weekBoundaries(weekStart);
  const byDay = new Map<number, number[]>();
  for (const k of cells) {
    const { d, r } = parseKey(k);
    if (!(d >= 0 && d < DAYS && r >= 0 && r < ROWS)) continue;
    const list = byDay.get(d) ?? [];
    list.push(r);
    byDay.set(d, list);
  }
  const out: Range[] = [];
  for (const [d, rows] of byDay) {
    rows.sort((x, y) => x - y);
    let start = rows[0];
    let prev = rows[0];
    const flush = () => {
      const s = b[d][start];
      const e = b[d][prev + 1];
      if (e > s) out.push({ start: s, end: e });
    };
    for (const r of rows.slice(1)) {
      if (r === prev + 1) {
        prev = r;
        continue;
      }
      flush();
      start = r;
      prev = r;
    }
    flush();
  }
  return out.sort((x, y) => x.start - y.start);
}

// ---------------------------------------------------------------------------
// Blocks

const ms = (iso: string) => new Date(iso).getTime();

export type Overlap<B> = { range: Range; blocks: B[] };

/** For each range that touches existing blocks (strictly overlaps; end-to-end is not touching), those blocks. */
export function overlaps<B extends Pick<PmBlock, "starts_at" | "ends_at">>(ranges: Range[], blocks: B[]): Array<Overlap<B>> {
  const out: Array<Overlap<B>> = [];
  for (const range of ranges) {
    const hit = blocks.filter((bk) => ms(bk.starts_at) < range.end && range.start < ms(bk.ends_at));
    if (hit.length) out.push({ range, blocks: hit });
  }
  return out;
}

type Mergeable = Pick<PmBlock, "person_id" | "type_id" | "firmness" | "place_id" | "title" | "starts_at" | "ends_at">;

/**
 * Adjacent (or overlapping) blocks of the same person, type, firmness, place
 * and title become one block, keeping the first one's other fields.
 */
export function mergeAdjacent<B extends Mergeable>(blocks: B[]): B[] {
  const sameKind = (a: B, b: B) =>
    a.person_id === b.person_id && a.type_id === b.type_id && a.firmness === b.firmness && a.place_id === b.place_id && (a.title ?? null) === (b.title ?? null);
  const sorted = [...blocks].sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
  const out: B[] = [];
  for (const bk of sorted) {
    const idx = out.findIndex((o) => sameKind(o, bk) && ms(o.ends_at) >= ms(bk.starts_at) && ms(o.starts_at) <= ms(bk.ends_at));
    if (idx >= 0) {
      const o = out[idx];
      if (ms(bk.ends_at) > ms(o.ends_at)) out[idx] = { ...o, ends_at: bk.ends_at };
    } else out.push({ ...bk });
  }
  return out;
}

/** "5 ranges, 31 h", "1 range, 1 h 30", "1 range, 30 min". */
export function summarise(ranges: Range[]): string {
  const n = ranges.length;
  const total = Math.round(ranges.reduce((s, r) => s + (r.end - r.start), 0) / MINUTE);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const dur = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
  return `${n} ${n === 1 ? "range" : "ranges"}, ${dur}`;
}

export type Segment = { dayIndex: number; topRow: number; rowSpan: number };

/** Where a span draws: one segment per day it touches (crossing midnight draws on two days). */
export function spanLayout(weekStart: string, start: number, end: number): Segment[] {
  const b = weekBoundaries(weekStart);
  const out: Segment[] = [];
  for (let d = 0; d < DAYS; d++) {
    const s = Math.max(start, b[d][0]);
    const e = Math.min(end, b[d][ROWS]);
    if (e <= s) continue;
    let top = ROWS - 1;
    while (top > 0 && b[d][top] > s) top--;
    let bottom = 1;
    while (bottom < ROWS && b[d][bottom] < e) bottom++;
    out.push({ dayIndex: d, topRow: top, rowSpan: Math.max(1, bottom - top) });
  }
  return out;
}

export function blockLayout(weekStart: string, block: Pick<PmBlock, "starts_at" | "ends_at">): Segment[] {
  return spanLayout(weekStart, ms(block.starts_at), ms(block.ends_at));
}

/** Highlighted cells as vertical runs per day, for drawing: [{ d, r0, r1 }] with r1 inclusive. */
export function cellRuns(cells: Iterable<string>): Array<{ d: number; r0: number; r1: number }> {
  const byDay = new Map<number, number[]>();
  for (const k of cells) {
    const { d, r } = parseKey(k);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const out: Array<{ d: number; r0: number; r1: number }> = [];
  for (const [d, rows] of byDay) {
    rows.sort((x, y) => x - y);
    let r0 = rows[0];
    let prev = rows[0];
    for (const r of rows.slice(1)) {
      if (r === prev + 1) {
        prev = r;
        continue;
      }
      out.push({ d, r0, r1: prev });
      r0 = r;
      prev = r;
    }
    out.push({ d, r0, r1: prev });
  }
  return out.sort((a, b) => a.d - b.d || a.r0 - b.r0);
}
