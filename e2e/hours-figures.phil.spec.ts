/**
 * Hours → every derived figure, as Phil (claude/four-day-week-spec.md §3).
 *
 * Four synthetic weeks in 2031 are entered through the API and merged. The
 * expected figures are worked out HERE from the rules in spec §2 and §3 (the
 * small calculator below), never by calling lib/hours/calc.ts, and the
 * headline strings are also written out by hand so a mistake shared by both
 * calculators would still show. The browser's clock is moved between the
 * weeks to see each state of the Dashboard.
 *
 *   week of 17 Feb  Mon 5:00, Tue 11:00                      → Short
 *   week of 24 Feb  10:00 a day Mon–Thu                      → Met, 2:30 surplus lost
 *   week of  3 Mar  9:00, 9:00, 9:00, 9:30, Fri 1:00         → Covered on Friday
 *   week of 10 Mar  bank holiday Mon, absence Wed, part-logged → In progress on Wed 12
 */
import { test, type Locator, type Page } from "@playwright/test";
import { BASE, SLOW, addDays, addHeld, both, card, cells, descriptions, expect, freeze, hm, mergeHeld, patchSettings, pct, purge, record, restoreSettings, runId, snapshotSettings, stat, visit, type SettingsSnapshot } from "./hours.helpers.ts";

const RUN = runId();
const P = `E2E-hours-${RUN}`;
const TICKET_BASE = "https://e2e-hours.example.test/browse";

// --- the rules, as agreed (spec §2) -----------------------------------
const TARGET = 37 * 60 + 30;
const STD_DAY = 7 * 60 + 30;
const THRESHOLD = 25 * 60;
const TRACKING_START = "2031-02-17";

// --- the synthetic record ---------------------------------------------
type Fx = { date: string | null; minutes: number | null; estimate?: number; ticket?: string; logged?: boolean; held?: boolean; d: string };
const FIX: Fx[] = [
  // week of 17 Feb
  { date: "2031-02-17", minutes: 300, ticket: "ZZE-401", logged: true, d: "w1 mon" },
  { date: "2031-02-18", minutes: 660, ticket: "ZZE-401", logged: true, d: "w1 tue" },
  // week of 24 Feb
  { date: "2031-02-24", minutes: 600, ticket: "ZZE-402", logged: true, d: "w2 mon" },
  { date: "2031-02-25", minutes: 600, ticket: "ZZE-402", logged: true, d: "w2 tue" },
  { date: "2031-02-26", minutes: 600, ticket: "ZZE-402", logged: true, d: "w2 wed" },
  { date: "2031-02-27", minutes: 600, ticket: "ZZE-402", logged: false, d: "w2 thu" },
  // week of 3 Mar
  { date: "2031-03-03", minutes: 540, ticket: "ZZE-201", logged: true, d: "w3 mon" },
  { date: "2031-03-04", minutes: 540, ticket: "ZZE-201", logged: true, d: "w3 tue" },
  { date: "2031-03-05", minutes: 540, ticket: "ZZE-201", logged: true, d: "w3 wed" },
  { date: "2031-03-06", minutes: 570, ticket: "ZZE-201", logged: true, d: "w3 thu" },
  { date: "2031-03-07", minutes: 60, ticket: "ZZE-201", logged: true, d: "w3 fri" },
  // week of 10 Mar
  { date: "2031-03-10", minutes: 60, ticket: "ZZE-101", logged: true, d: "w4 mon" },
  { date: "2031-03-11", minutes: 270, ticket: "ZZE-101", logged: true, d: "w4 tue a" },
  { date: "2031-03-11", minutes: 195, ticket: "ZZE-102", logged: false, d: "w4 tue b" },
  { date: "2031-03-11", minutes: 45, ticket: "", logged: false, d: "w4 tue no ticket" },
  { date: "2031-03-12", minutes: 120, ticket: `${TICKET_BASE}/ZZE-103?focus=1`, logged: true, d: "w4 wed" },
  { date: "2031-03-12", minutes: null, estimate: 90, ticket: "ZZE-104", d: "w4 open item" },
  { date: null, minutes: 20, ticket: "ZZE-105", d: "dateless with time" },
  // typed but never merged: must count nowhere
  { date: "2031-03-11", minutes: 300, ticket: "ZZE-999", held: true, d: "held" },
];
const desc = (f: Fx) => `${P} ${f.d}`;
const BANK_HOLIDAYS = ["2031-03-10"];
const ABSENCES: Record<string, number> = { "2031-03-12": 120 };

// --- spec §3, worked out independently ---------------------------------
const merged = FIX.filter((f) => !f.held);
const weekday = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0

