/**
 * Hours → Log and Backlog, as Phil (claude/four-day-week-spec.md §5, §12:
 * spreadsheet rows, the 0157 holding section, the blank row, MERGE).
 *
 * The browser's clock is fixed on Wednesday 12 March 2031 so "This week" is
 * a week nobody else touches. Tests run in order and build on each other:
 * three entries are typed into the blank row, edited in place, merged, and
 * then filtered, sorted and deleted.
 */
import { test, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import {
  BASE,
  SLOW,
  TODAY,
  addHeld,
  blankRow,
  card,
  cell,
  descriptions,
  entryId,
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
  rowById,
  rowOf,
  runId,
  snapshotSettings,
  stat,
  watch,
  visit,
  type SettingsSnapshot,
} from "./hours.helpers.ts";

const RUN = runId();
const P = `E2E-hours-${RUN}`;
const D1 = `${P} one`;
const D2 = `${P} two`;
const D2E = `${P} two edited`;
const D3 = `${P} three dateless`;
const TICKET_BASE = "https://e2e-hours.example.test/browse";

let before: SettingsSnapshot = null;

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async ({ request }) => {
  purge();
  before = await snapshotSettings(request);
  await patchSettings(request, { tracking_start: "2031-03-03", ticket_base_url: TICKET_BASE, catch_all_tickets: [{ key: "ZZE-900", purpose: "E2E-hours catch-all" }] });
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

test("the holding section opens with a blank row at the top and MERGE off", async ({ page }) => {
  await openLog(page);
  const hold = holding(page);
  await expect(hold).toContainText("New entries");
  await expect(hold).toContainText("type into the blank row");
  await expect(hold.getByRole("button", { name: "MERGE" })).toBeDisabled();
  // The blank row is the first row of the section, dated today (no entry yet to copy a date from).
  await expect(hold.locator("[data-hours-row]").first()).toHaveAttribute("data-hours-new-row");
  await expect(blankRow(page).getByLabel("Date")).toHaveValue(TODAY);
  await expect(record(page)).toContainText("Nothing here for this filter.");
  // The catch-all ticket from Settings is offered in the Ticket cell.
  await expect(page.locator('datalist#hours-catch-all option[value="ZZE-900"]')).toHaveCount(1);
});

test("typing into the blank row and pressing Enter holds the entry; the row clears and the cursor returns to Time", async ({ page }) => {
  await openLog(page);
  const blank = blankRow(page);
  await blank.getByLabel("Time spent").fill("1.5h");
  await blank.getByLabel("Estimate").fill("2:00");
  await blank.getByLabel("Description").fill(D1);
  await blank.getByLabel("Ticket").fill("zze-301");
  const saved = page.waitForResponse(isEntryWrite("POST"));
  await blank.getByLabel("Ticket").press("Enter");
  expect((await saved).status()).toBe(201);

  const row = rowOf(holding(page), D1);
  await expect(row).toBeVisible();
  await expect(cell(row, "date")).toHaveValue(TODAY);
  await expect(cell(row, "time")).toHaveValue("1:30");
  await expect(cell(row, "estimate")).toHaveValue("~2:00");
  await expect(cell(row, "ticket")).toHaveValue("ZZE-301");
  await expect(row.getByRole("link")).toHaveAttribute("href", `${TICKET_BASE}/ZZE-301`);
  await expect(row.getByLabel("Has time, not yet ticked Logged")).toBeVisible();

  // The blank row is ready for the next one.
  await expect(blank.getByLabel("Time spent")).toHaveValue("");
  await expect(blank.getByLabel("Description")).toHaveValue("");
  await expect(blank.getByLabel("Ticket")).toHaveValue("");
  await expect(blank.getByLabel("Date")).toHaveValue(TODAY);
  await expect(blank.getByLabel("Time spent")).toBeFocused();

  await expect(holding(page)).toContainText("1 waiting · 1:30 · not counted until merged");
  await expect(holding(page).getByRole("button", { name: "MERGE" })).toBeEnabled();
  // Held, so not in the record and not in its count.
  await expect(record(page)).toContainText("Nothing here for this filter.");
  await expect(page.getByText("0 entries · 0:00")).toBeVisible();

  const mine = (await getBundle(page.request)).entries.filter((e) => e.description === D1);
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ entry_date: TODAY, minutes: 90, estimate_minutes: 120, ticket_raw: "zze-301", ticket_key: "ZZE-301", logged: false, source: "manual", merged_at: null });
});

