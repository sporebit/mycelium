/**
 * PhirstMaxx — the week's pure shapes (claude/phirstmaxx-spec.md §4), the
 * parts of lib/phirstmaxx/week.ts that need no database:
 *
 *   patterns      a saved week shape ("my usual week") is slots relative to
 *                 Monday 00:00 London, so it lands on the same wall-clock
 *                 times whatever the season;
 *   shifting      a block moved a week on keeps its London wall-clock time
 *                 across a clock change (Copy last week);
 *   grouping      pm_save_blocks takes one type per call, so a mixed set of
 *                 ranges is saved in one call per shape;
 *   last used     what the save bar opens with next time;
 *   undo          a save can be put back for ten minutes.
 */
import { londonInstant, londonWall, shiftDate, weekDays } from "./grid";
import type { Firmness, PmBlock } from "./types";

const MINUTE = 60_000;
const DAY_MIN = 1440;
export const UNDO_MS = 10 * MINUTE;

/** One block of a pattern: dow 0 = Monday; minutes from that day's London midnight (an end past 1440 crosses midnight). */
export type PatternBlock = {
  dow: number;
  start_min: number;
  end_min: number;
  type_id: string;
  firmness: Firmness;
  place_id: string | null;
  title: string | null;
};

export type IsoRange = { start: string; end: string };
export type Shape = { type_id: string; firmness: Firmness; place_id: string | null; title: string | null };
export type ShapedRange = IsoRange & Shape;
export type SaveGroup = Shape & { ranges: IsoRange[] };

const ms = (iso: string) => new Date(iso).getTime();

/** Whole days from one London date to another. */
function dayDiff(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * The shown week's blocks as a pattern. A block is kept when it starts on
 * one of the seven days; one running in from the Sunday before is not part
 * of this week's shape.
 */
export function patternFromBlocks(weekStart: string, blocks: Array<Pick<PmBlock, "starts_at" | "ends_at" | "type_id" | "firmness" | "place_id" | "title">>): PatternBlock[] {
  const days = weekDays(weekStart);
  const out: PatternBlock[] = [];
  for (const b of blocks) {
    const s = londonWall(ms(b.starts_at));
    const e = londonWall(ms(b.ends_at));
    const dow = days.indexOf(s.date);
    if (dow < 0) continue;
    const end = e.minutes + DAY_MIN * dayDiff(s.date, e.date);
    if (end <= s.minutes) continue;
    out.push({ dow, start_min: s.minutes, end_min: end, type_id: b.type_id, firmness: b.firmness, place_id: b.place_id ?? null, title: b.title ?? null });
  }
  return out.sort((a, b) => a.dow - b.dow || a.start_min - b.start_min);
}

/** A pattern laid onto a week: one ISO range per block, with its shape. Zero-length ranges (the missing spring hour) are dropped. */
export function rangesFromPattern(weekStart: string, blocks: PatternBlock[]): ShapedRange[] {
  const out: ShapedRange[] = [];
  for (const p of blocks) {
    if (!(p.dow >= 0 && p.dow < 7) || !Number.isFinite(p.start_min) || !Number.isFinite(p.end_min)) continue;
    const day = shiftDate(weekStart, p.dow);
    const start = londonInstant(day, p.start_min);
    const end = londonInstant(day, p.end_min);
    if (end <= start) continue;
    out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), type_id: p.type_id, firmness: p.firmness, place_id: p.place_id ?? null, title: p.title ?? null });
  }
  return out;
}

/** The same London wall-clock span `weeks` weeks on (or back, when negative). */
export function shiftRangeWeeks(range: IsoRange, weeks: number): IsoRange {
  const s = londonWall(ms(range.start));
  const e = londonWall(ms(range.end));
  const start = londonInstant(shiftDate(s.date, 7 * weeks), s.minutes);
  const end = londonInstant(shiftDate(e.date, 7 * weeks), e.minutes);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/** Ranges of the same type, firmness, place and title, together: one pm_save_blocks call each. */
export function groupForSave(items: ShapedRange[]): SaveGroup[] {
  const groups = new Map<string, SaveGroup>();
  for (const it of items) {
    const key = [it.type_id, it.firmness, it.place_id ?? "", it.title ?? ""].join("|");
    const g = groups.get(key) ?? { type_id: it.type_id, firmness: it.firmness, place_id: it.place_id ?? null, title: it.title ?? null, ranges: [] };
    g.ranges.push({ start: it.start, end: it.end });
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, ranges: g.ranges.sort((a, b) => ms(a.start) - ms(b.start)) }));
}

// ---------------------------------------------------------------------------
// pm_people.settings: what the save bar opens with, and the save that can be undone

export type LastUsed = { type_id: string | null; firmness: Firmness; place_id: string | null };
export type LastBatch = { ids: string[]; at: string };

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export function lastUsedFrom(settings: Record<string, unknown> | null | undefined): LastUsed {
  const raw = (settings?.last_used ?? null) as Partial<Record<keyof LastUsed, unknown>> | null;
  return {
    type_id: isUuid(raw?.type_id) ? raw.type_id : null,
    firmness: raw?.firmness === "flexible" ? "flexible" : "firm",
    place_id: isUuid(raw?.place_id) ? raw.place_id : null,
  };
}

export function lastBatchFrom(settings: Record<string, unknown> | null | undefined): LastBatch | null {
  const raw = (settings?.last_batch ?? null) as { ids?: unknown; id?: unknown; at?: unknown } | null;
  if (!raw || typeof raw.at !== "string" || Number.isNaN(Date.parse(raw.at))) return null;
  const ids = Array.isArray(raw.ids) ? raw.ids.filter(isUuid) : isUuid(raw.id) ? [raw.id] : [];
  return ids.length ? { ids, at: raw.at } : null;
}

/** True while the last save is young enough for pm_undo_blocks to take it back. */
export function canUndo(batch: LastBatch | null, now: number = Date.now()): boolean {
  if (!batch) return false;
  const age = now - Date.parse(batch.at);
  return age >= 0 && age < UNDO_MS;
}

/** The settings after a save: what was chosen, and the batch that can be undone. */
export function settingsAfterSave(settings: Record<string, unknown> | null | undefined, used: LastUsed, batchIds: string[], now: number = Date.now()): Record<string, unknown> {
  return { ...(settings ?? {}), last_used: used, last_batch: { ids: batchIds, at: new Date(now).toISOString() } };
}

/** The settings once the save has been undone: nothing left to undo. */
export function settingsAfterUndo(settings: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const rest = { ...(settings ?? {}) };
  delete rest.last_batch;
  return rest;
}

/** A block's edge sits on a London half hour (which is a UTC half hour too). */
export function isHalfHour(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t % (30 * MINUTE) === 0;
}