function day(date: string) {
  const timed = merged.filter((f) => f.date === date && f.minutes !== null);
  const logged = timed.reduce((s, f) => s + f.minutes!, 0);
  const ticked = timed.filter((f) => f.logged).reduce((s, f) => s + f.minutes!, 0);
  const credited = (BANK_HOLIDAYS.includes(date) ? STD_DAY : 0) + (ABSENCES[date] ?? 0);
  return { date, logged, credited, total: logged + credited, ticked, notYetLogged: logged - ticked };
}

function week(monday: string, today: string) {
  const days = Array.from({ length: 7 }, (_, i) => day(addDays(monday, i)));
  const banked = days.slice(0, 4).reduce((s, d) => s + d.total, 0);
  const remaining = Math.max(0, TARGET - banked);
  const surplusLost = Math.max(0, banked - TARGET);
  const friWorked = days[4].logged;
  const stillOutstanding = Math.max(0, remaining - friWorked);
  const notYetLogged = days.reduce((s, d) => s + d.notYetLogged, 0);
  let status = "";
  if (monday > today) status = "";
  else if (addDays(monday, 3) >= today) status = "In progress";
  else if (banked >= TARGET) status = "Met";
  else if (friWorked >= remaining) status = "Covered on Friday"; // O2
  else status = "Short";
  return { monday, days, banked, remaining, surplusLost, friWorked, fridayOwed: remaining, stillOutstanding, notYetLogged, weeklyPct: banked / TARGET, status };
}

function dashboard(today: string) {
  const monday = addDays(today, -weekday(today));
  const w = week(monday, today);
  const wd = weekday(today);
  const banner = w.banked >= TARGET ? `STOP - ${hm(TARGET)} MET, FRIDAY IS CLEAR` : w.remaining <= 60 ? `ALMOST THERE - ${hm(w.remaining)} LEFT THIS WEEK` : `${hm(w.remaining)} LEFT TO WORK THIS WEEK`;
  const daysLeft = wd > 3 ? 0 : 4 - wd;
  const beforeToday = w.days.slice(0, Math.min(wd, 4)).reduce((s, d) => s + d.total, 0);
  const evenPace = daysLeft === 0 ? 0 : Math.max(0, (TARGET - beforeToday) / daysLeft);
  const todayTotal = day(today).total;
  const leftToday = Math.max(0, evenPace - todayTotal);
  const pill = w.banked >= TARGET ? "WEEK COMPLETE - STOP" : wd > 3 ? "OUTSIDE MON-THU" : leftToday === 0 ? `TODAY DONE - ${hm(w.remaining)} LEFT THIS WEEK` : `KEEP GOING - ${hm(leftToday)} LEFT TODAY`;
  const checkpoint = w.banked >= THRESHOLD ? "SEND BLOCK-OUT" : `HOLD - ${hm(THRESHOLD - w.banked)} SHORT`;
  const friday = w.fridayOwed === 0 ? "FRIDAY IS CLEAR" : w.stillOutstanding === 0 ? "SHORTFALL COVERED" : `WORK ${hm(w.stillOutstanding)} ON FRIDAY`;
  const monFri = w.days.slice(0, 5).reduce((s, d) => s + d.total, 0);
  const paceThu = wd < 3 ? hm(w.remaining / (3 - wd)) : "—";
  const paceFri = wd < 4 ? hm(Math.max(0, TARGET - monFri) / (4 - wd)) : "—";
  return { monday, w, wd, banner, evenPace, todayTotal, leftToday, pill, checkpoint, shortOfThreshold: Math.max(0, THRESHOLD - w.banked), friday, paceThu, paceFri };
}

const SHORT_DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dd = (key: string) => key.slice(8);
const dMon = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (key: string) => `${SHORT_DAY[weekday(key)]} ${dMon(key)}`;

/** A Daily / History-detail row after its Day cell: Logged, Credited, Day total, 4-day %, 5-day %, Cumulative, Not yet logged. Total logged is checked apart. */
function dayRow(w: ReturnType<typeof week>, i: number) {
  const d = w.days[i];
  const cumulative = w.days.slice(0, Math.min(i, 3) + 1).reduce((s, x) => s + x.total, 0);
  return {
    logged: hm(d.logged),
    credited: hm(d.credited),
    total: hm(d.total),
    fourDay: i < 4 ? pct(d.total / (TARGET / 4)) : "—",
    fiveDay: pct(d.total / (TARGET / 5)),
    cumulative: i < 4 ? hm(cumulative) : "—",
    notYetLogged: hm(d.notYetLogged),
  };
}

let before: SettingsSnapshot = null;

// Read-only once seeded, so the checks are independent of each other (no serial mode: one failure must not hide the rest).
test.describe.configure({ timeout: 120_000 });

