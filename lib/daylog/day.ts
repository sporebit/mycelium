/**
 * Day log — the day boundary. A "day" is the Europe/London calendar date,
 * except that the small hours up to the cutoff (default 03:00) still belong
 * to the evening before: the 21:30 prompt, a 00:30 reply and the 03:00
 * cutoff-skip all refer to the same day row. Pure; `now` injectable.
 */

export type LondonClock = { date: string; minutes: number };

export function londonClock(d: Date = new Date()): LondonClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

export function shiftDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function hmToMinutes(t: string | null | undefined, fallback: number): number {
  if (!t) return fallback;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return fallback;
  return (h % 24) * 60 + (Number.isNaN(m) ? 0 : m);
}

/** The day-log day for a moment: London date, or yesterday while before the cutoff. */
export function daylogDay(now: Date = new Date(), cutoff = "03:00"): string {
  const c = londonClock(now);
  return c.minutes < hmToMinutes(cutoff, 180) ? shiftDate(c.date, -1) : c.date;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
