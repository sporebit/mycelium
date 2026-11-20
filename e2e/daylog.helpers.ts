/**
 * Shared by the Day log and capture specs: a run id for the data they
 * create, an API context that acts as Phil whichever project is running,
 * and the day arithmetic the app itself uses.
 *
 * The Day log keys its rows by date, so a prefix cannot mark a row as the
 * spec's own. Instead each test takes a date that has no row yet
 * (`freeDay`) and removes that row when it finishes.
 */
import { expect as baseExpect, type APIRequestContext, type APIResponse, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { E2E_API_SECRET, E2E_CRON_SECRET, E2E_ORIGIN } from "./support/env.ts";

export const expect = baseExpect;

export const RUN = Date.now().toString(36);
export const tag = (surface: "daylog" | "capture") => `E2E-${surface}-${RUN}`;

export const OPENER = "Go on then — where did the day take you?";
export const QUICK_PROMPT = "Quick one: who / where / one line about the day.";
export const SCORE_LINE = "mood / energy / sleep / productivity, 1–5?";
/** What the interviewer says when the model cannot be reached (AI is off on this server). */
export const LOST_THREAD = "Lost my thread for a second — say that again, or 'done' to wrap up.";
export const CRON_AUTH = { Authorization: `Bearer ${E2E_CRON_SECRET}` };

/**
 * An empty cookie jar. Inside a test `playwright.request.newContext()` starts from the project's options,
 * the signed-in session included, so a context meant to carry no session has to say so.
 */
export const NO_SESSION = { cookies: [], origins: [] };

/** Requests that act as Phil through API_SECRET, with no session cookie in the way. */
export function philApi(playwright: PlaywrightWorkerArgs["playwright"]): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: E2E_ORIGIN, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET }, storageState: NO_SESSION });
}

