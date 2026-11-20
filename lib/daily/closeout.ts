/**
 * The weekly close-out (master run §6; research rules 23, 25 and 32): a
 * session that only finishes. Same slot every week, a forty-five-minute
 * box, the plan said at the start and reported at the end.
 *
 * Pure: the arithmetic over plans already loaded. closeoutServer.ts reads
 * the rows and writes the one row a week.
 *
 * Two things this file is careful about (rule 25):
 *   - the week's FILL is shown, never a streak that can break: a count of
 *     win days this week and lifetime totals that can only grow;
 *   - a week with nothing in it is "0 win days", never "lost".
 */
import { isoWeekOf } from "@/lib/util/week";

export type FillPlan = {
  day: string;
  status: string;
  items: Array<{ is_win: boolean; state: string; position?: number }>;
};

export type WeekFill = {
  week: string;
  /** Days this week on which item one was finished (done or good enough). */
  win_days: number;
  finished: number;
  started: number;
  planned: number;
  dropped: number;
  /** Days this week that had a plan at all. */
  days_planned: number;
};

export type LifetimeTotals = {
  win_days: number;
  finished: number;
  weeks_closed: number;
  /** Days that have had a plan, ever. */
  days: number;
};

export const FINISHED = new Set(["done", "good_enough"]);
export const STARTED = new Set(["started", "done", "good_enough"]);

/** "2026-W47" for a London date "YYYY-MM-DD". */
export function weekKey(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const w = isoWeekOf(new Date(y, m - 1, d));
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

/** The seven London dates of the week that holds `day`, Monday first. */
export function weekDays(day: string): string[] {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(date);
    x.setUTCDate(date.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

/** True when the plan's item one was finished. */
export function planWon(plan: FillPlan): boolean {
  return plan.items.some((i) => i.is_win && FINISHED.has(i.state));
}

/** The week's fill from its plans (any plan not in the week is ignored). */
export function weekFill(week: string, plans: readonly FillPlan[]): WeekFill {
  const inWeek = plans.filter((p) => weekKey(p.day) === week);
  const fill: WeekFill = { week, win_days: 0, finished: 0, started: 0, planned: 0, dropped: 0, days_planned: inWeek.length };
  for (const p of inWeek) {
    if (planWon(p)) fill.win_days += 1;
    for (const i of p.items) {
      if (i.state === "swapped") continue;
      fill.planned += 1;
      if (STARTED.has(i.state)) fill.started += 1;
      if (FINISHED.has(i.state)) fill.finished += 1;
      if (i.state === "dropped") fill.dropped += 1;
    }
  }
  return fill;
}

/** Lifetime totals from every plan there has ever been, plus the count of weeks closed out. */
export function lifetimeTotals(plans: readonly FillPlan[], weeksClosed: number): LifetimeTotals {
  let win = 0;
  let finished = 0;
  for (const p of plans) {
    if (planWon(p)) win += 1;
    for (const i of p.items) if (FINISHED.has(i.state)) finished += 1;
  }
  return { win_days: win, finished, weeks_closed: weeksClosed, days: plans.length };
}

/**
 * Is this week's close-out the first of a month? The month a week belongs
 * to is the month of its Thursday (the ISO rule), so a week is counted once.
 * The measures are shown in the first close-out of a month and cover the
 * month before it.
 */
export function monthOfWeek(week: string): string {
  const [y, w] = week.split("-W").map(Number);
  // ISO week 1's Thursday is the first Thursday of the year.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4dow = jan4.getUTCDay() || 7;
  const thursday = new Date(jan4);
  thursday.setUTCDate(jan4.getUTCDate() - (jan4dow - 4) + (w - 1) * 7);
  return thursday.toISOString().slice(0, 7);
}

export function previousWeek(week: string): string {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4dow - 1) + (w - 2) * 7);
  return weekKey(monday.toISOString().slice(0, 10));
}

/** The month just gone relative to this week: "2026-10" for a week in November. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** True when this week is the first of its month, so the month before it is measured now. */
export function firstWeekOfMonth(week: string): boolean {
  return monthOfWeek(previousWeek(week)) !== monthOfWeek(week);
}

/**
 * Minutes until the close-out's slot today, or null when today is not the
 * day or the slot has passed. `minutesNow` is minutes since London midnight.
 */
export function minutesToCloseout(isoDay: number, minutesNow: number, slotDay: number, slotTime: string): number | null {
  if (isoDay !== slotDay) return null;
  const [h, m] = slotTime.split(":").map(Number);
  const slot = (h || 0) * 60 + (m || 0);
  return slot >= minutesNow ? slot - minutesNow : null;
}

/** The box's state: how many minutes are left of the forty-five, or 0 when it is over. */
export function boxLeft(startedAt: string | null, boxMinutes: number, now: Date): number | null {
  if (!startedAt) return null;
  const left = Math.ceil((Date.parse(startedAt) + boxMinutes * 60_000 - now.getTime()) / 60_000);
  return Math.max(0, left);
}
