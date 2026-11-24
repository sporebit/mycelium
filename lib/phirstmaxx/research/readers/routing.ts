/**
 * PhirstMaxx research — travel time between two points (spec §6 step 4).
 *
 * Three answers in order, and the result says which one gave it (rule 3):
 *
 *   1. Google Routes API v2 `computeRoutes` when GOOGLE_MAPS_API_KEY is set:
 *      drive with traffic for the departure time (TRAFFIC_AWARE, only when
 *      the time is in the future — Google refuses a past one), walk, cycle
 *      and transit. Paid beyond the free monthly allowance: the caller
 *      counts calls and stops at 900 a month (spec §11 item 2) by passing
 *      no googleKey once the count is reached.
 *   2. OpenRouteService directions when ORS_API_KEY is set (free, 2,000
 *      requests a day, 40 a minute): drive, walk and cycle. ORS has no
 *      public transport, so transit skips straight to 3. The address is
 *      HeiGIT's unified one, api.heigit.org/openrouteservice/v2 — the old
 *      api.openrouteservice.org answered 410 Gone from November 2026 (seen
 *      2026-11-24); the key still goes in the Authorization header.
 *   3. The caller's estimator over the straight-line (haversine) distance —
 *      the old app's calibrated profile. Labelled "estimate", never dressed
 *      as a route.
 *
 * Timeouts 10 s each. `routeWithFallback` never returns null.
 */
import type { TravelMode, TravelProvider } from "@/lib/phirstmaxx/types";
import { fetchJson, pickFetch, USER_AGENT, type FetchLike } from "./website";

export type LatLng = { lat: number; lng: number };
export type RouteResult = { minutes: number; km: number | null };

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const validPoint = (p: LatLng) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

const ORS_PROFILE: Record<TravelMode, string | null> = { drive: "driving-car", walk: "foot-walking", cycle: "cycling-regular", transit: null };

type OrsAnswer = { features?: Array<{ properties?: { summary?: { distance?: number; duration?: number } } }> };

/** OpenRouteService directions. Null for transit (ORS has none), a missing key, or no answer. */
export async function orsRoute(from: LatLng, to: LatLng, mode: TravelMode, key: string, fetchImpl?: FetchLike): Promise<RouteResult | null> {
  const profile = ORS_PROFILE[mode];
  if (!profile || !key || !validPoint(from) || !validPoint(to)) return null;
  const url = `https://api.heigit.org/openrouteservice/v2/directions/${profile}?start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;
  // The key goes in the Authorization header (which ORS accepts as its api_key) so it stays out of URLs and logs.
  const j = await fetchJson<OrsAnswer>(pickFetch(fetchImpl), url, { headers: { Authorization: key, Accept: "application/json, application/geo+json", "User-Agent": USER_AGENT } }, 10_000);
  const sum = j?.features?.[0]?.properties?.summary;
  if (!sum || typeof sum.duration !== "number" || !Number.isFinite(sum.duration)) return null;
  return { minutes: Math.max(1, Math.round(sum.duration / 60)), km: typeof sum.distance === "number" ? round1(sum.distance / 1000) : null };
}

const GOOGLE_MODE: Record<TravelMode, string> = { drive: "DRIVE", walk: "WALK", cycle: "BICYCLE", transit: "TRANSIT" };

/** "1234s" or "1234.5s" → seconds; null for anything else. */
export function parseDurationSeconds(d: unknown): number | null {
  if (typeof d !== "string") return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d.trim());
  return m ? Number(m[1]) : null;
}

type GoogleAnswer = { routes?: Array<{ duration?: string; distanceMeters?: number }> };

/**
 * Google Routes API v2. departAt is sent only when it is in the future (with
 * TRAFFIC_AWARE for driving, and as the departure for transit); otherwise
 * Google routes for now. `now` is injectable for tests.
 */
export async function googleRoute(
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
  departAt: Date | null,
  key: string,
  fetchImpl?: FetchLike,
  now: number = Date.now(),
): Promise<RouteResult | null> {
  if (!key || !validPoint(from) || !validPoint(to)) return null;
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const body: Record<string, unknown> = { origin: point(from), destination: point(to), travelMode: GOOGLE_MODE[mode], languageCode: "en-GB", units: "METRIC", regionCode: "gb" };
  const future = departAt && Number.isFinite(departAt.getTime()) && departAt.getTime() > now + 60_000 ? departAt : null;
  if (mode === "drive") body.routingPreference = "TRAFFIC_AWARE";
  if (future && (mode === "drive" || mode === "transit")) body.departureTime = future.toISOString();
  const j = await fetchJson<GoogleAnswer>(
    pickFetch(fetchImpl),
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters", "User-Agent": USER_AGENT },
      body: JSON.stringify(body),
    },
    10_000,
  );
  const r = j?.routes?.[0];
  const secs = parseDurationSeconds(r?.duration);
  if (secs === null) return null;
  return { minutes: Math.max(1, Math.round(secs / 60)), km: typeof r?.distanceMeters === "number" ? round1(r.distanceMeters / 1000) : null };
}

export type RouteOpts = {
  googleKey?: string | null;
  orsKey?: string | null;
  departAt?: Date | null;
  fetch?: FetchLike;
  /** The caller's straight-line profile: minutes for a haversine distance in km by mode. */
  estimate: (km: number, mode: TravelMode) => number;
  now?: number;
};

export type RouteAnswer = { minutes: number; km: number; provider: Exclude<TravelProvider, "override"> };

/** Google → OpenRouteService → estimate. Never null; the provider says who answered. */
export async function routeWithFallback(from: LatLng, to: LatLng, mode: TravelMode, opts: RouteOpts): Promise<RouteAnswer> {
  const straight = validPoint(from) && validPoint(to) ? haversineKm(from, to) : 0;
  if (opts.googleKey) {
    const g = await googleRoute(from, to, mode, opts.departAt ?? null, opts.googleKey, opts.fetch, opts.now);
    if (g) return { minutes: g.minutes, km: g.km ?? round1(straight), provider: "google" };
  }
  if (opts.orsKey && mode !== "transit") {
    const o = await orsRoute(from, to, mode, opts.orsKey, opts.fetch);
    if (o) return { minutes: o.minutes, km: o.km ?? round1(straight), provider: "ors" };
  }
  const minutes = opts.estimate(straight, mode);
  return { minutes: Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0, km: round1(straight), provider: "estimate" };
}
