import { NextResponse } from "next/server";
import { OPERATOR } from "@/lib/config/operator";
import { localDateKey, previousDateKey } from "@/lib/util/date";

export const runtime = "nodejs";

type SunResults = { sunrise: string; sunset: string };
type DayCache = { date: string; today: SunResults; tomorrow: SunResults };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 5000;

let cache: { data: DayCache; expiresAt: number } | null = null;

function nextDateKey(dateKey: string): string {
  // previousDateKey reverses; do the inverse here.
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

async function fetchSun(date: string): Promise<SunResults | null> {
  const url = `https://api.sunrise-sunset.org/json?lat=${OPERATOR.latitude}&lng=${OPERATOR.longitude}&date=${date}&formatted=0`;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      status?: string;
      results?: { sunrise?: string; sunset?: string };
    };
    if (j.status !== "OK") return null;
    const sr = j.results?.sunrise;
    const ss = j.results?.sunset;
    if (typeof sr !== "string" || typeof ss !== "string") return null;
    return { sunrise: sr, sunset: ss };
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

async function loadDay(): Promise<DayCache | null> {
  const today = localDateKey();
  if (
    cache &&
    cache.data.date === today &&
    cache.expiresAt > Date.now()
  ) {
    return cache.data;
  }
  const tomorrow = nextDateKey(today);
  const [todayRes, tomorrowRes] = await Promise.all([
    fetchSun(today),
    fetchSun(tomorrow),
  ]);
  if (!todayRes || !tomorrowRes) return null;
  const data: DayCache = { date: today, today: todayRes, tomorrow: tomorrowRes };
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

export async function GET() {
  // Defensive: clear cache if it was generated for a stale local date
  if (cache && cache.data.date !== localDateKey()) {
    cache = null;
    // Reference previousDateKey to ensure the import isn't tree-shaken in test
    // builds where this file is imported but the loader isn't called. Cheap.
    void previousDateKey;
  }

  const day = await loadDay();
  if (!day) {
    return NextResponse.json(
      { error: "sunrise-sunset fetch failed" },
      { status: 502 }
    );
  }

  const now = new Date();
  const sr = new Date(day.today.sunrise);
  const ss = new Date(day.today.sunset);
  const tomSr = new Date(day.tomorrow.sunrise);

  let next: "sunrise" | "sunset";
  let nextTime: Date;
  if (now < sr) {
    next = "sunrise";
    nextTime = sr;
  } else if (now < ss) {
    next = "sunset";
    nextTime = ss;
  } else {
    next = "sunrise";
    nextTime = tomSr;
  }

  return NextResponse.json({
    sunrise: day.today.sunrise,
    sunset: day.today.sunset,
    tomorrow_sunrise: day.tomorrow.sunrise,
    now: now.toISOString(),
    next,
    nextTime: nextTime.toISOString(),
  });
}