test.beforeAll(async ({ request }) => {
  purge();
  before = await snapshotSettings(request);
  await patchSettings(request, {
    contracted_minutes_per_week: TARGET,
    standard_day_minutes: STD_DAY,
    checkpoint_threshold_minutes: THRESHOLD,
    checkpoint_label: "Wednesday 13:00",
    tracking_start: TRACKING_START,
    review_length_weeks: 6,
    ticket_base_url: TICKET_BASE,
  });
  for (const f of merged) await addHeld(request, { date: f.date, minutes: f.minutes, estimate: f.estimate ?? null, description: desc(f), ticket: f.ticket, logged: f.logged });
  expect(await mergeHeld(request)).toBe(merged.length);
  for (const f of FIX.filter((x) => x.held)) await addHeld(request, { date: f.date, minutes: f.minutes, description: desc(f), ticket: f.ticket });
  for (const date of BANK_HOLIDAYS) expect((await request.post("/api/hours/bank-holidays", { data: { holiday_date: date, name: "E2E-hours holiday" } })).status()).toBe(201);
  for (const [date, minutes] of Object.entries(ABSENCES)) expect((await request.post("/api/hours/absences", { data: { absence_date: date, type: "Other", minutes, note: "E2E-hours" } })).status()).toBe(201);
});

test.afterAll(async ({ request }) => {
  purge();
  await restoreSettings(request, before);
});

async function openAt(page: Page, path: string, today: string, heading?: string) {
  await freeze(page, new Date(`${today}T10:00:00Z`));
  await visit(page, path);
  if (heading) await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible({ timeout: SLOW });
  else await expect(card(page, "This week")).toBeVisible({ timeout: SLOW });
}

// Headline strings written out by hand for each "today"; the rest of each state comes from the calculator.
const STATES: Array<{ today: string; what: string; banner: string; pill: string; checkpoint: string; friday: string }> = [
  { today: "2031-03-12", what: "mid-week with a bank holiday and an absence", banner: "16:30 LEFT TO WORK THIS WEEK", pill: "KEEP GOING - 6:15 LEFT TODAY", checkpoint: "HOLD - 4:00 SHORT", friday: "WORK 16:30 ON FRIDAY" },
  { today: "2031-03-13", what: "Thursday with nothing logged yet", banner: "16:30 LEFT TO WORK THIS WEEK", pill: "KEEP GOING - 16:30 LEFT TODAY", checkpoint: "HOLD - 4:00 SHORT", friday: "WORK 16:30 ON FRIDAY" },
  { today: "2031-03-14", what: "Friday with a shortfall still owed", banner: "16:30 LEFT TO WORK THIS WEEK", pill: "OUTSIDE MON-THU", checkpoint: "HOLD - 4:00 SHORT", friday: "WORK 16:30 ON FRIDAY" },
  { today: "2031-02-18", what: "a Tuesday already past its even pace", banner: "21:30 LEFT TO WORK THIS WEEK", pill: "TODAY DONE - 21:30 LEFT THIS WEEK", checkpoint: "HOLD - 9:00 SHORT", friday: "WORK 21:30 ON FRIDAY" },
  { today: "2031-02-27", what: "target met with a surplus", banner: "STOP - 37:30 MET, FRIDAY IS CLEAR", pill: "WEEK COMPLETE - STOP", checkpoint: "SEND BLOCK-OUT", friday: "FRIDAY IS CLEAR" },
  { today: "2031-03-07", what: "Friday covering a one-hour shortfall", banner: "ALMOST THERE - 1:00 LEFT THIS WEEK", pill: "OUTSIDE MON-THU", checkpoint: "SEND BLOCK-OUT", friday: "SHORTFALL COVERED" },
];

