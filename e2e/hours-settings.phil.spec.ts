/**
 * Hours → Settings, export and import, as Phil (claude/four-day-week-spec.md
 * §5 Settings, §6 Export and import, O3 block-out).
 *
 * Two merged entries (Mon 10:00, Tue 11:00 in the week of 10 March 2031) give
 * the Dashboard something to react to when a target, an absence or a bank
 * holiday changes. Import is exercised through the route with a synthetic
 * file (dry run, apply, undo, conflict, rejected rows) and through the
 * Settings card (paste, .xlsx and JSON round trips).
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { BASE, SLOW, addHeld, blankRow, card, cells, expect, freeze, getBundle, mergeHeld, patchSettings, purge, restoreSettings, runId, snapshotSettings, stat, visit, type SettingsSnapshot } from "./hours.helpers.ts";

const RUN = runId();
const P = `E2E-hours-${RUN}`;
const S1 = `${P} seed mon`;
const S2 = `${P} seed tue`;
const TICKET_BASE = "https://e2e-hours.example.test/browse";
const DEFAULTS = {
  contracted_minutes_per_week: 2250,
  standard_day_minutes: 450,
  checkpoint_threshold_minutes: 1500,
  checkpoint_label: "Wednesday 13:00",
  tracking_start: "2031-03-10",
  review_length_weeks: 6,
  wed_minutes_before_1300: 210,
  wed_minutes_after_1300: 300,
  ticket_base_url: TICKET_BASE,
  catch_all_tickets: [],
  block_out_recipients: [],
  block_out_subject_template: "",
  block_out_body_lines: [],
};

let before: SettingsSnapshot = null;

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async ({ request }) => {
  purge();
  before = await snapshotSettings(request);
  await patchSettings(request, DEFAULTS);
  await addHeld(request, { date: "2031-03-10", minutes: 600, description: S1, ticket: "ZZE-601", logged: true });
  await addHeld(request, { date: "2031-03-11", minutes: 660, description: S2, ticket: "ZZE-602" });
  expect(await mergeHeld(request)).toBe(2);
});

test.afterAll(async ({ request }) => {
  purge();
  await restoreSettings(request, before);
});

test.beforeEach(async ({ page }) => {
  await freeze(page);
});

async function openSettings(page: Page) {
  await visit(page, "/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({ timeout: SLOW });
}
async function openDashboard(page: Page) {
  await visit(page);
  await expect(card(page, "This week")).toBeVisible({ timeout: SLOW });
}
/** The control under a field's label (the labels are not wired to their inputs). */
const field = (scope: Page | Locator, label: string) => scope.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
const isCall = (method: string, path: string) => (r: { url(): string; request(): { method(): string } }) => r.request().method() === method && new URL(r.url()).pathname === path;

// ---------------------------------------------------------------------
// Targets and the checkpoint
// ---------------------------------------------------------------------

test("Settings shows the targets, and the trade-off table follows the rule", async ({ page }) => {
  await openSettings(page);
  const c = card(page, "Targets and checkpoint");
  await expect(field(c, "Weekly target (Mon–Thu)")).toHaveValue("37:30");
  await expect(field(c, "Standard day (credit)")).toHaveValue("7:30");
  await expect(field(c, "Checkpoint threshold")).toHaveValue("25:00");
  await expect(field(c, "Checkpoint label")).toHaveValue("Wednesday 13:00");
  await expect(field(c, "Tracking start")).toHaveValue("2031-03-10");
  await expect(field(c, "Review after (weeks)")).toHaveValue("6");
  await expect(field(c, "Wed before 13:00 (assumed)")).toHaveValue("3:30");
  await expect(field(c, "Wed after 13:00 (assumed)")).toHaveValue("5:00");
  // Review = tracking start + 6 weeks.
  await expect(c).toContainText("review Mon 21 Apr 2031");

  // Spec §3: Mon and Tue each = (threshold − 3:30) / 2; Thursday = target − threshold − 5:00; Wednesday is the assumed 3:30 + 5:00.
  const rows = c.locator("table tbody tr");
  await expect(rows).toHaveCount(3);
  expect(await cells(rows.nth(0))).toEqual(["20:00", "8:15", "8:15", "8:30", "12:30"]);
  expect(await cells(rows.nth(1))).toEqual(["22:30", "9:30", "9:30", "8:30", "10:00"]);
  expect(await cells(rows.nth(2))).toEqual(["25:00", "10:45", "10:45", "8:30", "7:30"]);
  // It follows what is typed, before saving: 26:00 → (26:00 − 3:30)/2 = 11:15, and 37:30 − 26:00 − 5:00 = 6:30.
  await field(c, "Checkpoint threshold").fill("26:00");
  expect(await cells(rows.nth(2))).toEqual(["26:00", "11:15", "11:15", "8:30", "6:30"]);
});

