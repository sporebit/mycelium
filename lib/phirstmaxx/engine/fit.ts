/**
 * PhirstMaxx engine — does a thing fit a together-window? (spec §6 step 5)
 *
 * Pure and synchronous: the caller hands over the windows, everyone's
 * blocks, the thing, each person's buffers and a travel lookup it has
 * already filled from pm_travel (Google, then OpenRouteService, then the
 * straight-line estimate). Recomputed whenever blocks, facts or travel
 * change, so nothing here is stored.
 *
 * The rules, per window:
 *  - Each person sets off from where their previous block ends (the free
 *    block covering the start if there is one, else the block that ended
 *    last that day, else home), no earlier than the window start and that
 *    block's end plus their buffer.
 *  - Everyone arrives together: the later arrival sets the time, and the
 *    nearer person leaves later. Both from the same place is "together";
 *    two start points is "meet".
 *  - Each must get to their next block on time: if a block starts where the
 *    window ends, they travel to its place and arrive their buffer early;
 *    otherwise they are home by the window end (bedtime).
 *  - It must be open for the span (a weekly table; null means always open).
 *  - Time there at or over the thing's minimum fits, unless it would be
 *    within 10 minutes of the latest possible arrival, which is tight;
 *    70–100% of the minimum is tight; anything less does not fit.
 * Travel happens inside the window: the window is when everyone is free
 * and awake, and leaving before it would mean leaving a block early.
 */
import type {
  EngineBlock,
  EnginePerson,
  FitLeg,
  FitResult,
  FitVerdict,
  Interval,
  TogetherWindow,
  TravelMode,
  TravelProvider,
} from "../types";
import { intersect, merge } from "./intervals";
import { addLondonDays, isoWeekdayOf, londonClock, londonDate, londonTime } from "./time";
import { bufferFor, wakingEnd } from "./windows";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
/** "HH:mm" London; a close at or before the open means after midnight. */
export type OpeningSpan = { open: string; close: string };
/** A weekday missing from the table is closed that day. */
export type OpeningHours = Partial<Record<WeekdayKey, OpeningSpan[]>>;

export type FitThing = {
  lat: number | null;
  lng: number | null;
  /** Null falls back to DEFAULT_MIN_MINUTES. */
  min_minutes: number | null;
  /** No point staying longer than this; null means no cap. */
  max_minutes: number | null;
  /** Null means always open. */
  opening: OpeningHours | null;
  /** Carried for the forecast check, which belongs to the weather stage. */
  indoor: boolean | null;
};

export type TravelLookup = (fromPlaceId: string, mode: TravelMode) => { minutes: number; provider: TravelProvider } | null;

export type FitPerson = {
  person: Pick<EnginePerson, "id" | "buffers" | "home_place_id">;
  blocks: EngineBlock[];
  /** How this person travels; defaults to the input's mode, then drive. */
  mode?: TravelMode;
};

export type FitInput = {
  windows: TogetherWindow[];
  people: FitPerson[];
  thing: FitThing;
  travel: TravelLookup;
  /** Only windows inside this span; a window already under way is fitted from the horizon start. */
  horizon?: Interval;
  mode?: TravelMode;
};

export const DEFAULT_MIN_MINUTES = 60;
export const TIGHT_SHARE = 0.7;
export const TIGHT_SLACK_MINUTES = 10;

