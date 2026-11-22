/**
 * PhirstMaxx screens: the shapes the routes answer with, the one write
 * helper, and the words for times and money. Times on the wire are UTC
 * instants; everything shown is Europe/London.
 */
import type { EngineWindow } from "@/lib/phirstmaxx/engine/windows";
import type { HomeData, PlanView } from "@/lib/phirstmaxx/home";
import type { PmNotification } from "@/lib/phirstmaxx/notify";
import type { MeView, PmPet, WakingOverride } from "@/lib/phirstmaxx/settings";
import type { DropWithThing, ThingCard, ThingDetail } from "@/lib/phirstmaxx/things";
import type { FitResult, PmBlockType, PmPlace } from "@/lib/phirstmaxx/types";
import type { WeekData } from "@/lib/phirstmaxx/week";

export type { DropWithThing, EngineWindow, FitResult, HomeData, MeView, PlanView, PmNotification, ThingCard, ThingDetail, WeekData };

export type Person = { id: string; name: string; colour: string };
export type ResearchLine = { queue_depth: number; stuck: number; last_ok_by_source: Record<string, string | null>; month_cost_pence: number; paid_allowed: boolean; paid_reason: string | null };
export type SettingsView = {
  me: MeView;
  people: Array<Person & { has_car: boolean }>;
  places: PmPlace[];
  types: PmBlockType[];
  pets: PmPet[];
  waking_overrides: WakingOverride[];
  research: ResearchLine | null;
  inbox: { hint: string | null; path: string };
};

export const INPUT =
  "min-h-[40px] px-3 rounded-v2-md bg-surface-0 border border-hairline text-text-hi text-sm placeholder:text-text-lo focus:outline-none focus:border-glow transition-colors";
export const CELL = "w-full min-h-[36px] bg-transparent px-2 text-sm text-text-hi rounded-v2-sm border border-transparent hover:border-hairline focus:border-glow focus:bg-surface-0 focus:outline-none placeholder:text-text-lo";

/** A write to the PhirstMaxx API. Throws the server's own sentence, which is written to be read. */
export async function send<T = unknown>(method: "POST" | "PATCH" | "DELETE", path: string, body?: Record<string, unknown> | FormData): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "That did not save. Try again.");
  return json as T;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : "That did not work. Try again.");

const LONDON = "Europe/London";
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: LONDON });
const dayLongFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: LONDON });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LONDON });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: LONDON });
const at = (v: string | number) => new Date(v);

export const timeLabel = (v: string | number) => timeFmt.format(at(v));
export const dayLabel = (v: string | number) => dayFmt.format(at(v));
export const dayLongLabel = (v: string | number) => dayLongFmt.format(at(v));
export const dateLabel = (v: string | number) => dateFmt.format(at(v));
/** "Sat 28 Nov, 13:00–17:30" */
export const spanLabel = (s: string | number, e: string | number) => `${dayLabel(s)}, ${timeLabel(s)}–${timeLabel(e)}`;
/** "4 h 30", "45 min" */
export function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${String(rest).padStart(2, "0")}` : `${Math.floor(m / 60)} h`;
}
export const pounds = (pence: number | null | undefined) => (pence === null || pence === undefined ? "" : pence === 0 ? "Free" : `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`);
/** "3 min ago", "2 h ago", "4 days ago" */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
/** "Saturday 28 November, 13:00 to 17:30 — 4 h 30 together" */
export function windowInWords(w: EngineWindow): string {
  return `${dayLongLabel(w.start)}, ${timeLabel(w.start)} to ${timeLabel(w.end)} — ${durationLabel(w.minutes)} together${w.firmness === "flexible" ? " (flexible)" : ""}`;
}
/** The host of a URL, for a source line: "from official_site · nationaltrust.org.uk · checked 3 Nov 2026". */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
export const SOURCE_WORDS: Record<string, string> = {
  jsonld: "the site's structured data",
  official_site: "the official site",
  opengraph: "the page's preview",
  osm: "OpenStreetMap",
  google_places: "Google Places",
  web_search: "a web search",
  youtube: "YouTube",
  oembed: "the video's embed card",
  vision: "the picture",
  exif: "the photo's own data",
  person: "a person",
  estimate: "an estimate",
  import: "the old app",
};
export const VERDICT_WORDS: Record<FitResult["verdict"], string> = { fits: "Fits", tight: "Tight", no: "Doesn't fit" };
export const VERDICT_CLASS: Record<FitResult["verdict"], string> = { fits: "text-glow-2", tight: "text-warn", no: "text-text-lo" };

/** A fact's value as words. */
export function factText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(factText).join(", ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("text" in o && typeof o.text === "string") return o.text;
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${factText(v)}`)
      .join(" · ");
  }
  return String(value);
}

/** An instant as the value a datetime-local input takes, in the browser's own time (the one it reads back with). */
export function toLocalInput(iso: string | number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string): string | null => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export const STATUS_WORDS: Record<string, string> = { researching: "Researching", ready: "Researched", needs_answer: "Needs an answer", archived: "Archived" };
export const PLAN_WORDS: Record<string, string> = { proposed: "Proposed", accepted: "It's on", declined: "Declined", expired: "Expired", done: "Done", cancelled: "Cancelled" };