export function shift(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** The heading the day page shows for a date. */
export function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** London wall clock, the way lib/daylog/day.ts reads it. */
export function londonNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/** ISO week key ("2026-W47") of a day. */
export function isoWeek(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((dt.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function json<T = Record<string, unknown>>(res: APIResponse): Promise<T> {
  return (await res.json()) as T;
}

/** The app's own idea of today (before 03:00 London it is still yesterday). */
export async function appToday(api: APIRequestContext): Promise<string> {
  const res = await api.get("/api/journal/days");
  expect(res.status(), "GET /api/journal/days").toBe(200);
  return (await json<{ today: string }>(res)).today;
}

const handedOut = new Set<string>();

/**
 * A date in the last 12 weeks (so the list page shows it) that has no Day
 * log row for this person, and that no other test in this run was given.
 */
export async function freeDay(api: APIRequestContext): Promise<string> {
  const today = await appToday(api);
  const res = await api.get(`/api/journal/days?from=${shift(today, -85)}&to=${shift(today, -8)}`);
  expect(res.status()).toBe(200);
  const used = new Set((await json<{ days: Array<{ day: string }> }>(res)).days.map((d) => d.day));
  const start = 8 + Math.floor(Math.random() * 70);
  for (let i = 0; i < 78; i++) {
    const day = shift(today, -(8 + ((start - 8 + i) % 78)));
    if (!used.has(day) && !handedOut.has(day)) {
      handedOut.add(day);
      return day;
    }
  }
  throw new Error("no free Day log date in the last 12 weeks");
}

export type Entry = { role: "user" | "assistant" | "system"; at: string; text: string; channel: string };
export type Day = {
  id: string;
  day: string;
  status: string;
  mode: string | null;
  transcript: Entry[];
  summary: string | null;
  summary_edited_by_user: boolean;
  scores: Record<string, number>;
  turn_count: number;
  cost_pence: number;
};
export type Scene = { id: string; title: string; place_id: string | null; place_text: string | null; narrative: string | null; narrative_edited_by_user: boolean; hidden_from_linked: boolean; people: Array<{ id: string; name: string }> };
export type DayPayload = { day: Day; score_keys: string[]; scenes: Scene[]; facts: unknown[]; pending: number; media: Array<{ id: string; scene_id: string | null; caption: string | null; shareable: boolean; url: string | null }> };
export type Turn = { reply: string; state: "open" | "scores" | "closed"; missing: string[]; day: Day };

export async function readDay(api: APIRequestContext, date: string): Promise<DayPayload> {
  const res = await api.get(`/api/journal/days/${date}`);
  expect(res.status(), `GET day ${date}`).toBe(200);
  return json<DayPayload>(res);
}

/** POST to the app transport and insist on a 200: a turn must never 5xx, model or no model. */
export async function turn(api: APIRequestContext, date: string, body: { text: string } | { start: "talk" | "quick" | "skip" }): Promise<Turn> {
  const res = await api.post(`/api/journal/days/${date}/messages`, { data: body });
  expect(res.status(), `POST messages ${JSON.stringify(body)} → ${await res.text().then((t) => t.slice(0, 200))}`).toBe(200);
  return json<Turn>(res);
}

/** A closed Quick day: "who / where / one line", then the four scores. */
export async function quickDay(api: APIRequestContext, date: string, line: string, scores = "4 3 2 5"): Promise<Turn> {
  await turn(api, date, { start: "quick" });
  await turn(api, date, { text: line });
  return turn(api, date, { text: scores });
}

/**
 * Remove a day this spec created, with what hangs off it: review items
 * still waiting, and any person or place an approval made.
 */
export async function removeDay(api: APIRequestContext, date: string): Promise<void> {
  const res = await api.get(`/api/journal/days?from=${date}&to=${date}`);
  if (!res.ok()) return;
  const row = (await json<{ days: Array<{ id: string }> }>(res)).days[0];
  if (!row) return;
  const pend = await api.get(`/api/pending-entities?day_id=${row.id}&resolved=true`);
  if (pend.ok()) {
    for (const p of (await json<{ pending: Array<{ id: string; entity_type: string; resolved_at: string | null; resolved_action: string | null; resolved_entity_id: string | null }> }>(pend)).pending) {
      if (!p.resolved_at) await api.post(`/api/pending-entities/${p.id}/resolve`, { data: { action: "reject" } });
      else if (p.resolved_action === "create_new" && p.resolved_entity_id) {
        if (p.entity_type === "daylog_new_person") await api.delete(`/api/people/${p.resolved_entity_id}?hard=1`);
        if (p.entity_type === "daylog_place") await api.delete(`/api/places/${p.resolved_entity_id}`);
      }
    }
  }
  await api.delete(`/api/journal/days/${date}`);
}

/** The page's content, without the sidebar (whose links share words such as "Today" with the pages). */
export const m = (page: Page) => page.getByRole("main");

/** Collects same-origin 5xx answers and browser crashes while a page is driven. */
export function watch(page: Page): { serverErrors: string[]; crashes: string[]; serviceWorker: string[]; ambient: string[] } {
  const seen = { serverErrors: [] as string[], crashes: [] as string[], serviceWorker: [] as string[], ambient: [] as string[] };
  page.on("pageerror", (err) => {
    // The PWA shell's own trouble (a build whose /sw.js is missing or half-written: the registration is refused
    // and @serwist/window then reads `.waiting` of nothing) is every page's, not this surface's; kept apart.
    if (/Failed to register a ServiceWorker|reading 'waiting'/.test(err.message)) seen.serviceWorker.push(err.message);
    // FINDING capture-9 (see capture.phil.spec.ts): the ripple the background draws after a capture can throw.
    else if (/'arc' on 'CanvasRenderingContext2D'/.test(err.message)) seen.ambient.push(err.message);
    else seen.crashes.push(err.message);
  });
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (url.origin === E2E_ORIGIN && res.status() >= 500) seen.serverErrors.push(`${res.status()} ${res.request().method()} ${url.pathname}`);
  });
  return seen;
}

/** A 1×1 PNG, for the photo strip. */
export const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
