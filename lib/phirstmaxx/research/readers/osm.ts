/**
 * PhirstMaxx research — OpenStreetMap tags (spec §6 step 3, second source).
 *
 * What it reads: named nodes, ways and relations (ways and relations by
 * their centre) within a radius of a point, with their tags, from the
 * public Overpass API at overpass-api.de. Free, no key. Its fair-use limits
 * are about 10,000 queries a day and a couple running at once per address;
 * a busy server answers 429 or 504, which comes back here as null. Timeout
 * 15 s, radius capped at 5 km, 60 elements.
 *
 * `osmFacts` turns one element's tags into facts at source_kind "osm"
 * (0.7): opening hours (normalised by hours.ts; an unreadable value is kept
 * as raw text at 0.4 rather than guessed), website, phone, fee and charge,
 * the dog rule, wheelchair access, toilets, indoor or outdoor, parking.
 * Fallback when Overpass is down or the map is thin: Google Places when
 * keyed, then the cited web-search stage.
 */
import type { Fact } from "./index";
import { fromOsm } from "./hours";
import { haversineKm } from "./routing";
import { fetchJson, pickFetch, USER_AGENT, type FetchLike } from "./website";

export type OsmElement = { osm_type: "node" | "way" | "relation"; osm_id: number; name: string; lat: number; lng: number; distance_m: number; tags: Record<string, string> };

type OverpassJson = {
  elements?: Array<{ type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }>;
};

/** Named OSM elements within radiusM of a point, nearest first. Null when Overpass did not answer. */
export async function overpassAround(lat: number, lng: number, radiusM: number, fetchImpl?: FetchLike): Promise<OsmElement[] | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const r = Math.round(Math.min(5000, Math.max(1, radiusM)));
  const query = `[out:json][timeout:12];nwr(around:${r},${lat},${lng})[name];out center tags 60;`;
  const j = await fetchJson<OverpassJson>(
    pickFetch(fetchImpl),
    "https://overpass-api.de/api/interpreter",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": USER_AGENT }, body: `data=${encodeURIComponent(query)}` },
    15_000,
  );
  if (!j || !Array.isArray(j.elements)) return null;
  const out: OsmElement[] = [];
  for (const e of j.elements) {
    const type = e.type === "node" || e.type === "way" || e.type === "relation" ? e.type : null;
    const elat = typeof e.lat === "number" ? e.lat : e.center?.lat;
    const elng = typeof e.lon === "number" ? e.lon : e.center?.lon;
    const name = e.tags?.name;
    if (!type || typeof e.id !== "number" || typeof elat !== "number" || typeof elng !== "number" || !name) continue;
    out.push({ osm_type: type, osm_id: e.id, name, lat: elat, lng: elng, distance_m: Math.round(haversineKm({ lat, lng }, { lat: elat, lng: elng }) * 1000), tags: { ...e.tags } });
  }
  return out.sort((a, b) => a.distance_m - b.distance_m);
}

export type DogRule = "yes" | "no" | "outside_only" | "unknown";

/** OSM `dog=*` → the spec's dog rule. "leashed" is allowed (on a lead). */
export function dogRule(v: string | undefined): DogRule {
  switch ((v ?? "").trim().toLowerCase()) {
    case "yes":
    case "leashed":
    case "unleashed":
    case "designated":
    case "permissive":
      return "yes";
    case "no":
      return "no";
    case "outside":
    case "outside_only":
    case "garden":
      return "outside_only";
    default:
      return "unknown";
  }
}

const OUTDOOR_LEISURE = new Set(["park", "garden", "nature_reserve", "playground", "common", "beach_resort", "dog_park", "picnic_table", "golf_course", "pitch", "track", "marina"]);
const OUTDOOR_TOURISM = new Set(["viewpoint", "picnic_site", "camp_site", "caravan_site", "theme_park", "zoo"]);
const INDOOR_TOURISM = new Set(["museum", "gallery", "aquarium"]);
const INDOOR_AMENITY = new Set(["cinema", "theatre", "library", "arts_centre", "restaurant", "cafe", "pub", "bar", "community_centre", "planetarium"]);
const INDOOR_LEISURE = new Set(["sports_centre", "bowling_alley", "escape_game", "amusement_arcade", "trampoline_park", "ice_rink", "swimming_pool", "soft_play", "indoor_play"]);

/** Indoor (true), outdoor (false) or unknown (null) from the tags. */
export function indoorFromTags(t: Record<string, string>): boolean | null {
  if (t.indoor === "yes") return true;
  if (t.indoor === "no" || t.outdoor === "yes") return false;
  if (t.leisure === "swimming_pool" && t.location === "outdoor") return false;
  if (t.natural || OUTDOOR_LEISURE.has(t.leisure ?? "") || OUTDOOR_TOURISM.has(t.tourism ?? "") || t.boundary === "national_park" || t.landuse === "forest" || (t.historic === "castle" && t.ruins === "yes")) return false;
  if (INDOOR_TOURISM.has(t.tourism ?? "") || INDOOR_AMENITY.has(t.amenity ?? "") || INDOOR_LEISURE.has(t.leisure ?? "") || t.shop) return true;
  return null;
}

const yesNo = (v: string | undefined): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

/** Facts from one element's tags. Pass the element (or its type and id) to have a source URL. */
export function osmFacts(tags: Record<string, string>, ref?: { osm_type: string; osm_id: number }): Fact[] {
  const sourceUrl = ref ? `https://www.openstreetmap.org/${ref.osm_type}/${ref.osm_id}` : null;
  const facts: Fact[] = [];
  const add = (key: string, value: unknown, confidence = 0.7) => {
    if (value !== null && value !== undefined && value !== "") facts.push({ key, value, source_url: sourceUrl, source_kind: "osm", confidence });
  };
  const t = tags ?? {};
  add("name", t.name);
  const kind = ["tourism", "leisure", "amenity", "historic", "natural", "shop"].find((k) => t[k]);
  add("osm_kind", kind ? `${kind}=${t[kind]}` : null);
  if (t.opening_hours) {
    const hours = fromOsm(t.opening_hours);
    if (hours) add("opening_hours", hours);
    else add("opening_hours_text", t.opening_hours, 0.4);
  }
  add("website", t.website ?? t["contact:website"] ?? t.url);
  add("telephone", t.phone ?? t["contact:phone"]);
  add("fee", yesNo(t.fee));
  add("charge", t.charge);
  if (t.dog) add("dog_rule", dogRule(t.dog));
  add("wheelchair", t.wheelchair === "yes" || t.wheelchair === "limited" || t.wheelchair === "no" ? t.wheelchair : null);
  add("toilets", yesNo(t.toilets) ?? (t.amenity === "toilets" ? true : null));
  add("indoor", indoorFromTags(t));
  if (t.amenity === "parking") add("parking", { available: true, fee: yesNo(t.fee), capacity: t.capacity ? Number(t.capacity) || null : null });
  else if (t.parking && t.parking !== "no") add("parking", { available: true, fee: yesNo(t["parking:fee"]), capacity: null });
  else if (t.parking === "no") add("parking", { available: false, fee: null, capacity: null });
  return facts;
}
