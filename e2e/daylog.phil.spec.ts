/**
 * Day log, Parts A–E (claude/daylog-spec.md §12), as Phil.
 *
 * Cloud AI and Telegram are off on this server, so what is proved here is
 * everything the engine does without a model: the loop, the append-only
 * transcript, the score line, Skip and Quick, scenes and review items from
 * the Quick template, editing rules, photos, the week block and the cron
 * route. What only a model produces (interview questions, the narrative,
 * facts, the carry-over thread) is named in the hand-back, not faked here.
 *
 * Each test works on a date that had no row and removes its row afterwards.
 */
import { test, type APIRequestContext, type Page } from "@playwright/test";
import { expect } from "./daylog.helpers.ts";
import { localSql } from "../lib/access/introspect.ts";
import { TESS } from "./support/users.ts";
import {
  CRON_AUTH,
  LOST_THREAD,
  NO_SESSION,
  OPENER,
  QUICK_PROMPT,
  SCORE_LINE,
  TINY_PNG,
  appToday,
  freeDay,
  isoWeek,
  json,
  londonNow,
  longDate,
  m,
  quickDay,
  readDay,
  removeDay,
  shift,
  tag,
  turn,
  watch,
  type Day,
  type Turn,
} from "./daylog.helpers.ts";

const T = tag("daylog");


let api: APIRequestContext;
const mine: string[] = [];

test.beforeEach(({ request }) => {
  api = request;
});

test.afterEach(async () => {
  for (const d of mine.splice(0)) await removeDay(api, d);
});

/** A date with no row yet; its row is removed when the test ends. */
async function day(): Promise<string> {
  const d = await freeDay(api);
  mine.push(d);
  return d;
}

const conversation = (page: Page) => m(page).locator("section").filter({ has: page.getByText("Conversation", { exact: true }) });
const entry = (page: Page) => m(page).locator("section").filter({ has: page.getByText("Entry", { exact: true }) });
const composer = (page: Page) => conversation(page).getByRole("textbox");

/** Type into the composer, press Enter, and return the turn the server answered with (which must be a 200). */
async function say(page: Page, text: string): Promise<Turn> {
  const answered = page.waitForResponse((r) => r.url().includes("/messages") && r.request().method() === "POST");
  await composer(page).fill(text);
  await composer(page).press("Enter");
  const res = await answered;
  expect(res.status(), `turn "${text}" answered ${res.status()}`).toBe(200);
  return (await res.json()) as Turn;
}

async function press(page: Page, name: string | RegExp, path: string): Promise<Turn> {
  const answered = page.waitForResponse((r) => r.url().includes(path) && r.request().method() === "POST");
  await m(page).getByRole("button", { name }).click();
  const res = await answered;
  expect(res.status(), `${String(name)} answered ${res.status()}`).toBe(200);
  return (await res.json()) as Turn;
}

// ---------------------------------------------------------------------------