for (const s of STATES) {
  test(`Dashboard on ${dayLabel(s.today)}: ${s.what}`, async ({ page }) => {
    const x = dashboard(s.today);
    // The hand-written headlines and the calculator must agree before either is held against the app.
    expect({ banner: x.banner, pill: x.pill, checkpoint: x.checkpoint, friday: x.friday }).toEqual({ banner: s.banner, pill: s.pill, checkpoint: s.checkpoint, friday: s.friday });

    await openAt(page, "", s.today);
    await expect(page.getByText(s.banner, { exact: true })).toBeVisible();
    // The held entry is announced and counted in none of what follows.
    await expect(page.getByRole("link", { name: /^1 new entry is waiting in the Log and not counted yet/ })).toBeVisible();

    const thisWeek = card(page, "This week");
    await expect(thisWeek).toContainText(`${dayLabel(x.monday)} – ${dayLabel(addDays(x.monday, 3))}`);
    await expect(stat(thisWeek, "Banked Mon–Thu")).toHaveText(both(x.w.banked));
    await expect(stat(thisWeek, "Target")).toHaveText("37:30 (37.50h)");
    await expect(stat(thisWeek, "Remaining")).toHaveText(hm(x.w.remaining));
    await expect(stat(thisWeek, "Weekly")).toHaveText(pct(x.w.weeklyPct));
    if (x.w.surplusLost > 0) await expect(stat(thisWeek, "Surplus lost")).toHaveText(hm(x.w.surplusLost));
    else await expect(thisWeek.getByText("Surplus lost")).toHaveCount(0);
    if (x.w.notYetLogged > 0) await expect(stat(thisWeek, "Not yet logged in Jira")).toHaveText(hm(x.w.notYetLogged));
    else await expect(thisWeek.getByText("Not yet logged in Jira")).toHaveCount(0);

    const today = card(page, "Today");
    await expect(today).toContainText(dayLabel(s.today));
    await expect(today.getByText(s.pill, { exact: true })).toBeVisible();
    await expect(stat(today, "Today so far")).toHaveText(hm(x.todayTotal));
    await expect(stat(today, "Left today (even pace)")).toHaveText(x.wd > 3 ? "—" : hm(x.leftToday));
    await expect(stat(today, "Even pace today")).toHaveText(x.wd > 3 ? "—" : hm(x.evenPace));

    const cp = card(page, "Wednesday 13:00 checkpoint");
    await expect(cp).toContainText("threshold 25:00");
    await expect(cp.getByText(s.checkpoint, { exact: true })).toBeVisible();
    await expect(stat(cp, "Banked")).toHaveText(hm(x.w.banked));
    await expect(stat(cp, "Short of threshold")).toHaveText(hm(x.shortOfThreshold));

    const fri = card(page, "Friday");
    await expect(fri).toContainText(dayLabel(addDays(x.monday, 4)));
    await expect(fri.getByText(s.friday, { exact: true })).toBeVisible();
    await expect(stat(fri, "Owed on Friday")).toHaveText(hm(x.w.fridayOwed));
    await expect(stat(fri, "Worked Friday")).toHaveText(hm(x.w.friWorked));

    const rows = card(page, "By day").locator("tbody tr");
    await expect(rows).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const d = x.w.days[i];
      expect(await cells(rows.nth(i)), `By day, ${SHORT_DAY[i]}`).toEqual([
        `${SHORT_DAY[i]} ${dd(d.date)}`,
        hm(d.logged),
        hm(d.credited),
        hm(d.total),
        i < 4 ? pct(d.total / (TARGET / 4)) : "—",
        pct(d.total / (TARGET / 5)),
        hm(d.notYetLogged),
      ]);
    }

    const pace = card(page, "Pace");
    await expect(stat(pace, "To Thursday")).toHaveText(x.paceThu);
    await expect(stat(pace, "Including Friday")).toHaveText(x.paceFri);

    // Open work: one item without time (1:30 estimated). The dateless entry has time, so it is not "open".
    const open = card(page, "Open backlog");
    await expect(stat(open, "Items")).toHaveText("1");
    await expect(stat(open, "Estimated")).toHaveText("1:30");
    await expect(stat(open, "No estimate")).toHaveText("0");
  });
}

test.fixme("Dashboard shows the flat daily target as 9:22 (spec §3)", async ({ page }) => {
  // FINDING hours-1: spec §3 says target/4 = 562.5 minutes is "shown as 9:22"; the app rounds half up and shows 9:23
  // (lib/hours/calc.ts fmtHm; pinned at 9:23 by lib/hours/calc.test.ts). One of the two has to change: Phil's call.
  await openAt(page, "", "2031-03-12");
  await expect(stat(card(page, "Today"), "Flat daily target")).toHaveText("9:22");
});

async function dayRows(table: Locator, w: ReturnType<typeof week>, shown: number[]) {
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(shown.length);
  for (const [n, i] of shown.entries()) {
    const got = await cells(rows.nth(n));
    const want = dayRow(w, i);
    expect(got[0].toLowerCase(), `day cell ${i}`).toContain(`${SHORT_DAY[i]} ${dd(w.days[i].date)}`.toLowerCase());
    // columns: Day, Logged, Credited, Day total, Total logged, 4-day %, 5-day %, Cumulative, Not yet logged, (funnel)
    expect([got[1], got[2], got[3], got[5], got[6], got[7], got[8]], `${SHORT_DAY[i]} ${w.days[i].date}`).toEqual([want.logged, want.credited, want.total, want.fourDay, want.fiveDay, want.cumulative, want.notYetLogged]);
    // "Total logged": on a day with no credit this is the time ticked Logged (spec §3 dayTotalLogged). Credit days: see the fixme below.
    if (w.days[i].credited === 0) expect(got[4], `Total logged ${w.days[i].date}`).toBe(hm(w.days[i].ticked));
  }
}

