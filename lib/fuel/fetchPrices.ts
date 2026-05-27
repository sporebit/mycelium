import { FUEL_SOURCES, type FuelSource } from "./sources";
import type { Station } from "./types";

const FETCH_TIMEOUT_MS = 5000;

function normalizePrice(p: unknown): number | null {
  if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) return null;
  let pence = p;
  if (pence < 10) pence *= 100; // some retailers publish in pounds
  if (pence < 50 || pence > 500) return null; // implausible range
  return pence;
}

function readLatLng(stationRaw: Record<string, unknown>): {
  lat: number;
  lng: number;
} | null {
  const loc = stationRaw.location;
  if (loc && typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    const lat =
      typeof o.latitude === "number"
        ? o.latitude
        : typeof o.lat === "number"
          ? o.lat
          : null;
    const lng =
      typeof o.longitude === "number"
        ? o.longitude
        : typeof o.lng === "number"
          ? o.lng
          : typeof o.lon === "number"
            ? o.lon
            : null;
    if (lat !== null && lng !== null) return { lat, lng };
  }
  // Some sources put lat/lng at the top level
  const flatLat =
    typeof stationRaw.latitude === "number"
      ? stationRaw.latitude
      : typeof stationRaw.lat === "number"
        ? stationRaw.lat
        : null;
  const flatLng =
    typeof stationRaw.longitude === "number"
      ? stationRaw.longitude
      : typeof stationRaw.lng === "number"
        ? stationRaw.lng
        : typeof stationRaw.lon === "number"
          ? stationRaw.lon
          : null;
  if (flatLat !== null && flatLng !== null) {
    return { lat: flatLat, lng: flatLng };
  }
  return null;
}

function readString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStations(
  raw: unknown,
  sourceName: string
): Station[] {
  if (!raw || typeof raw !== "object") return [];
  const wrapper = raw as Record<string, unknown>;
  const list = Array.isArray(wrapper.stations)
    ? wrapper.stations
    : Array.isArray(wrapper.station_list)
      ? wrapper.station_list
      : [];

  const out: Station[] = [];
  for (const itemRaw of list) {
    if (!itemRaw || typeof itemRaw !== "object") continue;
    const item = itemRaw as Record<string, unknown>;

    const loc = readLatLng(item);
    if (!loc) continue;

    const prices =
      item.prices && typeof item.prices === "object"
        ? (item.prices as Record<string, unknown>)
        : {};
    const e10 = normalizePrice(prices.E10 ?? prices.e10 ?? prices.unleaded_e10);
    const b7 = normalizePrice(
      prices.B7 ?? prices.b7 ?? prices.diesel ?? prices.DIESEL
    );
    if (e10 === null && b7 === null) continue;

    const siteId = readString(item.site_id ?? item.id ?? item.siteid);
    out.push({
      siteId: siteId || `${sourceName}-${out.length}`,
      brand: readString(item.brand) || sourceName,
      address: readString(item.address),
      postcode: readString(item.postcode),
      lat: loc.lat,
      lng: loc.lng,
      e10,
      b7,
      source: sourceName,
    });
  }
  return out;
}

async function fetchOne(
  source: FuelSource
): Promise<{ name: string; stations: Station[]; lastUpdated: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/html;q=0.9, */*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("non-JSON response");
    }
    const stations = normalizeStations(parsed, source.name);
    const lastUpdated =
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).last_updated === "string"
        ? ((parsed as Record<string, unknown>).last_updated as string)
        : null;
    return { name: source.name, stations, lastUpdated };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAllPrices(): Promise<{
  stations: Station[];
  failed: string[];
  lastUpdated: string;
}> {
  const results = await Promise.allSettled(FUEL_SOURCES.map(fetchOne));
  const stations: Station[] = [];
  const failed: string[] = [];
  let newest: number = 0;

  results.forEach((r, i) => {
    const source = FUEL_SOURCES[i];
    if (r.status === "fulfilled") {
      stations.push(...r.value.stations);
      if (r.value.lastUpdated) {
        const t = Date.parse(r.value.lastUpdated);
        if (Number.isFinite(t) && t > newest) newest = t;
      }
      if (r.value.stations.length === 0) {
        // Source returned but yielded no usable stations — flag it
        failed.push(`${source.name} (no usable stations)`);
      }
    } else {
      const reason =
        r.reason instanceof Error ? r.reason.message : "unknown error";
      console.error(`[fuel] ${source.name} failed:`, reason);
      failed.push(source.name);
    }
  });

  return {
    stations,
    failed,
    lastUpdated:
      newest > 0 ? new Date(newest).toISOString() : new Date().toISOString(),
  };
}
