/**
 * PhirstMaxx engine — the last-resort travel estimate (provider "estimate")
 * and the old "time out of the day" planner.
 *
 * The research pipeline asks Google Routes, then OpenRouteService; only when
 * neither answers does it fall back to this straight-line profile. The
 * profile was calibrated on 10 Sep 2026 against OSRM driving times for
 * thirteen routes out of Darlington (2 km to 190 km): the old 1.3 road
 * factor and 30/55/80 km/h bands overestimated short and medium drives by
 * 40–130%. The speed below is straight-line km/h with the road wiggle folded
 * in, rising with distance because long trips spend more time on A roads and
 * motorways, plus three minutes of parking and doors a router never counts.
 * Twelve of the routes are pinned in the tests.
 *
 * Route overrides are symmetric (old decision 2026-09-02); a leg with no pin
 * at either end counts as 0 and marks the plan incomplete rather than
 * failing it.
 */
import type { TravelMode } from "../types";

export type Point = {
  /** Stable key for overrides: a place id, or "lat,lng" to 3 dp. */
  key: string;
  label: string;
  lat: number | null;
  lng: number | null;
};

export type PickupMode = "pickup_by_a" | "pickup_by_b" | "meet_there";

export type Leg = {
  kind: "pickup" | "outbound" | "return" | "dropoff" | "home";
  /** Who is travelling. */
  who: "a" | "b" | "both";
  from: Point;
  to: Point;
  minutes: number;
  distanceKm: number | null;
  /** True when a remembered override replaced the estimate. */
  overridden: boolean;
  /** False when either end has no coordinates and nothing overrode it. */
  known: boolean;
};

export type DayPlan = {
  mode: PickupMode;
  legs: Leg[];
  activityMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  travelShare: number;
  /** Any leg unknown: the total is a floor, not an estimate. */
  complete: boolean;
};

export const ROAD_FACTOR = 1;
export const FAFF_MINUTES = 3;
export const WALK_KMH = 5;
export const CYCLE_KMH = 15;

/** [crow km, effective crow-line km/h] knots; linear between, flat outside. */
const SPEED_PROFILE: Array<[number, number]> = [
  [2, 20],
  [5, 42],
  [20, 54],
  [60, 58],
  [120, 64],
];

/** Great-circle (haversine) distance in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Effective straight-line driving speed for a leg of `km` crow-flies. */
export function speedKmh(km: number): number {
  const first = SPEED_PROFILE[0];
  const last = SPEED_PROFILE[SPEED_PROFILE.length - 1];
  if (km <= first[0]) return first[1];
  if (km >= last[0]) return last[1];
  for (let i = 1; i < SPEED_PROFILE.length; i++) {
    const [k1, v1] = SPEED_PROFILE[i];
    const [k0, v0] = SPEED_PROFILE[i - 1];
    if (km <= k1) return v0 + ((km - k0) / (k1 - k0)) * (v1 - v0);
  }
  return last[1];
}

/** Driving minutes for `km` crow-flies, parking included. */
export function estimateLegMinutes(km: number): number {
  if (km <= 0.05) return 0;
  return Math.round(((km * ROAD_FACTOR) / speedKmh(km)) * 60 + FAFF_MINUTES);
}

/**
 * Minutes for `km` by `mode`: the calibrated profile for driving, a steady
 * 5 km/h on foot and 15 km/h by bike. Transit cannot be guessed from a
 * straight line, so it is null and the caller says so.
 */
export function travelMinutes(km: number, mode: TravelMode): number | null {
  if (mode === "transit") return null;
  if (mode === "drive") return estimateLegMinutes(km);
  if (km <= 0.05) return 0;
  return Math.round((km / (mode === "walk" ? WALK_KMH : CYCLE_KMH)) * 60);
}

export function pointKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export function overrideKey(from: Point, to: Point): string {
  return `${from.key}→${to.key}`;
}

function leg(kind: Leg["kind"], who: Leg["who"], from: Point, to: Point, overrides: ReadonlyMap<string, number>): Leg {
  const base = { kind, who, from, to };
  if (from.key === to.key) return { ...base, minutes: 0, distanceKm: 0, overridden: false, known: true };
  const override = overrides.get(overrideKey(from, to)) ?? overrides.get(overrideKey(to, from));
  const km =
    from.lat !== null && from.lng !== null && to.lat !== null && to.lng !== null
      ? distanceKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng })
      : null;
  if (override !== undefined) return { ...base, minutes: override, distanceKm: km, overridden: true, known: true };
  if (km === null) return { ...base, minutes: 0, distanceKm: null, overridden: false, known: false };
  return { ...base, minutes: estimateLegMinutes(km), distanceKm: km, overridden: false, known: true };
}

function finish(mode: PickupMode, legs: Leg[], activityMinutes: number, travel: number): DayPlan {
  const totalMinutes = travel + activityMinutes;
  return {
    mode,
    legs,
    activityMinutes,
    travelMinutes: travel,
    totalMinutes,
    travelShare: totalMinutes > 0 ? travel / totalMinutes : 0,
    complete: legs.every((l) => l.known),
  };
}

/**
 * Builds the day for one idea. `a` and `b` are the two people: where they
 * start (from the window, or home) and where they end (home). Meeting there,
 * the time out of the day is the longer of the two round trips: the day
 * ends when the last person is home.
 */
export function planDay(input: {
  mode: PickupMode;
  idea: Point;
  activityMinutes: number;
  a: { start: Point; home: Point };
  b: { start: Point; home: Point };
  overrides?: ReadonlyMap<string, number>;
}): DayPlan {
  const ov = input.overrides ?? new Map<string, number>();
  const { a, b, idea } = input;

  if (input.mode === "meet_there") {
    const legs = [
      leg("outbound", "a", a.start, idea, ov),
      leg("outbound", "b", b.start, idea, ov),
      leg("home", "a", idea, a.home, ov),
      leg("home", "b", idea, b.home, ov),
    ];
    const sum = (who: Leg["who"]) => legs.filter((l) => l.who === who).reduce((s, l) => s + l.minutes, 0);
    return finish(input.mode, legs, input.activityMinutes, Math.max(sum("a"), sum("b")));
  }

  const byA = input.mode === "pickup_by_a";
  const driver = byA ? a : b;
  const passenger = byA ? b : a;
  const dw: Leg["who"] = byA ? "a" : "b";
  const legs = [
    leg("pickup", dw, driver.start, passenger.start, ov),
    leg("outbound", "both", passenger.start, idea, ov),
    leg("dropoff", "both", idea, passenger.home, ov),
    leg("home", dw, passenger.home, driver.home, ov),
  ];
  return finish(input.mode, legs, input.activityMinutes, legs.reduce((s, l) => s + l.minutes, 0));
}

/** The cheapest complete mode for a pairing, or the cheapest of all if none is complete. */
export function bestMode(plans: DayPlan[]): DayPlan | undefined {
  const complete = plans.filter((p) => p.complete);
  const pool = complete.length ? complete : plans;
  return [...pool].sort((x, y) => x.totalMinutes - y.totalMinutes)[0];
}
