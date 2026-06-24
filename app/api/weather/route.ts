import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const LOCATION = "Doncaster,UK";
const LAT = 53.5228;
const LON = -1.1286;
const CACHE_HOURS = 3;

type WeatherDay = {
  date: string;
  temp_min: number;
  temp_max: number;
  description: string;
  icon: string;
  rain_chance: number;
};

type OWMDaily = {
  dt: number;
  temp: { min: number; max: number };
  weather: { main: string; description: string; icon: string }[];
  pop: number;
};

function transformDaily(daily: OWMDaily[]): WeatherDay[] {
  return daily.map((d) => {
    const date = new Date(d.dt * 1000);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return {
      date: `${yyyy}-${mm}-${dd}`,
      temp_min: Math.round(d.temp.min),
      temp_max: Math.round(d.temp.max),
      description: d.weather[0]?.description ?? "unknown",
      icon: d.weather[0]?.icon ?? "01d",
      rain_chance: Math.round((d.pop ?? 0) * 100),
    };
  });
}

export async function GET() {
  try {
    const supabase = createServerClient();

    const cutoff = new Date(Date.now() - CACHE_HOURS * 3600_000).toISOString();
    const { data: cached } = await supabase
      .from("weather_cache")
      .select("forecast")
      .eq("location", LOCATION)
      .gt("fetched_at", cutoff)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.forecast) {
      return NextResponse.json({ forecast: cached.forecast });
    }

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENWEATHER_API_KEY missing" }, { status: 500 });
    }

    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${LAT}&lon=${LON}&exclude=minutely,hourly,alerts&units=metric&appid=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      console.error("[weather] OpenWeatherMap error", res.status, err);
      return NextResponse.json({ error: "Weather API failed" }, { status: 502 });
    }

    const data = await res.json();
    const forecast = transformDaily(data.daily ?? []);

    await supabase.from("weather_cache").delete().eq("location", LOCATION);
    await supabase.from("weather_cache").insert({
      location: LOCATION,
      forecast,
    });

    return NextResponse.json({ forecast });
  } catch (err) {
    console.error("[weather GET]", err);
    return NextResponse.json({ error: "weather failed" }, { status: 500 });
  }
}
