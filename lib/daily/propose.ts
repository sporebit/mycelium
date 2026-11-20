/**
 * The morning proposal (master run §6; research rules 9, 16, 17).
 *
 * Today holds up to five items. The first is the one that makes the day a
 * win; the rest are "if there's time". The proposal is worked out from
 * dates, what is already started, priority and size, with no model: every
 * choice here can be explained in one line, and that line is kept
 * (`why`) so the card can say it.
 *
 * Pure: tickets and a date in, a plan out. No clock, no database.
 *
 * What the research asked for and how it is met here:
 *   rule 9   time shown is the person's guess × 1.5 (`shownMinutes`)
 *   rule 14  something that slipped a week ago is not pushed to the front
 *            again; it is held back for one Re-date / Someday / Drop card
 *   rule 17  one win plus up to four extras; the extras fit inside half of
 *            the day's free time, or they are five-minute things
 * Phil's decisions: five items; the first is marked as the win.
 */

export const MAX_ITEMS = 5;
/** Shown time = the guess × this (people with ADHD under-estimate; research rule 9). */
export const ESTIMATE_FACTOR = 1.5;
/** A ticket with no estimate is treated as this many minutes of guess. */
export const DEFAULT_GUESS_MIN = 30;
/** Slipped this many days or more: one decision card, not another day at the front. */
export const SLIPPED_DAYS = 7;
/** An extra this small may go in even when the time budget is spent. */
export const TINY_MIN = 15;

export type Candidate = {
  id: string;
  key: string | null;
  title: string;
  /** inbox | backlog | next | doing | waiting | verify */
  category: string;
  scheduled_on: string | null;
  deadline_on: string | null;
  urgent: boolean;
  points: number | null;
  time_estimate_min: number | null;
  priority_score: number | null;
  now_score: number | null;
  someday: boolean;
  blocked: boolean;
  /** 0–1 when the ticket has steps or sub-tasks; null when it has neither. */
  progress: number | null;
  next_step: string | null;
  project_name: string | null;
  /** Already offered as Re-date / Someday / Drop and still undecided. */
  slip_offered: boolean;
};

export type PlanItem = {
  ticket_id: string;
  position: number;
  is_win: boolean;
  /** Minutes to show on the card: the guess × 1.5, to the nearest five. */
  shown_minutes: number;
  why: string;
};

export type Proposal = {
  day: string;
  items: PlanItem[];
  /** Held back for one Re-date / Someday / Drop card each (rule 14). */
  slipped: string[];
  /** The next-best candidates, in order: what Swap offers. */
  bench: string[];
  budget_minutes: number;
  planned_minutes: number;
};

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function shownMinutes(guess: number | null | undefined): number {
  const base = guess && guess > 0 ? guess : DEFAULT_GUESS_MIN;
  return Math.max(5, Math.round((base * ESTIMATE_FACTOR) / 5) * 5);
}

/** The earliest of the two dates that is on or before `day`, or null. */
function dueBy(c: Candidate, day: string): string | null {
  const dates = [c.deadline_on, c.scheduled_on].filter((d): d is string => !!d && d <= day);
  return dates.length ? dates.sort()[0] : null;
}

/** How long ago the ticket's date passed, in days (0 = today, negative = still ahead or undated). */
export function slippedDays(c: Candidate, day: string): number {
  const due = dueBy(c, day);
  return due ? daysBetween(due, day) : -1;
}

type Scored = { c: Candidate; score: number; why: string };

export function score(c: Candidate, day: string): Scored {
  let s = 0;
  const reasons: Array<[number, string]> = [];
  const add = (n: number, why: string) => {
    s += n;
    reasons.push([n, why]);
  };

  if (c.deadline_on) {
    const d = daysBetween(day, c.deadline_on);
    if (d <= 0) add(100, d === 0 ? "Its date is today" : "Its date has passed");
    else if (d <= 3) add(35, `Its date is in ${d} day${d === 1 ? "" : "s"}`);
    else if (d <= 7) add(12, "Its date is this week");
  }
  if (c.scheduled_on && c.scheduled_on <= day) add(60, c.scheduled_on === day ? "Planned for today" : "Moved from an earlier day");
  if (c.urgent) add(40, "Marked urgent");
  if (c.category === "doing") add(30, "Already started");
  if (c.progress != null && c.progress >= 0.8 && c.progress < 1) add(25, "Nearly finished");
  if (c.category === "next") add(8, "Next in line");
  if (c.category === "inbox" || c.category === "backlog") add(-10, "Not yet lined up");

  const now = Math.max(0, Math.min(1, Number(c.now_score ?? 0)));
  const pri = Math.max(0, Math.min(1, Number(c.priority_score ?? 0)));
  const weight = Math.round(Math.max(now, pri) * 20);
  if (weight > 0) add(weight, "High priority");

  if (shownMinutes(c.time_estimate_min) <= TINY_MIN) add(4, "Quick to do");

  reasons.sort((a, b) => b[0] - a[0]);
  return { c, score: s, why: reasons[0]?.[1] ?? "Open and unblocked" };
}

