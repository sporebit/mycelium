export type LondonNow = {
  hour: number;
  minute: number;
  dow: number; // 0=Sun ... 6=Sat
  dateKey: string; // YYYY-MM-DD in Europe/London
  weekday: string;
};

const DOW_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Returns the current wall-clock view of Europe/London. Uses Intl rather
 * than UTC-offset math so DST handles itself.
 */
export function nowInLondon(): LondonNow {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  });
  const parts = fmt.formatToParts(new Date());
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = parseInt(pick("hour"), 10);
  const minute = parseInt(pick("minute"), 10);
  const weekday = pick("weekday");
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    dow: DOW_MAP[weekday] ?? 0,
    dateKey: `${year}-${month}-${day}`,
    weekday,
  };
}

export function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}
