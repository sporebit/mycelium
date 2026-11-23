/**
 * Hours → ticking rows, as Phil (2026-11-23: "a select button on each row
 * so I can delete multiple at once", "select what I want merging", and
 * backlog items with a date shown on the Log in colour).
 *
 * The browser's clock is fixed on Wednesday 12 March 2031. Tests run in
 * order: four entries are held, two are merged by tick, the other two are
 * deleted by tick, then the record and the Backlog are thinned the same way.
 */
import { test, type Locator, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import {
  SLOW,
  addHeld,
  blankRow,
  descriptions,
  expect,
  freeze,
  getBundle,
  holding,
  isEntryWrite,
  mergeHeld,
  patchSettings,
  purge,
  record,
  restoreSettings,
  rowOf,
  runId,
  snapshotSettings,
  visit,
  type ApiEntry,
  type SettingsSnapshot,
} from "./hours.helpers.ts";

const RUN = runId();
const P = `E2E-hours-${RUN}`;
const A = `${P} a timed`;
const B = `${P} b timed`;
const C = `${P} c backlog with date`;
const D = `${P} d dateless`;
const TICKET_BASE = "https://e2e-hours.example.test/browse";

let before: SettingsSnapshot = null;
const held: Record<string, ApiEntry> = {};

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async ({ request }) => {
  purge();
  before = await snapshotSettings(request);
  await patchSettings(request, { tracking_start: "2031-03-03", ticket_base_url: TICKET_BASE });
});

test.afterAll(async ({ request }) => {
  purge();
  await restoreSettings(request, before);
});

test.beforeEach(async ({ page }) => {
  await freeze(page);
});

async function openLog(page: Page) {
  await visit(page, "/log");
  await expect(page.getByRole("heading", { level: 1, name: "Log" })).toBeVisible({ timeout: SLOW });
  await expect(blankRow(page)).toBeVisible();
}

const tick = (row: Locator) => row.locator("input[data-select]");
const selectAll = (scope: Locator) => scope.getByRole("checkbox", { name: "Select all rows" });
const bar = (scope: Locator) => scope.locator("[data-selection-bar]");
const accept = (page: Page) => page.once("dialog", (d) => void d.accept());

test("ticked held rows merge alone; the rest keep waiting; a dated open item lands under its day in blue", async ({ page }) => {
  for (const e of [
    { description: A, date: "2031-03-12", minutes: 60, ticket: "ZZE-1" },
    { description: B, date: "2031-03-12", minutes: 30, ticket: "ZZE-2" },
    { description: C, date: "2031-03-12", minutes: null, estimate: 40, ticket: "ZZE-3" },
    { description: D, date: null, minutes: 20, ticket: "ZZE-4" },
  ]) {
    held[e.description] = await addHeld(page.request, e);
  }

  await openLog(page);
  const hold = holding(page);
  await expect(hold).toContainText("4 waiting");
  await expect(hold.getByRole("button", { name: "MERGE", exact: true })).toBeEnabled();
  // The blank row has no tick; every held row has one.
  await expect(blankRow(page).locator("input[data-select]")).toHaveCount(0);
  await expect(hold.locator("[data-hours-row] input[data-select]")).toHaveCount(4);

  await tick(rowOf(hold, A)).check();
  await tick(rowOf(hold, C)).check();
  await expect(hold).toContainText("2 ticked");
  await expect(rowOf(hold, A)).toHaveAttribute("data-selected", "true");
  await expect(selectAll(hold), "half the rows ticked: the header shows the half state").toHaveJSProperty("indeterminate", true);

  const merged = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/hours/entries/merge");
  await hold.getByRole("button", { name: "MERGE 2 selected" }).click();
  const res = await merged;
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ merged: 2 });
  expect((JSON.parse(res.request().postData() ?? "{}") as { ids: string[] }).ids.sort()).toEqual([held[A].id, held[C].id].sort());

  // B and D still wait; nothing is ticked any more; MERGE is plain again.
  await expect(hold).toContainText("2 waiting · 0:50");
  expect((await descriptions(hold)).sort()).toEqual([B, D].sort());
  await expect(hold).not.toContainText("ticked");
  await expect(hold.getByRole("button", { name: "MERGE", exact: true })).toBeVisible();

  // A and C sit under Wednesday. C is open work with a date: tinted, tagged, counted in the day's header.
  const day = record(page).locator("section").filter({ hasText: "Wed 12 Mar" });
  expect((await descriptions(day)).sort()).toEqual([A, C].sort());
  const c = rowOf(day, C);
  await expect(c).toHaveAttribute("data-backlog", "true");
  await expect(c.getByText("backlog", { exact: true })).toBeVisible();
  await expect(c.getByLabel("Backlog — open, no time yet")).toBeVisible();
  await expect(rowOf(day, A)).not.toHaveAttribute("data-backlog", /.*/);
  await expect(day).toContainText("1 backlog");
  await expect(day).toContainText("1:00");
  await expect(page.getByText("2 entries · 1:00 · 1 open")).toBeVisible();

  // The Backlog state filter on the Log keeps only C; the Backlog page lists C too.
  await page.getByRole("radio", { name: "Backlog", exact: true }).click();
  await expect.poll(() => descriptions(record(page))).toEqual([C]);
  await visit(page, "/backlog");
  await expect(rowOf(page, C)).toBeVisible();
  await expect(page.getByText("1 open · estimated 0:40")).toBeVisible();
});