const MINUTE = 60_000;
const WEEKDAY_KEYS: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "45 min", "3 h", "3 h 10". */
export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${String(rest).padStart(2, "0")}` : `${Math.floor(m / 60)} h`;
}

/** "Sat 28 Nov" for a London date. */
export function formatDay(day: string): string {
  const [, mo, d] = day.split("-").map(Number);
  return `${WEEKDAY_SHORT[isoWeekdayOf(day) - 1]} ${d} ${MONTH_SHORT[mo - 1]}`;
}

/** Opening intervals touching [from, to], including spans from the day before that run past midnight. */
function openIntervals(opening: OpeningHours, from: number, to: number): Interval[] {
  const out: Interval[] = [];
  const last = londonDate(to);
  for (let day = addLondonDays(londonDate(from), -1); day <= last; day = addLondonDays(day, 1)) {
    for (const span of opening[WEEKDAY_KEYS[isoWeekdayOf(day) - 1]] ?? []) {
      out.push({ start: londonTime(day, span.open), end: wakingEnd(day, span.open, span.close) });
    }
  }
  return merge(out);
}

type Plan = {
  person_id: string;
  from: string | null;
  earliest: number;
  backTo: string | null;
  backBy: number;
  mode: TravelMode;
};

/** Where and when one person can set off, and where and by when they must be next. */
function planFor(p: FitPerson, w: TogetherWindow, start: number, mode: TravelMode): Plan {
  const { person, blocks } = p;
  const home = person.home_place_id;
  const day = londonDate(start);
  const freeHere = blocks.find((b) => b.kind === "free" && b.start <= start && b.end > start && b.place_id);
  const prev = blocks
    .filter((b) => b.kind !== "free" && b.end <= start && londonDate(b.end - 1) === day)
    .sort((a, b) => b.end - a.end)[0];
  const ready = prev ? prev.end + (prev.firmness === "firm" ? bufferFor(person.buffers, prev.kind) : 0) * MINUTE : start;

  const next = blocks
    .filter((b) => b.kind !== "free" && Math.abs(b.start - w.end) <= MINUTE)
    .sort((a, b) => a.start - b.start)[0];
  return {
    person_id: person.id,
    from: freeHere?.place_id ?? prev?.place_id ?? home,
    earliest: Math.max(start, ready),
    backTo: next ? next.place_id ?? home : home,
    backBy: next ? next.start - (next.firmness === "firm" ? bufferFor(person.buffers, next.kind) : 0) * MINUTE : w.end,
    mode,
  };
}

function result(
  w: TogetherWindow,
  verdict: FitVerdict,
  reason: string,
  mode: FitResult["mode"],
  extra: Partial<Pick<FitResult, "legs" | "arrive_at" | "leave_at" | "minutes_there">> = {},
): FitResult {
  return { verdict, reason, window: w, legs: extra.legs ?? [], arrive_at: extra.arrive_at ?? null, leave_at: extra.leave_at ?? null, minutes_there: extra.minutes_there ?? 0, mode };
}

function fitWindow(w: TogetherWindow, input: FitInput): FitResult | null {
  const start = Math.max(w.start, input.horizon?.start ?? w.start);
  const end = Math.min(w.end, input.horizon?.end ?? w.end);
  if (end <= start || (input.horizon && w.start >= input.horizon.end)) return null;

  const plans = input.people.map((p) => planFor(p, w, start, p.mode ?? input.mode ?? "drive"));
  const mode: FitResult["mode"] = plans.every((p) => p.from !== null && p.from === plans[0].from) ? "together" : "meet";
  if (plans.some((p) => p.from === null || p.backTo === null)) {
    return result(w, "no", "Doesn't fit: there is no start point for one of you yet.", mode);
  }

  const journeys = plans.map((p) => ({ p, out: input.travel(p.from as string, p.mode), back: input.travel(p.backTo as string, p.mode) }));
  if (journeys.some((j) => !j.out || !j.back)) {
    return result(w, "no", "Doesn't fit: there is no travel time from one of your start points yet.", mode);
  }

  let arrive = Math.max(...journeys.map((j) => j.p.earliest + (j.out?.minutes ?? 0) * MINUTE));
  let mustLeave = Math.min(...journeys.map((j) => j.p.backBy - (j.back?.minutes ?? 0) * MINUTE));
  if (mustLeave <= arrive) {
    return result(w, "no", "Doesn't fit: the journey there and back takes up the whole window.", mode);
  }

  const opening = input.thing.opening;
  if (opening) {
    const open = intersect(openIntervals(opening, arrive, mustLeave), [{ start: arrive, end: mustLeave }]);
    if (open.length === 0) {
      const day = londonDate(arrive);
      const today = opening[WEEKDAY_KEYS[isoWeekdayOf(day) - 1]] ?? [];
      const spans = openIntervals(opening, arrive, arrive);
      const why =
        today.length === 0 && !spans.some((s) => s.end > arrive)
          ? `closed on ${WEEKDAY_NAMES[isoWeekdayOf(day) - 1]}s`
          : spans.some((s) => s.start > arrive)
            ? `not open until ${londonClock(spans.find((s) => s.start > arrive)?.start ?? arrive)}`
            : "closed by the time you would arrive";
      return result(w, "no", `Doesn't fit: ${why}.`, mode);
    }
    // The longest open stretch; the first of equals.
    const best = open.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    arrive = best.start;
    mustLeave = best.end;
  }

  const min = input.thing.min_minutes ?? DEFAULT_MIN_MINUTES;
  const available = (mustLeave - arrive) / MINUTE;
  const there = input.thing.max_minutes !== null ? Math.min(available, input.thing.max_minutes) : available;
  const leaveAt = arrive + there * MINUTE;

  const legs: FitLeg[] = journeys.map((j) => {
    const minutes = j.out?.minutes ?? 0;
    return {
      person_id: j.p.person_id,
      from_place_id: j.p.from,
      leave_at: arrive - minutes * MINUTE,
      travel_minutes: minutes,
      arrive_at: arrive,
      mode: j.p.mode,
      provider: j.out?.provider ?? "estimate",
    };
  });
  const leaveBy = londonClock(Math.min(...legs.map((l) => l.leave_at)));
  const shown = formatDuration(there);
  const extra = { legs, arrive_at: arrive, leave_at: leaveAt, minutes_there: Math.round(there) };

  if (available >= min) {
    return available - min < TIGHT_SLACK_MINUTES
      ? result(w, "tight", `Tight: ${shown} there with little to spare, leave by ${leaveBy}.`, mode, extra)
      : result(w, "fits", `Fits: ${shown} there, leave by ${leaveBy}.`, mode, extra);
  }
  if (available >= min * TIGHT_SHARE) {
    return result(w, "tight", `Tight: ${shown} there against ${formatDuration(min)} needed, leave by ${leaveBy}.`, mode, extra);
  }
  return result(w, "no", `Doesn't fit: only ${shown} there, and it needs ${formatDuration(min)}.`, mode, extra);
}

