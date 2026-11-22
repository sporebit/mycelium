/**
 * PhirstMaxx research — opening hours, the one shape (spec §6 step 3).
 *
 * Every reader that finds opening hours (schema.org JSON-LD on a site, an
 * OpenStreetMap `opening_hours` tag, Google Places periods) turns them into
 * `WeeklyHours` here, so the engine asks one question of one shape: "is it
 * open for this span?". Pure: no I/O, no clock of its own.
 *
 * The shape: a list of spans per weekday, 0 = Sunday, times "HH:mm" in
 * Europe/London. A close of "24:00" means midnight at the end of the day; a
 * close at or before the open ("18:00"–"02:00") runs past midnight into the
 * next day. A day with no spans is closed.
 *
 * Limits, on purpose: seasonal rules ("Apr-Oct …"), week numbers, public
 * holidays and open-ended times ("10:00+") are not modelled. `fromOsm`
 * returns null for anything it cannot read rather than guess; "PH off" and
 * "SH off" are ignored because a closed bank holiday does not change the
 * ordinary week. The fallback for an unreadable string is the raw text as a
 * lower-confidence fact (osm.ts), never invented hours.
 */

export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type HoursSpan = { open: string; close: string };
export type WeeklyHours = Record<DayIndex, HoursSpan[]>;

const DAYS: readonly DayIndex[] = [0, 1, 2, 3, 4, 5, 6];
const OSM_DAYS: Record<string, DayIndex> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const SCHEMA_DAYS: Record<string, DayIndex> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

export function emptyWeek(): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/** "9:00", "09:00:00", "0900" → "09:00"; "24:00" allowed; anything else null. */
export function normaliseTime(t: unknown): string | null {
  if (typeof t !== "string") return null;
  const m = /^(\d{1,2}):?(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function sortWeek(w: WeeklyHours): WeeklyHours {
  for (const d of DAYS) w[d].sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
  return w;
}

const hasAny = (w: WeeklyHours) => DAYS.some((d) => w[d].length > 0);

/**
 * schema.org `openingHoursSpecification` (one object or an array). Days come
 * as "Monday", "https://schema.org/Monday" or arrays of those. A spec with
 * no day applies to every day; one with no times is skipped. "23:59" as a
 * close is read as "24:00", which is what sites mean by it; opens and
 * closes both "00:00" is schema.org for shut all day.
 */
export function fromSchemaOrg(specs: unknown): WeeklyHours | null {
  const list: unknown[] = Array.isArray(specs) ? specs : specs && typeof specs === "object" ? [specs] : [];
  const week = emptyWeek();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const spec = raw as Record<string, unknown>;
    const open = normaliseTime(spec.opens);
    let close = normaliseTime(spec.closes);
    if (close === "23:59" || (close === "00:00" && open !== "00:00")) close = "24:00";
    const dayRaw = spec.dayOfWeek;
    const dayList: unknown[] | null = Array.isArray(dayRaw) ? dayRaw : dayRaw == null ? null : [dayRaw];
    const days: DayIndex[] = dayList === null ? [...DAYS] : [];
    for (const d of dayList ?? []) {
      const name = typeof d === "string" ? d : d && typeof d === "object" ? String((d as Record<string, unknown>)["@id"] ?? "") : "";
      const key = name.replace(/^.*[/#]/, "").toLowerCase();
      if (key in SCHEMA_DAYS) days.push(SCHEMA_DAYS[key]);
    }
    if (!days.length || !open || !close || (open === "00:00" && close === "00:00")) continue;
    for (const d of days) week[d].push({ open, close });
  }
  return hasAny(week) ? sortWeek(week) : null;
}

function parseOsmDays(sel: string): DayIndex[] | null {
  const out: DayIndex[] = [];
  for (const part of sel.split(",")) {
    const range = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!range) return null;
    const a = OSM_DAYS[range[1]];
    const b = range[2] ? OSM_DAYS[range[2]] : a;
    // Ranges run Monday-first and may wrap: "Sa-Mo" is Saturday, Sunday, Monday.
    const ma = (a + 6) % 7;
    const mb = (b + 6) % 7;
    const len = ((mb - ma + 7) % 7) + 1;
    for (let i = 0; i < len; i += 1) out.push(((ma + i + 1) % 7) as DayIndex);
  }
  return out;
}

function parseOsmTimes(sel: string): HoursSpan[] | null {
  const out: HoursSpan[] = [];
  for (const part of sel.split(",")) {
    const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!m) return null;
    const open = normaliseTime(`${m[1]}:${m[2]}`);
    // OSM writes past-midnight closes as "26:00" as well as "02:00".
    const ch = Number(m[3]);
    const close = normaliseTime(`${ch > 24 ? ch - 24 : ch}:${m[4]}`);
    if (!open || !close) return null;
    out.push({ open, close: close === "00:00" ? "24:00" : close });
  }
  return out;
}

/**
 * An OpenStreetMap `opening_hours` value in its common forms: "24/7",
 * "Mo-Fr 09:00-17:00; Sa 10:00-16:00; Su off", "Mo,We 10:00-12:00,13:00-16:00",
 * a bare "10:00-18:00" (every day). Later rules override earlier ones for
 * the days they name, as OSM reads them. Days no rule names are closed.
 * Null for anything else (months, weeks, "sunset", "10:00+", comments).
 */
export function fromOsm(value: unknown): WeeklyHours | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const week = emptyWeek();
  let set = false;
  for (const ruleRaw of value.split(";")) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    if (rule === "24/7") {
      for (const d of DAYS) week[d] = [{ open: "00:00", close: "24:00" }];
      set = true;
      continue;
    }
    if (/^(PH|SH)\b/.test(rule)) continue;
    let days: DayIndex[] | null = [...DAYS];
    let rest = rule;
    if (/^(Mo|Tu|We|Th|Fr|Sa|Su)\b/.test(rule)) {
      const m = /^([A-Za-z,\s-]+?)\s+(\d.*|off|closed)$/i.exec(rule);
      if (!m) return null;
      days = parseOsmDays(m[1]);
      rest = m[2].trim();
    }
    if (!days) return null;
    if (/^(off|closed)$/i.test(rest)) {
      for (const d of days) week[d] = [];
      set = true;
      continue;
    }
    const times = parseOsmTimes(rest);
    if (!times) return null;
    for (const d of days) week[d] = times.map((t) => ({ ...t }));
    set = true;
  }
  return set ? sortWeek(week) : null;
}