test("the header tick selects every held row and Delete selected removes them after one confirm", async ({ page }) => {
  await openLog(page);
  const hold = holding(page);
  await expect(hold).toContainText("2 waiting");
  await selectAll(hold).check();
  await expect(hold).toContainText("2 ticked");
  await expect(tick(rowOf(hold, B))).toBeChecked();
  await expect(tick(rowOf(hold, D))).toBeChecked();

  // Cancelling the confirm deletes nothing and keeps the ticks.
  page.once("dialog", (d) => void d.dismiss());
  await hold.getByRole("button", { name: "Delete selected" }).click();
  await expect(hold).toContainText("2 ticked");
  expect((await getBundle(page.request)).entries.filter((e) => e.merged_at === null && e.description.startsWith(P))).toHaveLength(2);

  let message = "";
  page.once("dialog", (d) => {
    message = d.message();
    void d.accept();
  });
  const gone = page.waitForResponse(isEntryWrite("DELETE"));
  await hold.getByRole("button", { name: "Delete selected" }).click();
  const res = await gone;
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ deleted: 2 });
  expect(new URL(res.url()).pathname).toBe("/api/hours/entries");
  expect(message).toBe("Delete 2 selected entries?");

  await expect(hold).toContainText("type into the blank row");
  await expect(hold.getByRole("button", { name: "MERGE", exact: true })).toBeDisabled();
  // Soft-deleted, as the × does.
  const kept = localSql(`select count(*) from public.hours_entries where description in ('${B}', '${D}') and deleted_at is not null`);
  expect(kept).toEqual([["2"]]);
  expect((await getBundle(page.request)).entries.some((e) => e.description === B || e.description === D)).toBe(false);
});

test("in the record, ticking a row shows the bar; Clear empties it; Delete selected removes only the ticked rows", async ({ page }) => {
  await openLog(page);
  const rec = record(page);
  await expect(bar(rec)).toHaveCount(0);

  await selectAll(rec).check();
  await expect(bar(rec)).toContainText("2 selected");
  await bar(rec).getByRole("button", { name: "Clear" }).click();
  await expect(bar(rec)).toHaveCount(0);
  await expect(tick(rowOf(rec, A))).not.toBeChecked();

  await tick(rowOf(rec, C)).check();
  await expect(bar(rec)).toContainText("1 selected");
  await expect(rowOf(rec, C)).toHaveAttribute("data-selected", "true");

  // A row the filter hides is no longer selected: the bar follows what is on view.
  await page.getByLabel("Search").fill("a timed");
  await expect.poll(() => descriptions(rec)).toEqual([A]);
  await expect(bar(rec)).toHaveCount(0);
  await page.getByLabel("Search").fill("");
  await expect.poll(async () => (await descriptions(rec)).sort()).toEqual([A, C].sort());
  await expect(bar(rec), "the tick comes back with the row").toContainText("1 selected");

  accept(page);
  const gone = page.waitForResponse(isEntryWrite("DELETE"));
  await bar(rec).getByRole("button", { name: "Delete selected" }).click();
  expect(await (await gone).json()).toEqual({ deleted: 1 });
  await expect.poll(() => descriptions(rec)).toEqual([A]);
  await expect(bar(rec)).toHaveCount(0);
  await expect(page.getByText("1 entry · 1:00")).toBeVisible();
});

test("on the Backlog, the header tick and Delete selected clear the open items together", async ({ page }) => {
  const E = `${P} e open`;
  const F = `${P} f open`;
  await addHeld(page.request, { description: E, date: null, minutes: null, estimate: 15, ticket: "ZZE-5" });
  await addHeld(page.request, { description: F, date: null, minutes: null, estimate: 25, ticket: "ZZE-6" });
  expect(await mergeHeld(page.request)).toBe(2);

  await visit(page, "/backlog");
  await expect(page.getByRole("heading", { level: 1, name: "Backlog" })).toBeVisible({ timeout: SLOW });
  await expect(page.getByText("2 open · estimated 0:40")).toBeVisible();
  const grid = record(page);
  await selectAll(grid).check();
  await expect(bar(grid)).toContainText("2 selected");

  accept(page);
  const gone = page.waitForResponse(isEntryWrite("DELETE"));
  await bar(grid).getByRole("button", { name: "Delete selected" }).click();
  expect(await (await gone).json()).toEqual({ deleted: 2 });
  await expect(page.getByText("No open items.")).toBeVisible();
});

test("the bulk routes refuse junk and count only what they changed", async ({ request }) => {
  const del = async (data: unknown) => request.delete("/api/hours/entries", { data });
  expect((await del({})).status()).toBe(400);
  expect((await del({ ids: [] })).status()).toBe(400);
  expect((await del({ ids: ["tmp-1"] })).status()).toBe(400);
  const none = await del({ ids: ["00000000-0000-4000-8000-000000000000"] });
  expect(none.status()).toBe(200);
  expect(await none.json()).toEqual({ deleted: 0 });

  expect((await request.post("/api/hours/entries/merge", { data: { ids: ["x"] } })).status()).toBe(400);
  expect((await request.post("/api/hours/entries/merge", { data: { ids: [] } })).status()).toBe(400);
  // Merging an id that is already merged (or not held) changes nothing.
  const again = await request.post("/api/hours/entries/merge", { data: { ids: [held[A].id] } });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ merged: 0 });
});
