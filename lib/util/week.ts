/**
 * ISO 8601 week helpers. ISO weeks start Monday and the week containing
 * the first Thursday of the calendar year is week 1.
 */

export type IsoWeek = { year: number; week: number };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Sunday of the week containing `d`, in local time. */
export function sundayOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay(); // 0=Sun ... 6=Sat
  const offset = dow === 0 ? 0 : 7 - dow;
  x.setDate(x.getDate() + offset);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday of the week containing `d`, in local time. */
export function mondayOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** ISO year + week for the given date. */
export function isoWeekOf(d: Date): IsoWeek {
  // Use a UTC copy so day-shift math doesn't get fouled by DST boundaries.
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7; // Sunday → 7
  x.setUTCDate(x.getUTCDate() + 4 - day); // shift to Thursday of this week
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((x.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: x.getUTCFullYear(), week };
}

/** Returns "2026-W21" format. */
export function isoWeekString(d: Date): string {
  const { year, week } = isoWeekOf(d);
  return `${year}-W${pad(week)}`;
}

export function parseIsoWeek(s: string): IsoWeek | null {
  const m = s.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (week < 1 || week > 53) return null;
  return { year, week };
}

/** Monday of ISO week (year, week). Returns UTC date. */
function mondayOfIsoWeek(year: number, week: number): Date {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

/** Sunday (last day) of an ISO week, formatted YYYY-MM-DD. */
export function sundayKeyOfIsoWeek(year: number, week: number): string {
  const monday = mondayOfIsoWeek(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return sunday.toISOString().slice(0, 10);
}

/** Monday of an ISO week, formatted YYYY-MM-DD. */
export function mondayKeyOfIsoWeek(year: number, week: number): string {
  return mondayOfIsoWeek(year, week).toISOString().slice(0, 10);
}