test("changing the targets saves, and the Dashboard and Rules follow", async ({ page }) => {
  try {
    await openSettings(page);
    const c = card(page, "Targets and checkpoint");
    await field(c, "Checkpoint threshold").fill("20:00");
    await field(c, "Checkpoint label").fill("Wednesday lunchtime");
    await field(c, "Weekly target (Mon–Thu)").fill("40:00");
    await field(c, "Standard day (credit)").fill("8:00");
    const saved = page.waitForResponse(isCall("PATCH", "/api/hours/settings"));
    await c.getByRole("button", { name: "SAVE" }).click();
    expect((await saved).status()).toBe(200);
    await expect(c.getByText("Saved.")).toBeVisible();
    expect((await getBundle(page.request)).settings).toMatchObject({ checkpoint_threshold_minutes: 1200, checkpoint_label: "Wednesday lunchtime", contracted_minutes_per_week: 2400, standard_day_minutes: 480 });

    // It survives a reload.
    await openSettings(page);
    await expect(field(card(page, "Targets and checkpoint"), "Checkpoint threshold")).toHaveValue("20:00");
    await expect(field(card(page, "Targets and checkpoint"), "Weekly target (Mon–Thu)")).toHaveValue("40:00");

    // Banked is 21:00 (10:00 + 11:00): past the new 20:00 threshold, 19:00 short of the new 40:00 target.
    await openDashboard(page);
    await expect(page.getByText("19:00 LEFT TO WORK THIS WEEK", { exact: true })).toBeVisible();
    await expect(stat(card(page, "This week"), "Target")).toHaveText("40:00 (40.00h)");
    await expect(stat(card(page, "This week"), "Banked Mon–Thu")).toHaveText("21:00 (21.00h)");
    const cp = card(page, "Wednesday lunchtime checkpoint");
    await expect(cp).toContainText("threshold 20:00");
    await expect(cp.getByText("SEND BLOCK-OUT", { exact: true })).toBeVisible();

    await visit(page, "/rules");
    await expect(page.locator("dl")).toContainText("40:00, Monday to Thursday.");
    await expect(page.locator("dl")).toContainText("Credits a standard day (8:00) on that date.");
    await expect(page.locator("dl")).toContainText("Wednesday lunchtime checkpoint");
    await expect(page.locator("dl")).toContainText("at least 20:00");
  } finally {
    await patchSettings(page.request, DEFAULTS);
  }
});

test("a target the server refuses is not saved and the reason is shown", async ({ page }) => {
  await openSettings(page);
  const c = card(page, "Targets and checkpoint");
  await field(c, "Weekly target (Mon–Thu)").fill("a lot");
  const refused = page.waitForResponse(isCall("PATCH", "/api/hours/settings"));
  await c.getByRole("button", { name: "SAVE" }).click();
  expect((await refused).status()).toBe(400);
  await expect(page.getByText("Weekly target must be between 1 and 10080 minutes.")).toBeVisible();
  await expect(c.getByText("Saved.")).toHaveCount(0);
  expect((await getBundle(page.request)).settings).toMatchObject({ contracted_minutes_per_week: 2250 });
});

// ---------------------------------------------------------------------
// Absences and bank holidays
// ---------------------------------------------------------------------