/** One result per window in the horizon, in time order. */
export function fitThing(input: FitInput): FitResult[] {
  if (input.people.length === 0) return [];
  return [...input.windows]
    .sort((a, b) => a.start - b.start)
    .map((w) => fitWindow(w, input))
    .filter((r): r is FitResult => r !== null);
}

/**
 * The first result still ahead of `now` that fits (or, failing that, is
 * tight), in words: "next fits: Sat 28 Nov, 13:00–17:30, leave by 12:10".
 */
export function nextFit(results: FitResult[], now: number): { result: FitResult; text: string } | null {
  const ahead = results
    .filter((r) => r.arrive_at !== null && r.leave_at !== null && r.legs.length > 0 && Math.min(...r.legs.map((l) => l.leave_at)) >= now)
    .sort((a, b) => (a.arrive_at ?? 0) - (b.arrive_at ?? 0));
  const pick = ahead.find((r) => r.verdict === "fits") ?? ahead.find((r) => r.verdict === "tight");
  if (!pick || pick.arrive_at === null || pick.leave_at === null) return null;
  const label = pick.verdict === "fits" ? "next fits" : "next tight fit";
  const leaveBy = londonClock(Math.min(...pick.legs.map((l) => l.leave_at)));
  const text = `${label}: ${formatDay(londonDate(pick.arrive_at))}, ${londonClock(pick.arrive_at)}–${londonClock(pick.leave_at)}, leave by ${leaveBy}`;
  return { result: pick, text };
}