test("in the blank row Tab moves across without saving, leaving the row saves, Esc clears and a bad time is refused", async ({ page }) => {
  await openLog(page);
  const posts = watch(page, "POST", /^\/api\/hours\/entries$/);
  const blank = blankRow(page);

  await blank.getByLabel("Time spent").fill("45");
  await blank.getByLabel("Time spent").press("Tab");
  await expect(blank.getByLabel("Estimate")).toBeFocused();
  await blank.getByLabel("Estimate").press("Tab");
  await expect(blank.getByLabel("Description")).toBeFocused();
  await blank.getByLabel("Description").fill(D2);
  expect(posts, "Tab inside the row must not save a half-typed entry").toEqual([]);

  // Clicking elsewhere on the page leaves the row: that saves it.
  const saved = page.waitForResponse(isEntryWrite("POST"));
  await page.getByLabel("Search").click();
  expect((await saved).status()).toBe(201);
  const row = rowOf(holding(page), D2);
  await expect(row).toBeVisible();
  await expect(cell(row, "time")).toHaveValue("0:45");
  // Time, description, no ticket: the unfilled (red) state.
  await expect(row.getByLabel("Missing a description or a ticket")).toBeVisible();
  await expect(blank.getByLabel("Description")).toHaveValue("");

  // Esc clears what was typed and saves nothing.
  await blank.getByLabel("Description").fill(`${P} never saved`);
  await blank.getByLabel("Description").press("Escape");
  await expect(blank.getByLabel("Description")).toHaveValue("");

  // A time that does not parse is refused: red cell, nothing sent.
  await blank.getByLabel("Time spent").fill("abc");
  await blank.getByLabel("Description").fill(`${P} bad time`);
  await blank.getByLabel("Description").press("Enter");
  await expect(blank.getByLabel("Time spent")).toHaveClass(/border-v2-error/);
  await expect(blank.getByLabel("Description")).toHaveValue(`${P} bad time`);
  await blank.getByLabel("Description").press("Escape");
  await expect(blank.getByLabel("Time spent")).toHaveValue("");

  const mine = (await getBundle(page.request)).entries.filter((e) => e.description.startsWith(P));
  expect(mine.map((e) => e.description).sort()).toEqual([D1, D2].sort());
  expect(posts).toHaveLength(1);
});

test("an entry with no date can be held", async ({ page }) => {
  await openLog(page);
  const blank = blankRow(page);
  await blank.getByLabel("Date").fill("");
  await blank.getByLabel("Estimate").fill("0:40");
  await blank.getByLabel("Description").fill(D3);
  await blank.getByLabel("Ticket").fill("ZZE-303");
  const saved = page.waitForResponse(isEntryWrite("POST"));
  await blank.getByLabel("Ticket").press("Enter");
  expect((await saved).status()).toBe(201);
  const row = rowOf(holding(page), D3);
  await expect(row).toBeVisible();
  await expect(cell(row, "date")).toHaveValue("");
  await expect(row.getByLabel("Backlog — open, no time yet")).toBeVisible();
  await expect(holding(page)).toContainText("3 waiting · 2:15 · not counted until merged");
  // Newest first beneath the blank row.
  expect(await descriptions(holding(page))).toEqual([D3, D2, D1]);
});