test("an absence credits its day: a standard day by default, one row per date, removable", async ({ page }) => {
  await openSettings(page);
  const c = card(page, "Absences");
  await expect(c).toContainText("credit a standard day (7:30) unless minutes are given");
  await expect(c).toContainText("None recorded.");
  await expect(c.getByRole("button", { name: "ADD" })).toBeDisabled();

  await c.getByLabel("Date").fill("2031-03-12");
  await c.getByLabel("Type").selectOption("Sick");
  await c.getByLabel("Note").fill("E2E-hours note");
  let saved = page.waitForResponse(isCall("POST", "/api/hours/absences"));
  await c.getByRole("button", { name: "ADD" }).click();
  expect((await saved).status()).toBe(201);
  const item = c.getByRole("listitem");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Wed 12 Mar 2031");
  await expect(item).toContainText("Sick");
  await expect(item).toContainText("7:30");
  await expect(item).toContainText("E2E-hours note");

  // The same date again replaces it rather than adding a second credit.
  await c.getByLabel("Date").fill("2031-03-12");
  await c.getByLabel("Type").selectOption("Other");
  await c.getByLabel("Minutes").fill("2:00");
  saved = page.waitForResponse(isCall("POST", "/api/hours/absences"));
  await c.getByRole("button", { name: "ADD" }).click();
  expect((await saved).status()).toBe(200);
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Other");
  await expect(item).toContainText("2:00");

  // Wednesday is credited 2:00, so banked goes from 21:00 to 23:00.
  await openDashboard(page);
  await expect(stat(card(page, "This week"), "Banked Mon–Thu")).toHaveText("23:00 (23.00h)");
  expect((await cells(card(page, "By day").locator("tbody tr").nth(2))).slice(0, 4)).toEqual(["Wed 12", "0:00", "2:00", "2:00"]);

  await openSettings(page);
  let asked = "";
  page.once("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  const gone = page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname.startsWith("/api/hours/absences/"));
  await card(page, "Absences").getByRole("button", { name: "remove" }).click();
  expect((await gone).status()).toBe(200);
  expect(asked).toBe("Remove the other on 2031-03-12?");
  await expect(card(page, "Absences")).toContainText("None recorded.");
  expect((await getBundle(page.request)).absences.filter((a) => a.absence_date.startsWith("2031"))).toEqual([]);
});

test("the absence and bank-holiday routes refuse bad input", async ({ request }) => {
  expect((await request.post("/api/hours/absences", { data: { absence_date: "12/03/2031", type: "Sick" } })).status()).toBe(400);
  expect((await request.post("/api/hours/absences", { data: { absence_date: "2031-03-12", type: "Holiday" } })).status()).toBe(400);
  expect((await request.post("/api/hours/absences", { data: { absence_date: "2031-03-12", type: "Sick", minutes: "25:00" } })).status()).toBe(400);
  expect((await request.post("/api/hours/bank-holidays", { data: { holiday_date: "2031-02-30", name: "E2E-hours" } })).status()).toBe(400);
  expect((await request.patch("/api/hours/settings", { data: {} })).status()).toBe(400);
  expect((await request.patch("/api/hours/settings", { data: { tracking_start: "soon" } })).status()).toBe(400);
  expect((await request.patch("/api/hours/settings", { data: { review_length_weeks: 0 } })).status()).toBe(400);
  const b = await getBundle(request);
  expect(b.absences.filter((a) => a.absence_date.startsWith("2031"))).toEqual([]);
  expect(b.bankHolidays.filter((h) => h.holiday_date.startsWith("2031"))).toEqual([]);
});

test("a bank holiday added by hand credits a standard day and can be removed", async ({ page }) => {
  await openSettings(page);
  const c = card(page, "Bank holidays");
  await c.getByLabel("Date").fill("2031-03-13");
  await c.getByLabel("Name").fill("E2E-hours holiday");
  let saved = page.waitForResponse(isCall("POST", "/api/hours/bank-holidays"));
  await c.getByRole("button", { name: "ADD" }).click();
  expect((await saved).status()).toBe(201);
  const item = c.getByRole("listitem").filter({ hasText: "Thu 13 Mar 2031" });
  await expect(item).toContainText("E2E-hours holiday");

  // The same date again renames it; still one row.
  await c.getByLabel("Date").fill("2031-03-13");
  await c.getByLabel("Name").fill("E2E-hours holiday renamed");
  saved = page.waitForResponse(isCall("POST", "/api/hours/bank-holidays"));
  await c.getByRole("button", { name: "ADD" }).click();
  expect((await saved).status()).toBe(200);
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("E2E-hours holiday renamed");

  // Thursday is credited 7:30: banked 21:00 → 28:30, past the 25:00 threshold.
  await openDashboard(page);
  await expect(stat(card(page, "This week"), "Banked Mon–Thu")).toHaveText("28:30 (28.50h)");
  expect((await cells(card(page, "By day").locator("tbody tr").nth(3))).slice(0, 4)).toEqual(["Thu 13", "0:00", "7:30", "7:30"]);
  await expect(card(page, "Wednesday 13:00 checkpoint").getByText("SEND BLOCK-OUT", { exact: true })).toBeVisible();

  await openSettings(page);
  page.once("dialog", (d) => void d.accept());
  const gone = page.waitForResponse((r) => r.request().method() === "DELETE" && new URL(r.url()).pathname.startsWith("/api/hours/bank-holidays/"));
  await card(page, "Bank holidays").getByRole("listitem").filter({ hasText: "Thu 13 Mar 2031" }).getByRole("button", { name: "remove" }).click();
  expect((await gone).status()).toBe(200);
  await expect(card(page, "Bank holidays").getByRole("listitem").filter({ hasText: "Thu 13 Mar 2031" })).toHaveCount(0);
});

test("REFRESH FROM GOV.UK answers without a server error and never overwrites", async ({ page }) => {
  // The tracking start is in 2031, later than anything gov.uk publishes, so a successful refresh adds nothing here.
  await openSettings(page);
  const c = card(page, "Bank holidays");
  const before = (await getBundle(page.request)).bankHolidays.length;
  const done = page.waitForResponse(isCall("POST", "/api/hours/bank-holidays/refresh"), { timeout: 60_000 });
  await c.getByRole("button", { name: "REFRESH FROM GOV.UK" }).click();
  const res = await done;
  // 502 is the route saying gov.uk could not be reached; anything else must be a clean answer.
  expect([200, 502]).toContain(res.status());
  if (res.status() === 200) {
    expect(await res.json()).toEqual({ added: 0, total: before });
    await expect(c.getByText("Already up to date with gov.uk.")).toBeVisible();
  }
  expect((await getBundle(page.request)).bankHolidays.length).toBe(before);
});

// ---------------------------------------------------------------------
// Tickets and the Friday block-out
// ---------------------------------------------------------------------

test("the ticket base URL must be a web address; catch-all tickets are offered in the Log", async ({ page }) => {
  try {
    await openSettings(page);
    const c = card(page, "Tickets");
    await field(c, "Ticket base URL").fill("jira.example.test/browse");
    let res = page.waitForResponse(isCall("PATCH", "/api/hours/settings"));
    await c.getByRole("button", { name: "SAVE" }).click();
    expect((await res).status()).toBe(400);
    await expect(page.getByText("Ticket base URL must start with http:// or https://.")).toBeVisible();

    await field(c, "Ticket base URL").fill(`${TICKET_BASE}/`);
    await field(c, "Catch-all tickets (one per line: KEY — purpose)").fill("ZZE-900 — E2E-hours admin\nZZE-901");
    res = page.waitForResponse(isCall("PATCH", "/api/hours/settings"));
    await c.getByRole("button", { name: "SAVE" }).click();
    expect((await res).status()).toBe(200);
    await expect(c.getByText("Saved.")).toBeVisible();
    expect((await getBundle(page.request)).settings).toMatchObject({
      ticket_base_url: `${TICKET_BASE}/`,
      catch_all_tickets: [
        { key: "ZZE-900", purpose: "E2E-hours admin" },
        { key: "ZZE-901", purpose: "" },
      ],
    });

    await visit(page, "/log");
    await expect(blankRow(page)).toBeVisible({ timeout: SLOW });
    await expect(page.locator("datalist#hours-catch-all option")).toHaveCount(2);
    await expect(page.locator('datalist#hours-catch-all option[value="ZZE-901"]')).toHaveCount(1);
    // A trailing slash on the base does not double up in the link.
    await expect(page.locator(`[data-hours-row] a[href="${TICKET_BASE}/ZZE-601"]`)).toHaveCount(1);
  } finally {
    await patchSettings(page.request, DEFAULTS);
  }
});

test("the Friday block-out is an email draft and a calendar file for this week's Friday; nothing is sent", async ({ page }) => {
  try {
    await openSettings(page);
    const c = card(page, "Friday block-out");
    await field(c, "Recipients (one per line)").fill("lead@e2e-hours.example.test\nteam@e2e-hours.example.test");
    await field(c, "Subject — {dd/mm/yyyy} becomes the Friday").fill("Friday off {dd/mm/yyyy}");
    await c.getByLabel("Body").fill("Hi all,\nI am off on Friday {dd/mm/yyyy}; target met.");
    const saved = page.waitForResponse(isCall("PATCH", "/api/hours/settings"));
    await c.getByRole("button", { name: "SAVE" }).click();
    expect((await saved).status()).toBe(200);
    await expect(c.getByText("Saved.")).toBeVisible();

    await openDashboard(page);
    const cp = card(page, "Wednesday 13:00 checkpoint");
    await expect(cp).toContainText("Friday Fri 14 Mar · 2 recipients · nothing is sent by Mycelium");
    const href = await cp.getByRole("link").filter({ hasText: "OPEN BLOCK-OUT EMAIL" }).getAttribute("href");
    expect(href).not.toBeNull();
    const mail = new URL(href!);
    expect(mail.protocol).toBe("mailto:");
    expect(decodeURIComponent(mail.pathname)).toBe("lead@e2e-hours.example.test,team@e2e-hours.example.test");
    expect(mail.searchParams.get("subject")).toBe("Friday off 14/03/2031");
    expect(mail.searchParams.get("body")).toBe("Hi all,\nI am off on Friday 14/03/2031; target met.");

    const download = page.waitForEvent("download");
    await cp.getByRole("button", { name: "CALENDAR .ICS" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("friday-off-2031-03-14.ics");
    const ics = readFileSync(await file.path(), "utf8");
    // An all-day event on the Friday, shown as free, with a stable id so a second download replaces the first.
    for (const line of ["BEGIN:VEVENT", "UID:hours-blockout-2031-03-14@mycelium", "DTSTART;VALUE=DATE:20310314", "DTEND;VALUE=DATE:20310315", "SUMMARY:Friday off 14/03/2031", "TRANSP:TRANSPARENT", "END:VCALENDAR"]) {
      expect(ics.split("\r\n"), `calendar file has "${line}"`).toContain(line);
    }
    expect(ics).toContain("DESCRIPTION:Hi all\\,\\nI am off on Friday 14/03/2031\\; target met.");
  } finally {
    await patchSettings(page.request, DEFAULTS);
  }
});

// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------

type ExportJson = {
  exportedAt: string;
  settings: Record<string, unknown> | null;
  absences: unknown[];
  bankHolidays: unknown[];
  logEntries: Array<{ id: string; sourceRow: number | null; date: string | null; minutes: number | null; estimateMinutes: number | null; description: string; ticketRaw: string; ticketKey: string | null; logged: boolean; mergedAt: string | null }>;
};

async function exportJson(request: APIRequestContext): Promise<ExportJson> {
  const res = await request.get("/api/hours/export?format=json");
  expect(res.status()).toBe(200);
  return (await res.json()) as ExportJson;
}

async function exportWorkbook(request: APIRequestContext): Promise<ExcelJS.Workbook> {
  const res = await request.get("/api/hours/export?format=xlsx");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("spreadsheetml");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await res.body()) as unknown as ArrayBuffer);
  return wb;
}

/** A sheet row as plain values, left to right; an empty cell reads as null however the file stored it. */
const rowValues = (ws: ExcelJS.Worksheet, n: number) => Array.from((ws.getRow(n).values as unknown[]).slice(1), (v) => (v === undefined || v === "" ? null : v));

test("Export downloads the workbook and the JSON backup, with every live row and its Entry ID", async ({ page }) => {
  // A held row is exported too (it is saved like any other); a deleted row is not.
  const held = await addHeld(page.request, { date: "2031-03-12", minutes: 15, estimate: 30, description: `${P} export held`, ticket: "ZZE-603" });
  const doomed = await addHeld(page.request, { date: "2031-03-12", minutes: 5, description: `${P} export deleted` });
  expect((await page.request.delete(`/api/hours/entries/${doomed.id}`)).status()).toBe(200);
  try {
    await openSettings(page);
    const c = card(page, "Export");

    let download = page.waitForEvent("download");
    await c.getByRole("link").filter({ hasText: "DOWNLOAD .JSON BACKUP" }).click();
    let file = await download;
    expect(file.suggestedFilename()).toMatch(/^hours-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(readFileSync(await file.path(), "utf8")) as ExportJson;
    expect(Number.isNaN(Date.parse(json.exportedAt))).toBe(false);
    expect(json.settings).toMatchObject({ contractedMinutesPerWeek: 2250, standardDayMinutes: 450, checkpointThresholdMinutes: 1500, trackingStart: "2031-03-10", ticketBaseUrl: TICKET_BASE });
    const mine = json.logEntries.filter((e) => e.description.startsWith(P));
    expect(mine.map((e) => e.description).sort()).toEqual([S1, S2, `${P} export held`].sort());
    const live = (await getBundle(page.request)).entries;
    expect(mine.find((e) => e.description === S1)).toMatchObject({ id: live.find((e) => e.description === S1)!.id, date: "2031-03-10", minutes: 600, ticketRaw: "ZZE-601", ticketKey: "ZZE-601", logged: true });
    expect(mine.find((e) => e.description === S1)!.mergedAt).not.toBeNull();
    expect(mine.find((e) => e.description === `${P} export held`)).toMatchObject({ id: held.id, minutes: 15, estimateMinutes: 30, mergedAt: null });

    download = page.waitForEvent("download");
    await c.getByRole("link").filter({ hasText: "DOWNLOAD .XLSX" }).click();
    file = await download;
    expect(file.suggestedFilename()).toMatch(/^hours-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await file.path());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Log", "Absences", "Bank Holidays", "Settings", "Weekly History"]);

    // Title Case headers with no underscores; durations as h:mm and as Minutes; dates as YYYY-MM-DD.
    const log = wb.getWorksheet("Log")!;
    expect(rowValues(log, 1)).toEqual(["Date", "Time Spent", "Minutes", "Estimate", "Estimate Minutes", "Description", "Ticket", "Ticket Key", "Logged", "Entry ID", "Created", "Updated"]);
    const rows: unknown[][] = [];
    log.eachRow((_r, n) => {
      if (n > 1) rows.push(rowValues(log, n));
    });
    const row = (d: string) => rows.find((r) => r[5] === d);
    expect(rows.filter((r) => String(r[5]).startsWith(P))).toHaveLength(3);
    expect(row(S1)!.slice(0, 10)).toEqual(["2031-03-10", "10:00", 600, null, null, S1, "ZZE-601", "ZZE-601", "x", live.find((e) => e.description === S1)!.id]);
    expect(row(S2)!.slice(0, 10)).toEqual(["2031-03-11", "11:00", 660, null, null, S2, "ZZE-602", "ZZE-602", null, live.find((e) => e.description === S2)!.id]);
    expect(row(`${P} export held`)!.slice(0, 5)).toEqual(["2031-03-12", "0:15", 15, "0:30", 30]);
    expect(String(row(S1)![10])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(row(`${P} export deleted`)).toBeUndefined();

    expect(rowValues(wb.getWorksheet("Absences")!, 1)).toEqual(["Date", "Type", "Minutes", "Note"]);
    expect(rowValues(wb.getWorksheet("Bank Holidays")!, 1)).toEqual(["Date", "Name"]);
    expect(rowValues(wb.getWorksheet("Weekly History")!, 1)).toEqual(["Week Of", "Mon", "Tue", "Wed", "Thu", "Mon Thu", "Weekly Pct", "Surplus Lost", "Shortfall", "Fri Worked", "Not Yet Logged", "Status", "Banked Minutes"]);
    const settings = wb.getWorksheet("Settings")!;
    const pairs = new Map<string, unknown>();
    settings.eachRow((_r, n) => {
      if (n > 1) pairs.set(String(rowValues(settings, n)[0]), rowValues(settings, n)[1]);
    });
    expect(pairs.get("Contracted Minutes Per Week")).toBe(2250);
    expect(pairs.get("Contracted Per Week")).toBe("37:30");
    expect(pairs.get("Tracking Start")).toBe("2031-03-10");
  } finally {
    purgeByDescription(`${P} export %`);
  }
});

/** Hard-delete rows this spec made that later tests must not see (the app only soft-deletes). */
function purgeByDescription(like: string) {
  localSql(`delete from public.hours_entries where description like '${like}'`);
}

// ---------------------------------------------------------------------
// Import through the route, with a synthetic file
// ---------------------------------------------------------------------

const FILE_NAME = `E2E-hours-${RUN}.json`;
const A = `${P} import a`;
const B = `${P} import b`;
const C = `${P} import open`;
const importFile = (aMinutes = 90) => ({
  logEntries: [
    { sourceRow: 900001, date: "2031-03-17", minutes: aMinutes, description: A, ticketRaw: "zze-701", logged: true },
    { sourceRow: 900002, date: "2031-03-18", minutes: 30, description: B, ticketRaw: "", logged: false },
    { sourceRow: 900003, date: null, minutes: null, estimateMinutes: 45, description: C, ticketRaw: "ZZE-702" },
  ],
  absences: [{ date: "2031-03-19", type: "Sick", minutes: 450 }],
  bankHolidays: [{ date: "2031-03-20", name: "E2E-hours import holiday" }],
});
const imported = async (request: APIRequestContext) => (await getBundle(request)).entries.filter((e) => [A, B, C].includes(e.description));

test("import: the dry run reports the plan and writes nothing", async ({ request }) => {
  const res = await request.post("/api/hours/import", { data: { file: importFile(), filename: FILE_NAME } }); // dryRun defaults to true
  expect(res.status()).toBe(200);
  const j = await res.json();
  expect(j.dry_run).toBe(true);
  expect(j.can_apply).toBe(true);
  expect(j.counts).toMatchObject({ file_rows: 3, added: 3, changed: 0, unchanged: 0, conflicts: 0, rejected: 0, absences_added: 1, holidays_added: 1, settings_changed: 0 });
  expect(j.added).toHaveLength(3);
  expect(await imported(request)).toEqual([]);
  const b = await getBundle(request);
  expect(b.absences.some((a) => a.absence_date === "2031-03-19")).toBe(false);
  expect(b.bankHolidays.some((h) => h.holiday_date === "2031-03-20")).toBe(false);
});

test("import: apply writes the plan as merged rows, and undo removes exactly what it added", async ({ request }) => {
  const res = await request.post("/api/hours/import", { data: { file: importFile(), filename: FILE_NAME, dryRun: false } });
  expect(res.status(), await res.text()).toBe(200);
  const j = await res.json();
  expect(j.dry_run).toBe(false);
  expect(j.applied).toMatchObject({ inserted: 3, updated: 0, absences: 1, holidays: 1 });

  const rows = await imported(request);
  expect(rows).toHaveLength(3);
  // Imported rows land merged (reviewed in the dry run already) and the key is derived on the way in.
  for (const r of rows) {
    expect(r.source).toBe("import");
    expect(r.merged_at).not.toBeNull();
  }
  expect(rows.find((r) => r.description === A)).toMatchObject({ entry_date: "2031-03-17", minutes: 90, ticket_raw: "zze-701", ticket_key: "ZZE-701", logged: true });
  expect(rows.find((r) => r.description === C)).toMatchObject({ entry_date: null, minutes: null, estimate_minutes: 45, ticket_key: "ZZE-702" });
  let b = await getBundle(request);
  expect(b.absences.find((a) => a.absence_date === "2031-03-19")).toMatchObject({ type: "Sick", minutes: 450 });
  expect(b.bankHolidays.find((h) => h.holiday_date === "2031-03-20")).toMatchObject({ name: "E2E-hours import holiday" });

  const runs = (await (await request.get("/api/hours/import")).json()) as { runs: Array<{ filename: string; format: string; counts: Record<string, number>; undone_at: string | null }>; can_undo: boolean };
  expect(runs.can_undo).toBe(true);
  expect(runs.runs[0]).toMatchObject({ filename: FILE_NAME, format: "json", undone_at: null });
  expect(runs.runs[0].counts).toMatchObject({ inserted: 3, updated: 0 });

  const undo = await request.post("/api/hours/import/undo");
  expect(undo.status(), await undo.text()).toBe(200);
  expect(await imported(request)).toEqual([]);
  b = await getBundle(request);
  expect(b.absences.some((a) => a.absence_date === "2031-03-19")).toBe(false);
  expect(b.bankHolidays.some((h) => h.holiday_date === "2031-03-20")).toBe(false);
  // The rows that were here before the import are untouched.
  expect(b.entries.filter((e) => [S1, S2].includes(e.description))).toHaveLength(2);

  // There is nothing further to undo.
  const again = await request.post("/api/hours/import/undo");
  expect(again.status()).toBe(409);
  expect((await (await request.get("/api/hours/import")).json()).can_undo).toBe(false);
});

test("import: a second load of the same file changes nothing; a changed row updates; a missing row is never deleted", async ({ request }) => {
  expect((await request.post("/api/hours/import", { data: { file: importFile(), filename: FILE_NAME, dryRun: false } })).status()).toBe(200);

  // Idempotent by sourceRow.
  let j = await (await request.post("/api/hours/import", { data: { file: importFile(), filename: FILE_NAME } })).json();
  expect(j.counts).toMatchObject({ added: 0, changed: 0, unchanged: 3, absences_added: 0, holidays_added: 0 });

  // One row changed in the file, and the other two left out of it altogether.
  const partial = { logEntries: [importFile(120).logEntries[0]] };
  j = await (await request.post("/api/hours/import", { data: { file: partial, filename: FILE_NAME } })).json();
  expect(j.counts).toMatchObject({ file_rows: 1, added: 0, changed: 1, unchanged: 0 });
  expect(j.changed[0].before).toMatchObject({ minutes: 90, description: A });
  expect(j.changed[0].after).toMatchObject({ minutes: 120, description: A });

  const applied = await request.post("/api/hours/import", { data: { file: partial, filename: FILE_NAME, dryRun: false } });
  expect(applied.status(), await applied.text()).toBe(200);
  let rows = await imported(request);
  expect(rows).toHaveLength(3); // B and the open item were not in the file and are still here
  expect(rows.find((r) => r.description === A)!.minutes).toBe(120);

  // Undoing that puts the changed row back and leaves the rest.
  expect((await request.post("/api/hours/import/undo")).status()).toBe(200);
  rows = await imported(request);
  expect(rows).toHaveLength(3);
  expect(rows.find((r) => r.description === A)!.minutes).toBe(90);
});

test("import: a row edited here after the export is a conflict until a side is picked; a deleted row stays deleted", async ({ request }) => {
  const backup = await exportJson(request);
  const a = backup.logEntries.find((e) => e.description === A)!;
  const b = backup.logEntries.find((e) => e.description === B)!;
  expect(a && b).toBeTruthy();

  // After the export: A is edited in Mycelium, B is deleted in Mycelium.
  expect((await request.patch(`/api/hours/entries/${a.id}`, { data: { minutes: 100 } })).status()).toBe(200);
  expect((await request.delete(`/api/hours/entries/${b.id}`)).status()).toBe(200);
  // Meanwhile the file was edited too.
  const edited = { ...backup, settings: null, blockOut: null, logEntries: backup.logEntries.filter((e) => [A, B].includes(e.description)).map((e) => (e.id === a.id ? { ...e, minutes: 75 } : e)) };

  let res = await request.post("/api/hours/import", { data: { file: edited, filename: FILE_NAME } });
  let j = await res.json();
  expect(j.counts).toMatchObject({ file_rows: 2, conflicts: 1, changed: 0, added: 0, skipped_deleted: 1 });
  expect(j.can_apply).toBe(false);
  expect(j.conflicts[0]).toMatchObject({ id: a.id, file: { minutes: 75 }, db: { minutes: 100 } });

  // Applying with the conflict open is refused and writes nothing.
  res = await request.post("/api/hours/import", { data: { file: edited, filename: FILE_NAME, dryRun: false } });
  expect(res.status()).toBe(409);
  expect((await imported(request)).find((r) => r.description === A)!.minutes).toBe(100);

  // Keeping Mycelium's side leaves the row alone.
  j = await (await request.post("/api/hours/import", { data: { file: edited, filename: FILE_NAME, resolutions: { [a.id]: "db" } } })).json();
  expect(j.counts).toMatchObject({ conflicts: 0, changed: 0, unchanged: 1 });
  expect(j.can_apply).toBe(true);

  // Taking the file's side applies it. The row deleted here is not brought back.
  res = await request.post("/api/hours/import", { data: { file: edited, filename: FILE_NAME, dryRun: false, resolutions: { [a.id]: "file" } } });
  expect(res.status(), await res.text()).toBe(200);
  const rows = await imported(request);
  expect(rows.find((r) => r.description === A)!.minutes).toBe(75);
  expect(rows.some((r) => r.description === B)).toBe(false);
});

test("import: unreadable rows are listed and block the apply; unreadable files are refused", async ({ request }) => {
  const bad = { logEntries: [{ date: "2031-02-31", minutes: 30, description: `${P} import bad date` }, { date: "2031-03-21", minutes: 2000, description: `${P} import bad minutes` }, { date: "2031-03-21", minutes: 30, description: `${P} import fine` }] };
  let res = await request.post("/api/hours/import", { data: { file: bad, filename: FILE_NAME } });
  expect(res.status()).toBe(200);
  const j = await res.json();
  expect(j.counts).toMatchObject({ added: 1, rejected: 2 });
  expect(j.can_apply).toBe(false);
  expect(j.rejected.map((r: { row: number }) => r.row)).toEqual([1, 2]);
  res = await request.post("/api/hours/import", { data: { file: bad, filename: FILE_NAME, dryRun: false } });
  expect(res.status()).toBe(409);
  expect((await getBundle(request)).entries.some((e) => e.description === `${P} import fine`)).toBe(false);

  expect((await request.post("/api/hours/import", { data: {} })).status()).toBe(400);
  expect((await request.post("/api/hours/import", { data: { file: { nothing: true } } })).status()).toBe(400);
  expect((await request.post("/api/hours/import", { data: { file: { logEntries: [] } } })).status()).toBe(400);
  expect((await request.post("/api/hours/import", { data: { xlsx: Buffer.from("not a workbook").toString("base64") } })).status()).toBeLessThan(500);
  expect((await request.post("/api/hours/import", { data: { paste: "just some words" } })).status()).toBeLessThan(500);
});

// ---------------------------------------------------------------------
// Import through the Settings card
// ---------------------------------------------------------------------

test("Import card: workbook columns pasted from Excel go through dry run, apply and undo", async ({ page }) => {
  const P1 = `${P} paste one`;
  const P2 = `${P} paste two`;
  const header = "Date\tTime Spent\tEstimate\tDescription\tTicket\tLogged";
  const good = `${header}\n24/03/2031\t1:15\t\t${P1}\tZZE-801\tx\n2031-03-25\t45\t1:00\t${P2}\thttps://e2e-hours.example.test/browse/ZZE-802\t`;
  await openSettings(page);
  const c = card(page, "Import");
  const box = c.getByRole("textbox");
  await expect(c.getByRole("button", { name: "DRY RUN" })).toBeDisabled();
  await expect(c.getByRole("button", { name: "APPLY" })).toBeDisabled();

  // A row with a date nobody can read is listed by its row number and blocks APPLY.
  await box.fill(`${good}\nnext Tuesday-ish\t0:30\t\t${P} paste bad\t\t`);
  let res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "DRY RUN" }).click();
  expect((await res).status()).toBe(200);
  await expect(stat(c, "To add")).toHaveText("2");
  await expect(stat(c, "Rejected")).toHaveText("1");
  await expect(c).toContainText('row 4: Date "next Tuesday-ish" not understood.');
  await expect(c).toContainText("Pick a side for each conflict and fix the rejected rows before applying.");
  await expect(c.getByRole("button", { name: "APPLY" })).toBeDisabled();

  await box.fill(good);
  await expect(c.getByRole("button", { name: "APPLY" }), "editing the paste asks for a fresh dry run").toBeDisabled();
  res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "DRY RUN" }).click();
  expect((await res).status()).toBe(200);
  await expect(stat(c, "To add")).toHaveText("2");
  await expect(stat(c, "Rejected")).toHaveText("0");
  await expect(stat(c, "Unchanged")).toHaveText("0");
  expect((await getBundle(page.request)).entries.some((e) => e.description === P1), "a dry run writes nothing").toBe(false);

  res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "APPLY" }).click();
  expect((await res).status()).toBe(200);
  await expect(c.getByText("Applied. The views have refreshed.")).toBeVisible();
  await expect(stat(c, "Added")).toHaveText("2");
  await expect(box).toHaveValue("");
  await expect(c).toContainText("paste · +2 / ~0");
  const rows = (await getBundle(page.request)).entries;
  expect(rows.find((e) => e.description === P1)).toMatchObject({ entry_date: "2031-03-24", minutes: 75, ticket_key: "ZZE-801", logged: true, source: "import" });
  expect(rows.find((e) => e.description === P2)).toMatchObject({ entry_date: "2031-03-25", minutes: 45, estimate_minutes: 60, ticket_key: "ZZE-802", logged: false });
  expect(rows.find((e) => e.description === P1)!.merged_at).not.toBeNull();

  // The same rows pasted again are recognised, not doubled.
  await box.fill(good);
  res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "DRY RUN" }).click();
  expect((await res).status()).toBe(200);
  await expect(stat(c, "To add")).toHaveText("0");
  await expect(stat(c, "Unchanged")).toHaveText("2");

  let asked = "";
  page.once("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  res = page.waitForResponse(isCall("POST", "/api/hours/import/undo"));
  await c.getByRole("button", { name: "UNDO LAST" }).click();
  expect((await res).status()).toBe(200);
  expect(asked).toContain("Undo the last import?");
  await expect(c).toContainText("paste · +2 / ~0 · undone");
  await expect(c.getByRole("button", { name: "UNDO LAST" })).toBeDisabled();
  expect((await getBundle(page.request)).entries.some((e) => [P1, P2].includes(e.description))).toBe(false);
});