test("Daily shows this week and last week by day, with the week summary", async ({ page }) => {
  const today = "2031-03-12";
  await openAt(page, "/daily", today, "Daily");
  const thisW = week("2031-03-10", today);
  const lastW = week("2031-03-03", today);

  const a = card(page, "This week");
  await expect(a).toContainText("10 Mar – 16 Mar");
  await expect(a).toContainText("21:00");
  await expect(a).toContainText("of 37:30", { ignoreCase: true });
  await expect(a.getByText("56%", { exact: true })).toBeVisible();
  await expect(a.getByText("In progress", { exact: true })).toBeVisible();
  await expect(a).toContainText("16:30 to go");
  expect(hm(thisW.banked)).toBe("21:00");
  // Sat and Sun are still to come and empty, so they are left out.
  await dayRows(a.locator("table"), thisW, [0, 1, 2, 3, 4]);
  await expect(a.locator("tbody tr").nth(0)).toContainText(/bank hol/i);
  await expect(a.locator("tbody tr").nth(2)).toContainText(/absence/i);

  const b = card(page, "Last week");
  await expect(b).toContainText("3 Mar – 9 Mar");
  await expect(b).toContainText("36:30");
  await expect(b.getByText("97%", { exact: true })).toBeVisible();
  await expect(b.getByText("Covered on Friday", { exact: true })).toBeVisible();
  await dayRows(b.locator("table"), lastW, [0, 1, 2, 3, 4, 5, 6]);
});

test.fixme("Daily's Total logged is the time ticked Logged on a credited day too (spec §3 dayTotalLogged)", async ({ page }) => {
  // FINDING hours-2: spec §3 defines dayTotalLogged(d) as Σ minutes of entries on d ticked Logged. The app's column adds
  // the day's credit (components/hours/WeekTable.tsx: loggedTicked + credited), so the bank-holiday Monday reads 8:30
  // where the rule gives 1:00. Which the workbook's column did is Phil's to say; then the spec or the column follows.
  await openAt(page, "/daily", "2031-03-12", "Daily");
  const mon = card(page, "This week").locator("tbody tr").nth(0);
  expect((await cells(mon))[4]).toBe("1:00");
});

test("Daily tables sort on their headers and filter per column", async ({ page }) => {
  await openAt(page, "/daily", "2031-03-12", "Daily");
  const a = card(page, "This week");
  const dayCol = async () => (await a.locator("tbody tr td:first-child").allInnerTexts()).map((t) => t.slice(0, 3));
  expect(await dayCol()).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);

  const head = a.getByRole("columnheader", { name: "Day total" });
  await head.getByRole("button").click(); // durations: largest first; Mon and Tue tie at 8:30 and keep their order
  await expect(head).toHaveAttribute("aria-sort", "descending");
  await expect.poll(dayCol).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  await head.getByRole("button").click();
  await expect(head).toHaveAttribute("aria-sort", "ascending");
  await expect.poll(dayCol).toEqual(["Thu", "Fri", "Wed", "Mon", "Tue"]);
  await head.getByRole("button").click();
  await expect(head).toHaveAttribute("aria-sort", "none");
  await expect.poll(dayCol).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);

  await a.getByRole("button", { name: "Filter columns" }).click();
  await a.getByLabel("Filter Credited").fill(">0");
  await expect.poll(dayCol).toEqual(["Mon", "Wed"]);
  await a.getByLabel("Filter Credited").fill("");
  await a.getByLabel("Filter Not yet logged").fill("=4:00");
  await expect.poll(dayCol).toEqual(["Tue"]);
  await a.getByLabel("Filter Not yet logged").fill(">24:00");
  await expect(a).toContainText("No day matches the filters.");
});

const historyRow = (page: Page, monday: string) => page.locator("tbody > tr[aria-expanded]").filter({ has: page.locator("td:first-child", { hasText: new RegExp(`^▶?\\s*${dMon(monday)}$`) }) });

