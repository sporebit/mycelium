/**
 * PhirstMaxx research — from a name to a place on the map (spec §6 step 2).
 *
 * Nominatim (OpenStreetMap's geocoder) is the free route and always works
 * without a key. Its usage policy, which this module keeps to and its
 * callers must too: at most one request a second from the whole app (the
 * research queue runs these one at a time, so there is no in-process gate
 * here), a User-Agent that identifies the application — ours is
 * "Mycelium/1.0 (self-hosted planner)", which names no person — and no bulk
 * or autocomplete use. Searches are limited to Great Britain (countrycodes=gb).
 *
 * Google Places API (New), when GOOGLE_MAPS_API_KEY is set, gives a better
 * match plus hours, phone, website, price level, dog and child rules. It is
 * paid past the free allowance, so the caller counts calls (900 a month cap,
 * spec §11 item 2) and simply does not call it once over; every Places fact
 * is source_kind "google_places" at 0.9.
 *
 * `nearDuplicate` is the spec's duplicate rule: within 150 m and a similar
 * name means the drop attaches to the existing thing.
 *
 * Timeouts 10 s; failures are null (no answer) as distinct from [] (asked,
 * nothing found).
 */
import type { Fact } from "./index";
import { fromGooglePlaces, type WeeklyHours } from "./hours";
import { haversineKm, type LatLng } from "./routing";
import { fetchJson, pickFetch, USER_AGENT, type FetchLike } from "./website";

export type GeoHit = { name: string; lat: number; lng: number; address: string; osm_type: "node" | "way" | "relation" | null; osm_id: number | null; kind: string | null };

type NominatimRow = {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  osm_type?: string;
  osm_id?: number;
  category?: string;
  type?: string;
};

const NOMINATIM_HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en-GB,en;q=0.8" };

function toHit(r: NominatimRow): GeoHit | null {
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = typeof r.display_name === "string" ? r.display_name : "";
  const name = (typeof r.name === "string" && r.name.trim()) || address.split(",")[0]?.trim() || "";
  const osmType = r.osm_type === "node" || r.osm_type === "way" || r.osm_type === "relation" ? r.osm_type : null;
  return { name, lat, lng, address, osm_type: osmType, osm_id: typeof r.osm_id === "number" ? r.osm_id : null, kind: r.category && r.type ? `${r.category}=${r.type}` : null };
}

/** Up to five Nominatim matches in Great Britain. Null when Nominatim did not answer. */
export async function nominatimSearch(query: string, fetchImpl?: FetchLike): Promise<GeoHit[] | null> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=gb&q=${encodeURIComponent(q)}`;
  const rows = await fetchJson<NominatimRow[]>(pickFetch(fetchImpl), url, { headers: NOMINATIM_HEADERS }, 10_000);
  if (!Array.isArray(rows)) return null;
  return rows.map(toHit).filter((h): h is GeoHit => !!h).slice(0, 5);
}

/** The nearest addressable thing to a point. Null when there is none or Nominatim did not answer. */
export async function nominatimReverse(lat: number, lng: number, fetchImpl?: FetchLike): Promise<GeoHit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`;
  const row = await fetchJson<NominatimRow & { error?: string }>(pickFetch(fetchImpl), url, { headers: NOMINATIM_HEADERS }, 10_000);
  if (!row || row.error) return null;
  return toHit(row);
}

// ---------------------------------------------------------------------------
// Google Places API (New)

const PLACE_FIELDS = [
  "id", "displayName", "formattedAddress", "location", "types", "regularOpeningHours", "priceLevel", "rating", "websiteUri",
  "nationalPhoneNumber", "accessibilityOptions", "allowsDogs", "goodForChildren", "restroom", "parkingOptions",
];

export type GooglePlace = { place_id: string; name: string; lat: number | null; lng: number | null; address: string | null; types: string[]; hours: WeeklyHours | null; facts: Fact[] };

type PlaceJson = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  regularOpeningHours?: { periods?: unknown[] };
  priceLevel?: string;
  rating?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  accessibilityOptions?: Record<string, boolean>;
  allowsDogs?: boolean;
  goodForChildren?: boolean;
  restroom?: boolean;
  parkingOptions?: Record<string, boolean>;
};

const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "inexpensive",
  PRICE_LEVEL_MODERATE: "moderate",
  PRICE_LEVEL_EXPENSIVE: "expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "very_expensive",
};

