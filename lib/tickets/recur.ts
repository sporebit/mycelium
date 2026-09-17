/**
 * Tickets — recurrence (spec §8.3). A small RFC 5545 RRULE subset, enough
 * for life tickets and reminders without a dependency:
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY ; INTERVAL=n ; BYDAY=MO,TU,… ;
 *   BYMONTHDAY=n ; COUNT/UNTIL ignored (occurrences are open-ended).
 * Dates are YYYY-MM-DD keys evaluated on the Europe/London calendar; times
 * (reminders) are carried separately as HH:MM.
 */

export type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byday: number[]; // ISO 1..7
  bymonthday: number | null;
};

const DAY_CODE: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

export function parseRule(rrule: string | null | undefined): Rule | null {
  if (!rrule) return null;
  const parts = rrule.replace(/^RRULE:/i, "").split(";");
  const out: Rule = { freq: "DAILY", interval: 1, byday: [], bymonthday: null };
  let hasFreq = false;
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case "FREQ": {
        const f = v.toUpperCase();
        if (f === "DAILY" || f === "WEEKLY" || f === "MONTHLY" || f === "YEARLY") {
          out.freq = f;
          hasFreq = true;
        }
        break;
      }
      case "INTERVAL":
        out.interval = Math.max(1, parseInt(v, 10) || 1);
        break;
      case "BYDAY":
        out.byday = v
          .split(",")
          .map((d) => DAY_CODE[d.trim().toUpperCase().slice(-2)])
          .filter((n): n is number => !!n);
        break;
      case "BYMONTHDAY":
        out.bymonthday = parseInt(v, 10) || null;
        break;
    }
  }
  return hasFreq ? out : null;
}

function parseKey(k: string): { y: number; m: number; d: number } {
  const [y, m, d] = k.split("-").map(Number);
  return { y, m, d };
}
function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function addDays(key: string, n: number): string {
  const { y, m, d } = parseKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function isoDay(key: string): number {
  const { y, m, d } = parseKey(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The first occurrence strictly after `after`, anchored on `start`
 * (the template's scheduled_on or created date). Returns null only when
 * the rule is unparseable.
 */
export function nextOccurrence(rrule: string, start: string, after: string): string | null {
  const rule = parseRule(rrule);
  if (!rule) return null;
  const startK = start.slice(0, 10);
  const afterK = after.slice(0, 10);

  switch (rule.freq) {
    case "DAILY": {
      let k = startK;
      if (k > afterK) return k;
      const diff = Math.floor((Date.parse(afterK) - Date.parse(startK)) / 86_400_000);
      const steps = Math.floor(diff / rule.interval) + 1;
      k = addDays(startK, steps * rule.interval);
      return k;
    }
    case "WEEKLY": {
      const days = rule.byday.length ? rule.byday : [isoDay(startK)];
      // walk day by day from the day after `after` (bounded)
      let k = afterK > startK ? addDays(afterK, 1) : startK;
      for (let i = 0; i < 400; i++) {
        const weeksFromStart = Math.floor((Date.parse(k) - Date.parse(startK)) / (7 * 86_400_000));
        const sameWeekPhase = ((weeksFromStart % rule.interval) + rule.interval) % rule.interval === 0;
        if (days.includes(isoDay(k)) && sameWeekPhase && k > afterK) return k;
        k = addDays(k, 1);
      }
      return null;
    }
    case "MONTHLY": {
      const { y: sy, m: sm, d: sd } = parseKey(startK);
      const dom = rule.bymonthday ?? sd;
      for (let i = 0; i < 240; i++) {
        const total = sy * 12 + (sm - 1) + i * rule.interval;
        const y = Math.floor(total / 12);
        const m = (total % 12) + 1;
        const k = toKey(y, m, Math.min(dom, daysInMonth(y, m)));
        if (k > afterK && k >= startK) return k;
      }
      return null;
    }
    case "YEARLY": {
      const { y: sy, m: sm, d: sd } = parseKey(startK);
      for (let i = 0; i < 50; i++) {
        const y = sy + i * rule.interval;
        const k = toKey(y, sm, Math.min(sd, daysInMonth(y, sm)));
        if (k > afterK) return k;
      }
      return null;
    }
  }
}

/** Occurrences in (after, until] — for "spawn within 7 days". */
export function occurrencesBetween(rrule: string, start: string, after: string, until: string, cap = 31): string[] {
  const out: string[] = [];
  let cursor = after;
  for (let i = 0; i < cap; i++) {
    const n = nextOccurrence(rrule, start, cursor);
    if (!n || n > until) break;
    out.push(n);
    cursor = n;
  }
  return out;
}

/** Combine a date key with a London wall-clock HH:MM into an ISO instant. */
export function londonDateTimeToIso(dateKey: string, hhmm: string): string {
  const [h, mi] = hhmm.split(":").map(Number);
  const { y, m, d } = parseKey(dateKey);
  // find the UTC instant whose London wall clock is y-m-d h:mi
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const offset = wall - guess; // London ahead of UTC by offset
  return new Date(guess - offset).toISOString();
}

/** The London HH:MM of an ISO instant. */
export function londonTimeOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
