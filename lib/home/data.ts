/**
 * Loads the Home data contract for the signed-in person (contract.ts).
 * Every part that can fail on its own does so quietly: Home with the hours
 * ruler missing is still Home.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { countWaiting } from "@/lib/capture/queue";
import { ensurePlan, FINISHED_STATES, getPlan, type Plan } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { type TodayCard, viewOf } from "@/lib/daily/view";
import { goneQuiet } from "@/lib/dormant/features";
import { featureStatesFor } from "@/lib/dormant/server";
import { addDays, buildIndex, fmtHm, mondayOf, weekSummary } from "@/lib/hours/calc";
import { ABSENCE_SELECT, ENTRY_SELECT, HOLIDAY_SELECT, type HoursBundle, SETTINGS_SELECT } from "@/lib/hours/types";
import { openNudges } from "@/lib/system/nudges";
import { todayLondon } from "@/lib/tickets/when";
import type { HomeData, HomeHours, HomeItem, HomeWeekDay } from "./contract";
import { seedOf } from "./specimen";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A title cut to fit a small figure, on a word where it can. Pure. */
export function shortTitle(title: string, max = 28): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/** The plan's cards as Home items: finished ones stay (coloured in), set-aside ones go. Pure. */
export function homeItems(cards: readonly TodayCard[]): HomeItem[] {
  return cards
    .filter((c) => ["planned", "started", ...FINISHED_STATES].includes(c.state))
    .map((c) => ({
      item_id: c.item_id,
      ticket_id: c.ticket_id,
      key: c.key,
      title: c.title,
      short: shortTitle(c.title),
      section: c.project,
      first_step: c.first_step,
      minutes: c.minutes,
      is_win: c.is_win,
      state: FINISHED_STATES.includes(c.state) ? ("done" as const) : c.state === "started" ? ("started" as const) : ("open" as const),
      seed: seedOf(c.ticket_id),
    }));
}

/** The seven days of this week with how many things were finished on each. Pure. */
export function weekDays(today: string, finishedOn: readonly string[]): HomeWeekDay[] {
  const monday = mondayOf(today);
  const counts = new Map<string, number>();
  for (const d of finishedOn) counts.set(d, (counts.get(d) ?? 0) + 1);
  return DAY_LABELS.map((label, i) => {
    const date = addDays(monday, i);
    return { date, label, done: counts.get(date) ?? 0, is_today: date === today, is_future: date > today };
  });
}

const londonDay = (iso: string) => todayLondon(new Date(iso));

async function finished(db: SupabaseClient, uid: string, today: string): Promise<{ week: string[]; count: number; since: string | null }> {
  const monday = mondayOf(today);
  // A little before Monday in UTC so a Monday 00:30 BST completion is not lost; sorted into London days below.
  const from = new Date(Date.parse(`${monday}T00:00:00Z`) - 2 * 3_600_000).toISOString();
  const [week, total, first] = await Promise.all([
    db.from("tickets").select("completed_at").eq("created_by", uid).is("deleted_at", null).gte("completed_at", from).limit(500),
    db.from("tickets").select("id", { count: "exact", head: true }).eq("created_by", uid).is("deleted_at", null).not("completed_at", "is", null),
    db.from("tickets").select("completed_at").eq("created_by", uid).is("deleted_at", null).not("completed_at", "is", null).order("completed_at", { ascending: true }).limit(1),
  ]);
  const days = ((week.data ?? []) as Array<{ completed_at: string }>).map((r) => londonDay(r.completed_at)).filter((d) => d >= monday && d <= today);
  const firstAt = (first.data as Array<{ completed_at: string }> | null)?.[0]?.completed_at ?? null;
  const since = firstAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "long", year: "numeric" }).format(new Date(firstAt)) : null;
  return { week: days, count: total.count ?? 0, since };
}

async function hours(db: SupabaseClient, today: string): Promise<HomeHours | null> {
  const [settings, entries, absences, holidays] = await Promise.all([
    db.from("hours_settings").select(SETTINGS_SELECT).maybeSingle(),
    db.from("hours_entries").select(ENTRY_SELECT).is("deleted_at", null).gte("entry_date", addDays(mondayOf(today), -7)),
    db.from("hours_absences").select(ABSENCE_SELECT),
    db.from("hours_bank_holidays").select(HOLIDAY_SELECT),
  ]);
  // No settings row: this person does not use Hours. No ruler.
  if (settings.error || !settings.data) return null;
  const bundle: HoursBundle = {
    settings: settings.data as HoursBundle["settings"],
    entries: (entries.data ?? []) as unknown as HoursBundle["entries"],
    absences: (absences.data ?? []) as unknown as HoursBundle["absences"],
    bankHolidays: (holidays.data ?? []) as unknown as HoursBundle["bankHolidays"],
  };
  const ws = weekSummary(buildIndex(bundle, today), mondayOf(today), today);
  if (!ws.target) return null;
  const left = Math.max(0, ws.remaining);
  const note = left === 0 ? `${fmtHm(ws.target)} met. Friday is clear.` : `left of ${fmtHm(ws.target)} this week.`;
  return { banked: ws.banked, target: ws.target, left, note };
}

const quietly = async <T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    console.error(`[home] ${what}:`, err instanceof Error ? err.message : err);
    return fallback;
  }
};

export async function loadHome(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<HomeData> {
  const settings = await dailySettings(db);
  return homeFrom(db, uid, now, await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes }));
}

/**
 * The same contract without making anything: null when the person has no
 * plan for today yet. For a screen that is looking in on someone (the wall,
 * master run §11) rather than the person themselves.
 */
export async function peekHome(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<HomeData | null> {
  const plan = await getPlan(db, uid, todayLondon(now), now);
  return plan ? homeFrom(db, uid, now, plan) : null;
}

async function homeFrom(db: SupabaseClient, uid: string, now: Date, plan: Plan): Promise<HomeData> {
  const day = todayLondon(now);
  const today = await viewOf(db, plan, now);
  const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const [done, hrs, waiting, quiet, profile, nudges] = await Promise.all([
    quietly("finished", () => finished(db, uid, day), { week: [], count: 0, since: null }),
    quietly("hours", () => hours(db, day), null),
    quietly("captures", () => countWaiting(db), 0),
    quietly("quiet", async () => goneQuiet(await featureStatesFor(db, now)), []),
    quietly("profile", async () => (await db.from("profiles").select("display_name").eq("id", uid).maybeSingle()).data as { display_name: string | null } | null, null),
    quietly("nudges", () => openNudges(db, now), []),
  ]);
  const days = weekDays(day, done.week);
  return {
    day,
    day_label: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" }).format(now),
    drawn_at: new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    who: { id: uid, name: profile?.display_name?.trim() || "You" },
    today,
    items: homeItems(today.items),
    week: { days, count: days.reduce((n, d) => n + d.done, 0) },
    lifetime: { count: done.count, since: done.since },
    hours: hrs,
    captures_waiting: waiting,
    quiet: quiet.map((q) => ({ href: q.href, label: q.label, how_long: q.how_long ?? "" })),
    family: null,
    finds: null,
    nudges: nudges.slice(0, 3).map((n) => ({ id: n.id, from: n.from, at: hhmm(n.at), text: n.text })),
  };
}
