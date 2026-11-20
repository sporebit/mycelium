/**
 * The occasions engine, pure (spec §5). Dates are London calendar dates as
 * YYYY-MM-DD strings; `today` is injected so every rule is testable.
 *
 *   - seeding: a birthday instance for every person with a birthday, and
 *     the fixed calendar (Christmas, Valentine's), each for the NEXT time
 *     it comes round;
 *   - roll-forward: an annual instance whose date has passed gets next
 *     year's row, carrying budget, lead days, kind and person, and pointing
 *     back;
 *   - idempotency: keyed on (person-or-shared, kind, year); a double run
 *     plans nothing. The unique index in 0181 is the last line of defence.
 *   - dob sync: a birthday instance that no longer matches the person's
 *     birthday moves to the right day (an edited date of birth fixes the
 *     next instance).
 *
 * 29 February: a birthday on a leap day falls on 28 February in a year
 * without one (house convention, listed for review).
 */
import { DEFAULT_LEAD_DAYS, FIXED_OCCASIONS, type OccasionKind, type OccasionRow } from "./types";

export const SHARED = "00000000-0000-0000-0000-000000000000";

export type OccasionSeed = {
  name: string;
  kind: OccasionKind;
  person_id: string | null;
  occurs_on: string;
  recurrence: "annual";
  source: "person_dob" | "fixed" | "manual";
  previous_occasion_id: string | null;
  budget: number | null;
  lead_days: number[];
  notes: string | null;
};

export type PersonBirthday = { id: string; name: string; birthday: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The calendar date of (month, day) in `year`; 29 Feb becomes 28 Feb when the year has none. */
export function dateIn(year: number, month: number, day: number): string {
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return `${year}-${pad(month)}-${pad(d)}`;
}

/** The next time (month, day) comes round on or after `today` (today itself counts). */
export function nextOccurrence(month: number, day: number, today: string): string {
  const year = Number(today.slice(0, 4));
  const thisYear = dateIn(year, month, day);
  return thisYear >= today ? thisYear : dateIn(year + 1, month, day);
}

/** The same occasion a year later, from its own date (not from today: a run that was late still lands on the right day). */
export function nextYear(occursOn: string): string {
  const [y, m, d] = occursOn.split("-").map(Number);
  // a 28 Feb that stands in for a leap-day birthday goes back to the 29th when the year allows
  return dateIn(y + 1, m, d);
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/** The idempotency key the unique index enforces: one annual instance per (person-or-shared, kind, year). */
export function instanceKey(personId: string | null, kind: string, year: number): string {
  return `${personId ?? SHARED}:${kind}:${year}`;
}

export function keysOf(existing: ReadonlyArray<Pick<OccasionRow, "person_id" | "kind" | "occurs_on" | "recurrence" | "archived_at">>): Set<string> {
  const keys = new Set<string>();
  for (const o of existing) if (o.recurrence === "annual" && !o.archived_at) keys.add(instanceKey(o.person_id, o.kind, yearOf(o.occurs_on)));
  return keys;
}

export function birthdayName(personName: string, year: number): string {
  return `${personName}'s birthday ${year}`;
}

/** Days from `from` to `to` (negative when `to` is earlier). Pure calendar arithmetic, no time zones. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Everything the daily run should create for one space: birthday instances
 * for people with a birthday and no instance for its next occurrence; the
 * fixed calendar's next instances; and next year's row for every annual
 * occasion whose date has passed. Nothing for a key that already exists.
 */
export function plan(
  existing: readonly OccasionRow[],
  people: readonly PersonBirthday[],
  today: string,
  opts: { fixed?: boolean } = {},
): OccasionSeed[] {
  const keys = keysOf(existing);
  const out: OccasionSeed[] = [];
  const take = (seed: OccasionSeed) => {
    const k = instanceKey(seed.person_id, seed.kind, yearOf(seed.occurs_on));
    if (keys.has(k)) return;
    keys.add(k);
    out.push(seed);
  };

  // 1. roll-forward: an annual instance whose day has passed gets next year's row
  for (const o of existing) {
    if (o.recurrence !== "annual" || o.archived_at || o.occurs_on >= today) continue;
    // only the newest instance of a line rolls (the 2024 row does not create 2025 when 2025 exists)
    take({
      name: o.kind === "birthday" && o.person_id ? renamedYear(o.name, yearOf(o.occurs_on), yearOf(nextYear(o.occurs_on))) : renamedYear(o.name, yearOf(o.occurs_on), yearOf(nextYear(o.occurs_on))),
      kind: o.kind,
      person_id: o.person_id,
      occurs_on: nextYear(o.occurs_on),
      recurrence: "annual",
      source: o.source === "manual" ? "manual" : o.source,
      previous_occasion_id: o.id,
      budget: o.budget,
      lead_days: o.lead_days?.length ? o.lead_days : [...DEFAULT_LEAD_DAYS],
      notes: null,
    });
  }

  // 2. seeding from People birthdays: the next time each comes round
  for (const p of people) {
    if (!p.birthday || !DATE_RE.test(p.birthday)) continue;
    const month = Number(p.birthday.slice(5, 7));
    const day = Number(p.birthday.slice(8, 10));
    const when = nextOccurrence(month, day, today);
    take({
      name: birthdayName(p.name, yearOf(when)),
      kind: "birthday",
      person_id: p.id,
      occurs_on: when,
      recurrence: "annual",
      source: "person_dob",
      previous_occasion_id: null,
      budget: null,
      lead_days: [...DEFAULT_LEAD_DAYS],
      notes: null,
    });
  }

  // 3. the fixed calendar
  if (opts.fixed !== false) {
    for (const f of FIXED_OCCASIONS) {
      const when = nextOccurrence(f.month, f.day, today);
      take({
        name: `${f.name} ${yearOf(when)}`,
        kind: f.kind,
        person_id: null,
        occurs_on: when,
        recurrence: "annual",
        source: "fixed",
        previous_occasion_id: null,
        budget: null,
        lead_days: [...DEFAULT_LEAD_DAYS],
        notes: null,
      });
    }
  }
  return out;
}

function renamedYear(name: string, from: number, to: number): string {
  return name.includes(String(from)) ? name.replace(String(from), String(to)) : `${name} ${to}`;
}

export type DobFix = { id: string; occurs_on: string; name: string };

/**
 * Birthday instances that no longer match the person's birthday (the date
 * of birth was edited): the open, future-or-today instance moves to the
 * right day of its own year. Past instances are history and stay.
 */
export function dobFixes(existing: readonly OccasionRow[], people: readonly PersonBirthday[], today: string): DobFix[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: DobFix[] = [];
  for (const o of existing) {
    if (o.source !== "person_dob" || o.archived_at || !o.person_id || o.occurs_on < today) continue;
    const p = byId.get(o.person_id);
    if (!p?.birthday || !DATE_RE.test(p.birthday)) continue;
    const want = dateIn(yearOf(o.occurs_on), Number(p.birthday.slice(5, 7)), Number(p.birthday.slice(8, 10)));
    if (want !== o.occurs_on) out.push({ id: o.id, occurs_on: want, name: birthdayName(p.name, yearOf(want)) });
  }
  return out;
}

/** Soonest first, with no past ones unless asked; archived never. */
export function upcoming(rows: readonly OccasionRow[], today: string, opts: { includePast?: boolean } = {}): OccasionRow[] {
  return rows
    .filter((o) => !o.archived_at && (opts.includePast || o.occurs_on >= today))
    .slice()
    .sort((a, b) => a.occurs_on.localeCompare(b.occurs_on) || a.name.localeCompare(b.name));
}
