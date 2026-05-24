import { NextRequest, NextResponse } from "next/server";
import { fetchAllPrices } from "@/lib/fuel/fetchPrices";
import {
  ARMTHORPE_LAT,
  ARMTHORPE_LNG,
  filterByDistance,
} from "@/lib/fuel/distance";
import { aggregate } from "@/lib/fuel/aggregate";
import { localDateKey } from "@/lib/util/date";
import type { FuelApiResponse } from "@/lib/fuel/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cache:
  | { dateKey: string; data: FuelApiResponse; expiresAt: number }
  | null = null;

async function buildResponse(): Promise<FuelApiResponse> {
  const { stations, failed, lastUpdated } = await fetchAllPrices();
  const nearby = filterByDistance(stations, 5);
  const summary = aggregate(nearby);
  return {
    summary,
    stations: nearby,
    failed,
    centre: { lat: ARMTHORPE_LAT, lng: ARMTHORPE_LNG, name: "Armthorpe" },
    lastUpdated,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const warm = url.searchParams.get("warm") === "1";
  const today = localDateKey();

  // Cache invalidates when local date rolls over (so a stale day's data
  // doesn't survive past midnight) OR when the TTL expires.
  const cacheValid =
    cache &&
    cache.dateKey === today &&
    cache.expiresAt > Date.now();

  if (!warm && cacheValid) {
    return NextResponse.json(cache!.data, {
      headers: { "cache-control": "no-store" },
    });
  }

  try {
    const data = await buildResponse();
    cache = {
      dateKey: today,
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[/api/fuel GET]", err);
    if (cache) {
      // Fall back to stale cache rather than 500
      return NextResponse.json(
        { ...cache.data, failed: [...cache.data.failed, "refresh failed"] },
        { headers: { "cache-control": "no-store" } }
      );
    }
    return NextResponse.json({ error: "fuel fetch failed" }, { status: 502 });
  }
}
