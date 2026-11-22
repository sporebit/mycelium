/**
 * PhirstMaxx engine — deterministic checks on a trip itinerary. Whatever
 * drafted it, a model or a person, the same rules apply: dates, edges,
 * budget, dog, drive lengths, overlaps, and a Sunday service when faith is
 * on. Returns violations to show inline and never throws.
 *
 * Trip edges are full local datetimes ("YYYY-MM-DDTHH:mm") and items are
 * "HH:mm" on their day; the two are joined before comparing (old decision
 * 2026-09-02, after a lexical-compare bug). Drive time uses the last-resort
 * estimate because a draft is checked before any route is fetched.
 */
import { distanceKm, estimateLegMinutes } from "./travel";

export type TripConstraints = {
  leave_after?: string | null;
  back_by?: string | null;
  max_drive_min?: number | null;
  pet?: boolean;
  faith?: boolean;
};

export type TripItem = {
  start: string;
  end: string;
  title: string;
  cost_pence: number;
  dog_ok?: boolean | null;
  lat?: number | null;
  lng?: number | null;
};

export type TripDay = { date: string; items: TripItem[] };
export type TripItinerary = { days: TripDay[] };

export type Violation = { level: "error" | "warn"; day?: string; message: string };

type LatLng = { lat: number; lng: number };

const pinOf = (p: { lat?: number | null; lng?: number | null }): LatLng | null =>
  p.lat === null || p.lat === undefined || p.lng === null || p.lng === undefined ? null : { lat: p.lat, lng: p.lng };

export function validateTrip(input: {
  itinerary: TripItinerary;
  constraints: TripConstraints;
  startOn: string;
  endOn: string;
  budgetPence: number;
  /** Where the trip starts and ends. */
  home: { lat: number | null; lng: number | null };
  /** Named in the dog warning; "the dog" when not given. */
  petName?: string;
}): { violations: Violation[]; costPence: number; driveMinutes: number } {
  const v: Violation[] = [];
  const { itinerary, constraints } = input;
  const days = itinerary.days ?? [];

  if (days.some((d) => d.date < input.startOn || d.date > input.endOn)) {
    v.push({ level: "error", message: "The itinerary has a day outside the trip dates." });
  }

  const firstDay = days[0];
  const lastDay = days.at(-1);
  const first = firstDay?.items[0];
  const last = lastDay?.items.at(-1);
  if (constraints.leave_after && firstDay && first && `${firstDay.date}T${first.start}` < constraints.leave_after.slice(0, 16)) {
    v.push({ level: "error", day: firstDay.date, message: `Starts at ${first.start} but you can't leave until ${constraints.leave_after.slice(11, 16)}.` });
  }
  if (constraints.back_by && lastDay && last && `${lastDay.date}T${last.end}` > constraints.back_by.slice(0, 16)) {
    v.push({ level: "error", day: lastDay.date, message: `Ends at ${last.end} but you need to be back by ${constraints.back_by.slice(11, 16)}.` });
  }

  const costPence = days.reduce((s, d) => s + d.items.reduce((t, i) => t + (i.cost_pence ?? 0), 0), 0);
  if (input.budgetPence > 0 && costPence > input.budgetPence) {
    v.push({ level: "error", message: `Comes to about £${(costPence / 100).toFixed(0)} against a budget of £${(input.budgetPence / 100).toFixed(0)}.` });
  } else if (input.budgetPence > 0 && costPence > input.budgetPence * 0.9) {
    v.push({ level: "warn", message: "Right up against the budget, with no slack for fuel or a round." });
  }

  if (constraints.pet) {
    const pet = input.petName ?? "the dog";
    for (const d of days) {
      for (const i of d.items) {
        if (i.dog_ok === false) v.push({ level: "error", day: d.date, message: `${i.title} isn't dog-friendly and ${pet} is coming.` });
        if (i.dog_ok === null || i.dog_ok === undefined) v.push({ level: "warn", day: d.date, message: `Not sure whether ${i.title} takes dogs, so check.` });
      }
    }
  }

  // Drive legs, home to first pin to … and back home, per day.
  const home = pinOf(input.home);
  let driveMinutes = 0;
  let prev = home;
  for (const d of days) {
    let dayDrive = 0;
    for (const i of d.items) {
      const here = pinOf(i);
      if (!here) continue;
      if (prev) dayDrive += estimateLegMinutes(distanceKm(prev, here));
      prev = here;
    }
    driveMinutes += dayDrive;
    if (constraints.max_drive_min && dayDrive > constraints.max_drive_min) {
      v.push({
        level: "warn",
        day: d.date,
        message: `About ${Math.round(dayDrive / 60)}h of driving on ${d.date}, over your ${Math.round(constraints.max_drive_min / 60)}h limit.`,
      });
    }
  }
  if (prev && home) driveMinutes += estimateLegMinutes(distanceKm(prev, home));

  for (const d of days) {
    const sorted = [...d.items].sort((a, b) => a.start.localeCompare(b.start));
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].start < sorted[k - 1].end) v.push({ level: "error", day: d.date, message: `${sorted[k - 1].title} and ${sorted[k].title} overlap.` });
    }
  }

  if (constraints.faith) {
    for (const s of days.filter((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() === 0)) {
      if (!s.items.some((i) => /service|church|chapel|mass|worship/i.test(i.title))) {
        v.push({ level: "warn", day: s.date, message: `Sunday ${s.date} has no service in it.` });
      }
    }
  }

  return { violations: v, costPence, driveMinutes };
}
