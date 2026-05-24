const LAT = 53.5172;
const LNG = -1.0596;
const FETCH_TIMEOUT_MS = 5000;

// WMO weather interpretation codes — abridged to the cases that occur in
// the UK without overloading copy. Anything else falls back to "Mixed".
const WMO_CODE: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Thunderstorm w/ hail",
};

export type Weather = {
  hi: number; // °C
  lo: number; // °C
  conditions: string;
  code: number;
};

export async function fetchWeather(): Promise<Weather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe%2FLondon`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        weathercode?: number[];
      };
    };
    const hi = j.daily?.temperature_2m_max?.[0];
    const lo = j.daily?.temperature_2m_min?.[0];
    const code = j.daily?.weathercode?.[0];
    if (
      typeof hi !== "number" ||
      typeof lo !== "number" ||
      typeof code !== "number"
    ) {
      return null;
    }
    return {
      hi: Math.round(hi),
      lo: Math.round(lo),
      code,
      conditions: WMO_CODE[code] ?? "Mixed",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