test("History has one row per week since the tracking start, with the right status, and opens to the week's days", async ({ page }) => {
  const today = "2031-03-12";
  await openAt(page, "/history", today, "History");
  // Review date = tracking start + 6 weeks.
  await expect(page.getByText(`Since ${TRACKING_START} · review 2031-03-31 · target 37:30 Mon–Thu`)).toBeVisible();

  const mondays = ["2031-03-10", "2031-03-03", "2031-02-24", "2031-02-17"]; // newest first
  const statuses: Record<string, string> = { "2031-03-10": "In progress", "2031-03-03": "Covered on Friday", "2031-02-24": "Met", "2031-02-17": "Short" };
  const rows = page.locator("tbody > tr[aria-expanded]");
  await expect(rows).toHaveCount(mondays.length);
  for (const [n, monday] of mondays.entries()) {
    const w = week(monday, today);
    expect(w.status, `status of ${monday} by the rules`).toBe(statuses[monday]);
    const got = await cells(rows.nth(n));
    expect([got[0].replace("▶", "").trim(), ...got.slice(1)], `History row ${monday}`).toEqual([
      dMon(monday),
      hm(w.days[0].total),
      hm(w.days[1].total),
      hm(w.days[2].total),
      hm(w.days[3].total),
      hm(w.banked),
      pct(w.weeklyPct),
      hm(w.surplusLost),
      hm(w.remaining),
      hm(w.friWorked),
      hm(w.notYetLogged),
      w.status,
      "",
    ]);
  }
  // A few of those by hand, so the calculator is not marking its own homework.
  expect((await cells(historyRow(page, "2031-02-24"))).slice(5, 12)).toEqual(["40:00", "107%", "2:30", "0:00", "0:00", "10:00", "Met"]);
  expect((await cells(historyRow(page, "2031-03-03"))).slice(5, 12)).toEqual(["36:30", "97%", "0:00", "1:00", "1:00", "0:00", "Covered on Friday"]);
  expect((await cells(historyRow(page, "2031-02-17"))).slice(5, 12)).toEqual(["16:00", "43%", "0:00", "21:30", "0:00", "0:00", "Short"]);
  expect((await cells(historyRow(page, "2031-03-10"))).slice(1, 12)).toEqual(["8:30", "8:30", "4:00", "0:00", "21:00", "56%", "0:00", "16:30", "0:00", "4:00", "In progress"]);

  // Totals over the record: merged entries only.
  const timed = merged.filter((f) => f.minutes !== null);
  const keys = new Set(merged.map((f) => (f.ticket ?? "").split("/").pop()!.split("?")[0]).filter(Boolean));
  await expect(stat(page, "Completed weeks")).toHaveText("3 · 1 met");
  await expect(stat(page, "Entries with time")).toHaveText(`${timed.length} · 1 open`);
  await expect(stat(page, "Logged in total")).toHaveText(both(timed.reduce((s, f) => s + f.minutes!, 0)));
  await expect(stat(page, "Distinct tickets")).toHaveText(String(keys.size));
  expect([timed.length, both(timed.reduce((s, f) => s + f.minutes!, 0)), keys.size]).toEqual([17, "105:20 (105.33h)", 8]);

  // A week opens to its days and closes again.
  const w3 = historyRow(page, "2031-03-03");
  await w3.click();
  await expect(w3).toHaveAttribute("aria-expanded", "true");
  const detail = page.locator("tbody > tr").filter({ has: page.locator("table") });
  await expect(detail).toHaveCount(1);
  await expect(detail).toContainText("3 Mar – 9 Mar");
  await expect(detail.getByText("Covered on Friday", { exact: true })).toBeVisible();
  await expect(detail.getByText("97%", { exact: true })).toBeVisible();
  await dayRows(detail.locator("table"), week("2031-03-03", today), [0, 1, 2, 3, 4, 5, 6]);
  // The keyboard opens a week too.
  const w4 = historyRow(page, "2031-03-10");
  await w4.focus();
  await w4.press("Enter");
  await expect(w4).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("tbody > tr").filter({ has: page.locator("table") })).toHaveCount(2);
  await w3.click();
  await expect(w3).toHaveAttribute("aria-expanded", "false");
  const open4 = page.locator("tbody > tr").filter({ has: page.locator("table") });
  await expect(open4).toHaveCount(1);
  await dayRows(open4.locator("table"), week("2031-03-10", today), [0, 1, 2, 3, 4]);
});

test("History turns an unfinished week Short once its Thursday has passed", async ({ page }) => {
  const today = "2031-03-17"; // the Monday after
  await openAt(page, "/history", today, "History");
  expect(week("2031-03-10", today).status).toBe("Short");
  await expect(page.locator("tbody > tr[aria-expanded]")).toHaveCount(5);
  expect((await cells(historyRow(page, "2031-03-10"))).slice(5, 12)).toEqual(["21:00", "56%", "0:00", "16:30", "0:00", "4:00", "Short"]);
  expect((await cells(historyRow(page, "2031-03-17"))).slice(5, 12)).toEqual(["0:00", "0%", "0:00", "37:30", "0:00", "0:00", "In progress"]);
  await expect(stat(page, "Completed weeks")).toHaveText("4 · 1 met");
});

