/**
 * The sub-daily schedule (master run §9).
 *
 * Vercel's free plan runs a job once a day at most, so anything that must
 * happen during the day needs something else to knock. One route,
 * /api/cron/tick, is knocked on every five minutes by the PC worker while
 * the PC is on, and (when set up) by one cron-job.org job when it is not.
 * The tick decides what is due from this table; whoever knocks does not
 * need to know the schedule.
 *
 * Every job here is safe to run twice in the same slot (each sends from
 * stored state and records what it sent), so two knockers are harmless.
 * Pure: the clock is passed in.
 */

export const SLOT_MINUTES = 5;

export type ScheduledJob = {
  /** The route that does the work. */
  path: string;
  /** Run once every this many minutes, on the slot boundary. A multiple of SLOT_MINUTES. */
  everyMinutes: number;
  /** London hours [from, to) in which it runs; `from > to` wraps midnight. Omitted: all day. */
  londonHours?: [number, number];
  why: string;
};

export const SCHEDULE: readonly ScheduledJob[] = [
  { path: "/api/cron/daily-prompts", everyMinutes: 5, londonHours: [6, 24], why: "the morning and evening prompts at their fallback times" },
  { path: "/api/cron/reminders", everyMinutes: 5, why: "a reminder goes out within five minutes of its time" },
  { path: "/api/cron/tickets-checkins", everyMinutes: 15, why: "the scheduled-day check-in and the weekly-review reminder" },
  { path: "/api/cron/daylog", everyMinutes: 15, londonHours: [18, 4], why: "the evening Day log prompt, its snooze and its idle close" },
  { path: "/api/cron/quotes-research", everyMinutes: 30, why: "quote research that did not finish after its request" },
  { path: "/api/cron/rundowns", everyMinutes: 60, why: "weekly rundowns, sent in each team's hour" },
];

function inHours(hour: number, range: [number, number] | undefined): boolean {
  if (!range) return true;
  const [from, to] = range;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * The jobs due in the slot that contains this minute.
 * @param londonMinutes minutes since London midnight (0–1439)
 */
export function dueJobs(londonMinutes: number, schedule: readonly ScheduledJob[] = SCHEDULE): ScheduledJob[] {
  const slotStart = Math.floor(londonMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  const hour = Math.floor(slotStart / 60);
  return schedule.filter((job) => slotStart % job.everyMinutes === 0 && inHours(hour, job.londonHours));
}
