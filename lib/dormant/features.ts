/**
 * Features that have gone quiet (master run §6; Phil's version, decided
 * 2026-11-20: marks in the navigation and on the dashboard, direct, not
 * softened).
 *
 * A feature is "used" when the person DOES something in it: adds, edits or
 * completes. Opening a page does not count. That is read from the rows the
 * feature itself keeps (their created and updated times), so the history
 * is true from the first day the feature existed, with nothing to backfill
 * and nothing new to record.
 *
 * Each feature has its own natural rhythm: something done daily is quiet
 * after a few days; something done monthly, after about six weeks.
 *
 * Pure: the config and the arithmetic. lib/dormant/server.ts reads the rows.
 */

export type Feature = {
  key: string;
  /** As the person would name it. */
  label: string;
  /** Where it lives; also the navigation entry that is dimmed. */
  href: string;
  /** Tables whose rows are written by the person doing something here (never by a sync or an import). */
  tables: readonly string[];
  /** Quiet when nothing has been added or changed for this many days. */
  quietAfterDays: number;
};

const DAILY = 4;
const WORKDAYS = 6;
const WEEKLY = 21;
const MONTHLY = 42;
const SELDOM = 120;

export const FEATURES: readonly Feature[] = [
  { key: "captures", label: "Capture", href: "/organisation/captures", tables: ["raw_captures"], quietAfterDays: DAILY },
  { key: "tickets", label: "Tickets", href: "/work", tables: ["tickets", "ticket_comments"], quietAfterDays: DAILY },
  { key: "daylog", label: "Day log", href: "/journal", tables: ["daylog_days", "daylog_scenes"], quietAfterDays: DAILY },
  { key: "habits", label: "Habits", href: "/organisation/habits", tables: ["daily_logs"], quietAfterDays: DAILY },
  { key: "workouts", label: "Workout log", href: "/fitness", tables: ["workout_sessions"], quietAfterDays: WORKDAYS },
  { key: "nutrition", label: "Nutrition log", href: "/health/nutrition", tables: ["nutrition_logs"], quietAfterDays: DAILY },
  { key: "supplements", label: "Supplements", href: "/health/supplements", tables: ["supplement_logs"], quietAfterDays: DAILY },
  { key: "hours", label: "Hours", href: "/organisation/hours", tables: ["hours_entries"], quietAfterDays: WORKDAYS },
  { key: "body", label: "Body measurements", href: "/fitness/body", tables: ["body_metrics"], quietAfterDays: WEEKLY },
  { key: "recipes", label: "Recipes and meal plan", href: "/health/recipes", tables: ["recipes", "meal_plan", "shopping_lists"], quietAfterDays: WEEKLY },
  { key: "media", label: "Media", href: "/organisation/media", tables: ["media_items", "media_episodes"], quietAfterDays: WEEKLY },
  { key: "boys", label: "The Boys", href: "/the-boys", tables: ["agent_messages"], quietAfterDays: WEEKLY },
  { key: "docs", label: "Docs", href: "/docs", tables: ["doc_pages"], quietAfterDays: MONTHLY },
  { key: "quotes", label: "Quotes", href: "/organisation/quotes", tables: ["quotes"], quietAfterDays: MONTHLY },
  { key: "people", label: "People", href: "/organisation/people", tables: ["people", "person_phones", "person_emails"], quietAfterDays: MONTHLY },
  { key: "receipts", label: "Receipts", href: "/organisation/receipts", tables: ["receipts"], quietAfterDays: MONTHLY },
  { key: "purchases", label: "Purchases", href: "/organisation/purchases", tables: ["purchases"], quietAfterDays: MONTHLY },
  { key: "ventures", label: "Ventures", href: "/ventures", tables: ["ventures", "venture_steps", "venture_inspiration"], quietAfterDays: MONTHLY },
  { key: "drops", label: "Drops", href: "/drops", tables: ["drops", "wishlist_items", "raffle_entries"], quietAfterDays: MONTHLY },
  { key: "places", label: "Places", href: "/places", tables: ["places"], quietAfterDays: SELDOM },
  // The family space (0171): quiet when neither a note, a name, a list, a cost nor a tap in the baby log for three weeks.
  { key: "family", label: "Family", href: "/family", tables: ["family_entries", "family_names", "family_name_votes", "family_list_items", "baby_log", "household_items", "household_costs"], quietAfterDays: WEEKLY },
  { key: "clinical", label: "Health records", href: "/health", tables: ["blood_test_sessions", "gut_health_logs", "eye_prescriptions"], quietAfterDays: SELDOM },
];

