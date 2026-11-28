/**
 * A short greeting by time of day (brief 6b: "a short greeting by time of
 * day"), for Home's Today tile in the Field shell and the wall's header.
 * The hour is London's, as every clock in the app is. Plain and the same
 * every day: no exclamation, nothing about how the day has gone.
 */

export type DayPart = "morning" | "afternoon" | "evening";

/** 04:00 to 11:59 morning, 12:00 to 17:59 afternoon, the rest evening. */
export function dayPart(hour: number): DayPart {
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** "Good evening, Phil"; with no name (the wall, a shared screen), "Good evening". */
export function greeting(hour: number, name?: string | null): string {
  const words = `Good ${dayPart(hour)}`;
  const who = name?.trim();
  return who && who !== "You" ? `${words}, ${who}` : words;
}

/** The hour from a "05:31" clock string; null when it is not one. */
export function hourOf(clock: string): number | null {
  const m = /^(\d{1,2}):\d{2}/.exec(clock);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h < 24 ? h : null;
}

/** London's hour for a moment. */
export function londonHour(at: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(at);
  return Number(h) % 24;
}