test.describe("Day log · list and getting to a day", () => {
  test("/journal offers today, yesterday and any past day", async ({ page }) => {
    const seen = watch(page);
    const today = await appToday(api);
    await page.goto("/journal");
    await expect(m(page).getByRole("heading", { name: "Journal" })).toBeVisible();
    await expect(m(page).getByRole("link", { name: "TODAY" })).toHaveAttribute("href", `/journal/${today}`);
    await expect(m(page).getByRole("link", { name: "YESTERDAY" })).toHaveAttribute("href", `/journal/${shift(today, -1)}`);

    const past = await day();
    await m(page).getByLabel("Log a past day").fill(past);
    await m(page).getByRole("link", { name: "OPEN" }).click();
    await expect(page).toHaveURL(new RegExp(`/journal/${past}$`));
    await expect(m(page).getByRole("heading", { name: longDate(past) })).toBeVisible();
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
  });

  test("today's page opens from the list and is the app's own day", async ({ page }) => {
    const seen = watch(page);
    const today = await appToday(api);
    const before = await json<{ days: Array<{ day: string }> }>(await api.get(`/api/journal/days?from=${today}&to=${today}`));
    const existed = before.days.length > 0;

    await page.goto("/journal");
    await m(page).getByRole("link", { name: "TODAY" }).click();
    await expect(page).toHaveURL(new RegExp(`/journal/${today}$`));
    await expect(m(page).getByRole("heading", { name: longDate(today) })).toBeVisible();
    await expect(m(page).getByRole("link", { name: "all days" })).toHaveAttribute("href", "/journal");
    const d = (await readDay(api, today)).day;
    await expect(m(page).getByText(d.mode ? `${d.status} · ${d.mode}` : d.status, { exact: true })).toBeVisible();
    if (d.status === "pending" || d.status === "prompted") {
      for (const name of ["TALK", "QUICK", "SKIP — SCORES ONLY"]) await expect(m(page).getByRole("button", { name, exact: true })).toBeVisible();
    }
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
    // opening the page made the row; leave it only if it was there before
    if (!existed && d.transcript.length === 0) await api.delete(`/api/journal/days/${today}`);
  });

  test("a day nobody has logged: nothing yet, three ways to start, no composer", async ({ page }) => {
    const d = await day();
    await page.goto(`/journal/${d}`);
    await expect(m(page).getByText("pending", { exact: true })).toBeVisible();
    await expect(entry(page).getByText("Nothing yet.")).toBeVisible();
    await expect(conversation(page).getByText("No messages.")).toBeVisible();
    for (const name of ["TALK", "QUICK", "SKIP — SCORES ONLY"]) await expect(m(page).getByRole("button", { name, exact: true })).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
    await expect(m(page).getByRole("button", { name: "WRAP UP" })).toHaveCount(0);
    await expect(m(page).getByRole("button", { name: "RE-EXTRACT" })).toHaveCount(0);
    // the arrows walk a day at a time
    await expect(m(page).getByRole("link", { name: "Previous day" })).toHaveAttribute("href", `/journal/${shift(d, -1)}`);
    await expect(m(page).getByRole("link", { name: "Next day" })).toHaveAttribute("href", `/journal/${shift(d, 1)}`);
  });

  test("a day row's id in the URL lands on its date", async ({ page }) => {
    const d = await day();
    const { day: row } = await readDay(api, d);
    await page.goto(`/journal/${row.id}`);
    await expect(page).toHaveURL(new RegExp(`/journal/${d}$`));
    // and the API answers the same row for the id
    const byId = await json<{ day: Day }>(await api.get(`/api/journal/days/${row.id}`));
    expect(byId.day.day).toBe(d);
  });

  test("a date that is not on the calendar is refused, never a server error", async ({ page }) => {
    // was a 500 from Postgres before the guard in lib/daylog/day.ts checked the calendar
    for (const bad of ["2026-02-30", "2026-13-01", "2025-02-29"]) {
      expect((await api.get(`/api/journal/days/${bad}`)).status(), `GET ${bad}`).toBe(400);
      expect((await api.post(`/api/journal/days/${bad}/messages`, { data: { start: "skip" } })).status(), `messages ${bad}`).toBe(400);
      expect((await api.post(`/api/journal/days/${bad}/close`)).status(), `close ${bad}`).toBe(400);
    }
    // a bad bound on the list falls back to the default window instead of failing
    const list = await api.get("/api/journal/days?from=2026-13-01&to=2026-02-30");
    expect(list.status()).toBe(200);
    expect((await page.goto("/journal/2026-02-30"))!.status()).toBe(404);
    expect((await page.goto("/journal/not-a-date"))!.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------------

test.describe("Part A · the loop, the transcript, the scores", () => {
  test("Talk opens the day; a typed entry is appended and answered without a model", async ({ page }) => {
    const seen = watch(page);
    const d = await day();
    await page.goto(`/journal/${d}`);
    const opened = await press(page, "TALK", "/messages");
    expect(opened.reply).toBe(OPENER);
    await expect(m(page).getByText("open · talk", { exact: true })).toBeVisible();
    await expect(conversation(page).getByRole("listitem")).toHaveCount(1);
    await expect(conversation(page).getByRole("listitem").first()).toContainText(OPENER);
    await expect(entry(page).getByText("The entry is written when the day closes.")).toBeVisible();

    const text = `${T} walked to the harbour and back`;
    const t = await say(page, text);
    // AI is off: the entry is kept and the interviewer says so plainly, on the system channel
    expect(t.state).toBe("open");
    expect(t.reply).toBe(LOST_THREAD);
    const items = conversation(page).getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(1)).toContainText(text);
    await expect(items.nth(1)).toContainText("· app");
    await expect(items.nth(2)).toContainText(LOST_THREAD);
    await expect(items.nth(2)).toContainText("· system");
    await expect(composer(page)).toHaveValue("");

    // Talk again on an open day changes nothing
    const again = await turn(api, d, { start: "talk" });
    expect(again.reply).toBe("Carry on — I'm listening.");
    expect(again.day.transcript).toHaveLength(3);
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
  });

  test("the transcript only ever grows, and no route will rewrite it", async ({ page }) => {
    const d = await day();
    await turn(api, d, { start: "talk" });
    const first = (await turn(api, d, { text: `${T} first thing` })).day.transcript;
    const second = (await turn(api, d, { text: `${T} second thing` })).day.transcript;
    expect(second.length).toBeGreaterThan(first.length);
    expect(second.slice(0, first.length)).toEqual(first);
    expect(second.filter((e) => e.role === "user").map((e) => e.text)).toEqual([`${T} first thing`, `${T} second thing`]);
    for (const e of second) expect(Number.isNaN(Date.parse(e.at)), "every entry is timestamped").toBe(false);

    for (const body of [{ transcript: [] }, { extraction: {} }, { transcript: second.slice(0, 1), summary: "x" }]) {
      const res = await api.patch(`/api/journal/days/${d}`, { data: body });
      expect(res.status()).toBe(400);
      expect((await json<{ error: string }>(res)).error).toBe("transcript and extraction are append-only");
    }
    // fields outside the whitelist are ignored, not written
    expect((await api.patch(`/api/journal/days/${d}`, { data: { status: "closed", turn_count: 0 } })).status()).toBe(400);
    const after = (await readDay(api, d)).day;
    expect(after.transcript).toEqual(second);
    expect(after.status).toBe("open");

    // on the page a message has no edit control: the composer is the only text box in the conversation
    await page.goto(`/journal/${d}`);
    await expect(conversation(page).getByRole("listitem")).toHaveCount(second.length);
    await expect(conversation(page).getByRole("textbox")).toHaveCount(1);
    await expect(conversation(page).getByRole("button", { name: /edit|delete/i })).toHaveCount(0);
  });

  test("done asks the score line; digits, a partial reply and words are parsed; the day closes", async ({ page }) => {
    const seen = watch(page);
    const d = await day();
    await page.goto(`/journal/${d}`);
    await press(page, "TALK", "/messages");
    await say(page, `${T} a quiet one, stayed in`);

    const asked = await say(page, "done");
    expect(asked.state).toBe("scores");
    expect(asked.reply).toBe(SCORE_LINE);
    expect(asked.missing).toEqual(["mood", "energy", "sleep", "productivity"]);
    await expect(m(page).getByText("closing · talk", { exact: true })).toBeVisible();
    await expect(composer(page)).toHaveAttribute("placeholder", "The scores, e.g. 4 3 5 2");

    // out of range is not a score
    const junk = await say(page, "9 9 9 9");
    expect(junk.reply).toBe(`Just the numbers: ${SCORE_LINE}`);
    expect(junk.day.scores).toEqual({});

    // a partial reply keeps what it got and asks for the rest by name
    const partial = await say(page, "4 3");
    expect(partial.reply).toBe("And sleep / productivity, 1–5?");
    expect(partial.day.scores).toEqual({ mood: 4, energy: 3 });

    // words are accepted
    const closed = await say(page, "five two");
    expect(closed.state).toBe("closed");
    expect(closed.day.status).toBe("closed");
    expect(closed.day.scores).toEqual({ mood: 4, energy: 3, sleep: 5, productivity: 2 });

    await expect(m(page).getByText("closed · talk", { exact: true })).toBeVisible();
    for (const [k, v] of Object.entries(closed.day.scores)) await expect(m(page).getByRole("button", { name: `${k} ${v}`, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(composer(page)).toHaveCount(0);
    await expect(m(page).getByRole("button", { name: "WRAP UP" })).toHaveCount(0);
    await expect(m(page).getByRole("button", { name: "RE-EXTRACT" })).toBeVisible();
    // no model, no narrative: the day closes with its transcript and scores and says there is no entry
    await expect(entry(page).getByText("No entry.")).toBeVisible();
    expect(closed.day.summary).toBeNull();
    expect(closed.day.cost_pence).toBe(0);

    // a closed day takes no more messages
    const late = await api.post(`/api/journal/days/${d}/messages`, { data: { text: "one more thing" } });
    expect(late.status()).toBe(409);
    expect((await json<{ error: string }>(late)).error).toBe("day is closed");
    expect((await turn(api, d, { start: "talk" })).reply).toBe("That day is closed.");
    expect((await readDay(api, d)).day.transcript).toEqual(closed.day.transcript);
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
  });

  test("keyed scores in any order are read by name", async () => {
    const d = await day();
    await turn(api, d, { start: "skip" });
    const t = await turn(api, d, { text: "sleep 2, mood: 5 productivity=1 energy four" });
    expect(t.day.scores).toEqual({ mood: 5, energy: 4, sleep: 2, productivity: 1 });
    expect(t.state).toBe("closed");
  });

  test("the turn cap ends the interview at the score line", async () => {
    const d = await day();
    await turn(api, d, { start: "talk" });
    let last: Turn | null = null;
    for (let i = 1; i <= 15; i++) {
      last = await turn(api, d, { text: `${T} message ${i}` });
      if (i < 15) expect(last.state, `turn ${i} keeps the day open`).toBe("open");
    }
    expect(last!.state).toBe("scores");
    expect(last!.reply).toBe(SCORE_LINE);
    expect(last!.day.status).toBe("closing");
    expect(last!.day.turn_count).toBe(15);
  });

  test("Wrap up goes to the score line; Close with what I have closes without scores", async ({ page }) => {
    const d = await day();
    await page.goto(`/journal/${d}`);
    await press(page, "TALK", "/messages");
    await say(page, `${T} not much to say`);
    const wrapped = await press(page, "WRAP UP", "/close");
    expect(wrapped.state).toBe("scores");
    expect(wrapped.reply).toBe(SCORE_LINE);
    await expect(m(page).getByText("closing · talk", { exact: true })).toBeVisible();

    const closed = await press(page, "CLOSE WITH WHAT I HAVE", "/close");
    expect(closed.state).toBe("closed");
    expect(closed.day.status).toBe("closed");
    expect(closed.day.scores).toEqual({});
    await expect(m(page).getByText("closed · talk", { exact: true })).toBeVisible();
    expect((await json<{ reply: string }>(await api.post(`/api/journal/days/${d}/close`))).reply).toBe("Already closed.");
  });

  test("Skip records the scores and nothing else", async ({ page }) => {
    const seen = watch(page);
    const d = await day();
    await page.goto(`/journal/${d}`);
    const started = await press(page, "SKIP — SCORES ONLY", "/messages");
    expect(started.reply).toBe(SCORE_LINE);
    expect(started.state).toBe("scores");
    await expect(m(page).getByText("closing · skip", { exact: true })).toBeVisible();

    const done = await say(page, "3 2 4 4");
    expect(done.reply).toBe("Logged.");
    expect(done.day.status).toBe("skipped");
    expect(done.day.scores).toEqual({ mood: 3, energy: 2, sleep: 4, productivity: 4 });
    expect(done.day.summary).toBeNull();
    expect(done.day.turn_count).toBe(0);
    await expect(m(page).getByText("skipped · skip", { exact: true })).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
    await expect(entry(page).getByText("No entry.")).toBeVisible();
    // a skipped day is not re-extracted (there is nothing to read)
    await expect(m(page).getByRole("button", { name: "RE-EXTRACT" })).toHaveCount(0);
    expect((await api.post(`/api/journal/days/${d}/reextract`)).status()).toBe(409);
    expect(seen.serverErrors).toEqual([]);
  });

  test("a force-closed day that never heard from anyone is skipped, not closed", async () => {
    const d = await day();
    await turn(api, d, { start: "skip" });
    const res = await api.post(`/api/journal/days/${d}/close`);
    expect(res.status()).toBe(200);
    const body = await json<Turn>(res);
    expect(body.day.status).toBe("skipped");
    expect(body.day.scores).toEqual({});
  });

  test("scores are edited on the page, one tap each, and validated 1–5 on the configured keys", async ({ page }) => {
    const d = await day();
    await turn(api, d, { start: "skip" });
    await turn(api, d, { text: "3 3 3 3" });
    await page.goto(`/journal/${d}`);
    const mood5 = m(page).getByRole("button", { name: "mood 5", exact: true });
    await expect(m(page).getByRole("button", { name: "mood 3", exact: true })).toHaveAttribute("aria-pressed", "true");

    let saved = page.waitForResponse((r) => r.url().endsWith(`/api/journal/days/${d}`) && r.request().method() === "PATCH");
    await mood5.click();
    expect((await saved).status()).toBe(200);
    await expect(mood5).toHaveAttribute("aria-pressed", "true");
    await expect(m(page).getByRole("button", { name: "mood 3", exact: true })).toHaveAttribute("aria-pressed", "false");
    expect((await readDay(api, d)).day.scores.mood).toBe(5);

    // tapping the chosen number again clears that score
    saved = page.waitForResponse((r) => r.url().endsWith(`/api/journal/days/${d}`) && r.request().method() === "PATCH");
    await mood5.click();
    expect((await saved).status()).toBe(200);
    await expect(mood5).toHaveAttribute("aria-pressed", "false");
    expect((await readDay(api, d)).day.scores).toEqual({ energy: 3, sleep: 3, productivity: 3 });

    for (const [scores, error] of [
      [{ mood: 6 }, "mood must be 1–5"],
      [{ mood: 0 }, "mood must be 1–5"],
      [{ mood: 2.5 }, "mood must be 1–5"],
      [{ mood: "4" }, "mood must be 1–5"],
      [{ stress: 3 }, "unknown score key stress"],
    ] as const) {
      const res = await api.patch(`/api/journal/days/${d}`, { data: { scores } });
      expect(res.status(), JSON.stringify(scores)).toBe(400);
      expect((await json<{ error: string }>(res)).error).toBe(error);
    }
    expect((await readDay(api, d)).day.scores).toEqual({ energy: 3, sleep: 3, productivity: 3 });
  });

  test("the entry is editable and stays the owner's wording", async ({ page }) => {
    const d = await day();
    await quickDay(api, d, `nobody / - / ${T} first wording`);
    await page.goto(`/journal/${d}`);
    await expect(entry(page)).toContainText(`${T} first wording`);
    await entry(page).getByRole("button", { name: "EDIT" }).click();
    await entry(page).getByRole("textbox").fill(`${T} my own wording`);
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/journal/days/${d}`) && r.request().method() === "PATCH");
    await entry(page).getByRole("button", { name: "SAVE" }).click();
    expect((await saved).status()).toBe(200);
    await expect(entry(page)).toContainText(`${T} my own wording`);
    await expect(entry(page).getByRole("textbox")).toHaveCount(0);

    const after = (await readDay(api, d)).day;
    expect(after.summary).toBe(`${T} my own wording`);
    expect(after.summary_edited_by_user).toBe(true);
    // re-extracting a closed day never touches the edited entry (and does not fail without a model)
    const again = await api.post(`/api/journal/days/${d}/reextract`);
    expect(again.status()).toBe(200);
    expect((await readDay(api, d)).day.summary).toBe(`${T} my own wording`);

    // cancel leaves it alone
    await page.reload();
    await entry(page).getByRole("button", { name: "EDIT" }).click();
    await entry(page).getByRole("textbox").fill("thrown away");
    await entry(page).getByRole("button", { name: "CANCEL" }).click();
    await expect(entry(page)).toContainText(`${T} my own wording`);
    expect((await readDay(api, d)).day.summary).toBe(`${T} my own wording`);
  });

  test("past days are listed newest first with status, scores and what is waiting", async ({ page }) => {
    const older = await day();
    const newer = await day();
    const [a, b] = [older, newer].sort();
    await quickDay(api, a, `${T}-Ann / ${T}-Pier / ${T} older day`, "1 2 3 4");
    await turn(api, b, { start: "skip" });
    await turn(api, b, { text: "5 5 5 5" });

    const list = await json<{ days: Array<{ day: string; status: string; mode: string; summary: string | null; scores: Record<string, number>; scene_titles: string[]; to_review: number; user_turns: number }> }>(
      await api.get(`/api/journal/days?from=${a}&to=${b}`),
    );
    const rows = list.days.filter((r) => r.day === a || r.day === b);
    expect(rows.map((r) => r.day)).toEqual([b, a]);
    expect(rows[0]).toMatchObject({ status: "skipped", mode: "skip", summary: null, scores: { mood: 5, energy: 5, sleep: 5, productivity: 5 }, scene_titles: [], to_review: 0 });
    expect(rows[1]).toMatchObject({ status: "closed", mode: "quick", scores: { mood: 1, energy: 2, sleep: 3, productivity: 4 }, scene_titles: [`${T}-Pier`], to_review: 2 });
    // the status filter narrows the list
    const onlySkipped = await json<{ days: Array<{ day: string }> }>(await api.get(`/api/journal/days?from=${a}&to=${b}&status=skipped`));
    expect(onlySkipped.days.map((r) => r.day)).toContain(b);
    expect(onlySkipped.days.map((r) => r.day)).not.toContain(a);

    await page.goto("/journal");
    const rowA = m(page).locator(`a[href="/journal/${a}"]`);
    const rowB = m(page).locator(`a[href="/journal/${b}"]`);
    await expect(rowA).toContainText("closed · quick");
    await expect(rowA).toContainText(`${T}-Pier`);
    await expect(rowA).toContainText("2 to review");
    await expect(rowA).toContainText(`${T} older day`);
    await expect(rowB).toContainText("skipped · skip");
    // a skipped day says what it holds (it used to read "1 messages, no summary")
    await expect(rowB).toContainText("scores only");
    for (const k of ["mood 5", "energy 5", "sleep 5", "productivity 5"]) await expect(rowB.locator(`[title="${k}"]`)).toBeVisible();
    await rowA.click();
    await expect(page).toHaveURL(new RegExp(`/journal/${a}$`));

    // the score series the strip and Health read
    const series = await json<{ keys: string[]; series: Array<Record<string, unknown>> }>(await api.get(`/api/journal/scores?from=${a}&to=${b}`));
    expect(series.keys).toEqual(["mood", "energy", "sleep", "productivity"]);
    expect(series.series.find((r) => r.day === a)).toEqual({ day: a, mood: 1, energy: 2, sleep: 3, productivity: 4 });
    expect(series.series.find((r) => r.day === b)).toEqual({ day: b, mood: 5, energy: 5, sleep: 5, productivity: 5 });
    const one = await json<{ keys: string[]; series: Array<Record<string, unknown>> }>(await api.get(`/api/journal/scores?from=${a}&to=${a}&key=sleep`));
    expect(one.keys).toEqual(["sleep"]);
    expect(one.series).toEqual([{ day: a, sleep: 3 }]);
  });
});

// ---------------------------------------------------------------------------

test.describe("Part B · Quick mode, scenes and what waits for review", () => {
  test("Quick: one templated line becomes the entry, one scene and review items", async ({ page }) => {
    const seen = watch(page);
    const d = await day();
    await page.goto(`/journal/${d}`);
    const started = await press(page, "QUICK", "/messages");
    expect(started.reply).toBe(QUICK_PROMPT);
    await expect(m(page).getByText("open · quick", { exact: true })).toBeVisible();

    const line = `${T}-Zorb and ${T}-Quix / ${T}-Harbour / chips on the wall`;
    const asked = await say(page, line);
    expect(asked.state).toBe("scores");
    expect(asked.reply).toBe(SCORE_LINE);
    const closed = await say(page, "4 3 2 5");
    expect(closed.state).toBe("closed");
    expect(closed.reply).toBe(`${line}\n3 items to review.`);
    await expect(m(page).getByText("closed · quick", { exact: true })).toBeVisible();

    // the one line is the entry; the place is the scene; nobody is on the scene until reviewed
    await expect(entry(page)).toContainText(line);
    const got = await readDay(api, d);
    expect(got.day.summary).toBe(line);
    expect(got.scenes).toHaveLength(1);
    expect(got.scenes[0]).toMatchObject({ title: `${T}-Harbour`, place_text: `${T}-Harbour`, place_id: null, people: [], hidden_from_linked: false });
    expect(got.facts).toEqual([]);
    expect(got.pending).toBe(3);

    await expect(m(page).getByRole("heading", { name: `${T}-Harbour` })).toBeVisible();
    await expect(m(page).getByTitle("Not linked to Places yet")).toHaveText(`${T}-Harbour`);
    const badge = m(page).getByRole("link", { name: "3 TO REVIEW" });
    await expect(badge).toHaveAttribute("href", `/organisation/captures/review?tab=entities&day=${got.day.id}`);

    const pending = await json<{ pending: Array<{ entity_type: string; entity_name: string; capture_id: string | null; additional_data: Record<string, unknown> }> }>(await api.get(`/api/pending-entities?day_id=${got.day.id}`));
    expect(pending.pending.map((p) => `${p.entity_type}:${p.entity_name}`).sort()).toEqual([`daylog_new_person:${T}-Quix`, `daylog_new_person:${T}-Zorb`, `daylog_place:${T}-Harbour`].sort());
    for (const p of pending.pending) {
      expect(p.capture_id).toBeNull();
      expect(p.additional_data).toMatchObject({ day_id: got.day.id, day: d });
    }
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
  });

  test("a Quick line without the template is still a day: one scene named after the line, nothing to review", async () => {
    const d = await day();
    const closed = await quickDay(api, d, `${T} stayed in and read`);
    expect(closed.reply).toBe(`${T} stayed in and read`);
    const got = await readDay(api, d);
    expect(got.scenes.map((s) => s.title)).toEqual([`${T} stayed in and read`]);
    expect(got.scenes[0].place_text).toBeNull();
    expect(got.pending).toBe(0);
  });

  test("nothing reaches People or Places until it is reviewed; approving puts it on the scene", async ({ page }) => {
    const seen = watch(page);
    const d = await day();
    await quickDay(api, d, `${T}-Zorb and ${T}-Quix / ${T}-Harbour / chips on the wall`);
    const before = await readDay(api, d);
    const people = async () => (await json<{ people: Array<{ id: string; first_name: string | null; days_together?: number }> }>(await api.get("/api/people?limit=500"))).people.filter((p) => (p.first_name ?? "").startsWith(T));
    const places = async () => (await json<{ places: Array<{ id: string; name: string }> }>(await api.get("/api/places"))).places.filter((p) => p.name.startsWith(T));
    expect(await people()).toEqual([]);
    expect(await places()).toEqual([]);

    await page.goto(`/journal/${d}`);
    await m(page).getByRole("link", { name: "3 TO REVIEW" }).click();
    await expect(page).toHaveURL(/tab=entities/);
    await expect(m(page).getByRole("tab", { name: "NEW ENTITIES" })).toHaveAttribute("aria-selected", "true");
    await expect(m(page).getByRole("link", { name: `Day log · ${d}` })).toBeVisible();
    const group = m(page).locator("section").filter({ has: page.getByRole("link", { name: `Day log · ${d}` }) });
    const item = (name: string) => group.getByRole("listitem").filter({ hasText: name });
    await expect(group.getByRole("listitem")).toHaveCount(3);
    await expect(item(`${T}-Zorb`)).toContainText("No one by this name in People.");

    const resolved = () => page.waitForResponse((r) => /\/api\/pending-entities\/.+\/resolve$/.test(new URL(r.url()).pathname));
    let done = resolved();
    await item(`${T}-Zorb`).getByRole("button", { name: "CREATE PERSON" }).click();
    expect((await done).status()).toBe(200);
    await expect(item(`${T}-Zorb`)).toHaveCount(0);

    done = resolved();
    await item(`${T}-Quix`).getByRole("button", { name: "REJECT" }).click();
    expect((await done).status()).toBe(200);
    await expect(item(`${T}-Quix`)).toHaveCount(0);

    done = resolved();
    await item(`${T}-Harbour`).getByRole("button", { name: "CREATE PLACE" }).click();
    expect((await done).status()).toBe(200);
    await expect(m(page).getByText("Nothing left to review for that day.")).toBeVisible();

    const made = await people();
    expect(made.map((p) => p.first_name)).toEqual([`${T}-Zorb`]);
    const place = await places();
    expect(place.map((p) => p.name)).toEqual([`${T}-Harbour`]);

    const after = await readDay(api, d);
    expect(after.pending).toBe(0);
    expect(after.scenes[0].people).toEqual([{ id: made[0].id, name: `${T}-Zorb` }]);
    expect(after.scenes[0].place_id).toBe(place[0].id);
    expect(after.scenes[0].id).toBe(before.scenes[0].id);

    await page.goto(`/journal/${d}`);
    await expect(m(page).getByRole("link", { name: /TO REVIEW/ })).toHaveCount(0);
    await expect(m(page).getByRole("link", { name: `${T}-Zorb`, exact: true })).toHaveAttribute("href", `/organisation/people/${made[0].id}`);
    await expect(m(page).getByRole("link", { name: `${T}-Harbour`, exact: true })).toHaveAttribute("href", `/places?focus=${place[0].id}`);

    // Part C: the person now has a day together, and their page says so
    const days = await json<{ stats: { days_together: number; first_seen: string; last_seen: string } | null; timeline: Array<{ day: string; title: string }> }>(await api.get(`/api/people/${made[0].id}/days`));
    expect(days.stats).toMatchObject({ days_together: 1, first_seen: d, last_seen: d });
    expect(days.timeline.map((t) => `${t.day} ${t.title}`)).toEqual([`${d} ${T}-Harbour`]);
    expect((await people())[0].days_together).toBe(1);
    await page.goto(`/organisation/people/${made[0].id}`);
    await expect(m(page).locator(`a[href="/journal/${d}"]`).first()).toBeVisible();

    // Part E: a person can only be linked to someone who shares a team with the owner
    const link = await json<{ linked: unknown; candidates: Array<{ user_id: string }> }>(await api.get(`/api/people/${made[0].id}/link`));
    expect(link.linked).toBeNull();
    const attempt = await api.post(`/api/people/${made[0].id}/link`, { data: { user_id: TESS.id } });
    if (link.candidates.some((c) => c.user_id === TESS.id)) {
      expect(attempt.status()).toBe(200);
      expect((await api.delete(`/api/people/${made[0].id}/link`)).status()).toBe(200);
    } else {
      expect(attempt.status()).toBe(403);
      expect((await json<{ error: string }>(attempt)).error).toBe("only someone who shares a team with you can be linked");
    }
    expect((await api.post(`/api/people/${made[0].id}/link`, { data: { user_id: "nobody" } })).status()).toBe(400);
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
  });

  test("a scene is edited and deleted on the page; re-extracting never rewrites it", async ({ page }) => {
    const d = await day();
    await quickDay(api, d, `nobody / ${T}-Quay / fish and chips`);
    await page.goto(`/journal/${d}`);
    const card = m(page).locator("div.rounded-md").filter({ has: page.getByRole("heading", { name: `${T}-Quay` }) });
    await card.getByRole("button", { name: "EDIT" }).click();
    await m(page).getByLabel("Scene title").fill(`${T}-Quay renamed`);
    await m(page).getByLabel("Time hint").fill("lunch");
    await m(page).getByLabel("Scene narrative").fill(`${T} we sat on the wall`);
    let saved = page.waitForResponse((r) => r.url().includes("/api/journal/scenes/") && r.request().method() === "PATCH");
    await m(page).getByRole("button", { name: "SAVE" }).click();
    expect((await saved).status()).toBe(200);
    await expect(m(page).getByRole("heading", { name: `${T}-Quay renamed` })).toBeVisible();
    await expect(m(page).getByText(`${T} we sat on the wall`)).toBeVisible();
    await expect(m(page).getByText("lunch", { exact: true })).toBeVisible();

    let scene = (await readDay(api, d)).scenes[0];
    expect(scene).toMatchObject({ title: `${T}-Quay renamed`, narrative: `${T} we sat on the wall`, narrative_edited_by_user: true, hidden_from_linked: false });

    // shared with / hidden from linked people is one tap
    saved = page.waitForResponse((r) => r.url().includes("/api/journal/scenes/") && r.request().method() === "PATCH");
    await m(page).getByRole("button", { name: "SHARED WITH LINKED" }).click();
    expect((await saved).status()).toBe(200);
    await expect(m(page).getByRole("button", { name: "HIDDEN FROM LINKED" })).toBeVisible();
    expect((await readDay(api, d)).scenes[0].hidden_from_linked).toBe(true);

    // re-extract (no model here) adds nothing and leaves the edited scene as it is
    const notice = page.waitForResponse((r) => r.url().endsWith("/reextract"));
    await m(page).getByRole("button", { name: "RE-EXTRACT" }).click();
    expect((await notice).status()).toBe(200);
    await expect(m(page).getByText("Re-extracted: nothing new.")).toBeVisible();
    scene = (await readDay(api, d)).scenes[0];
    expect(scene.title).toBe(`${T}-Quay renamed`);
    expect((await readDay(api, d)).scenes).toHaveLength(1);

    // a blank title is refused
    expect((await api.patch(`/api/journal/scenes/${scene.id}`, { data: { title: "  " } })).status()).toBe(400);
    expect((await api.patch(`/api/journal/scenes/${scene.id}`, { data: { hidden_from_linked: "yes" } })).status()).toBe(400);

    page.once("dialog", (dlg) => void dlg.accept());
    const gone = page.waitForResponse((r) => r.url().includes("/api/journal/scenes/") && r.request().method() === "DELETE");
    await m(page).getByRole("button", { name: "DELETE" }).click();
    expect((await gone).status()).toBe(200);
    await expect(m(page).getByRole("heading", { name: `${T}-Quay renamed` })).toHaveCount(0);
    expect((await readDay(api, d)).scenes).toEqual([]);
    // a scene deleted by hand is not brought back by a re-extract
    expect((await api.post(`/api/journal/days/${d}/reextract`)).status()).toBe(200);
    expect((await readDay(api, d)).scenes).toEqual([]);
    expect((await api.delete(`/api/journal/scenes/${scene.id}`)).status()).toBe(404);
  });

  test("deleting a day takes its waiting review items with it", async () => {
    // before the fix in DELETE /api/journal/days/[date] the three items stayed in the queue with no day behind them
    const d = await day();
    await quickDay(api, d, `${T}-Orphan / ${T}-Nowhere / gone tomorrow`);
    const { day: row, pending } = await readDay(api, d);
    expect(pending).toBe(2);
    expect((await api.delete(`/api/journal/days/${d}`)).status()).toBe(200);
    const left = await json<{ pending: unknown[] }>(await api.get(`/api/pending-entities?day_id=${row.id}&resolved=true`));
    expect(left.pending).toEqual([]);
    expect((await api.delete(`/api/journal/days/${d}`)).status()).toBe(404);
    const list = await json<{ days: unknown[] }>(await api.get(`/api/journal/days?from=${d}&to=${d}`));
    expect(list.days).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

test.describe("Part D · photos, the week, the cron", () => {
  test("a photo added on the page is shown, captioned, shared, and joins the scene when the day closes", async ({ page }) => {
    const seen = watch(page);
    const d = await day();
    await turn(api, d, { start: "quick" });
    await page.goto(`/journal/${d}`);
    const uploaded = page.waitForResponse((r) => r.url().endsWith(`/api/journal/days/${d}/media`) && r.request().method() === "POST");
    await page.locator('input[type="file"]').setInputFiles({ name: `${T}.png`, mimeType: "image/png", buffer: TINY_PNG });
    expect((await uploaded).status()).toBe(201);

    const loose = m(page).locator("div.rounded-md").filter({ has: page.getByText("Photos not yet on a scene", { exact: true }) });
    const img = loose.getByRole("img", { name: "photo" });
    await expect(img).toBeVisible();
    // the signed URL really serves the image
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1);

    await loose.getByRole("button", { name: "+ caption" }).click();
    let saved = page.waitForResponse((r) => r.url().includes("/api/journal/media/") && r.request().method() === "PATCH");
    await m(page).getByLabel("Caption").fill(`${T} the sea wall`);
    await m(page).getByLabel("Caption").press("Enter");
    expect((await saved).status()).toBe(200);
    await expect(loose.getByRole("button", { name: `${T} the sea wall` })).toBeVisible();

    // private by default; one tap shares it with linked people
    saved = page.waitForResponse((r) => r.url().includes("/api/journal/media/") && r.request().method() === "PATCH");
    await loose.getByRole("button", { name: "Not shared with linked people", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(loose.getByRole("button", { name: "Shared with linked people", exact: true })).toBeVisible();
    let got = await readDay(api, d);
    expect(got.media).toHaveLength(1);
    expect(got.media[0]).toMatchObject({ caption: `${T} the sea wall`, shareable: true, scene_id: null });

    // closing the day puts the photo on the scene that was being talked about
    await turn(api, d, { text: `nobody / ${T}-Wall / photo day` });
    await turn(api, d, { text: "4 4 4 4" });
    got = await readDay(api, d);
    expect(got.media[0].scene_id).toBe(got.scenes[0].id);
    await page.reload();
    const card = m(page).locator("div.rounded-md").filter({ has: page.getByRole("heading", { name: `${T}-Wall` }) });
    await expect(card.getByRole("img", { name: `${T} the sea wall` })).toBeVisible();
    await expect(m(page).getByText("Photos not yet on a scene", { exact: true })).toHaveCount(0);

    // only images, and removing one removes it
    const notImage = await api.post(`/api/journal/days/${d}/media`, { multipart: { file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } } });
    expect(notImage.status()).toBe(415);
    expect((await api.post(`/api/journal/days/${d}/media`, { multipart: { caption: "no file" } })).status()).toBe(400);
    page.once("dialog", (dlg) => void dlg.accept());
    const removed = page.waitForResponse((r) => r.url().includes("/api/journal/media/") && r.request().method() === "DELETE");
    await card.getByRole("button", { name: "Remove photo" }).click();
    expect((await removed).status()).toBe(200);
    await expect(card.getByRole("img")).toHaveCount(0);
    expect((await readDay(api, d)).media).toEqual([]);
    expect(seen.serverErrors).toEqual([]);
    expect(seen.crashes).toEqual([]);
  });

  test("the week block counts logged and skipped days and averages the scores", async ({ page }) => {
    const d = await day();
    await quickDay(api, d, `nobody / - / ${T} week block day`, "2 4 2 4");
    const week = isoWeek(d);
    const res = await api.get(`/api/journal/week?week=${week}`);
    expect(res.status()).toBe(200);
    const block = await json<{ week_start: string; week_end: string; days: Array<{ day: string; status: string; mode: string; first_line: string | null; scores: Record<string, number> }>; averages: Record<string, number>; logged: number; skipped: number }>(res);
    expect(block.week_start <= d && d <= block.week_end).toBe(true);
    expect(shift(block.week_start, 6)).toBe(block.week_end);
    const row = block.days.find((r) => r.day === d);
    expect(row).toMatchObject({ status: "closed", mode: "quick", first_line: `nobody / - / ${T} week block day`, scores: { mood: 2, energy: 4, sleep: 2, productivity: 4 } });
    expect(block.logged).toBe(block.days.filter((r) => r.status === "closed").length);
    expect(block.skipped).toBe(block.days.filter((r) => r.status === "skipped").length);
    const scored = block.days.filter((r) => typeof r.scores?.mood === "number");
    expect(block.averages.mood).toBe(Math.round((scored.reduce((s, r) => s + r.scores.mood, 0) / scored.length) * 10) / 10);
    expect((await api.get("/api/journal/week?week=nonsense")).status()).toBe(400);

    // and the weekly review shows that week's days
    await page.goto(`/review/${week}`);
    const dayLog = m(page).locator("section").filter({ has: page.getByText("Day log", { exact: true }) });
    await expect(dayLog.locator(`a[href="/journal/${d}"]`)).toBeVisible();
    await expect(dayLog).toContainText(`nobody / - / ${T} week block day`);
    await expect(dayLog).toContainText(`${block.logged} logged · ${block.skipped} skipped`);
    expect((await api.get("/api/journal/week")).status()).toBe(200);
  });

  test("with embeddings off a closed day is simply not indexed", async () => {
    const d = await day();
    const closed = await quickDay(api, d, `nobody / - / ${T} a day that cannot be embedded here`);
    expect(closed.state).toBe("closed");
    // the close answered 200 above; the chunk it would have written is absent, so Ask and ⌘K cannot find this day
    expect(localSql(`select count(*) from public.memory_chunks where source_type = 'daylog_day' and source_id = '${closed.day.id}'`)[0][0]).toBe("0");
  });

  test("the cron route wants the bearer", async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: NO_SESSION });
    expect((await anon.get("/api/cron/daylog")).status()).toBe(401);
    expect((await anon.post("/api/cron/daylog")).status()).toBe(401);
    expect((await anon.get("/api/cron/daylog", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
    await anon.dispose();
    // a signed-in session is not the cron either
    expect((await api.get("/api/cron/daylog", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  });

  test("a cron tick with Telegram off reports, prompts nobody and never fails", async ({ playwright }) => {
    const cron = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: CRON_AUTH, storageState: NO_SESSION });
    const today = await appToday(api);
    const todayBefore = (await json<{ days: Array<{ day: string; status: string }> }>(await api.get(`/api/journal/days?from=${today}&to=${today}`))).days[0] ?? null;

    for (const method of ["get", "post"] as const) {
      const res = await cron[method]("/api/cron/daylog");
      expect(res.status(), `${method} cron`).toBe(200);
      const report = await json<{ ok: boolean; day: string; prompted: boolean; snoozed: boolean; closedIdle: string[]; skipped: string[]; alert?: { spent_pence: number; sent: boolean }; note?: string }>(res);
      expect(report.ok).toBe(true);
      expect(report.day).toBe(await appToday(api));
      expect(report.prompted).toBe(false);
      expect(report.snoozed).toBe(false);
      expect(report.alert).toEqual({ spent_pence: expect.any(Number), sent: false });

      // the evening window is prompt time (21:30) to the cutoff (03:00), London
      const { minutes } = londonNow();
      const inWindow = minutes >= 21 * 60 + 30 || minutes < 3 * 60;
      const row = (await json<{ days: Array<{ status: string }> }>(await api.get(`/api/journal/days?from=${report.day}&to=${report.day}`))).days[0] ?? null;
      if (inWindow && row?.status === "pending") {
        // the prompt could not be sent, so the day stays pending for the next tick
        expect(report.note).toBe("telegram send failed");
      } else if (!inWindow) {
        expect(report.note).toBeUndefined();
      }
      if (inWindow) expect(row, "a tick in the window makes today's row").not.toBeNull();
    }
    await cron.dispose();
    // the tick may have made today's row; leave it only if it was there before
    if (!todayBefore) {
      const now = await appToday(api);
      const made = await json<{ days: Array<{ day: string; status: string; user_turns: number }> }>(await api.get(`/api/journal/days?from=${today}&to=${now}`));
      for (const r of made.days) if (r.status === "pending" && r.user_turns === 0) await api.delete(`/api/journal/days/${r.day}`);
    }
  });

  test("at the cutoff yesterday's unfinished day is closed as skipped", async ({ playwright }) => {
    const today = await appToday(api);
    const yesterday = shift(today, -1);
    const todayBefore = (await json<{ days: unknown[] }>(await api.get(`/api/journal/days?from=${today}&to=${today}`))).days.length > 0;
    const there = await json<{ days: unknown[] }>(await api.get(`/api/journal/days?from=${yesterday}&to=${yesterday}`));
    test.skip(there.days.length > 0, `${yesterday} already has a Day log row this spec did not make`);
    mine.push(yesterday);
    await turn(api, yesterday, { start: "talk" });
    await turn(api, yesterday, { text: `${T} started and never finished` });

    const cron = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: CRON_AUTH, storageState: NO_SESSION });
    const res = await cron.get("/api/cron/daylog");
    expect(res.status()).toBe(200);
    const report = await json<{ day: string; skipped: string[]; closedIdle: string[] }>(res);
    await cron.dispose();
    test.skip(report.day !== today, "the day rolled over mid-test");
    const { minutes, date } = londonNow();
    const after = (await readDay(api, yesterday)).day;
    if (minutes >= 3 * 60 && date === today) {
      // past 03:00: the day that was left open is skipped, its transcript kept
      expect(report.skipped).toEqual([yesterday]);
      expect(after.status).toBe("skipped");
      expect(after.transcript.filter((e) => e.role === "user").map((e) => e.text)).toEqual([`${T} started and never finished`]);
      expect((await api.post(`/api/journal/days/${yesterday}/messages`, { data: { text: "too late" } })).status()).toBe(409);
    } else {
      // before 03:00 the evening is still running: nothing is skipped
      expect(report.skipped).toEqual([]);
      expect(after.status).toBe("open");
    }
    // a day active in the last two hours is not idle-closed
    expect(report.closedIdle).not.toContain(yesterday);
    // the tick may have made today's row; leave it only if it was there before
    if (!todayBefore) {
      const row = await json<{ days: Array<{ day: string; status: string; user_turns: number }> }>(await api.get(`/api/journal/days?from=${today}&to=${today}`));
      for (const r of row.days) if (r.status === "pending" && r.user_turns === 0) mine.push(r.day);
    }
  });
});