test("History sorts on its headers and filters per column", async ({ page }) => {
  await openAt(page, "/history", "2031-03-12", "History");
  const weeks = async () => (await page.locator("tbody > tr[aria-expanded] td:first-child").allInnerTexts()).map((t) => t.replace("▶", "").trim());
  expect(await weeks()).toEqual(["10 Mar", "3 Mar", "24 Feb", "17 Feb"]);

  const banked = page.getByRole("columnheader", { name: "Mon–Thu" });
  await banked.getByRole("button").click();
  await expect(banked).toHaveAttribute("aria-sort", "descending");
  await expect.poll(weeks).toEqual(["24 Feb", "3 Mar", "10 Mar", "17 Feb"]);
  await banked.getByRole("button").click();
  await expect.poll(weeks).toEqual(["17 Feb", "10 Mar", "3 Mar", "24 Feb"]);
  await banked.getByRole("button").click();
  await expect.poll(weeks).toEqual(["10 Mar", "3 Mar", "24 Feb", "17 Feb"]);

  const week_ = page.getByRole("columnheader", { name: "Week" });
  await week_.getByRole("button").click(); // dates: oldest first
  await expect.poll(weeks).toEqual(["17 Feb", "24 Feb", "3 Mar", "10 Mar"]);
  await week_.getByRole("button").click();
  await week_.getByRole("button").click();

  await page.getByRole("button", { name: "Filter columns" }).click();
  await page.getByLabel("Filter Status").fill("short");
  await expect.poll(weeks).toEqual(["17 Feb"]);
  await expect(page.getByText("3 of 4 hidden by 1 filter")).toBeVisible();
  await page.getByLabel("Filter Status").fill("");
  await page.getByLabel("Filter %").fill(">100");
  await expect.poll(weeks).toEqual(["24 Feb"]);
  await page.getByLabel("Filter %").fill("");
  await page.getByLabel("Filter Fri worked").fill(">0");
  await expect.poll(weeks).toEqual(["3 Mar"]);
  await page.getByLabel("Filter Week").fill("2031-02");
  await expect(page.getByText("No week matches the filters.")).toBeVisible();
  await page.getByRole("button", { name: "clear", exact: true }).click();
  await expect.poll(weeks).toEqual(["10 Mar", "3 Mar", "24 Feb", "17 Feb"]);
});

test("Tickets groups this week by key against the target, and any range against its own total", async ({ page }) => {
  await openAt(page, "/tickets", "2031-03-12", "Tickets");
  const thisWeek = card(page, "This week");
  await expect(thisWeek).toContainText("Mon 10 Mar – Sun 16 Mar · % of target 37:30");
  const rows = thisWeek.locator("tbody tr");
  // ZZE-101: 1:00 + 4:30; ZZE-102: 3:15 not logged; ZZE-103 came in as a browse/ URL; 0:45 has no ticket. % is of 37:30.
  expect(await cells(rows.nth(0))).toEqual(["ZZE-101", `${P} w4 mon`, "2", "5:30", pct(330 / TARGET), "0:00", ""]);
  expect(await cells(rows.nth(1))).toEqual(["ZZE-102", `${P} w4 tue b`, "1", "3:15", pct(195 / TARGET), "3:15", ""]);
  expect(await cells(rows.nth(2))).toEqual(["ZZE-103", `${P} w4 wed`, "1", "2:00", pct(120 / TARGET), "0:00", ""]);
  expect(await cells(rows.nth(3))).toEqual(["No ticket", "entries with time and no key", "", "0:45", pct(45 / TARGET), "", ""]);
  await expect(rows).toHaveCount(4);
  expect([pct(330 / TARGET), pct(195 / TARGET), pct(120 / TARGET), pct(45 / TARGET)]).toEqual(["15%", "9%", "5%", "2%"]);
  await expect(thisWeek.getByRole("link", { name: "ZZE-101" })).toHaveAttribute("href", `${TICKET_BASE}/ZZE-101`);

  // All time: every merged, dated entry with time. The dateless 0:20 and the held 5:00 are in neither.
  const range = card(page, "Any range");
  const all = merged.filter((f) => f.date && f.minutes !== null).reduce((s, f) => s + f.minutes!, 0);
  expect(hm(all)).toBe("105:00");
  await expect(range).toContainText(`All time · total ${hm(all)} · % of the range`);
  const top = await cells(range.locator("tbody tr").nth(0));
  expect(top).toEqual(["ZZE-402", `${P} w2 mon`, "4", "40:00", pct(2400 / all), "10:00", ""]);
  await expect(range.locator("tbody tr")).toHaveCount(7); // six keys and No ticket

  await range.getByLabel("From").fill("2031-03-03");
  await range.getByLabel("To").fill("2031-03-09");
  await expect(range).toContainText("2031-03-03 to 2031-03-09 · total 37:30 · % of the range");
  await expect(range.locator("tbody tr")).toHaveCount(1);
  expect(await cells(range.locator("tbody tr").nth(0))).toEqual(["ZZE-201", `${P} w3 mon`, "5", "37:30", "100%", "0:00", ""]);
  await range.getByLabel("From").fill("2031-04-01");
  await range.getByLabel("To").fill("2031-04-30");
  await expect(range).toContainText("No time in this range.");
});

