/**
 * Shared pieces for the Hours (Four-Day Week Tracker) specs. Not a spec
 * itself: the Playwright config only picks up `*.spec.ts`.
 *
 * Everything these specs create is synthetic and carries `E2E-hours-` in its
 * description (entries), sits in 2031 (absences, bank holidays) or is named
 * `E2E-hours-…` (import files), so `purge()` can remove exactly that and
 * nothing else. The app only soft-deletes entries and never deletes an
 * import run, so the clean-up is SQL on the local stack; assertions go
 * through the app.
 */
import { expect as baseExpect, type APIRequestContext, type Locator, type Page, type Response } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL, personalSpace, type Person } from "./support/users.ts";

export const BASE = "/organisation/hours";

/** The synthetic "today": a Wednesday in a week nobody else uses. Europe/London is on GMT that week. */
export const TODAY = "2031-03-12";
export const TODAY_INSTANT = new Date("2031-03-12T10:00:00Z");
export const MONDAY = "2031-03-10";

/** How long to wait for the first paint of a page on a server several suites share. */
export const SLOW = 60_000;

/**
 * `expect` with a little more patience than the config's 15 s: the server is
 * shared by several suites at once. The checks themselves are unchanged.
 */
export const expect = baseExpect.configure({ timeout: 20_000 });

