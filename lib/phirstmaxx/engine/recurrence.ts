/**
 * PhirstMaxx engine — expands an RRULE anchored on a block's start into
 * concrete occurrences.
 *
 * Recurrence is a wall-clock notion: "Mondays 17:00" stays 17:00 London in
 * both BST and GMT (old decision 2026-09-02). So the rule is walked over
 * London calendar dates and each hit is placed at the anchor's London clock
 * through londonTime(); expanding in UTC would drift an hour every March and
 * October. The occurrence keeps the anchor's real duration.
 *
 * The old app used the rrule package; this repo does not have it, so this is
 * a small hand-rolled subset: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY),
 * INTERVAL, BYDAY (with ordinals for MONTHLY), BYMONTHDAY, COUNT, UNTIL and
 * WKST. Anything else is refused, and a refused or malformed rule degrades
 * to a one-off block rather than vanishing.
 */
import type { Interval } from "../types";
import { addLondonDays, dayNumber, isoWeekdayOf, londonClock, londonDate, londonTime } from "./time";

export type RecurringInput = { start: number; end: number; rule: string | null; exceptions?: string[] };

type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type ByDay = { weekday: number; ordinal: number | null };
type Rule = {
  freq: Freq;
  interval: number;
  byDay: ByDay[] | null;
  byMonthDay: number[] | null;
  count: number | null;
  /** Either a London date (inclusive) or an instant (inclusive). */
  until: { day: string } | { instant: number } | null;
  wkst: number;
};

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function weekdayCode(code: string): number {
  const i = WEEKDAYS.indexOf(code);
  if (i < 0) throw new Error(`bad weekday ${code}`);
  return i + 1;
}

/** Parses the supported subset; throws on anything else. */
export function parseRule(text: string): Rule {
  const body = text.trim().replace(/^RRULE:/i, "");
  const rule: Rule = { freq: "WEEKLY", interval: 1, byDay: null, byMonthDay: null, count: null, until: null, wkst: 1 };
  let sawFreq = false;
  for (const part of body.split(";")) {
    if (!part) continue;
    const [rawKey, value] = part.split("=");
    const key = rawKey?.toUpperCase();
    if (!key || value === undefined || value === "") throw new Error(`bad part ${part}`);
    switch (key) {
      case "FREQ":
        if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(value)) throw new Error(`unsupported FREQ ${value}`);
        rule.freq = value as Freq;
        sawFreq = true;
        break;
      case "INTERVAL": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) throw new Error("bad INTERVAL");
        rule.interval = n;
        break;
      }
      case "COUNT": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) throw new Error("bad COUNT");
        rule.count = n;
        break;
      }
      case "UNTIL": {
        const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(value);
        if (!m) throw new Error("bad UNTIL");
        const day = `${m[1]}-${m[2]}-${m[3]}`;
        if (!m[4]) rule.until = { day };
        else if (m[7] === "Z") rule.until = { instant: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) };
        else rule.until = { instant: londonTime(day, `${m[4]}:${m[5]}`) };
        break;
      }
      case "BYDAY":
        rule.byDay = value.split(",").map((v) => {
          const m = /^([+-]?\d{1,2})?([A-Z]{2})$/.exec(v.toUpperCase());
          if (!m) throw new Error(`bad BYDAY ${v}`);
          return { weekday: weekdayCode(m[2]), ordinal: m[1] ? Number(m[1]) : null };
        });
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = value.split(",").map((v) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 31) throw new Error("bad BYMONTHDAY");
          return n;
        });
        break;
      case "WKST":
        rule.wkst = weekdayCode(value.toUpperCase());
        break;
      default:
        throw new Error(`unsupported part ${key}`);
    }
  }
  if (!sawFreq) throw new Error("no FREQ");
  if (rule.byDay?.some((b) => b.ordinal !== null) && rule.freq !== "MONTHLY") throw new Error("ordinal BYDAY needs MONTHLY");
  return rule;
}

const ymd = (day: string) => day.split("-").map(Number) as [number, number, number];

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Does London date `day` carry an occurrence of `rule` anchored on `anchor`? */
function matches(rule: Rule, anchor: string, day: string): boolean {
  const [ay, am, ad] = ymd(anchor);
  const [y, m, d] = ymd(day);
  const weekday = isoWeekdayOf(day);
  switch (rule.freq) {
    case "DAILY":
      if ((dayNumber(day) - dayNumber(anchor)) % rule.interval !== 0) return false;
      return !rule.byDay || rule.byDay.some((b) => b.weekday === weekday);
    case "WEEKLY": {
      const weekOf = (x: string) => Math.floor((dayNumber(x) - (((isoWeekdayOf(x) - rule.wkst) % 7) + 7) % 7) / 7);
      if ((weekOf(day) - weekOf(anchor)) % rule.interval !== 0) return false;
      const days = rule.byDay ? rule.byDay.map((b) => b.weekday) : [isoWeekdayOf(anchor)];
      return days.includes(weekday);
    }
    case "MONTHLY": {
      if (((y - ay) * 12 + (m - am)) % rule.interval !== 0) return false;
      const dim = daysInMonth(y, m);
      if (rule.byMonthDay) return rule.byMonthDay.some((n) => (n > 0 ? n : dim + n + 1) === d);
      if (rule.byDay) {
        return rule.byDay.some((b) => {
          if (b.weekday !== weekday) return false;
          if (b.ordinal === null) return true;
          return b.ordinal > 0 ? Math.ceil(d / 7) === b.ordinal : Math.ceil((dim - d + 1) / 7) === -b.ordinal;
        });
      }
      return d === ad;
    }
    case "YEARLY":
      return (y - ay) % rule.interval === 0 && m === am && d === ad;
  }
}

export function expandRecurrence(block: RecurringInput, range: Interval): Interval[] {
  const duration = block.end - block.start;
  const overlaps = (start: number) => start < range.end && start + duration > range.start;
  if (!block.rule) return overlaps(block.start) ? [{ start: block.start, end: block.end }] : [];

  let rule: Rule;
  try {
    rule = parseRule(block.rule);
  } catch {
    return expandRecurrence({ ...block, rule: null }, range);
  }

  const anchor = londonDate(block.start);
  const clock = londonClock(block.start);
  const skip = new Set(block.exceptions ?? []);
  // A day either side so the wall-clock/UTC skew never drops an edge hit.
  const lastDay = addLondonDays(londonDate(range.end), 1);
  let day = anchor;
  if (rule.count === null) {
    const lo = addLondonDays(londonDate(range.start - Math.max(0, duration)), -1);
    if (lo > day) day = lo;
  }

  const out: Interval[] = [];
  let seen = 0;
  for (; day <= lastDay; day = addLondonDays(day, 1)) {
    if (!matches(rule, anchor, day)) continue;
    const start = day === anchor ? block.start : londonTime(day, clock);
    if (rule.until) {
      if ("day" in rule.until ? day > rule.until.day : start > rule.until.instant) break;
    }
    seen++;
    if (rule.count !== null && seen > rule.count) break;
    // Exceptions are removed after counting, as EXDATE is.
    if (skip.has(day) || !overlaps(start)) continue;
    out.push({ start, end: start + duration });
  }
  return out;
}

/** The rule text the app writes for "repeat every week on this weekday". */
export function weeklyRule(): string {
  return "FREQ=WEEKLY";
}
