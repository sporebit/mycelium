/**
 * Reminders, pure (spec §6). One daily run decides, for each occasion:
 *
 *   task     when the occasion FIRST enters its longest lead window, one
 *            task is created (once: `reminder_task_id` remembers it);
 *   nudge    at each `lead_days` entry exactly (30 days out fires on that
 *            day and not again tomorrow), and a final one at 2 days when
 *            nothing is bought;
 *   nothing  once any gift for the occasion is given.
 *
 * The nudge text is deliberately vague (§12 flag 3): counts, never a name
 * or a thing. The detail lives behind the link.
 */
import { daysBetween } from "./occasions";
import { FINAL_NUDGE_DAYS, type GiftRow, type OccasionRow } from "./types";

export type OccasionGifts = Pick<GiftRow, "status">[];

export type Decision = {
  occasion_id: string;
  days_left: number;
  /** Create the reminder task today (the window opened and none exists). */
  open_task: boolean;
  /** A nudge is due today: which lead day it is, or "final". */
  nudge: number | "final" | null;
};

export function longestLead(o: Pick<OccasionRow, "lead_days">): number {
  const days = (o.lead_days ?? []).filter((n) => Number.isFinite(n) && n >= 0);
  return days.length ? Math.max(...days) : 0;
}

export function anyGiven(gifts: OccasionGifts): boolean {
  return gifts.some((g) => g.status === "given");
}

export function anyBought(gifts: OccasionGifts): boolean {
  return gifts.some((g) => g.status === "bought" || g.status === "given");
}

/** What today asks for one occasion. Null when nothing is due and no task is to open. */
export function decide(o: OccasionRow, gifts: OccasionGifts, today: string): Decision | null {
  if (o.archived_at) return null;
  const daysLeft = daysBetween(today, o.occurs_on);
  if (daysLeft < 0) return null;
  if (anyGiven(gifts)) return null;
  const openTask = !o.reminder_task_id && daysLeft <= longestLead(o);
  let nudge: Decision["nudge"] = null;
  const leads = (o.lead_days ?? []).filter((n) => Number.isFinite(n) && n >= 0);
  if (leads.includes(daysLeft)) nudge = daysLeft;
  else if (daysLeft === FINAL_NUDGE_DAYS && !anyBought(gifts)) nudge = "final";
  if (!openTask && nudge === null) return null;
  return { occasion_id: o.id, days_left: daysLeft, open_task: openTask, nudge };
}

/** "Gift for Kirsty — birthday, 23 May" (the task title; the task is private to the owner's space). */
export function taskTitle(o: Pick<OccasionRow, "name" | "kind" | "occurs_on">, personName: string | null): string {
  const day = formatDay(o.occurs_on);
  if (personName && o.kind === "birthday") return `Gift for ${personName} — birthday, ${day}`;
  if (personName) return `Gift for ${personName} — ${o.name}, ${day}`;
  return `Gifts for ${o.name} — ${day}`;
}

export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** Due a week before, never after the day itself. */
export function taskDue(o: Pick<OccasionRow, "occurs_on">, today: string): string {
  const due = shiftDays(o.occurs_on, -7);
  return due < today ? today : due;
}

export function shiftDays(date: string, by: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

export type NudgeCounts = { occasions: number; horizon_days: number; nothing_bought: number };

/**
 * The one vague line: "2 occasions in the next 30 days, 1 with nothing
 * bought". Never a name, never a thing, never an amount.
 */
export function nudgeText(c: NudgeCounts): string {
  const n = c.occasions;
  const head = `${n} ${n === 1 ? "occasion" : "occasions"} in the next ${c.horizon_days} days`;
  if (c.nothing_bought === 0) return `${head}, all with something bought`;
  return `${head}, ${c.nothing_bought} with nothing bought`;
}

/**
 * The counts behind a nudge: every open occasion inside the horizon (the
 * longest lead among them, at least the one that fired), and how many have
 * nothing bought.
 */
export function nudgeCounts(all: ReadonlyArray<{ occasion: OccasionRow; gifts: OccasionGifts }>, today: string, horizon: number): NudgeCounts {
  let occasions = 0;
  let nothingBought = 0;
  for (const { occasion, gifts } of all) {
    if (occasion.archived_at || anyGiven(gifts)) continue;
    const left = daysBetween(today, occasion.occurs_on);
    if (left < 0 || left > horizon) continue;
    occasions += 1;
    if (!anyBought(gifts)) nothingBought += 1;
  }
  return { occasions, horizon_days: horizon, nothing_bought: nothingBought };
}
