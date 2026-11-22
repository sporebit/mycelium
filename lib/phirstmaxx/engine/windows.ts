/**
 * PhirstMaxx engine — together-windows (the old app's overlap finder).
 *
 * Pure. Given everyone's blocks for a range, returns the spans when they are
 * all free during waking hours. Each person's own hours are used (weekday,
 * or weekend where "weekend" means Friday and Saturday NIGHTS, the ones that
 * run late), intersected, so a window can cross midnight; it belongs to the
 * London day it starts on. An end at or before the start means the next day.
 *
 * Precedence, as the old decision log has it:
 *  - Hard busy: every firm block that is not `free` (unconfirmed ones too,
 *    to be safe), plus that person's buffer after it by kind.
 *  - Flexible busy: free with a penalty. Windows on it come out as
 *    firmness "flexible", emitted separately from firm ones and never
 *    overlapping them. A flexible block has no buffer tail.
 *  - A `free` block overrides flexible blocks it overlaps ("free tonight"
 *    beats "at work-ish"), never hard busy ones.
 *  - Overnight sits are hard busy unless the sitter has said they are
 *    joinable, when they behave like flexible blocks.
 *  - A window on a day someone has not filled in is `tentative`.
 */
import type { EngineBlock, EngineKind, EnginePerson, Firmness, Interval, TogetherWindow } from "../types";
import { intersect, merge, minutesOf, subtract } from "./intervals";
import { expandRecurrence } from "./recurrence";
import { addLondonDays, eachLondonDay, isoWeekdayOf, londonDate, londonTime } from "./time";

export type WakingHours = EnginePerson["waking"]["weekday"];
export type WakingSettings = EnginePerson["waking"];
export type BufferSettings = EnginePerson["buffers"];

/** Stargazers' hours: later on Friday and Saturday nights. */
export const DEFAULT_WAKING: WakingSettings = {
  weekday: { start: "07:00", end: "23:00" },
  weekend: { start: "08:00", end: "00:30" },
};
export const DEFAULT_BUFFERS: BufferSettings = { shift: 15, sit: 30, walk: 15 };
/** Kinds with no personal buffer fall back to these. */
export const DEFAULT_KIND_BUFFERS: Record<EngineKind, number> = { work: 0, shift: 15, walk: 15, sit: 30, busy: 0, free: 0, faith: 0 };
export const DEFAULT_MIN_WINDOW_MINUTES = 90;

export type BlockStatus = "confirmed" | "pending_confirm" | "rejected";

/** An engine block plus what the windows finder also reads. */
export type WindowBlock = EngineBlock & {
  rule?: string | null;
  exceptions?: string[];
  status?: BlockStatus;
  has_car?: boolean;
  has_pet?: boolean;
};

export type WindowPersonInput = EnginePerson & {
  blocks: WindowBlock[];
  /** London dates this person has filled in; omitted means every day counts as known. */
  knownDays?: ReadonlySet<string>;
  overnightSitsJoinable?: boolean;
  has_car?: boolean;
  has_pet?: boolean;
};

/** Where someone is at the start of a window, and with what. */
export type WindowPerson = { person_id: string; place_id: string | null; has_car: boolean; has_pet: boolean };

export type EngineWindow = TogetherWindow & { minutes: number; tentative: boolean; people: WindowPerson[] };

export type WindowsInput = {
  range: Interval;
  people: WindowPersonInput[];
  minWindowMinutes?: number;
  /** Buffers for kinds a person has none of their own for (work, busy, faith). */
  kindBuffers?: Partial<Record<EngineKind, number>>;
  /**
   * "Late one tonight": London day to a later end ("HH:mm"; at or before
   * that day's waking start means the next day). Extends everyone's evening.
   */
  dayOverrides?: Record<string, string>;
};

/** Friday and Saturday nights are the ones that run late. */
export function isWeekendNight(day: string): boolean {
  const weekday = isoWeekdayOf(day);
  return weekday === 5 || weekday === 6;
}

export function wakingFor(waking: WakingSettings, day: string): WakingHours {
  return isWeekendNight(day) ? waking.weekend : waking.weekday;
}

/** The instant a waking day starting on `day` ends, crossing midnight if need be. */
export function wakingEnd(day: string, start: string, end: string): number {
  return end <= start ? londonTime(addLondonDays(day, 1), end) : londonTime(day, end);
}

/** A person's buffer after a hard block of `kind`, in minutes. */
export function bufferFor(buffers: BufferSettings, kind: EngineKind, fallback: Partial<Record<EngineKind, number>> = {}): number {
  if (kind === "shift" || kind === "sit" || kind === "walk") return buffers[kind];
  return fallback[kind] ?? DEFAULT_KIND_BUFFERS[kind];
}

