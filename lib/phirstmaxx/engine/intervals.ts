/**
 * PhirstMaxx engine — half-open [start, end) intervals on the instant line,
 * in epoch ms. Pure and tiny; the windows finder and fit lean on it. The
 * Interval shape itself lives in lib/phirstmaxx/types.ts so routes and
 * screens can name it without importing the engine.
 */
import type { Interval } from "../types";

export type { Interval };

export function isEmpty(i: Interval): boolean {
  return i.end <= i.start;
}

/** Sort and coalesce touching or overlapping intervals; empties are dropped. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => !isEmpty(i)).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

/** a ∩ b, both lists merged first. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const A = merge(a);
  const B = merge(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start);
    const end = Math.min(A[i].end, B[j].end);
    if (start < end) out.push({ start, end });
    if (A[i].end < B[j].end) i++;
    else j++;
  }
  return out;
}

/** a − b. */
export function subtract(a: Interval[], b: Interval[]): Interval[] {
  const cuts = merge(b);
  const out: Interval[] = [];
  for (const base of merge(a)) {
    let cursor = base.start;
    for (const c of cuts) {
      if (c.end <= cursor) continue;
      if (c.start >= base.end) break;
      if (c.start > cursor) out.push({ start: cursor, end: c.start });
      cursor = Math.max(cursor, c.end);
      if (cursor >= base.end) break;
    }
    if (cursor < base.end) out.push({ start: cursor, end: base.end });
  }
  return out;
}

export function minutesOf(i: Interval): number {
  return (i.end - i.start) / 60_000;
}
