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
  // Order matters in a slot where several are due. The briefing carries the morning pick and the Day log
  // prompt carries the evening close, so each runs before the daily prompts, which then find the moment
  // already taken and say nothing.
  { path: "/api/briefings/morning", everyMinutes: 5, londonHours: [7, 10], why: "the morning briefing at 07:00 London on weekdays and 09:00 at weekends (the route keeps its own hour and sends once)" },
  { path: "/api/cron/daylog", everyMinutes: 15, londonHours: [18, 4], why: "the evening Day log prompt, its snooze and its idle close" },
  { path: "/api/cron/daily-prompts", everyMinutes: 5, londonHours: [6, 24], why: "the morning and evening prompts at their fallback times" },
  { path: "/api/cron/reminders", everyMinutes: 5, why: "a reminder goes out within five minutes of its time" },
  { path: "/api/cron/tickets-checkins", everyMinutes: 15, why: "the scheduled-day check-in and the weekly-review reminder" },
  { path: "/api/cron/family", everyMinutes: 15, why: "an appointment in the family space, the evening before and two hours before; the week's letter question on Sunday evening" },
  { path: "/api/cron/finance", everyMinutes: 60, londonHours: [9, 10], why: "once a morning: a spending nudge when a category has passed 80% or all of its month's budget" },
  { path: "/api/cron/finds", everyMinutes: 60, londonHours: [8, 21], why: "the Finds feed: the watchers once a day, verdicts for what has waited, and on Sunday evening the week's digest" },
  { path: "/api/cron/gift-occasions", everyMinutes: 60, londonHours: [8, 9], why: "once a morning: birthday and fixed occasions seeded, annual ones rolled forward, dates of birth reconciled (gifts spec §5)" },
  { path: "/api/cron/gift-reminders", everyMinutes: 60, londonHours: [8, 9], why: "once a morning, after the occasions: the gift task when a lead window opens and one vague nudge on a lead day (gifts spec §6)" },
  { path: "/api/cron/reference", everyMinutes: 60, londonHours: [4, 5], why: "on Sunday morning, after the Gousto sync: cold recipe details move to the PC's reference store (the route skips other days)" },
  { path: "/api/cron/quotes-research", everyMinutes: 30, why: "quote research that did not finish after its request" },
  { path: "/api/cron/rundowns", everyMinutes: 60, why: "weekly rundowns, sent in each team's hour" },
  { path: "/api/cron/ai-models", everyMinutes: 60, londonHours: [5, 6], why: "once a day at five: the AI providers' model lists, first and last seen; a nudge on a new model and on a retired one still pinned (MYC-190)" },
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
