/**
 * When a spoken or typed reminder is due.
 *
 * The classifier (model or pattern rules) says when in the speaker's own
 * terms: `date` is "today", "tomorrow", a day of the week, an ISO date or
 * nothing; `time` is HH:MM or nothing; `relative_minutes` is "in 30
 * minutes". `createRoutedRow` used to accept an ISO date only, so "remind me
 * at 8pm" and "remind me tomorrow at 9" were never set by the pipeline and
 * sat as cards instead. This is the same reading the Telegram webhook has
 * always given them, as a pure function.
 *
 * Returns null when nothing says WHEN (no time, no delay, no ISO date): the
 * card asks for one. Times are London wall clock.
 */
import { londonToUtcIso } from "./registry";

export type ReminderWhen = { date?: unknown; time?: unknown; relative_minutes?: unknown; recurrence?: unknown };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function londonDate(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function reminderDueIso(r: ReminderWhen, now: Date = new Date()): string | null {
  if (typeof r.relative_minutes === "number" && Number.isFinite(r.relative_minutes) && r.relative_minutes > 0) {
    return new Date(now.getTime() + r.relative_minutes * 60_000).toISOString();
  }
  const time = typeof r.time === "string" && HHMM.test(r.time) ? r.time : null;
  const said = typeof r.date === "string" ? r.date.trim().toLowerCase() : "";

  // A calendar date stands on its own (the typed form always sends one); 09:00 when no time came with it.
  if (ISO_DATE.test(said)) return londonToUtcIso(said, time ?? "09:00");
  // Anything else needs a time: "tomorrow" alone is a day, not a moment.
  if (!time) return null;

  const today = londonDate(now);
  let day = today;
  if (said === "tomorrow") {
    day = addDays(today, 1);
  } else {
    const target = DAYS.findIndex((d) => said.startsWith(d));
    if (target >= 0) {
      const [y, m, d] = today.split("-").map(Number);
      let ahead = target - new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (ahead <= 0) ahead += 7;
      day = addDays(today, ahead);
    }
  }
  let due = londonToUtcIso(day, time);
  // "at 8" said at nine means tomorrow, unless it repeats (then the first one is simply the next).
  if (day === today && new Date(due).getTime() <= now.getTime() && !r.recurrence) due = londonToUtcIso(addDays(today, 1), time);
  return due;
}