type GooglePoint = { day?: number; hour?: number; minute?: number; time?: string };

function googlePoint(p: unknown): { day: DayIndex; minutes: number } | null {
  if (!p || typeof p !== "object") return null;
  const o = p as GooglePoint;
  if (typeof o.day !== "number" || o.day < 0 || o.day > 6) return null;
  let minutes: number | null = null;
  if (typeof o.hour === "number") minutes = o.hour * 60 + (typeof o.minute === "number" ? o.minute : 0);
  else if (typeof o.time === "string" && /^\d{4}$/.test(o.time)) minutes = Number(o.time.slice(0, 2)) * 60 + Number(o.time.slice(2));
  else if (o.hour === undefined && o.time === undefined) minutes = 0;
  if (minutes === null || minutes < 0 || minutes > 1440) return null;
  return { day: o.day as DayIndex, minutes };
}

/**
 * Google Places `regularOpeningHours.periods` (Places API New: {day, hour,
 * minute}; the legacy API's {day, time: "0900"} is read too). A period with
 * no close is open round the clock. A close one day on at or before the
 * open time stays one past-midnight span; longer periods are split by day.
 */
export function fromGooglePlaces(periods: unknown): WeeklyHours | null {
  if (!Array.isArray(periods) || !periods.length) return null;
  const week = emptyWeek();
  for (const raw of periods) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { open?: unknown; close?: unknown };
    const open = googlePoint(r.open);
    if (!open) continue;
    const close = r.close ? googlePoint(r.close) : null;
    if (!close) {
      if (open.minutes === 0) {
        for (const d of DAYS) week[d] = [{ open: "00:00", close: "24:00" }];
        return week;
      }
      continue;
    }
    const daysOn = (close.day - open.day + 7) % 7;
    if (daysOn === 0 && close.minutes > open.minutes) {
      week[open.day].push({ open: fromMinutes(open.minutes), close: fromMinutes(close.minutes) });
    } else if (daysOn === 1 && close.minutes <= open.minutes) {
      week[open.day].push({ open: fromMinutes(open.minutes), close: close.minutes === 0 ? "24:00" : fromMinutes(close.minutes) });
    } else {
      const span = daysOn === 0 ? 7 : daysOn;
      week[open.day].push({ open: fromMinutes(open.minutes), close: "24:00" });
      for (let i = 1; i < span; i += 1) week[((open.day + i) % 7) as DayIndex].push({ open: "00:00", close: "24:00" });
      if (close.minutes > 0) week[close.day].push({ open: "00:00", close: fromMinutes(close.minutes) });
    }
  }
  return hasAny(week) ? sortWeek(week) : null;
}

/** Minutes of continuous opening left from `minute` on `day`, counting a past-midnight carry from the day before. 0 = shut. */
function openRemaining(hours: WeeklyHours, day: DayIndex, minute: number): number {
  let end = 0;
  for (const s of hours[day]) {
    const o = toMinutes(s.open);
    const c = toMinutes(s.close);
    const stop = c > o ? c : 1440;
    if (minute >= o && minute < stop) end = Math.max(end, stop);
  }
  const prev = ((day + 6) % 7) as DayIndex;
  for (const s of hours[prev]) {
    const o = toMinutes(s.open);
    const c = toMinutes(s.close);
    if (c <= o && minute < c) end = Math.max(end, c);
  }
  return end > minute ? end - minute : 0;
}

/** Whether it is open at a London weekday (0 = Sunday) and "HH:mm". */
export function isOpenAt(hours: WeeklyHours, londonDay: DayIndex, time: string): boolean {
  const t = normaliseTime(time);
  if (!t || t === "24:00") return false;
  return openRemaining(hours, londonDay, toMinutes(t)) > 0;
}

const WEEKDAY: Record<string, DayIndex> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const londonFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** The London weekday (0 = Sunday) and minute of the day for an instant. */
export function londonWeekdayMinute(ms: number): { day: DayIndex; minute: number } {
  const parts = londonFmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: WEEKDAY[get("weekday")] ?? 0, minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/**
 * Whether it is open for the whole of [startMs, endMs), read in
 * Europe/London (a span across a clock change is read on the wall clock
 * either side). Walks from span end to span end rather than minute by
 * minute. A zero-length span asks about the start instant alone.
 */
export function isOpenFor(hours: WeeklyHours, startMs: number, endMs: number): boolean {
  const stop = Math.max(endMs, startMs + 1);
  let t = startMs;
  for (let guard = 0; t < stop && guard < 400; guard += 1) {
    const { day, minute } = londonWeekdayMinute(t);
    const left = openRemaining(hours, day, minute);
    if (left <= 0) return false;
    t = t - (t % 60_000) + left * 60_000;
  }
  return t >= stop;
}