/** Every table the config reads, once. */
export function featureTables(features: readonly Feature[] = FEATURES): string[] {
  return [...new Set(features.flatMap((f) => f.tables))];
}

export type FeatureState = {
  key: string;
  label: string;
  href: string;
  /** When the person last did something here; null if never. */
  last_at: string | null;
  /** Whole days since then; null if never. */
  days_quiet: number | null;
  quiet_after_days: number;
  /** active: within its rhythm. quiet: past it. unused: nothing has ever been done here. */
  state: "active" | "quiet" | "unused";
  /** "9 weeks", "5 days": how long, for the card. Null unless quiet. */
  how_long: string | null;
};

/** "5 days", "3 weeks", "4 months", "2 years": plain, no drama. */
export function howLong(days: number): string {
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (days < 14) return n(Math.max(1, days), "day");
  if (days < 70) return n(Math.round(days / 7), "week");
  if (days < 730) return n(Math.round(days / 30), "month");
  return n(Math.round(days / 365), "year");
}

/**
 * Each feature's state from the last time each of its tables was written.
 * `lastByTable` holds ISO timestamps; a missing table or null means nothing
 * there.
 */
export function featureStates(lastByTable: Readonly<Record<string, string | null | undefined>>, now: Date = new Date(), features: readonly Feature[] = FEATURES): FeatureState[] {
  return features.map((f) => {
    let last = 0;
    for (const t of f.tables) {
      const at = lastByTable[t] ? Date.parse(lastByTable[t] as string) : NaN;
      if (Number.isFinite(at) && at > last) last = at;
    }
    if (!last) return { key: f.key, label: f.label, href: f.href, last_at: null, days_quiet: null, quiet_after_days: f.quietAfterDays, state: "unused", how_long: null };
    const days = Math.max(0, Math.floor((now.getTime() - last) / 86_400_000));
    const quiet = days >= f.quietAfterDays;
    return {
      key: f.key,
      label: f.label,
      href: f.href,
      last_at: new Date(last).toISOString(),
      days_quiet: days,
      quiet_after_days: f.quietAfterDays,
      state: quiet ? "quiet" : "active",
      how_long: quiet ? howLong(days) : null,
    };
  });
}

/**
 * What has gone quiet, longest relative to its own rhythm first: a daily
 * thing untouched for three weeks is a bigger gap than a monthly thing
 * untouched for seven. Never-used features are not "gone quiet": there was
 * nothing to stop.
 */
export function goneQuiet(states: readonly FeatureState[]): FeatureState[] {
  return states
    .filter((s) => s.state === "quiet")
    .sort((a, b) => (b.days_quiet as number) / b.quiet_after_days - (a.days_quiet as number) / a.quiet_after_days || a.label.localeCompare(b.label));
}

/** The navigation entries to dim: the href of each quiet feature. */
export function quietHrefs(states: readonly FeatureState[]): string[] {
  return states.filter((s) => s.state === "quiet").map((s) => s.href);
}

/** One direct line for the weekly close-out, about the single biggest gap. Null when nothing is quiet. */
export function quietQuestion(states: readonly FeatureState[]): string | null {
  const top = goneQuiet(states)[0];
  if (!top) return null;
  return `${top.label} has not been touched for ${top.how_long}. Why? Keep it, pause it, or retire it.`;
}