test("held rows count nowhere: Dashboard, History, Tickets and Backlog stay empty", async ({ page }) => {
  await visit(page);
  await expect(page.getByRole("link", { name: "3 new entries are waiting in the Log and not counted yet — open the Log to merge." })).toBeVisible();
  await expect(page.getByText("37:30 LEFT TO WORK THIS WEEK")).toBeVisible();
  await expect(stat(card(page, "This week"), "Banked Mon–Thu")).toHaveText("0:00 (0.00h)");
  await expect(stat(card(page, "Today"), "Today so far")).toHaveText("0:00");
  await expect(stat(card(page, "Open backlog"), "Items")).toHaveText("0");

  await visit(page, "/tickets");
  await expect(card(page, "This week")).toContainText("No time in this range.");
  await visit(page, "/backlog");
  await expect(page.getByText("No open items.")).toBeVisible();
  await visit(page, "/history");
  await expect(stat(page, "Entries with time")).toHaveText("0 · 0 open");
  await expect(stat(page, "Logged in total")).toHaveText("0:00 (0.00h)");
});

test("a cell saves on blur and on Enter, Enter and Shift+Enter move down and up, Tab moves across, Esc reverts, a refused time stays red", async ({ page }) => {
  await openLog(page);
  const hold = holding(page);
  const patches = watch(page, "PATCH", /^\/api\/hours\/entries\//);

  const one = rowById(hold, await entryId(page.request, D1));
  const twoE = rowById(hold, await entryId(page.request, D2));
  const three = rowById(hold, await entryId(page.request, D3));

  // Blur saves.
  await cell(twoE, "description").fill(D2E);
  let saved = page.waitForResponse(isEntryWrite("PATCH"));
  await page.getByLabel("Search").click();
  expect((await saved).status()).toBe(200);
  await expect(cell(twoE, "description")).toHaveValue(D2E);
  expect((await getBundle(page.request)).entries.some((e) => e.description === D2E)).toBe(true);

  // Enter saves and moves down the same column (rows are D3, D2, D1).
  // Typed as decimal hours, stored and shown as h:mm.
  await cell(twoE, "time").fill("2.25h");
  saved = page.waitForResponse(isEntryWrite("PATCH"));
  await cell(twoE, "time").press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(cell(one, "time")).toBeFocused();
  await expect(cell(twoE, "time")).toHaveValue("2:15");

  // Shift+Enter moves back up; from the first held row it reaches the blank row.
  await cell(one, "time").press("Shift+Enter");
  await expect(cell(twoE, "time")).toBeFocused();
  await cell(twoE, "time").press("Shift+Enter");
  await expect(cell(three, "time")).toBeFocused();
  await cell(three, "time").press("Shift+Enter");
  await expect(blankRow(page).getByLabel("Time spent")).toBeFocused();

  // Tab moves across the row.
  await cell(twoE, "time").focus();
  await cell(twoE, "time").press("Tab");
  await expect(cell(twoE, "estimate")).toBeFocused();
  await cell(twoE, "estimate").press("Tab");
  await expect(cell(twoE, "description")).toBeFocused();

  // Two edits so far, two saves: moving on after Enter must not send the same change a second time.
  expect(patches).toHaveLength(2);

  // Esc puts the cell back and saves nothing.
  const sentBeforeEsc = patches.length;
  await cell(one, "description").fill(`${P} must not be saved`);
  await cell(one, "description").press("Escape");
  await expect(cell(one, "description")).toHaveValue(D1);
  const afterEsc = (await getBundle(page.request)).entries.filter((e) => e.description.startsWith(P)).map((e) => e.description);
  expect(afterEsc).toContain(D1);
  expect(afterEsc).not.toContain(`${P} must not be saved`);
  expect(patches.length, "Esc must not send a save").toBe(sentBeforeEsc);

  // A time that does not parse stays red, is not saved, and Enter does not move on.
  await cell(one, "time").fill("abc");
  await cell(one, "time").press("Enter");
  await expect(cell(one, "time")).toHaveClass(/border-v2-error/);
  await expect(cell(one, "time")).toBeFocused();
  await cell(one, "time").press("Escape");
  await expect(cell(one, "time")).toHaveValue("1:30");
  expect(patches.length, "a refused time must not be sent").toBe(sentBeforeEsc);

  // The Logged tick saves at once and turns the row green.
  saved = page.waitForResponse(isEntryWrite("PATCH"));
  await cell(one, "logged").check();
  expect((await saved).status()).toBe(200);
  await expect(one.getByLabel("Complete and logged in Jira")).toBeVisible();

  const mine = (await getBundle(page.request)).entries.filter((e) => e.description.startsWith(P));
  expect(mine.find((e) => e.description === D1)).toMatchObject({ minutes: 90, logged: true, merged_at: null });
  expect(mine.find((e) => e.description === D2E)).toMatchObject({ minutes: 135, logged: false, merged_at: null });
});

test("MERGE moves dated rows into their day and dateless rows to the Backlog", async ({ page }) => {
  await openLog(page);
  const merged = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/hours/entries/merge");
  await holding(page).getByRole("button", { name: "MERGE" }).click();
  const res = await merged;
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ merged: 3 });

  await expect(holding(page)).toContainText("type into the blank row");
  await expect(holding(page).getByRole("button", { name: "MERGE" })).toBeDisabled();
  expect(await descriptions(holding(page))).toEqual([]);

  // The two dated rows sit under their day; the day's header carries its totals.
  const day = record(page).locator("section").filter({ hasText: "Wed 12 Mar" });
  await expect(day).toBeVisible();
  expect((await descriptions(day)).sort()).toEqual([D1, D2E].sort());
  await expect(day).toContainText("2:15 not logged");
  await expect(day).toContainText("3:45");
  await expect(page.getByText("2 entries · 3:45 · 1 open")).toBeVisible();

  // The dateless one is in no week of the Log, even with every week shown…
  await page.getByRole("radio", { name: "All", exact: true }).first().click();
  expect(await descriptions(record(page))).not.toContain(D3);
  // …it is on the Backlog.
  await visit(page, "/backlog");
  await expect(rowOf(page, D3)).toBeVisible();
  await expect(page.getByText("1 open · estimated 0:40")).toBeVisible();

  // And the figures now count the merged time.
  await visit(page);
  await expect(page.getByText(/waiting in the Log/)).toHaveCount(0);
  await expect(stat(card(page, "This week"), "Banked Mon–Thu")).toHaveText("3:45 (3.75h)");
  await expect(stat(card(page, "Open backlog"), "Items")).toHaveText("1");
  await expect(stat(card(page, "Open backlog"), "Estimated")).toHaveText("0:40");
});

