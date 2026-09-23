/**
 * "When" (tickets spec §18 R4–R7): the picker that replaced the urgency
 * labels. Every choice writes a date, in Europe/London; the choice itself is
 * kept in `tickets.due_window` so the row can say "Within a week" while the
 * date is still ahead, and OVERDUE once it is not. Pure: dates in, dates
 * out, no clock unless asked (`todayLondon`).
 */

export type DueWindow = "week" | "month" | "month_end" | "weekend" | "someday" | "date";

export const DUE_WINDOWS: readonly DueWindow[] = ["week", "month", "month_end", "weekend", "someday", "date"];

export const DUE_WINDOW_LABEL: Record<DueWindow, string> = {
  week: "Within a week",
  month: "Within a month",
  month_end: "End of the month",
  weekend: "On the weekend",
  someday: "Someday",
  date: "Pick a date",
};

export function isDueWindow(v: unknown): v is DueWindow {
  return typeof v === "string" && (DUE_WINDOWS as readonly string[]).includes(v);
}

/** Today's date in Europe/London as YYYY-MM-DD. */
export function todayLondon(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// --- calendar arithmetic on YYYY-MM-DD strings (no timezone involved) ---

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The last day of the month `date` is in. */
export function monthEnd(date: string): string {
  const [y, m] = parts(date);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return fmt(y, m, last);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [y, m, d] = parts(date);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export type Weekend = { saturday: string; sunday: string; label: string };

/**
 * The next `count` weekends to pick from. On a Saturday or Sunday the first
 * one is the weekend already under way, so "this weekend" stays choosable.
 */
export function weekendsFrom(today: string, count = 8): Weekend[] {
  const wd = isoWeekday(today);
  const firstSat = wd === 7 ? addDays(today, -1) : addDays(today, 6 - wd);
  const out: Weekend[] = [];
  for (let i = 0; i < count; i++) {
    const saturday = addDays(firstSat, i * 7);
    const sunday = addDays(saturday, 1);
    const label = i === 0 && (wd === 6 || wd === 7) ? "This weekend" : i === 0 ? "This coming weekend" : fmtWeekend(saturday, sunday);
    out.push({ saturday, sunday, label });
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtShort(date: string): string {
  const [, m, d] = parts(date);
  return `${d} ${MONTHS[m - 1]}`;
}

function fmtWeekend(sat: string, sun: string): string {
  const [, sm, sd] = parts(sat);
  const [, um, ud] = parts(sun);
  return sm === um ? `Sat ${sd}–${ud} ${MONTHS[sm - 1]}` : `Sat ${sd} ${MONTHS[sm - 1]} – ${ud} ${MONTHS[um - 1]}`;
}

export type WhenChoice =
  | { window: "week" | "month" | "month_end" | "someday" }
  | { window: "weekend"; saturday: string }
  | { window: "date"; date: string };

export type WhenDates = {
  due_window: DueWindow | null;
  deadline_on: string | null;
  scheduled_on: string | null;
  someday: boolean;
};

/** The dates a choice writes (R4). Deadline windows never set a scheduled date (R6). */
export function datesForWhen(choice: WhenChoice, today: string): WhenDates {
  switch (choice.window) {
    case "week":
      return { due_window: "week", deadline_on: addDays(today, 7), scheduled_on: null, someday: false };
    case "month":
      return { due_window: "month", deadline_on: addDays(today, 30), scheduled_on: null, someday: false };
    case "month_end":
      return { due_window: "month_end", deadline_on: monthEnd(today), scheduled_on: null, someday: false };
    case "weekend":
      return { due_window: "weekend", scheduled_on: choice.saturday, deadline_on: addDays(choice.saturday, 1), someday: false };
    case "someday":
      return { due_window: "someday", deadline_on: null, scheduled_on: null, someday: true };
    case "date":
      return { due_window: "date", deadline_on: choice.date, scheduled_on: null, someday: false };
  }
}

/** The clear choice: no window, no dates, not someday. */
export const NO_WHEN: WhenDates = { due_window: null, deadline_on: null, scheduled_on: null, someday: false };

export type WhenSubject = {
  deadline_on?: string | null;
  due_date?: string | null;
  scheduled_on?: string | null;
  due_window?: DueWindow | string | null;
  someday?: boolean | null;
  category?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

const CLOSED = new Set(["done", "cancelled"]);

function closed(t: WhenSubject): boolean {
  return (t.category != null && CLOSED.has(t.category)) || !!t.completed_at || !!t.cancelled_at;
}

/** Overdue is a flag, not a status (R5): a past deadline on an open ticket. */
export function isOverdue(t: WhenSubject, today: string): boolean {
  if (closed(t)) return false;
  const deadline = t.deadline_on ?? t.due_date ?? null;
  return !!deadline && deadline < today;
}

/** Due within the next `days` days (inclusive of today), open only. Overdue counts as due. */
export function isDueWithin(t: WhenSubject, today: string, days: number): boolean {
  if (closed(t)) return false;
  const deadline = t.deadline_on ?? t.due_date ?? null;
  return !!deadline && deadline <= addDays(today, days);
}

export type WhenLabel = { kind: "overdue"; days: number } | { kind: "window"; text: string; date: string } | { kind: "someday" } | null;

/**
 * What a row shows: OVERDUE for a past deadline, the window label while the
 * date is ahead (a stale label never shows — it is overdue by then), a plain
 * date when there was no window, "someday" when parked.
 */
export function whenLabel(t: WhenSubject, today: string): WhenLabel {
  if (closed(t)) return null;
  const deadline = t.deadline_on ?? t.due_date ?? null;
  if (deadline && deadline < today) return { kind: "overdue", days: daysBetween(deadline, today) };
  if (deadline) {
    const w = isDueWindow(t.due_window) ? t.due_window : null;
    if (w === "weekend" && t.scheduled_on) return { kind: "window", text: `Weekend ${fmtShort(t.scheduled_on)}`, date: deadline };
    if (w && w !== "date" && w !== "someday") return { kind: "window", text: DUE_WINDOW_LABEL[w], date: deadline };
    return { kind: "window", text: deadline === today ? "Today" : `Due ${fmtShort(deadline)}`, date: deadline };
  }
  if (t.someday) return { kind: "someday" };
  return null;
}

/**
 * The classifier still speaks in the old labels; a capture's label becomes a
 * When at the insert (R7's rule, applied live), so the `urgency` column is
 * never written again.
 */
export function whenFromUrgency(urgency: unknown, today: string): Partial<WhenDates> {
  switch (urgency) {
    case "today":
      return datesForWhen({ window: "date", date: today }, today);
    case "this_week":
      return datesForWhen({ window: "week" }, today);
    case "this_month":
      return datesForWhen({ window: "month" }, today);
    case "someday":
      return datesForWhen({ window: "someday" }, today);
    default:
      return {};
  }
}

// --- buckets: the classic Tasks board's columns, derived from the deadline ---

export type WhenBucket = "week" | "month" | "later" | "someday";
export const WHEN_BUCKETS: readonly WhenBucket[] = ["week", "month", "later", "someday"];
export const WHEN_BUCKET_LABEL: Record<WhenBucket, string> = {
  week: "THIS WEEK",
  month: "THIS MONTH",
  later: "LATER",
  someday: "SOMEDAY",
};

/** Which column a ticket sits in: by its deadline (or scheduled date), overdue counting as this week. */
export function bucketOf(t: WhenSubject, today: string): WhenBucket {
  if (t.someday) return "someday";
  const d = t.deadline_on ?? t.due_date ?? t.scheduled_on ?? null;
  if (!d) return "later";
  if (d <= addDays(today, 7)) return "week";
  if (d <= addDays(today, 30)) return "month";
  return "later";
}

/** Days out that a drop into LATER dates a ticket (Phil, 2026-09-23). */
export const LATER_DAYS = 90;

/**
 * Dropping into a column writes a When with its dates, so the due date moves
 * with the card: this week +7, this month +30, later +90 (a picked date),
 * someday parks it. The server derives the same dates from `due_window`.
 */
export function whenForBucket(b: WhenBucket, today: string = todayLondon()): WhenDates {
  switch (b) {
    case "week":
      return datesForWhen({ window: "week" }, today);
    case "month":
      return datesForWhen({ window: "month" }, today);
    case "later":
      return datesForWhen({ window: "date", date: addDays(today, LATER_DAYS) }, today);
    case "someday":
      return datesForWhen({ window: "someday" }, today);
  }
}
