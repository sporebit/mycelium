/**
 * PhirstMaxx engine — London calendar helpers.
 *
 * Instants are epoch milliseconds (UTC); every rule the engine applies
 * ("waking from 07:00", "Monday's shift at 17:00") is a Europe/London
 * wall-clock rule, so everything crosses through here. This repo has no
 * date-fns-tz, so the zone is read the way lib/daylog/day.ts reads it:
 * Intl.DateTimeFormat parts, with the UTC offset worked out from the gap
 * between the wall clock and the instant. That handles both changeovers.
 */

export const TIMEZONE = "Europe/London";

const DAY_MS = 86_400_000;

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function partsOf(instant: number): Parts {
  const parts = formatter.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

const pad = (n: number) => String(n).padStart(2, "0");

const ms = (instant: Date | number) => (typeof instant === "number" ? instant : instant.getTime());

/** London's offset from UTC at an instant, in ms (0 in winter, 3 600 000 in summer). */
function offsetAt(instant: number): number {
  const p = partsOf(instant);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant / 1000) * 1000;
}

/** "YYYY-MM-DD" for the London calendar day an instant falls on. */
export function londonDate(instant: Date | number): string {
  const p = partsOf(ms(instant));
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

/** "HH:mm" London. */
export function londonClock(instant: Date | number): string {
  const p = partsOf(ms(instant));
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/**
 * The instant for a London wall-clock time on a London date. In the March
 * gap (01:00–02:00 does not exist) the time is read forward an hour; in the
 * repeated October hour the later (GMT) reading wins.
 */
export function londonTime(day: string, hhmm: string): number {
  const [y, mo, d] = day.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const o1 = offsetAt(wall);
  const t1 = wall - o1;
  const o2 = offsetAt(t1);
  if (o2 === o1) return t1;
  const t2 = wall - o2;
  if (offsetAt(t2) === o2) return t2;
  return Math.max(t1, t2);
}

/** Midnight at the start of a London day. */
export function londonDayStart(day: string): number {
  return londonTime(day, "00:00");
}

/** Whole days since 1970-01-01 for a calendar date string. */
export function dayNumber(day: string): number {
  const [y, mo, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, mo - 1, d) / DAY_MS);
}

/** day + n calendar days. Calendar arithmetic, so the changeovers cannot skew it. */
export function addLondonDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday, for a calendar date. */
export function isoWeekdayOf(day: string): number {
  // 1970-01-01 was a Thursday.
  return ((((dayNumber(day) + 3) % 7) + 7) % 7) + 1;
}

/** 1 = Monday … 7 = Sunday, London. */
export function londonIsoWeekday(instant: Date | number): number {
  return isoWeekdayOf(londonDate(instant));
}

/** Every London date touched by [start, end). A zero-length range still reports its day. */
export function eachLondonDay(start: Date | number, end: Date | number): string[] {
  const s = ms(start);
  const e = ms(end);
  const first = londonDate(s);
  if (e <= s) return [first];
  const last = londonDate(e - 1);
  const out: string[] = [];
  for (let day = first; day <= last; day = addLondonDays(day, 1)) out.push(day);
  return out;
}

/** The London date of the Monday that starts the week containing `day`. */
export function londonWeekStart(day: string): string {
  return addLondonDays(day, 1 - isoWeekdayOf(day));
}