test("on the Backlog, a Date and a Time turn an open item into a normal entry", async ({ page }) => {
  await visit(page, "/backlog");
  const row = rowOf(page, D3);
  await expect(row).toBeVisible();
  await expect(cell(row, "estimate")).toHaveValue("~0:40");

  await cell(row, "date").fill("2031-03-11");
  let saved = page.waitForResponse(isEntryWrite("PATCH"));
  await cell(row, "date").press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(row, "dated but still without time: still open work").toBeVisible();

  await cell(row, "time").fill("0:30");
  saved = page.waitForResponse(isEntryWrite("PATCH"));
  await cell(row, "time").press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(page.getByText("No open items.")).toBeVisible();

  await openLog(page);
  const tue = record(page).locator("section").filter({ hasText: "Tue 11 Mar" });
  expect(await descriptions(tue)).toEqual([D3]);
  await expect(page.getByText("3 entries · 4:15")).toBeVisible();
});

test("the Log narrows by week, state and search", async ({ page }) => {
  // One entry in the week before, straight into the record.
  const LAST = `${P} last week`;
  await addHeld(page.request, { date: "2031-03-04", minutes: 60, description: LAST, ticket: "ZZE-304", logged: true });
  expect(await mergeHeld(page.request)).toBe(1);

  await openLog(page);
  const rec = record(page);
  const range = (name: string) => page.getByRole("radio", { name, exact: true });
  expect((await descriptions(rec)).sort()).toEqual([D1, D2E, D3].sort());
  await expect(page.getByText("Week of Mon 10 Mar 2031 to Sun 16 Mar")).toBeVisible();

  await range("Last week").click();
  await expect.poll(() => descriptions(rec)).toEqual([LAST]);
  await expect(page.getByText("Week of Mon 3 Mar 2031 to Sun 9 Mar")).toBeVisible();

  await range("Week of…").click();
  await page.getByLabel("Any date in the week").fill("2031-02-26");
  await expect(rec).toContainText("Nothing here for this filter.");
  await page.getByLabel("Any date in the week").fill("2031-03-07");
  await expect.poll(() => descriptions(rec)).toEqual([LAST]);

  // "All" appears twice (weeks and states); the first is the week range.
  await page.getByRole("radio", { name: "All", exact: true }).first().click();
  await expect.poll(async () => (await descriptions(rec)).sort()).toEqual([D1, D2E, D3, LAST].sort());

  await range("Not logged").click();
  await expect.poll(async () => (await descriptions(rec)).sort()).toEqual([D2E, D3].sort());
  await range("Incomplete").click();
  await expect.poll(() => descriptions(rec)).toEqual([D2E]);
  await range("Backlog").click();
  await expect(rec).toContainText("Nothing here for this filter.");
  await page.getByRole("radio", { name: "All", exact: true }).nth(1).click();

  await page.getByLabel("Search").fill("two edited");
  await expect.poll(() => descriptions(rec)).toEqual([D2E]);
  await page.getByLabel("Search").fill("zze-304");
  await expect.poll(() => descriptions(rec)).toEqual([LAST]);
});

