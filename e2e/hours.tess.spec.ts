/**
 * Hours as Tess, a second user with her own personal space. The tracker is
 * Phil's alone (spec §4: "sits in Phil's personal space and is never shared
 * by a team grant"), so Tess must see none of his hours, must not be able to
 * touch them through any route, and must get her own working, empty tracker.
 *
 * Phil's rows are made through the server-to-server header (acts as Phil).
 */
import { test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_API_SECRET } from "./support/env.ts";
import { PHIL, TESS } from "./support/users.ts";
import {
  BASE,
  SLOW,
  addHeld,
  blankRow,
  card,
  expect,
  freeze,
  getBundle,
  holding,
  patchSettings,
  purge,
  record,
  restoreSettings,
  rowOf,
  runId,
  snapshotSettings,
  stat,
  type ApiBundle,
  visit,
  type SettingsSnapshot,
} from "./hours.helpers.ts";

const RUN = runId();
const P = `E2E-hours-${RUN}`;
const PHIL_LABEL = `E2E-hours ${RUN} label`;

let phil: APIRequestContext;
let anonymous: APIRequestContext;
let philBefore: SettingsSnapshot = null;

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async ({ playwright, baseURL }) => {
  phil = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  purge(PHIL);
  purge(TESS);
  philBefore = await snapshotSettings(phil);
  await patchSettings(phil, { checkpoint_label: PHIL_LABEL, tracking_start: "2031-03-10" });
});

test.afterAll(async () => {
  purge(PHIL);
  purge(TESS);
  await restoreSettings(phil, philBefore, PHIL);
  await phil.dispose();
  await anonymous.dispose();
});

test.beforeEach(async ({ page }) => {
  await freeze(page);
});

async function open(page: Page, path: string, heading?: string) {
  const res = await visit(page, path);
  if (res) expect(res.status()).toBe(200); // a full page load; a tab click has no response of its own
  if (heading) await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: SLOW });
}

test("Tess gets her own empty tracker on every Hours page", async ({ page, request }) => {
  const mine = await getBundle(request);
  expect(mine.entries).toEqual([]);
  expect(mine.absences).toEqual([]);
  expect(mine.bankHolidays).toEqual([]);

  await open(page, "");
  await expect(card(page, "This week")).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("37:30 LEFT TO WORK THIS WEEK", { exact: true })).toBeVisible();
  await expect(stat(card(page, "This week"), "Banked Mon–Thu")).toHaveText("0:00 (0.00h)");
  await expect(stat(card(page, "Open backlog"), "Items")).toHaveText("0");
  // No settings of her own yet, so the defaults: the standard checkpoint, and no block-out to open.
  await expect(card(page, "Wednesday 13:00 checkpoint")).toContainText("threshold 25:00");
  await expect(page.getByText(PHIL_LABEL)).toHaveCount(0);
  await expect(page.getByText("OPEN BLOCK-OUT EMAIL")).toHaveCount(0);

  await open(page, "/log", "Log");
  await expect(holding(page)).toContainText("type into the blank row");
  await expect(holding(page).getByRole("button", { name: "MERGE" })).toBeDisabled();
  await expect(record(page)).toContainText("Nothing here for this filter.");

  await open(page, "/backlog", "Backlog");
  await expect(page.getByText("No open items.")).toBeVisible();

  await open(page, "/daily", "Daily");
  await expect(card(page, "This week")).toContainText("0:00");
  await expect(card(page, "Last week")).toBeVisible();

  await open(page, "/history", "History");
  await expect(page.locator("tbody > tr[aria-expanded]")).toHaveCount(1); // her tracking starts this week
  await expect(stat(page, "Entries with time")).toHaveText("0 · 0 open");

  await open(page, "/tickets", "Tickets");
  await expect(card(page, "This week")).toContainText("No time in this range.");
  await expect(card(page, "Any range")).toContainText("No time in this range.");

  await open(page, "/settings", "Settings");
  await expect(card(page, "Absences")).toContainText("None recorded.");
  await expect(card(page, "Bank holidays").getByRole("listitem")).toHaveCount(0);
  await expect(card(page, "Import").getByRole("button", { name: "UNDO LAST" })).toBeDisabled();

  await open(page, "/rules", "Rules");
  await expect(page.locator("dl")).toContainText("37:30, Monday to Thursday.");
});

