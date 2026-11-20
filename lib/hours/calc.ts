/**
 * Every derived figure of the Four-Day Week Tracker (spec §3). Pure: takes
 * the bundle and a "today" date key, returns numbers in integer minutes
 * (even-pace values may carry a half minute; the percentage maths keeps it,
 * the display rounds). Dates are `YYYY-MM-DD` keys in Europe/London; the
 * week runs Monday to Sunday and the target is worked Monday to Thursday.
 */
import type { HoursBundle, HoursEntry, HoursSettings } from "./types";

// ---------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------

/** `33:40`. Rounds to the minute; negative values keep their sign. */
export function fmtHm(minutes: number): string {
  const neg = minutes < 0;
  const a = Math.round(Math.abs(minutes));
  return `${neg ? "-" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

/** `33.67h` */
export function fmtDec(minutes: number): string {
  return `${(minutes / 60).toFixed(2)}h`;
}

/** The display convention: `33:40 (33.67h)` */
export function fmtBoth(minutes: number): string {
  return `${fmtHm(minutes)} (${fmtDec(minutes)})`;
}

/** `101%` — whole percent. */
export function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * What a person types for a duration: `0:45`, `1:30`, `45` (minutes),
 * `1.5` or `1.5h` (hours), `1h 30m`, `90m`. Null when it is not one of
 * those or is outside 0 to 24 hours.
 */
export function parseDuration(text: string | null | undefined): number | null {
  const t = (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  let m: RegExpMatchArray | null;
  let minutes: number | null = null;
  if ((m = t.match(/^(\d{1,3}):(\d{1,2})$/))) {
    const mm = Number(m[2]);
    if (mm > 59) return null;
    minutes = Number(m[1]) * 60 + mm;
  } else if ((m = t.match(/^(\d{1,4})$/))) {
    minutes = Number(m[1]);
  } else if ((m = t.match(/^(\d{1,3})(?:\.(\d{1,3}))?\s*h(?:ours?|rs?)?$/))) {
    minutes = Math.round(Number(`${m[1]}.${m[2] ?? "0"}`) * 60);
  } else if ((m = t.match(/^(\d{1,3})\.(\d{1,3})$/))) {
    minutes = Math.round(Number(t) * 60);
  } else if ((m = t.match(/^(\d{1,4})\s*m(?:ins?|inutes?)?$/))) {
    minutes = Number(m[1]);
  } else if ((m = t.match(/^(\d{1,3})\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*m?(?:ins?)?$/))) {
    const mm = Number(m[2]);
    if (mm > 59) return null;
    minutes = Number(m[1]) * 60 + mm;
  }
  if (minutes === null || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes > 1440) return null;
  return minutes;
}

// ---------------------------------------------------------------------
// Dates (keys only; no timezone maths past the caller's "today")
// ---------------------------------------------------------------------

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `YYYY-MM-DD`: the shape, and the day exists (no 31 February rolling over). */
export function isDateKey(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_KEY.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: string): number {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}

export function mondayOf(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ---------------------------------------------------------------------
// Settings with defaults, and an index over the bundle
// ---------------------------------------------------------------------

export type ResolvedSettings = {
  target: number;
  stdDay: number;
  threshold: number;
  checkpointLabel: string;
  trackingStart: string;
  reviewWeeks: number;
  wedBefore: number;
  wedAfter: number;
  ticketBaseUrl: string;
};

export function resolveSettings(s: HoursSettings | null | undefined, today: string): ResolvedSettings {
  return {
    target: s?.contracted_minutes_per_week ?? 2250,
    stdDay: s?.standard_day_minutes ?? 450,
    threshold: s?.checkpoint_threshold_minutes ?? 1500,
    checkpointLabel: s?.checkpoint_label ?? "Wednesday 13:00",
    trackingStart: s?.tracking_start ?? mondayOf(today),
    reviewWeeks: s?.review_length_weeks ?? 6,
    wedBefore: s?.wed_minutes_before_1300 ?? 210,
    wedAfter: s?.wed_minutes_after_1300 ?? 300,
    ticketBaseUrl: s?.ticket_base_url ?? "",
  };
}

export type HoursIndex = {
  settings: ResolvedSettings;
  /** live entries with a date, by date */
  byDate: Map<string, HoursEntry[]>;
  /** live entries (dated or not) */
  live: HoursEntry[];
  absences: Map<string, number>;
  holidays: Map<string, string>;
};

export function buildIndex(bundle: HoursBundle, today: string): HoursIndex {
  const byDate = new Map<string, HoursEntry[]>();
  const live: HoursEntry[] = [];
  for (const e of bundle.entries) {
    if (e.deleted_at) continue;
    live.push(e);
    if (e.entry_date) {
      const list = byDate.get(e.entry_date) ?? [];
      list.push(e);
      byDate.set(e.entry_date, list);
    }
  }
  const absences = new Map<string, number>();
  for (const a of bundle.absences) absences.set(a.absence_date, (absences.get(a.absence_date) ?? 0) + a.minutes);
  const holidays = new Map<string, string>();
  for (const h of bundle.bankHolidays) holidays.set(h.holiday_date, h.name);
  return { settings: resolveSettings(bundle.settings, today), byDate, live, absences, holidays };
}

// ---------------------------------------------------------------------
// Per day
// ---------------------------------------------------------------------

export type DayTotals = {
  date: string;
  /** Σ minutes of entries dated d */
  logged: number;
  /** stdDay if bank holiday + Σ absence minutes */
  credited: number;
  total: number;
  /** Σ minutes of entries ticked Logged */
  loggedTicked: number;
  notYetLogged: number;
  entries: number;
  isBankHoliday: boolean;
  hasAbsence: boolean;
};

export function dayTotals(index: HoursIndex, date: string): DayTotals {
  let logged = 0;
  let ticked = 0;
  let entries = 0;
  for (const e of index.byDate.get(date) ?? []) {
    if (e.minutes === null) continue;
    entries += 1;
    logged += e.minutes;
    if (e.logged) ticked += e.minutes;
  }
  const isBankHoliday = index.holidays.has(date);
  const absence = index.absences.get(date) ?? 0;
  const credited = (isBankHoliday ? index.settings.stdDay : 0) + absence;
  return {
    date,
    logged,
    credited,
    total: logged + credited,
    loggedTicked: ticked,
    notYetLogged: logged - ticked,
    entries,
    isBankHoliday,
    hasAbsence: absence > 0,
  };
}

export function fourDayPct(index: HoursIndex, d: DayTotals): number {
  return d.total / (index.settings.target / 4);
}

export function fiveDayPct(index: HoursIndex, d: DayTotals): number {
  return d.total / (index.settings.target / 5);
}

// ---------------------------------------------------------------------
// Per week
// ---------------------------------------------------------------------

export type WeekStatus = "" | "In progress" | "Met" | "Short" | "Covered on Friday";

export type WeekSummary = {
  monday: string;
  /** Mon … Sun */
  days: DayTotals[];
  target: number;
  banked: number;
  weeklyPct: number;
  remaining: number;
  surplusLost: number;
  friWorked: number;
  fridayOwed: number;
  stillOutstanding: number;
  /** every unlogged entry dated in the week (Mon–Sun) */
  notYetLogged: number;
  status: WeekStatus;
};

export function weekSummary(index: HoursIndex, monday: string, today: string): WeekSummary {
  const target = index.settings.target;
  const days = Array.from({ length: 7 }, (_, i) => dayTotals(index, addDays(monday, i)));
  const banked = days.slice(0, 4).reduce((s, d) => s + d.total, 0);
  const remaining = Math.max(0, target - banked);
  const surplusLost = Math.max(0, banked - target);
  const friWorked = days[4].logged;
  const fridayOwed = remaining;
  const stillOutstanding = Math.max(0, fridayOwed - friWorked);
  const notYetLogged = days.reduce((s, d) => s + d.notYetLogged, 0);
  const ws: Omit<WeekSummary, "status"> = {
    monday,
    days,
    target,
    banked,
    weeklyPct: banked / target,
    remaining,
    surplusLost,
    friWorked,
    fridayOwed,
    stillOutstanding,
    notYetLogged,
  };
  return { ...ws, status: weekStatus(ws, today) };
}

/**
 * Future week: blank. In progress while Thursday of the week is today or
 * later. Then Met, or (O2, 2026-11-19) Covered on Friday when Friday's
 * hours reach the shortfall, else Short.
 */
export function weekStatus(ws: Omit<WeekSummary, "status">, today: string): WeekStatus {
  if (ws.monday > today) return "";
  if (addDays(ws.monday, 3) >= today) return "In progress";
  if (ws.banked >= ws.target) return "Met";
  if (ws.remaining > 0 && ws.friWorked >= ws.remaining) return "Covered on Friday";
  return "Short";
}

/** One row per week from the tracking start to the current week, oldest first. */
export function historyRows(index: HoursIndex, today: string): WeekSummary[] {
  const rows: WeekSummary[] = [];
  const last = mondayOf(today);
  let m = mondayOf(index.settings.trackingStart);
  let guard = 0;
  while (m <= last && guard < 1000) {
    rows.push(weekSummary(index, m, today));
    m = addDays(m, 7);
    guard += 1;
  }
  return rows;
}

export function reviewDate(settings: ResolvedSettings): string {
  return addDays(settings.trackingStart, settings.reviewWeeks * 7);
}

// ---------------------------------------------------------------------
// Totals over the whole record
// ---------------------------------------------------------------------

export type BundleTotals = {
  withTime: number;
  open: number;
  loggedMinutes: number;
  distinctKeys: number;
  openEstimate: number;
  openWithoutEstimate: number;
  absences: number;
  bankHolidays: number;
};

export function bundleTotals(index: HoursIndex): BundleTotals {
  let withTime = 0;
  let open = 0;
  let loggedMinutes = 0;
  let openEstimate = 0;
  let openWithoutEstimate = 0;
  const keys = new Set<string>();
  for (const e of index.live) {
    if (e.ticket_key) keys.add(e.ticket_key);
    if (e.minutes === null) {
      if (!isOpenItem(e)) continue;
      open += 1;
      if (e.estimate_minutes === null) openWithoutEstimate += 1;
      else openEstimate += e.estimate_minutes;
    } else {
      withTime += 1;
      loggedMinutes += e.minutes;
    }
  }
  return {
    withTime,
    open,
    loggedMinutes,
    distinctKeys: keys.size,
    openEstimate,
    openWithoutEstimate,
    absences: index.absences.size,
    bankHolidays: index.holidays.size,
  };
}

/** Backlog: an entry with a description or a ticket and no Time Spent. */
export function isOpenItem(e: HoursEntry): boolean {
  return e.minutes === null && (e.description.trim() !== "" || e.ticket_raw.trim() !== "");
}

// ---------------------------------------------------------------------
// Entry state (Log colours)
// ---------------------------------------------------------------------

export type EntryState = "green" | "red" | "amber" | "open";

export function entryState(e: HoursEntry): EntryState {
  if (e.minutes === null) return "open";
  const complete = e.description.trim() !== "" && e.ticket_raw.trim() !== "";
  if (!complete) return "red";
  return e.logged ? "green" : "amber";
}

// ---------------------------------------------------------------------
// Dashboard pieces
// ---------------------------------------------------------------------

export function bannerText(ws: WeekSummary): string {
  if (ws.banked >= ws.target) return `STOP - ${fmtHm(ws.target)} MET, FRIDAY IS CLEAR`;
  if (ws.remaining <= 60) return `ALMOST THERE - ${fmtHm(ws.remaining)} LEFT THIS WEEK`;
  return `${fmtHm(ws.remaining)} LEFT TO WORK THIS WEEK`;
}

export type TodayPanel = {
  flatDailyTarget: number;
  daysLeftInclToday: number;
  evenPaceToday: number;
  leftToday: number;
  todayTotal: number;
  pill: string;
};

export function todayPanel(index: HoursIndex, ws: WeekSummary, today: string): TodayPanel {
  const target = index.settings.target;
  const wd = weekdayIndex(today);
  const flatDailyTarget = target / 4;
  const daysLeftInclToday = wd > 3 ? 0 : 4 - wd;
  const before = ws.days.slice(0, Math.min(wd, 4)).reduce((s, d) => s + d.total, 0);
  const evenPaceToday = daysLeftInclToday === 0 ? 0 : Math.max(0, (target - before) / daysLeftInclToday);
  const todayTotal = dayTotals(index, today).total;
  const leftToday = Math.max(0, evenPaceToday - todayTotal);
  let pill: string;
  if (ws.banked >= target) pill = "WEEK COMPLETE - STOP";
  else if (wd > 3) pill = "OUTSIDE MON-THU";
  else if (leftToday === 0) pill = `TODAY DONE - ${fmtHm(ws.remaining)} LEFT THIS WEEK`;
  else pill = `KEEP GOING - ${fmtHm(leftToday)} LEFT TODAY`;
  return { flatDailyTarget, daysLeftInclToday, evenPaceToday, leftToday, todayTotal, pill };
}

export type Checkpoint = { shortfall: number; send: boolean; pill: string };

export function checkpoint(ws: WeekSummary, threshold: number): Checkpoint {
  const shortfall = Math.max(0, threshold - ws.banked);
  const send = ws.banked >= threshold;
  return { shortfall, send, pill: send ? "SEND BLOCK-OUT" : `HOLD - ${fmtHm(shortfall)} SHORT` };
}

export function fridayText(ws: WeekSummary): string {
  if (ws.fridayOwed === 0) return "FRIDAY IS CLEAR";
  if (ws.stillOutstanding === 0) return "SHORTFALL COVERED";
  return `WORK ${fmtHm(ws.stillOutstanding)} ON FRIDAY`;
}

export type Pace = { toThursday: number | null; inclFriday: number | null };

/** Minutes per remaining day. Null where there is no day left to pace over (`-`). */
export function pace(ws: WeekSummary, today: string): Pace {
  const wd = weekdayIndex(today);
  const toThursday = wd < 3 ? ws.remaining / (3 - wd) : null;
  const monFri = ws.days.slice(0, 5).reduce((s, d) => s + d.total, 0);
  const inclFriday = wd < 4 ? Math.max(0, ws.target - monFri) / (4 - wd) : null;
  return { toThursday, inclFriday };
}

export type TradeOffRow = { threshold: number; mon: number; tue: number; wed: number; thu: number };

/** Settings: what each checkpoint threshold asks of Mon, Tue and Thu, given the Wednesday assumptions. */
export function tradeOffTable(settings: ResolvedSettings, thresholds: number[] = [1200, 1350, 1500]): TradeOffRow[] {
  return thresholds.map((threshold) => {
    const monTue = (threshold - settings.wedBefore) / 2;
    return {
      threshold,
      mon: monTue,
      tue: monTue,
      wed: settings.wedBefore + settings.wedAfter,
      thu: settings.target - threshold - settings.wedAfter,
    };
  });
}

// ---------------------------------------------------------------------
// By ticket
// ---------------------------------------------------------------------

export type TicketRow = {
  key: string;
  minutes: number;
  pct: number;
  notYetLogged: number;
  description: string;
  entries: number;
};

export type TicketTable = { rows: TicketRow[]; noTicket: number; total: number; denominator: number };

/**
 * Entries with a key in [from, to] (inclusive; null = unbounded), grouped by
 * key, largest first. `%` is of the weekly target when `ofTarget` is given,
 * else of the range total.
 */
export function byTicket(index: HoursIndex, from: string | null, to: string | null, ofTarget: number | null): TicketTable {
  const groups = new Map<string, TicketRow>();
  let noTicket = 0;
  let total = 0;
  for (const e of index.live) {
    if (e.minutes === null || !e.entry_date) continue;
    if (from && e.entry_date < from) continue;
    if (to && e.entry_date > to) continue;
    total += e.minutes;
    if (!e.ticket_key) {
      noTicket += e.minutes;
      continue;
    }
    const g = groups.get(e.ticket_key) ?? { key: e.ticket_key, minutes: 0, pct: 0, notYetLogged: 0, description: e.description, entries: 0 };
    g.minutes += e.minutes;
    g.entries += 1;
    if (!e.logged) g.notYetLogged += e.minutes;
    if (!g.description && e.description) g.description = e.description;
    groups.set(e.ticket_key, g);
  }
  const denominator = ofTarget ?? total;
  const rows = Array.from(groups.values())
    .map((g) => ({ ...g, pct: denominator > 0 ? g.minutes / denominator : 0 }))
    .sort((a, b) => b.minutes - a.minutes || a.key.localeCompare(b.key));
  return { rows, noTicket, total, denominator };
}