test("Import card: an exported .xlsx and JSON backup come back unchanged, and an edited workbook row is an update", async ({ page }) => {
  const total = (await getBundle(page.request)).entries.length;
  expect(total).toBeGreaterThanOrEqual(2);
  await openSettings(page);
  const c = card(page, "Import");

  // The JSON backup, straight back in: every row matches by id, and the settings it carries are the settings here.
  const backup = await exportJson(page.request);
  await c.getByRole("radio", { name: "JSON backup" }).click();
  await c.locator('input[type="file"]').setInputFiles({ name: `E2E-hours-${RUN}-backup.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  let res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "DRY RUN" }).click();
  expect((await res).status()).toBe(200);
  await expect(stat(c, "Unchanged")).toHaveText(String(total));
  await expect(stat(c, "To add")).toHaveText("0");
  await expect(stat(c, "To change")).toHaveText("0");
  await expect(stat(c, "Conflicts")).toHaveText("0");
  await expect(stat(c, "Settings changed")).toHaveText("0");

  // The workbook, straight back in: the Entry ID column makes it an upsert, so nothing is added.
  const wb = await exportWorkbook(page.request);
  await c.getByRole("radio", { name: ".xlsx" }).click();
  await c.locator('input[type="file"]').setInputFiles({ name: `E2E-hours-${RUN}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
  res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "DRY RUN" }).click();
  expect((await res).status()).toBe(200);
  await expect(stat(c, "Unchanged")).toHaveText(String(total));
  await expect(stat(c, "To add")).toHaveText("0");
  await expect(stat(c, "To change")).toHaveText("0");
  await expect(stat(c, "Rejected")).toHaveText("0");

  // Edit one row of the workbook (the import trusts Minutes over Time Spent) and it becomes one change.
  const log = wb.getWorksheet("Log")!;
  let edited = 0;
  log.eachRow((r, n) => {
    if (n > 1 && r.getCell(6).value === S2) {
      r.getCell(2).value = "11:00"; // left as it was on purpose
      r.getCell(3).value = 615;
      r.getCell(9).value = "x";
      edited += 1;
    }
  });
  expect(edited).toBe(1);
  await c.getByRole("radio", { name: "JSON backup" }).click(); // switch away and back to clear the chosen file
  await c.getByRole("radio", { name: ".xlsx" }).click();
  await c.locator('input[type="file"]').setInputFiles({ name: `E2E-hours-${RUN}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
  res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "DRY RUN" }).click();
  expect((await res).status()).toBe(200);
  await expect(stat(c, "To change")).toHaveText("1");
  await expect(stat(c, "Unchanged")).toHaveText(String(total - 1));
  await expect(c).toContainText(`2031-03-11 · 11:00 · ${S2} · ZZE-602`);
  await expect(c).toContainText(`2031-03-11 · 10:15 · ${S2} · ZZE-602 · logged`);

  res = page.waitForResponse(isCall("POST", "/api/hours/import"));
  await c.getByRole("button", { name: "APPLY" }).click();
  expect((await res).status()).toBe(200);
  await expect(c.getByText("Applied. The views have refreshed.")).toBeVisible();
  expect((await getBundle(page.request)).entries.find((e) => e.description === S2)).toMatchObject({ minutes: 615, logged: true });

  page.once("dialog", (d) => void d.accept());
  res = page.waitForResponse(isCall("POST", "/api/hours/import/undo"));
  await c.getByRole("button", { name: "UNDO LAST" }).click();
  expect((await res).status()).toBe(200);
  expect((await getBundle(page.request)).entries.find((e) => e.description === S2)).toMatchObject({ minutes: 660, logged: false });
});

test.fixme("a JSON backup restores a held entry as held", async ({ request }) => {
  // FINDING hours-4: spec §6 calls the .json export a "lossless full backup" and §12 says it carries mergedAt, but the
  // import never reads mergedAt (lib/hours/import.ts readImportFile, and hours_apply_import in 0156 inserts with the
  // column default now()). An entry that was still waiting in the Log's holding section comes back merged, so it
  // starts counting in every figure after a restore. Needs the insert in hours_apply_import to take merged_at, which
  // is a migration, so it is reported, not fixed.
  const held = await addHeld(request, { date: "2031-03-26", minutes: 25, description: `${P} restore held` });
  const backup = await exportJson(request);
  expect(backup.logEntries.find((e) => e.id === held.id)!.mergedAt).toBeNull();
  purgeByDescription(`${P} restore held`); // lost, as if the database had been rebuilt
  const one = { ...backup, settings: null, blockOut: null, absences: [], bankHolidays: [], logEntries: backup.logEntries.filter((e) => e.id === held.id) };
  expect((await request.post("/api/hours/import", { data: { file: one, filename: FILE_NAME, dryRun: false } })).status()).toBe(200);
  const back = (await getBundle(request)).entries.find((e) => e.description === `${P} restore held`)!;
  expect(back).toBeTruthy();
  expect(back.merged_at, "still waiting in the holding section").toBeNull();
});