export const runId = () => Date.now().toString(36).slice(-6);

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `h:mm`, minutes rounded to the nearest whole one. Written here, not imported from the app. */
export function hm(minutes: number): string {
  const a = Math.round(Math.abs(minutes));
  return `${minutes < 0 ? "-" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
export const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
export const both = (minutes: number) => `${hm(minutes)} (${(minutes / 60).toFixed(2)}h)`;

/** The browser believes it is `TODAY`; timers keep running. The server keeps the real date. */
export async function freeze(page: Page, at: Date = TODAY_INSTANT): Promise<void> {
  page.setDefaultTimeout(SLOW);
  await page.clock.setFixedTime(at);
}

/**
 * Open an Hours page. From another Hours page this clicks the tab (a
 * client-side move, as a person would make, and one page load fewer for the
 * shared server); from anywhere else it loads the page.
 */
export async function visit(page: Page, path = ""): Promise<Response | null> {
  const target = `${BASE}${path}`;
  const here = page.url().startsWith("http") ? new URL(page.url()).pathname : "";
  const tab = page.getByRole("navigation", { name: "Hours pages" }).locator(`a[href="${target}"]`);
  if (here.startsWith(BASE) && here !== target && (await tab.count()) === 1) {
    await tab.click();
    await page.waitForURL((u) => u.pathname === target);
    return null;
  }
  return page.goto(target);
}

// ---------------------------------------------------------------------
// Data through the API (set-up) and SQL (clean-up only)
// ---------------------------------------------------------------------

export type EntryInput = {
  date?: string | null;
  minutes?: number | null;
  estimate?: number | null;
  description: string;
  ticket?: string;
  logged?: boolean;
};

export type ApiEntry = {
  id: string;
  entry_date: string | null;
  minutes: number | null;
  estimate_minutes: number | null;
  description: string;
  ticket_raw: string;
  ticket_key: string | null;
  logged: boolean;
  source: string;
  merged_at: string | null;
  deleted_at: string | null;
};

export type ApiBundle = {
  settings: Record<string, unknown> | null;
  entries: ApiEntry[];
  absences: Array<{ id: string; absence_date: string; type: string; minutes: number; note: string }>;
  bankHolidays: Array<{ id: string; holiday_date: string; name: string }>;
};

/** POST one entry. It lands held (merged_at null), as a typed entry does. */
export async function addHeld(request: APIRequestContext, e: EntryInput): Promise<ApiEntry> {
  const res = await request.post("/api/hours/entries", {
    data: { entry_date: e.date ?? null, minutes: e.minutes ?? null, estimate_minutes: e.estimate ?? null, description: e.description, ticket: e.ticket ?? "", logged: e.logged ?? false },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { entry: ApiEntry }).entry;
}

export async function mergeHeld(request: APIRequestContext): Promise<number> {
  const res = await request.post("/api/hours/entries/merge");
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { merged: number }).merged;
}

export async function getBundle(request: APIRequestContext): Promise<ApiBundle> {
  const res = await request.get("/api/hours/bundle");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as ApiBundle;
}

export async function patchSettings(request: APIRequestContext, body: Record<string, unknown>): Promise<void> {
  const res = await request.patch("/api/hours/settings", { data: body });
  expect(res.status(), await res.text()).toBe(200);
}

const SETTINGS_FIELDS = [
  "contracted_minutes_per_week",
  "standard_day_minutes",
  "checkpoint_threshold_minutes",
  "checkpoint_label",
  "tracking_start",
  "review_length_weeks",
  "wed_minutes_before_1300",
  "wed_minutes_after_1300",
  "ticket_base_url",
  "catch_all_tickets",
  "block_out_recipients",
  "block_out_subject_template",
  "block_out_body_lines",
] as const;

export type SettingsSnapshot = Record<string, unknown> | null;

/** The settings row as it was before a spec touched it (null on a stack where the tracker was never set up). */
export async function snapshotSettings(request: APIRequestContext): Promise<SettingsSnapshot> {
  return (await getBundle(request)).settings;
}

/** Put the settings back: the saved values, or no row at all when there was none. */
export async function restoreSettings(request: APIRequestContext, snap: SettingsSnapshot, who: Person = PHIL): Promise<void> {
  if (snap === null) {
    localSql(`delete from public.hours_settings where space_id = '${personalSpace(who)}'`);
    return;
  }
  const body: Record<string, unknown> = {};
  for (const f of SETTINGS_FIELDS) body[f] = snap[f];
  await patchSettings(request, body);
}

/**
 * Remove what the Hours specs created for this person: entries whose
 * description or ticket carries the E2E prefix, absences and bank holidays
 * dated in 2031, and import runs of E2E-named files or pastes. Hard delete,
 * because the app keeps soft-deleted entries and every import run for good.
 */
export function purge(who: Person = PHIL): void {
  const space = personalSpace(who);
  localSql(
    `delete from public.hours_entries where space_id = '${space}' and (description like 'E2E-hours-%' or ticket_raw like 'E2E-hours-%' or ticket_raw like '%ZZE-%' or ticket_raw like '%e2e-hours.example.test%')`,
  );
  localSql(`delete from public.hours_absences where space_id = '${space}' and absence_date between '2031-01-01' and '2031-12-31'`);
  localSql(`delete from public.hours_bank_holidays where space_id = '${space}' and holiday_date between '2031-01-01' and '2031-12-31'`);
  localSql(`delete from public.hours_import_runs where space_id = '${space}' and (filename like 'E2E-hours-%' or filename = 'paste')`);
}

// ---------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------

/** The Log's holding section ("New entries"): the blank row, the held rows, MERGE. */
export const holding = (page: Page) => page.locator("section[data-hours-grid]");
/** The record below it: the dated entries grouped by day. */
export const record = (page: Page) => page.locator("div[data-hours-grid]");
export const blankRow = (page: Page) => page.locator("[data-hours-new-row]");

/** A spreadsheet row, found by what its Description cell holds. */
export function rowOf(scope: Page | Locator, description: string): Locator {
  return scope.locator(`[data-hours-row]:not([data-hours-new-row]):has(input[data-col="description"][value="${description}"])`);
}

/** The same row by its entry id: stays put while its Description is being edited. */
export const rowById = (scope: Page | Locator, id: string) => scope.locator(`[data-hours-row][data-entry-id="${id}"]`);

export async function entryId(request: APIRequestContext, description: string): Promise<string> {
  const found = (await getBundle(request)).entries.filter((e) => e.description === description);
  expect(found, `one entry described "${description}"`).toHaveLength(1);
  return found[0].id;
}

export const cell = (row: Locator, col: "date" | "time" | "estimate" | "description" | "ticket" | "logged") => row.locator(`input[data-col="${col}"]`);

/** A titled card (Dashboard, Daily, Tickets, Settings). */
export function card(page: Page, title: string | RegExp): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: title, exact: typeof title === "string" }) });
}

/** The value shown under a label, for the single figures on the Dashboard and History. */
export function stat(scope: Page | Locator, label: string): Locator {
  return scope.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
}

/** The cell texts of a table row, trimmed and with runs of white space collapsed. */
export async function cells(row: Locator): Promise<string[]> {
  const texts = await row.locator("td").allInnerTexts();
  return texts.map((t) => t.replace(/\s+/g, " ").trim());
}

/** The Description values of the rows in a grid, top to bottom. */
export async function descriptions(scope: Locator): Promise<string[]> {
  return scope.locator('[data-hours-row]:not([data-hours-new-row]) input[data-col="description"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
}

/** Requests the page makes that match, recorded as they are sent: for "nothing was saved" assertions. */
export function watch(page: Page, method: string, path: RegExp): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() === method && path.test(new URL(r.url()).pathname)) seen.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return seen;
}

export const isEntryWrite = (method: string) => (r: { url(): string; request(): { method(): string } }) =>
  r.request().method() === method && /\/api\/hours\/entries(\/|$)/.test(new URL(r.url()).pathname);
