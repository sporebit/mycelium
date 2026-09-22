/**
 * Day log seeds (spec §4.2, decision 12): what Mycelium already knows about
 * the day, gathered at prompt time, stored on the day row (audit + replay),
 * quoted in the opener and handed to the interviewer as context. Every
 * source is a settings toggle and degrades silently; the whole block is
 * capped so it never crowds the transcript. No LLM call here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCalendarData } from "@/lib/calendar/fetch";
import type { DaylogSettings } from "./settings";

export type Seeds = {
  gathered_at: string;
  calendar?: string[];
  spotify?: string[];
  media?: string[];
  health?: string[];
  weather?: string;
};

const MAX_CHARS = 1200; // ≈ 400 tokens (spec budget)
const LONDON = "Europe/London";

function londonDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: LONDON }); // YYYY-MM-DD
}
function londonTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit" });
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function calendarSeed(db: SupabaseClient, day: string): Promise<string[]> {
  const { events } = await getCalendarData(db);
  return events
    .filter((e) => londonDate(e.start) === day || (e.allDay && e.start.slice(0, 10) === day))
    .slice(0, 6)
    .map((e) => (e.allDay ? clip(e.title, 60) : `${londonTime(e.start)} ${clip(e.title, 60)}`));
}

async function spotifySeed(db: SupabaseClient, day: string): Promise<string[]> {
  const from = new Date(`${day}T00:00:00`).toISOString();
  const to = new Date(`${day}T23:59:59`).toISOString();
  const { data } = await db.from("spotify_plays").select("track_name, artist_names").gte("played_at", from).lte("played_at", to).limit(200);
  const rows = (data ?? []) as Array<{ track_name: string; artist_names: string }>;
  if (!rows.length) return [];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.artist_names, (counts.get(r.artist_names) ?? 0) + 1);
  const top = Array.from(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return [`${rows.length} plays — ${top.map(([a, n]) => (n > 1 ? `${clip(a, 30)} ×${n}` : clip(a, 30))).join(", ")}`];
}

async function mediaSeed(db: SupabaseClient, day: string): Promise<string[]> {
  const from = new Date(`${day}T00:00:00`).toISOString();
  const to = new Date(`${day}T23:59:59`).toISOString();
  const { data } = await db.from("media_items").select("title, media_status, media_type").gte("updated_at", from).lte("updated_at", to).neq("media_status", "backlog").limit(5);
  return ((data ?? []) as Array<{ title: string; media_status: string; media_type: string }>).map((m) => `${m.media_status === "completed" ? "finished" : m.media_status === "in_progress" ? "started" : m.media_status} ${clip(m.title, 40)}`);
}

async function healthSeed(): Promise<string[]> {
  // Apple Health import is not live yet (spec §4.2: degrade silently)
  return [];
}

async function weatherSeed(db: SupabaseClient, day: string): Promise<string | undefined> {
  const { data } = await db.from("weather_cache").select("forecast").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  const forecast = (data as { forecast?: Array<{ date: string; temp_max: number; description: string; rain_chance: number }> } | null)?.forecast;
  const today = forecast?.find((f) => f.date === day);
  if (!today) return undefined;
  return `${today.description}, ${today.temp_max}°${today.rain_chance >= 40 ? `, ${today.rain_chance}% rain` : ""}`;
}

/** Gather every enabled source for the day; a failing source is simply absent. */
export async function gatherSeeds(db: SupabaseClient, day: string, s: DaylogSettings): Promise<Seeds> {
  const seeds: Seeds = { gathered_at: new Date().toISOString() };
  const soft = async <T>(on: boolean, fn: () => Promise<T>): Promise<T | undefined> => {
    if (!on) return undefined;
    try {
      return await fn();
    } catch (err) {
      console.error("[daylog] seed failed:", err instanceof Error ? err.message : err);
      return undefined;
    }
  };
  const [calendar, spotify, media, health, weather] = await Promise.all([
    soft(s.seeds.calendar, () => calendarSeed(db, day)),
    soft(s.seeds.spotify, () => spotifySeed(db, day)),
    soft(s.seeds.media, () => mediaSeed(db, day)),
    soft(s.seeds.health, () => healthSeed()),
    soft(s.seeds.weather, () => weatherSeed(db, day)),
  ]);
  if (calendar?.length) seeds.calendar = calendar;
  if (spotify?.length) seeds.spotify = spotify;
  if (media?.length) seeds.media = media;
  if (health?.length) seeds.health = health;
  if (weather) seeds.weather = weather;
  return seeds;
}

/** One line for the Telegram prompt: "Calendar had Whitby, dry and 17°." Empty when nothing is known. */
export function seedsLine(seeds: Seeds | null | undefined): string {
  if (!seeds) return "";
  const bits: string[] = [];
  if (seeds.calendar?.length) bits.push(`Calendar had ${seeds.calendar.map((c) => c.replace(/^\d\d:\d\d /, "")).slice(0, 3).join(", ")}`);
  if (seeds.weather) bits.push(seeds.weather);
  if (seeds.health?.length) bits.push(seeds.health[0]);
  if (seeds.media?.length) bits.push(seeds.media[0]);
  return bits.length ? `${bits.join(" · ")}.` : "";
}

/** The block the interviewer sees (spec §4.3): what the day looked like from the outside, never asserted as fact. */
export function seedsBlock(seeds: Seeds | null | undefined): string | null {
  if (!seeds) return null;
  const lines: string[] = [];
  if (seeds.calendar?.length) lines.push(`calendar: ${seeds.calendar.join("; ")}`);
  if (seeds.weather) lines.push(`weather: ${seeds.weather}`);
  if (seeds.health?.length) lines.push(`health: ${seeds.health.join("; ")}`);
  if (seeds.spotify?.length) lines.push(`music: ${seeds.spotify.join("; ")}`);
  if (seeds.media?.length) lines.push(`media: ${seeds.media.join("; ")}`);
  if (!lines.length) return null;
  return clip(`seeds (from calendars and devices, not from the person — you may ask about these, never state them as what happened):\n${lines.join("\n")}`, MAX_CHARS);
}