type Occ = { block: WindowBlock; start: number; end: number };

function occurrences(person: WindowPersonInput, range: Interval): Occ[] {
  const out: Occ[] = [];
  for (const block of person.blocks) {
    if (block.status === "rejected") continue;
    const hits = expandRecurrence({ start: block.start, end: block.end, rule: block.rule ?? null, exceptions: block.exceptions }, range);
    for (const o of hits) out.push({ block, start: o.start, end: o.end });
  }
  return out.sort((a, b) => a.start - b.start);
}

const isOvernight = (o: Occ) => londonDate(o.start) !== londonDate(o.end - 1);

/**
 * One person's waking intervals for every London day the range touches. The
 * day before is included because its evening may run past midnight.
 */
function wakingHours(range: Interval, person: WindowPersonInput, overrides: Record<string, string>): Interval[] {
  const days = eachLondonDay(range.start - 86_400_000, range.end);
  const spans = days.map((day) => {
    const w = wakingFor(person.waking, day);
    let end = wakingEnd(day, w.start, w.end);
    const late = overrides[day];
    if (late) end = Math.max(end, wakingEnd(day, w.start, late));
    return { start: londonTime(day, w.start), end };
  });
  return intersect(merge(spans), [range]);
}

function availability(person: WindowPersonInput, occs: Occ[], waking: Interval[], kindBuffers: Partial<Record<EngineKind, number>>) {
  const hard: Interval[] = [];
  const soft: Interval[] = [];
  const free: Interval[] = [];
  for (const o of occs) {
    const kind = o.block.kind;
    if (kind === "free") {
      free.push({ start: o.start, end: o.end });
      continue;
    }
    const joinableSit = kind === "sit" && Boolean(person.overnightSitsJoinable) && isOvernight(o);
    if (o.block.firmness === "flexible" || joinableSit) {
      soft.push({ start: o.start, end: o.end });
    } else {
      hard.push({ start: o.start, end: o.end + bufferFor(person.buffers, kind, kindBuffers) * 60_000 });
    }
  }
  const any = subtract(waking, hard);
  const firm = subtract(any, subtract(soft, free));
  return { any: merge(any), firm: merge(firm) };
}

function personAt(person: WindowPersonInput, occs: Occ[], at: number): WindowPerson {
  const day = londonDate(at);
  // An explicit free block covering the start is the strongest statement;
  // otherwise the block that ended most recently that day says where they are.
  const freeHere = occs.find((o) => o.block.kind === "free" && o.start <= at && o.end > at);
  const before = occs.filter((o) => o.end <= at && londonDate(o.end - 1) === day).sort((a, b) => b.end - a.end)[0];
  const ref = freeHere ?? before;
  return {
    person_id: person.id,
    place_id: ref?.block.place_id ?? person.home_place_id,
    has_car: ref?.block.has_car ?? person.has_car ?? false,
    has_pet: ref?.block.has_pet ?? person.has_pet ?? false,
  };
}

export function findWindows(input: WindowsInput): EngineWindow[] {
  const { range, people } = input;
  if (people.length === 0 || range.end <= range.start) return [];
  const overrides = input.dayOverrides ?? {};
  const kindBuffers = input.kindBuffers ?? {};

  const perPerson = people.map((p) => {
    const occs = occurrences(p, range);
    return { person: p, occs, ...availability(p, occs, wakingHours(range, p, overrides), kindBuffers) };
  });

  let any = perPerson[0].any;
  let firm = perPerson[0].firm;
  for (const p of perPerson.slice(1)) {
    any = intersect(any, p.any);
    firm = intersect(firm, p.firm);
  }
  const flexible = subtract(any, firm);
  const minMs = (input.minWindowMinutes ?? DEFAULT_MIN_WINDOW_MINUTES) * 60_000;

  const build = (i: Interval, firmness: Firmness): EngineWindow => {
    const day = londonDate(i.start);
    return {
      start: i.start,
      end: i.end,
      firmness,
      day,
      minutes: minutesOf(i),
      tentative: perPerson.some((p) => p.person.knownDays !== undefined && !p.person.knownDays.has(day)),
      people: perPerson.map((p) => personAt(p.person, p.occs, i.start)),
    };
  };

  return [
    ...firm.filter((i) => i.end - i.start >= minMs).map((i) => build(i, "firm")),
    ...flexible.filter((i) => i.end - i.start >= minMs).map((i) => build(i, "flexible")),
  ].sort((a, b) => a.start - b.start);
}

/** Sum of firm, non-tentative window minutes: what a home screen headline shows. */
export function totalFirmMinutes(windows: EngineWindow[]): number {
  return windows.filter((w) => w.firmness === "firm" && !w.tentative).reduce((sum, w) => sum + w.minutes, 0);
}