/** One Places (New) place → our shape and its facts. Exported for tests and the pipeline. */
export function placeFromJson(p: PlaceJson): GooglePlace | null {
  if (!p || typeof p.id !== "string") return null;
  const sourceUrl = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(p.id)}`;
  const facts: Fact[] = [];
  const add = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") facts.push({ key, value, source_url: sourceUrl, source_kind: "google_places", confidence: 0.9 });
  };
  const lat = typeof p.location?.latitude === "number" ? p.location.latitude : null;
  const lng = typeof p.location?.longitude === "number" ? p.location.longitude : null;
  const name = p.displayName?.text?.trim() ?? "";
  const hours = fromGooglePlaces(p.regularOpeningHours?.periods);
  const types = Array.isArray(p.types) ? p.types.filter((t): t is string => typeof t === "string") : [];
  add("name", name || null);
  add("address", p.formattedAddress ?? null);
  add("geo", lat !== null && lng !== null ? { lat, lng } : null);
  add("google_types", types.length ? types : null);
  add("opening_hours", hours);
  add("price_level", p.priceLevel ? (PRICE[p.priceLevel] ?? null) : null);
  add("rating", typeof p.rating === "number" ? p.rating : null);
  add("website", p.websiteUri ?? null);
  add("telephone", p.nationalPhoneNumber ?? null);
  if (p.accessibilityOptions && typeof p.accessibilityOptions.wheelchairAccessibleEntrance === "boolean") add("wheelchair", p.accessibilityOptions.wheelchairAccessibleEntrance ? "yes" : "no");
  if (typeof p.allowsDogs === "boolean") add("dog_rule", p.allowsDogs ? "yes" : "no");
  if (typeof p.goodForChildren === "boolean") add("good_for_children", p.goodForChildren);
  if (typeof p.restroom === "boolean") add("toilets", p.restroom);
  if (p.parkingOptions && typeof p.parkingOptions === "object") {
    const o = p.parkingOptions;
    const free = !!(o.freeParkingLot || o.freeStreetParking || o.freeGarageParking);
    const paid = !!(o.paidParkingLot || o.paidStreetParking || o.paidGarageParking || o.valetParking);
    add("parking", free || paid ? { available: true, free, paid } : Object.values(o).some((v) => v === false) ? { available: false, free: false, paid: false } : null);
  }
  return { place_id: p.id, name, lat, lng, address: p.formattedAddress ?? null, types, hours, facts };
}

/** The best Places (New) text-search match, biased to a point when given. Null for no match or no answer. */
export async function googlePlacesFind(query: string, key: string, fetchImpl?: FetchLike, bias?: LatLng): Promise<GooglePlace | null> {
  if (!key || !query.trim()) return null;
  const body: Record<string, unknown> = { textQuery: query.trim(), regionCode: "GB", languageCode: "en-GB", pageSize: 1 };
  if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 20_000 } };
  const j = await fetchJson<{ places?: PlaceJson[] }>(
    pickFetch(fetchImpl),
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACE_FIELDS.map((f) => `places.${f}`).join(","), "User-Agent": USER_AGENT },
      body: JSON.stringify(body),
    },
    10_000,
  );
  const first = j?.places?.[0];
  return first ? placeFromJson(first) : null;
}

/** Places (New) details for a known place id, same fields as the search. */
export async function googlePlaceDetails(placeId: string, key: string, fetchImpl?: FetchLike): Promise<GooglePlace | null> {
  if (!key || !placeId) return null;
  const j = await fetchJson<PlaceJson>(
    pickFetch(fetchImpl),
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en-GB&regionCode=GB`,
    { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACE_FIELDS.join(","), "User-Agent": USER_AGENT } },
    10_000,
  );
  return j ? placeFromJson(j) : null;
}

// ---------------------------------------------------------------------------
// The duplicate rule

const STOP = new Set(["the", "a", "an", "of", "and", "at", "in", "on", "uk", "ltd"]);

/** Lower case, accents off, "&" as "and", punctuation out, stop words dropped. */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

/** Shared tokens over the shorter name's tokens: "Hackfall" and "Hackfall Woods" score 1. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

/** Within 150 m and names with token overlap ≥ 0.6: the same thing (spec §6 step 2). */
export function nearDuplicate(a: LatLng & { name: string }, b: LatLng & { name: string }): boolean {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return false;
  return haversineKm(a, b) * 1000 <= 150 && nameSimilarity(a.name, b.name) >= 0.6;
}