test("Tess sees none of Phil's hours and cannot change them through any route", async ({ request }) => {
  // Phil: a held entry, a merged one would need MERGE (which is his alone), an absence, a bank holiday, and an import run.
  const philEntry = await addHeld(phil, { date: "2031-03-11", minutes: 90, description: `${P} phil only`, ticket: "ZZE-950" });
  const abs = await phil.post("/api/hours/absences", { data: { absence_date: "2031-03-12", type: "Sick", note: "E2E-hours" } });
  expect(abs.status()).toBe(201);
  const philAbsence = ((await abs.json()) as { absence: { id: string } }).absence;
  const hol = await phil.post("/api/hours/bank-holidays", { data: { holiday_date: "2031-03-13", name: "E2E-hours holiday" } });
  expect(hol.status()).toBe(201);
  const philHoliday = ((await hol.json()) as { holiday: { id: string } }).holiday;
  const run = await phil.post("/api/hours/import", { data: { file: { logEntries: [{ date: "2031-03-10", minutes: 30, description: `${P} phil import` }] }, filename: `E2E-hours-${RUN}.json`, dryRun: false } });
  expect(run.status(), await run.text()).toBe(200);

  // Reads: nothing of his in her bundle, her export or her import history.
  const mine = await getBundle(request);
  expect(mine.entries.filter((e) => e.description.startsWith(P))).toEqual([]);
  expect(mine.absences).toEqual([]);
  expect(mine.bankHolidays).toEqual([]);
  expect((mine.settings as { checkpoint_label?: string } | null)?.checkpoint_label).not.toBe(PHIL_LABEL);
  const exported = await request.get("/api/hours/export?format=json");
  expect(exported.status()).toBe(200);
  expect(await exported.text()).not.toContain(P);
  const runs = (await (await request.get("/api/hours/import")).json()) as { runs: unknown[]; can_undo: boolean };
  expect(runs).toEqual({ runs: [], can_undo: false });

  // Writes aimed at his rows find nothing.
  expect((await request.patch(`/api/hours/entries/${philEntry.id}`, { data: { minutes: 1 } })).status()).toBe(404);
  expect((await request.delete(`/api/hours/entries/${philEntry.id}`)).status()).toBe(404);
  await request.delete(`/api/hours/absences/${philAbsence.id}`);
  await request.delete(`/api/hours/bank-holidays/${philHoliday.id}`);
  // Her MERGE merges nothing of his; her undo has nothing to undo and leaves his import alone.
  const merged = await request.post("/api/hours/entries/merge");
  expect(await merged.json()).toEqual({ merged: 0 });
  expect((await request.post("/api/hours/import/undo")).status()).toBe(409);

  const his: ApiBundle = await getBundle(phil);
  expect(his.entries.find((e) => e.id === philEntry.id)).toMatchObject({ minutes: 90, merged_at: null, deleted_at: null });
  expect(his.entries.some((e) => e.description === `${P} phil import`)).toBe(true);
  expect(his.absences.some((a) => a.id === philAbsence.id)).toBe(true);
  expect(his.bankHolidays.some((h) => h.id === philHoliday.id)).toBe(true);
  expect((his.settings as { checkpoint_label: string }).checkpoint_label).toBe(PHIL_LABEL);
  expect(((await (await phil.get("/api/hours/import")).json()) as { can_undo: boolean }).can_undo).toBe(true);
  expect((await phil.post("/api/hours/import/undo")).status()).toBe(200);
});

test("what Tess types into her Log is hers alone", async ({ page }) => {
  const mineOnly = `${P} tess only`;
  await open(page, "/log", "Log");
  const blank = blankRow(page);
  await blank.getByLabel("Time spent").fill("0:20");
  await blank.getByLabel("Description").fill(mineOnly);
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/hours/entries");
  await blank.getByLabel("Description").press("Enter");
  expect((await saved).status()).toBe(201);
  await expect(rowOf(holding(page), mineOnly)).toBeVisible();
  await expect(holding(page)).toContainText("1 waiting · 0:20 · not counted until merged");

  expect((await getBundle(page.request)).entries.filter((e) => e.description === mineOnly)).toHaveLength(1);
  expect((await getBundle(phil)).entries.some((e) => e.description === mineOnly)).toBe(false);
});

test("without a session every Hours route answers 401, never data and never a server error", async () => {
  const calls: Array<[string, string, unknown?]> = [
    ["GET", "/api/hours/bundle"],
    ["GET", "/api/hours/glance"],
    ["GET", "/api/hours/export?format=json"],
    ["GET", "/api/hours/export?format=xlsx"],
    ["GET", "/api/hours/import"],
    ["POST", "/api/hours/entries", { description: `${P} anonymous`, minutes: 5 }],
    ["POST", "/api/hours/entries/merge"],
    ["PATCH", "/api/hours/entries/00000000-0000-4000-8000-000000000000", { minutes: 5 }],
    ["DELETE", "/api/hours/entries/00000000-0000-4000-8000-000000000000"],
    ["PATCH", "/api/hours/settings", { review_length_weeks: 7 }],
    ["POST", "/api/hours/absences", { absence_date: "2031-03-12", type: "Sick" }],
    ["DELETE", "/api/hours/absences/00000000-0000-4000-8000-000000000000"],
    ["POST", "/api/hours/bank-holidays", { holiday_date: "2031-03-13", name: "E2E-hours" }],
    ["DELETE", "/api/hours/bank-holidays/00000000-0000-4000-8000-000000000000"],
    ["POST", "/api/hours/bank-holidays/refresh"],
    ["POST", "/api/hours/import", { file: { logEntries: [{ date: "2031-03-10", minutes: 5, description: `${P} anonymous` }] }, dryRun: false }],
    ["POST", "/api/hours/import/undo"],
  ];
  for (const [method, path, data] of calls) {
    const res = await anonymous.fetch(path, { method, data, maxRedirects: 0 });
    expect(res.status(), `${method} ${path}`).toBe(401);
  }
  const page = await anonymous.get(`${BASE}/log`, { maxRedirects: 0 });
  expect(page.status()).toBe(307);
  expect(page.headers().location).toContain("/login");
});