test("Log headers sort inside each day and the funnel filters each column", async ({ page }) => {
  await openLog(page);
  const rec = record(page);
  const wed = rec.locator("section").filter({ hasText: "Wed 12 Mar" });
  // Unsorted: newest entry first within the day (D2 was typed after D1).
  expect(await descriptions(wed)).toEqual([D2E, D1]);

  const time = rec.locator('[title="Sort by Time"]');
  await time.click(); // durations: largest first
  await expect.poll(() => descriptions(wed)).toEqual([D2E, D1]);
  await time.click(); // flipped
  await expect.poll(() => descriptions(wed)).toEqual([D1, D2E]);
  await time.click(); // cleared
  await expect.poll(() => descriptions(wed)).toEqual([D2E, D1]);

  const desc = rec.locator('[title="Sort by Description"]');
  await desc.click(); // text: A→Z ("… one" before "… two edited")
  await expect.poll(() => descriptions(wed)).toEqual([D1, D2E]);
  await desc.click();
  await expect.poll(() => descriptions(wed)).toEqual([D2E, D1]);
  await desc.click();

  // The funnel opens one filter input under every column.
  await expect(rec.getByLabel("Filter Time")).toHaveCount(0);
  await rec.getByRole("button", { name: "Filter columns" }).click();
  for (const label of ["Filter Date", "Filter Time", "Filter Description", "Filter Ticket", "Filter Logged"]) await expect(rec.getByLabel(label)).toBeVisible();

  await rec.getByLabel("Filter Time").fill(">2:00");
  await expect.poll(() => descriptions(rec)).toEqual([D2E]);
  await expect(rec).toContainText("2 of 3 hidden by 1 filter");
  await rec.getByLabel("Filter Time").fill("<=45");
  await expect.poll(() => descriptions(rec)).toEqual([D3]);
  await rec.getByLabel("Filter Time").fill("");

  await rec.getByLabel("Filter Logged").fill("yes");
  await expect.poll(() => descriptions(rec)).toEqual([D1]);
  await rec.getByLabel("Filter Logged").fill("no");
  await expect.poll(async () => (await descriptions(rec)).sort()).toEqual([D2E, D3].sort());
  await rec.getByLabel("Filter Logged").fill("");

  await rec.getByLabel("Filter Ticket").fill("blank");
  await expect.poll(() => descriptions(rec)).toEqual([D2E]);
  await rec.getByLabel("Filter Ticket").fill("303");
  await expect.poll(() => descriptions(rec)).toEqual([D3]);
  await rec.getByLabel("Filter Description").fill("no such text");
  await expect(rec).toContainText("Nothing here for this filter.");
  await expect(rec).toContainText("3 of 3 hidden by 2 filters");
  await rec.getByRole("button", { name: "clear", exact: true }).click();
  await expect.poll(async () => (await descriptions(rec)).sort()).toEqual([D1, D2E, D3].sort());
});