test("Tickets tables sort on their headers and filter per column", async ({ page }) => {
  await openAt(page, "/tickets", "2031-03-12", "Tickets");
  const t = card(page, "This week");
  const keys = async () => (await t.locator("tbody tr td:first-child").allInnerTexts()).map((s) => s.trim());
  // Largest time first to begin with.
  await expect(t.getByRole("columnheader", { name: "Time" })).toHaveAttribute("aria-sort", "descending");
  expect(await keys()).toEqual(["ZZE-101", "ZZE-102", "ZZE-103", "No ticket"]);
  await t.getByRole("columnheader", { name: "Time" }).getByRole("button").click();
  await expect.poll(keys).toEqual(["ZZE-103", "ZZE-102", "ZZE-101", "No ticket"]);
  await t.getByRole("columnheader", { name: "Not yet logged" }).getByRole("button").click();
  await expect.poll(keys).toEqual(["ZZE-102", "ZZE-101", "ZZE-103", "No ticket"]); // the two at 0:00 keep their order
  await t.getByRole("columnheader", { name: "Ticket" }).getByRole("button").click();
  await expect.poll(keys).toEqual(["ZZE-101", "ZZE-102", "ZZE-103", "No ticket"]);

  await t.getByRole("button", { name: "Filter columns" }).click();
  await t.getByLabel("Filter Entries").fill("=2");
  await expect.poll(keys).toEqual(["ZZE-101"]); // the No ticket total steps aside while a filter is on
  await expect(t).toContainText("2 of 3 hidden by 1 filter");
  await t.getByLabel("Filter Entries").fill("");
  await t.getByLabel("Filter Description").fill("tue b");
  await expect.poll(keys).toEqual(["ZZE-102"]);
});

test("Backlog lists open work and anything merged without a date; its headers sort and filter", async ({ page }) => {
  await openAt(page, "/backlog", "2031-03-12", "Backlog");
  const grid = record(page);
  const OPEN = `${P} w4 open item`;
  const DATELESS = `${P} dateless with time`;
  // Dated first, then the dateless; the held entry is not here. 1:30 is the one estimate.
  expect(await descriptions(grid)).toEqual([OPEN, DATELESS]);
  await expect(page.getByText("2 open · estimated 1:30")).toBeVisible();

  await grid.locator('[title="Sort by Description"]').click(); // text: A→Z
  await expect.poll(() => descriptions(grid)).toEqual([DATELESS, OPEN]);
  await grid.locator('[title="Sort by Description"]').click();
  await expect.poll(() => descriptions(grid)).toEqual([OPEN, DATELESS]);
  await grid.locator('[title="Sort by Time"]').click(); // empties always last
  await expect.poll(() => descriptions(grid)).toEqual([DATELESS, OPEN]);

  await grid.getByRole("button", { name: "Filter columns" }).click();
  await grid.getByLabel("Filter Time").fill("blank");
  await expect.poll(() => descriptions(grid)).toEqual([OPEN]);
  await expect(grid).toContainText("1 of 2 hidden by 1 filter");
  await grid.getByLabel("Filter Time").fill("");
  await grid.getByLabel("Filter Est.").fill(">1:00");
  await expect.poll(() => descriptions(grid)).toEqual([OPEN]);
  await grid.getByLabel("Filter Est.").fill("");
  await grid.getByLabel("Filter Ticket").fill("105");
  await expect.poll(() => descriptions(grid)).toEqual([DATELESS]);
  await grid.getByLabel("Filter Date").fill("2031-03-12");
  await expect(grid).toContainText("No open item matches the filters.");
});

test("Rules shows the agreed rules with the live figures", async ({ page }) => {
  await openAt(page, "/rules", "2031-03-12", "Rules");
  const body = page.locator("dl");
  await expect(body).toContainText("37:30, Monday to Thursday. Breaks are not counted.");
  await expect(body).toContainText("Credits a standard day (7:30) on that date.");
  await expect(body).toContainText("Wednesday 13:00 checkpoint");
  await expect(body).toContainText("at least 25:00");
  await expect(body).toContainText("Tracking start + 6 weeks");
  await expect(body).toContainText("Lost. No rollover, no TOIL. Resets on Monday.");
});

test("the Today glance answers for the real day without a server error", async ({ request }) => {
  const res = await request.get("/api/hours/glance");
  expect(res.status()).toBe(200);
  const j = (await res.json()) as { show: boolean; reason?: string; banner?: string };
  // The server's clock is the real one: shown Monday to Thursday only (O4).
  const realWeekday = (new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()) + "T00:00:00Z").getUTCDay() + 6) % 7;
  if (realWeekday > 3) expect(j).toEqual({ show: false, reason: "weekend" });
  else {
    expect(j.show).toBe(true);
    // Nothing of the 2031 record falls in the real week, so the whole target is left.
    expect(j.banner).toBe("37:30 LEFT TO WORK THIS WEEK");
  }
});