export type ProposeInput = {
  day: string;
  candidates: Candidate[];
  /** Free minutes on this day (evenings on a work day, more at the weekend). */
  freeMinutes: number;
  /** Tickets the person asked not to see today ("Not now"). */
  exclude?: string[];
  maxItems?: number;
};

export function propose(input: ProposeInput): Proposal {
  const { day, freeMinutes } = input;
  const max = Math.max(1, Math.min(input.maxItems ?? MAX_ITEMS, MAX_ITEMS));
  const exclude = new Set(input.exclude ?? []);

  const open = input.candidates.filter(
    (c) => !c.someday && !c.blocked && !exclude.has(c.id) && ["inbox", "backlog", "next", "doing"].includes(c.category),
  );

  // Rule 14: a week past its date means the date was wrong. One card, once.
  const slipped: string[] = [];
  const pool: Candidate[] = [];
  for (const c of open) {
    if (slippedDays(c, day) >= SLIPPED_DAYS && c.category !== "doing") {
      if (!c.slip_offered) slipped.push(c.id);
      continue;
    }
    pool.push(c);
  }

  const ranked = pool
    .map((c) => score(c, day))
    .sort((a, b) => b.score - a.score || (a.c.deadline_on ?? "9999").localeCompare(b.c.deadline_on ?? "9999") || a.c.title.localeCompare(b.c.title));

  const budget = Math.max(0, Math.floor(freeMinutes / 2));
  const items: PlanItem[] = [];
  const taken = new Set<string>();
  let planned = 0;

  // The win: the strongest candidate. If it would not fit in the whole
  // budget by itself and something nearly as strong would, prefer the one
  // that can actually be finished today.
  let win = ranked[0];
  if (win && shownMinutes(win.c.time_estimate_min) > Math.max(budget, 60)) {
    const fits = ranked.find((r) => shownMinutes(r.c.time_estimate_min) <= Math.max(budget, 60) && r.score >= win!.score - 30);
    if (fits) win = fits;
  }
  if (win) {
    const minutes = shownMinutes(win.c.time_estimate_min);
    items.push({ ticket_id: win.c.id, position: 1, is_win: true, shown_minutes: minutes, why: win.why });
    taken.add(win.c.id);
    planned += minutes;
  }

  for (const r of ranked) {
    if (items.length >= max) break;
    if (taken.has(r.c.id)) continue;
    const minutes = shownMinutes(r.c.time_estimate_min);
    const fits = planned + minutes <= budget;
    const tiny = minutes <= TINY_MIN;
    if (!fits && !tiny) continue;
    items.push({ ticket_id: r.c.id, position: items.length + 1, is_win: false, shown_minutes: minutes, why: r.why });
    taken.add(r.c.id);
    planned += minutes;
  }

  const bench = ranked.filter((r) => !taken.has(r.c.id)).map((r) => r.c.id);
  return { day, items, slipped, bench, budget_minutes: budget, planned_minutes: planned };
}

/** The two alternatives Swap offers for one item (research rule 10: two, and no reason asked). */
export function swapOptions(p: Proposal, count = 2): string[] {
  return p.bench.slice(0, count);
}

/**
 * Free minutes for a day of the week (1 = Monday … 7 = Sunday). The defaults
 * are a working week with Friday off, as Phil's four-day week has it; the
 * setting `daily.free_minutes` overrides any day.
 */
export const DEFAULT_FREE_MINUTES: Record<number, number> = { 1: 180, 2: 180, 3: 180, 4: 180, 5: 360, 6: 360, 7: 300 };

export function freeMinutesFor(isoWeekday: number, overrides?: Partial<Record<number, number>> | null): number {
  const v = overrides?.[isoWeekday];
  return typeof v === "number" && v >= 0 ? v : (DEFAULT_FREE_MINUTES[isoWeekday] ?? 180);
}
