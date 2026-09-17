/**
 * Tickets — shared vocabulary (isomorphic: safe in client and server code).
 *
 * The GTD lists, the Now view and automation bind to a status's *category*,
 * never its name (spec Flag 2). A project workflow may rename or add
 * statuses, but every status maps to exactly one of these eight categories.
 */

export const TICKET_CATEGORIES = [
  "inbox",
  "backlog",
  "next",
  "doing",
  "waiting",
  "verify",
  "done",
  "cancelled",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  inbox: "Inbox",
  backlog: "Backlog",
  next: "Next",
  doing: "Doing",
  waiting: "Waiting",
  verify: "Verify",
  done: "Done",
  cancelled: "Cancelled",
};

/** Forward order — automation only moves forward (spec §6). */
export const CATEGORY_ORDER: Record<TicketCategory, number> = {
  inbox: 0,
  backlog: 1,
  next: 2,
  doing: 3,
  waiting: 4,
  verify: 5,
  done: 6,
  cancelled: 7,
};

export const OPEN_CATEGORIES: readonly TicketCategory[] = [
  "inbox",
  "backlog",
  "next",
  "doing",
  "waiting",
  "verify",
];
export const CLOSED_CATEGORIES: readonly TicketCategory[] = ["done", "cancelled"];

export function isClosedCategory(c: string | null | undefined): boolean {
  return c === "done" || c === "cancelled";
}

/**
 * Non-technical rendering collapses the eight categories to four buckets
 * (spec §6). Used when ui_prefs.tickets.simple_statuses is on.
 */
export type SimpleBucket = "todo" | "doing" | "waiting" | "done";
export const SIMPLE_BUCKETS: readonly SimpleBucket[] = ["todo", "doing", "waiting", "done"];
export const SIMPLE_BUCKET_LABEL: Record<SimpleBucket, string> = {
  todo: "Todo",
  doing: "Doing",
  waiting: "Waiting",
  done: "Done",
};
export function simpleBucketOf(c: TicketCategory): SimpleBucket {
  switch (c) {
    case "inbox":
    case "backlog":
    case "next":
      return "todo";
    case "doing":
    case "verify":
      return "doing";
    case "waiting":
      return "waiting";
    case "done":
    case "cancelled":
      return "done";
  }
}
/** The category a simple bucket lands in when chosen from the collapsed UI. */
export const SIMPLE_BUCKET_TARGET: Record<SimpleBucket, TicketCategory> = {
  todo: "next",
  doing: "doing",
  waiting: "waiting",
  done: "done",
};

export const CATEGORY_TONE: Record<TicketCategory, { fg: string; bg: string; border: string }> = {
  inbox: { fg: "text-glow-2", bg: "bg-glow-2/10", border: "border-glow-2/30" },
  backlog: { fg: "text-ink-3", bg: "bg-ink-2/40", border: "border-ink-2" },
  next: { fg: "text-accent", bg: "bg-accent/10", border: "border-accent/30" },
  doing: { fg: "text-accent", bg: "bg-accent/15", border: "border-accent/40" },
  waiting: { fg: "text-warn", bg: "bg-warn/15", border: "border-warn/40" },
  verify: { fg: "text-glow-2", bg: "bg-glow-2/15", border: "border-glow-2/40" },
  done: { fg: "text-ok", bg: "bg-ok/15", border: "border-ok/40" },
  cancelled: { fg: "text-ink-3", bg: "bg-ink-2/40", border: "border-ink-2" },
};

// ---------------------------------------------------------------------
// Context facets (spec §3.3)
// ---------------------------------------------------------------------

export const WHERE_CTX = ["anywhere", "home", "out", "place"] as const;
export type WhereCtx = (typeof WHERE_CTX)[number];
export const WHERE_LABEL: Record<WhereCtx, string> = {
  anywhere: "Anywhere",
  home: "Home",
  out: "Out",
  place: "A place",
};
export const WHERE_GLYPH: Record<WhereCtx, string> = {
  anywhere: "✨",
  home: "🏠",
  out: "🚶",
  place: "📍",
};

