/**
 * PhirstMaxx — a plan's legs, from a fit result and into words (spec §7).
 *
 * Pure. `legsFromFit` turns the engine's verdict for one window into the
 * pm_plan_legs rows for each person: leave, travel, arrive, there, home.
 * The way back is read as the way there in reverse (the engine assumes the
 * same, old decision "overrides are symmetric"). `legsInWords` is the line
 * that goes on the Family calendar and in the push:
 *
 *   "Leave by 12:10 · 55 min drive · there 13:05–16:30 · home by 17:25"
 */
import { formatDuration, londonClock } from "./engine";
import type { FitResult, PmPlanLeg, TravelMode } from "./types";

const MINUTE = 60_000;

const MODE_WORDS: Record<TravelMode, string> = { drive: "drive", walk: "walk", cycle: "cycle", transit: "by public transport" };

export type LegRow = Omit<PmPlanLeg, "plan_id">;

/** The legs for every person in a fit result; empty when the thing does not fit. */
export function legsFromFit(fit: FitResult, labels: { from?: Record<string, string>; thing?: string | null } = {}): LegRow[] {
  if (fit.arrive_at === null || fit.leave_at === null || fit.legs.length === 0) return [];
  const out: LegRow[] = [];
  const thingLabel = labels.thing ?? null;
  for (const leg of fit.legs) {
    const from = leg.from_place_id ? (labels.from?.[leg.from_place_id] ?? null) : null;
    const back = fit.leave_at + leg.travel_minutes * MINUTE;
    const iso = (ms: number) => new Date(ms).toISOString();
    let position = 0;
    const push = (row: Omit<LegRow, "person_id" | "position">) => out.push({ person_id: leg.person_id, position: position++, ...row });
    push({ kind: "leave", from_label: from, to_label: null, starts_at: iso(leg.leave_at), ends_at: iso(leg.leave_at), minutes: 0, mode: null, provider: null });
    push({ kind: "travel", from_label: from, to_label: thingLabel, starts_at: iso(leg.leave_at), ends_at: iso(leg.arrive_at), minutes: leg.travel_minutes, mode: leg.mode, provider: leg.provider });
    push({ kind: "arrive", from_label: null, to_label: thingLabel, starts_at: iso(leg.arrive_at), ends_at: iso(leg.arrive_at), minutes: 0, mode: null, provider: null });
    push({ kind: "there", from_label: null, to_label: thingLabel, starts_at: iso(fit.arrive_at), ends_at: iso(fit.leave_at), minutes: Math.round((fit.leave_at - fit.arrive_at) / MINUTE), mode: null, provider: null });
    push({ kind: "home", from_label: thingLabel, to_label: from, starts_at: iso(fit.leave_at), ends_at: iso(back), minutes: leg.travel_minutes, mode: leg.mode, provider: leg.provider });
  }
  return out;
}

/** One person's legs in a line. Empty string when there is nothing to say. */
export function legsInWords(legs: readonly Pick<PmPlanLeg, "kind" | "starts_at" | "ends_at" | "minutes" | "mode">[]): string {
  const leave = legs.find((l) => l.kind === "leave");
  const travel = legs.find((l) => l.kind === "travel");
  const there = legs.find((l) => l.kind === "there");
  const home = legs.find((l) => l.kind === "home");
  const parts: string[] = [];
  if (leave) parts.push(`Leave by ${londonClock(Date.parse(leave.starts_at))}`);
  if (travel && travel.minutes > 0) parts.push(`${formatDuration(travel.minutes)} ${travel.mode ? MODE_WORDS[travel.mode] : "travel"}`);
  if (there) parts.push(`there ${londonClock(Date.parse(there.starts_at))}–${londonClock(Date.parse(there.ends_at))}`);
  if (home) parts.push(`home by ${londonClock(Date.parse(home.ends_at))}`);
  return parts.join(" · ");
}

/** Everyone's legs, one line each, named when they start apart. */
export function allLegsInWords(legs: readonly PmPlanLeg[], names: Record<string, string> = {}): string {
  const people = [...new Set(legs.map((l) => l.person_id))];
  const lines = people.map((pid) => legsInWords(legs.filter((l) => l.person_id === pid).sort((a, b) => a.position - b.position))).filter(Boolean);
  if (lines.length <= 1 || new Set(lines).size === 1) return lines[0] ?? "";
  return people.map((pid, i) => `${names[pid] ?? "Someone"}: ${lines[i]}`).join("\n");
}

/** "leave by 12:10": the earliest leave across everyone, or null. */
export function leaveByClock(legs: readonly Pick<PmPlanLeg, "kind" | "starts_at">[]): string | null {
  const leaves = legs.filter((l) => l.kind === "leave").map((l) => Date.parse(l.starts_at));
  return leaves.length ? londonClock(Math.min(...leaves)) : null;
}