test("the Ticket cell takes a key or a URL: a browse/ URL shows its key, any other URL shows as a link", async ({ page }) => {
  await openLog(page);
  const row = rowOf(record(page), D1);
  const pasted = "https://e2e-hours.example.test/browse/zze-777?focus=1";

  await cell(row, "ticket").fill(pasted);
  let saved = page.waitForResponse(isEntryWrite("PATCH"));
  await cell(row, "ticket").press("Enter");
  expect((await saved).status()).toBe(200);
  await page.getByLabel("Search").click();
  await expect(cell(row, "ticket")).toHaveValue("ZZE-777");
  await expect(row.getByRole("link")).toHaveAttribute("href", pasted);
  expect((await getBundle(page.request)).entries.find((e) => e.description === D1)).toMatchObject({ ticket_raw: pasted, ticket_key: "ZZE-777" });

  const wiki = "https://e2e-hours.example.test/wiki/page-1";
  await cell(row, "ticket").fill(wiki);
  saved = page.waitForResponse(isEntryWrite("PATCH"));
  await cell(row, "ticket").press("Enter");
  expect((await saved).status()).toBe(200);
  await page.getByLabel("Search").click();
  await expect(cell(row, "ticket")).toHaveValue("link");
  await expect(row.getByRole("link")).toHaveAttribute("href", wiki);
  expect((await getBundle(page.request)).entries.find((e) => e.description === D1)).toMatchObject({ ticket_raw: wiki, ticket_key: null });
});

test("the × deletes a row after a confirm, as a soft delete", async ({ page }) => {
  await openLog(page);
  const row = rowOf(record(page), D2E);
  const deletes = watch(page, "DELETE", /^\/api\/hours\/entries\//);

  // Cancelling the confirm deletes nothing.
  page.once("dialog", (d) => void d.dismiss());
  await row.hover();
  await row.getByRole("button", { name: "Delete entry" }).click();
  await expect(row).toBeVisible();
  expect(deletes).toEqual([]);

  let message = "";
  page.once("dialog", (d) => {
    message = d.message();
    void d.accept();
  });
  const gone = page.waitForResponse(isEntryWrite("DELETE"));
  await row.hover();
  await row.getByRole("button", { name: "Delete entry" }).click();
  expect((await gone).status()).toBe(200);
  expect(message).toBe(`Delete "${D2E}"?`);
  await expect(row).toHaveCount(0);
  await expect(page.getByText("2 entries · 2:00")).toBeVisible();

  // Gone from every read, kept in the table with deleted_at set.
  expect((await getBundle(page.request)).entries.some((e) => e.description === D2E)).toBe(false);
  const kept = localSql(`select deleted_at is not null from public.hours_entries where description = '${D2E}'`);
  expect(kept).toEqual([["t"]]);
});

test("the entry API refuses what the cells refuse", async ({ request }) => {
  const bad = async (data: Record<string, unknown>) => (await request.post("/api/hours/entries", { data })).status();
  expect(await bad({})).toBe(400); // nothing in it
  expect(await bad({ description: `${P} x`, minutes: "25:00" })).toBe(400); // over 24 hours
  expect(await bad({ description: `${P} x`, minutes: -5 })).toBe(400);
  expect(await bad({ description: `${P} x`, entry_date: "2031-02-31" })).toBe(400); // no such day
  expect(await bad({ description: `${P} x`, estimate_minutes: "soon" })).toBe(400);
  expect((await request.patch("/api/hours/entries/00000000-0000-4000-8000-000000000000", { data: { logged: true } })).status()).toBe(404);
  expect((await request.delete("/api/hours/entries/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
  expect((await getBundle(request)).entries.some((e) => e.description === `${P} x`)).toBe(false);
});