/** Tool is an open vocabulary; these are the chips. */
export const TOOL_PRESETS = ["none", "phone", "pc", "car"] as const;
export const TOOL_GLYPH: Record<string, string> = {
  none: "🌿",
  phone: "📱",
  pc: "🖥️",
  car: "🚗",
};

export const TIME_WINDOWS = ["anytime", "office_hours", "evenings", "weekend", "custom"] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];
export const TIME_WINDOW_LABEL: Record<TimeWindow, string> = {
  anytime: "Anytime",
  office_hours: "Office hours",
  evenings: "Evenings",
  weekend: "Weekend",
  custom: "Custom",
};

export const POINTS = [1, 2, 3, 5, 8, 13] as const;
export type Points = (typeof POINTS)[number];

/** Energy chip on the Now view (spec Q33): Low ≤2 · Normal ≤5 · All. */
export const ENERGY_CHIPS = [
  { value: 2, label: "Low" },
  { value: 5, label: "Normal" },
  { value: null, label: "All" },
] as const;

export const TICKET_KINDS = [
  "task",
  "habit",
  "reminder",
  "runbook",
  "test",
  "guide",
  "audit",
  "setup",
] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

/** Life kinds get app-generated rundowns; code plans come from the skill. */
export const RUNBOOK_KINDS: readonly TicketKind[] = ["runbook", "test", "guide", "audit", "setup"];

// ---------------------------------------------------------------------
// GTD lists (spec §3.2, §11 `list=`)
// ---------------------------------------------------------------------

export const GTD_LISTS = [
  "now",
  "inbox",
  "today",
  "upcoming",
  "next",
  "waiting",
  "someday",
  "logbook",
] as const;
export type GtdList = (typeof GTD_LISTS)[number];
export const GTD_LIST_LABEL: Record<GtdList, string> = {
  now: "Now",
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  next: "Next",
  waiting: "Waiting",
  someday: "Someday",
  logbook: "Logbook",
};

// ---------------------------------------------------------------------
// Time-window membership (spec §5) — evaluated on the Europe/London clock.
// ---------------------------------------------------------------------

export type LondonNow = {
  /** 1 = Monday … 7 = Sunday (ISO). */
  isoDay: number;
  /** Minutes since midnight. */
  minutes: number;
  /** YYYY-MM-DD */
  date: string;
};

export function londonNow(d: Date = new Date()): LondonNow {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  const isoDay = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd] ?? 1;
  const hour = Number(get("hour")) % 24;
  const minutes = hour * 60 + Number(get("minute"));
  return { isoDay, minutes, date: `${get("year")}-${get("month")}-${get("day")}` };
}

function hm(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

export function timeWindowContains(
  now: LondonNow,
  window: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
  days: number[] | null | undefined,
): boolean {
  switch (window) {
    case "office_hours":
      return now.isoDay <= 5 && now.minutes >= 9 * 60 && now.minutes < 17 * 60;
    case "evenings":
      return now.minutes >= 18 * 60 && now.minutes < 22 * 60;
    case "weekend":
      return now.isoDay >= 6;
    case "custom": {
      if (days && days.length > 0 && !days.includes(now.isoDay)) return false;
      const f = hm(from);
      const t = hm(to);
      if (f !== null && now.minutes < f) return false;
      if (t !== null && now.minutes >= t) return false;
      return true;
    }
    default:
      return true;
  }
}

/** Auto-detected Tool set from the device class (spec §5). */
export function toolsForDevice(device: "pc" | "phone" | "tablet"): string[] {
  if (device === "pc") return ["pc", "phone"];
  return ["phone"];
}

/** The key regex used in commits and search (spec §7.1). */
export const TICKET_KEY_RE = /\b[A-Z][A-Z0-9]{1,4}-\d+\b/g;
export function looksLikeKey(s: string): boolean {
  return /^[A-Z][A-Z0-9]{1,4}-\d+$/.test(s.trim().toUpperCase());
}
