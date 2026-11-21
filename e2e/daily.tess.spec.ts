/**
 * The daily loop (0161; master run §6), end to end, as Tess: her space is
 * quiet, so today's proposal is made of this spec's tickets and nothing
 * else. Covers the proposal, the focus card's actions and what each does to
 * the ticket underneath, the soft limit on things in progress, the one card
 * for a date that slipped a week ago, the morning prompt and its
 * forty-five-minute rule, and the evening close.
 *
 * A person has one plan per day, so every test starts by removing Tess's
 * plan for today (SQL, on a table only this feature writes).
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { TESS } from "./support/users.ts";

const RUN = `E2E-daily-${Date.now().toString(36)}`;
const london = (offsetDays = 0): string => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
const TODAY = london();

type Card = { item_id: string; ticket_id: string; title: string; is_win: boolean; state: string; minutes: number; first_step: string; why: string | null; left_off: string | null; timer_ends_at: string | null; position: number };
type Today = {
  plan_id: string;
  status: string;
  needs_ok: boolean;
  won: boolean;
  current: Card | null;
  then: Card | null;
  items: Card[];
  swap: Array<{ ticket_id: string; title: string }>;
  slipped: Array<{ id: string; title: string }>;
  timer_running: boolean;
  counts: { planned: number; finished: number; left: number };
  just_won?: boolean;
};

const made: string[] = [];
let api: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
});

test.afterAll(async () => {
  resetPlan();
  for (const id of made) localSql(`delete from public.tickets where id = '${id}'`);
  await api.dispose();
});

function resetPlan(): void {
  localSql(`delete from public.day_plans where created_by = '${TESS.id}'`);
  // Nothing of this spec's is left in progress from a previous test.
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")})`);
  made.length = 0;
}

test.beforeEach(() => resetPlan());

async function ticket(title: string, fields: Record<string, unknown> = {}): Promise<{ id: string; key: string }> {
  const res = await api.post("/api/tickets", { data: { title: `${RUN} ${title}`, category: "next", ...fields } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  const body = (await res.json()) as { ticket?: { id: string; ticket_key: string }; task?: { id: string; ticket_key: string } };
  const t = body.ticket ?? body.task!;
  made.push(t.id);
  // The estimate is a legacy field the create route does not take; set it on the row this spec made.
  if (typeof fields.minutes === "number") localSql(`update public.tickets set time_estimate_min = ${fields.minutes} where id = '${t.id}'`);
  return { id: t.id, key: t.ticket_key };
}

const category = (id: string) =>
  localSql(`select s.category from public.tickets t join public.ticket_statuses s on s.id = t.status_id where t.id = '${id}'`)[0]?.[0] ?? null;
const col = (id: string, column: string) => localSql(`select coalesce(${column}::text, '') from public.tickets where id = '${id}'`)[0]?.[0] ?? "";

async function today(): Promise<Today> {
  const res = await api.get("/api/daily/today");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as Today;
}

async function act(itemId: string, body: Record<string, unknown>): Promise<{ status: number; body: Today & { error?: string; wip?: { limit: number; in_progress: Array<{ id: string }> } } }> {
  const res = await api.post(`/api/daily/items/${itemId}`, { data: body });
  return { status: res.status(), body: await res.json() };
}

const mine = (t: Today) => t.items.filter((i) => i.title.startsWith(RUN));

test("today is proposed from dates and what is lined up: one win, the rest if there is time", async () => {
  const win = await ticket("boiler quote", { deadline_on: TODAY, minutes: 20 });
  const extra = await ticket("order the hinges", { scheduled_on: TODAY, minutes: 10 });
  await ticket("some day, maybe", { category: "backlog" });
  const stale = await ticket("renew the passport", { scheduled_on: london(-10) });

  const t = await today();
  expect(t.status).toBe("proposed");
  expect(t.needs_ok).toBe(true);
  expect(t.current).toMatchObject({ ticket_id: win.id, is_win: true, minutes: 30, why: "Its date is today", state: "planned" });
  expect(t.current!.first_step.length).toBeGreaterThan(5);
  expect(mine(t).map((i) => i.ticket_id)).toEqual([win.id, extra.id]);
  expect(t.then?.ticket_id).toBe(extra.id);
  expect(t.items.filter((i) => i.is_win)).toHaveLength(1);
  // The undated backlog item is not on the day; the week-old date is held for one decision card.
  expect(t.slipped.map((s) => s.id)).toEqual([stale.id]);
  expect(t.counts).toEqual({ planned: 2, finished: 0, left: 2 });

  // Asking again gives the same plan, not a second one.
  expect((await today()).plan_id).toBe(t.plan_id);
  expect(localSql(`select count(*) from public.day_plans where created_by = '${TESS.id}' and day = '${TODAY}'`)[0][0]).toBe("1");
});

test("an empty day is one calm card, not an error", async () => {
  const t = await today();
  expect(t.current).toBeNull();
  expect(t.items).toEqual([]);
  expect(t.counts.planned).toBe(0);
});

test("Start runs a countdown and moves the ticket to Doing; Done finishes it and wins the day", async () => {
  const win = await ticket("ring the plumber", { deadline_on: TODAY, minutes: 10 });
  const next = await ticket("post the letter", { scheduled_on: TODAY, minutes: 5 });
  const t = await today();

  const started = await act(t.current!.item_id, { action: "start", minutes: 15 });
  expect(started.status).toBe(200);
  expect(started.body.current).toMatchObject({ ticket_id: win.id, state: "started" });
  expect(started.body.timer_running).toBe(true);
  expect(started.body.needs_ok, "starting accepts the proposal").toBe(false);
  expect(Date.parse(started.body.current!.timer_ends_at!) - Date.now()).toBeGreaterThan(14 * 60_000);
  expect(category(win.id)).toBe("doing");

  const more = await act(t.current!.item_id, { action: "more_time", minutes: 10 });
  expect(more.status).toBe(200);
  expect(more.body.current!.state).toBe("started");

  const done = await act(t.current!.item_id, { action: "done" });
  expect(done.status).toBe(200);
  expect(done.body.just_won).toBe(true);
  expect(done.body.won).toBe(true);
  expect(done.body.timer_running).toBe(false);
  expect(done.body.current?.ticket_id, "the next thing comes forward").toBe(next.id);
  expect(done.body.counts).toMatchObject({ finished: 1, left: 1 });
  expect(category(win.id)).toBe("done");
});

test("Not now takes it off the card with no reason asked; Swap offers two alternatives", async () => {
  const a = await ticket("first", { deadline_on: TODAY, minutes: 10 });
  const b = await ticket("second", { scheduled_on: TODAY, minutes: 10 });
  // Enough lined up that five are planned and two more wait on the bench.
  for (const n of [3, 4, 5, 6, 7]) await ticket(`lined up ${n}`, { minutes: 5 });

  let t = await today();
  expect(mine(t)).toHaveLength(5);
  expect(t.swap).toHaveLength(2);

  const notNow = await act(t.current!.item_id, { action: "not_now" });
  expect(notNow.status).toBe(200);
  expect(notNow.body.current?.ticket_id).toBe(b.id);
  expect(category(a.id), "the ticket itself is untouched").toBe("next");

  t = notNow.body;
  const option = t.swap[0];
  const swapped = await act(t.current!.item_id, { action: "swap", with_ticket_id: option.ticket_id });
  expect(swapped.status).toBe(200);
  expect(swapped.body.current?.ticket_id).toBe(option.ticket_id);
  expect(swapped.body.items.some((i) => i.ticket_id === b.id), "the swapped-out item left today").toBe(false);

  // Only something offered can be swapped in.
  const bogus = await act(swapped.body.current!.item_id, { action: "swap", with_ticket_id: a.id });
  expect(bogus.status).toBe(400);
});

test("Park puts it back in Next with a note of where it was left", async () => {
  const win = await ticket("half-built shed", { deadline_on: TODAY, minutes: 60 });
  const t = await today();
  await act(t.current!.item_id, { action: "start" });
  const parked = await act(t.current!.item_id, { action: "park", note: "hinges ordered, door next" });
  expect(parked.status).toBe(200);
  expect(parked.body.current).toBeNull();
  expect(category(win.id)).toBe("next");
  expect(col(win.id, "parked_note")).toBe("hinges ordered, door next");
  expect(col(win.id, "parked_at")).not.toBe("");

  // Starting it again clears the note: it is no longer parked.
  resetPlanOnly();
  const again = await today();
  expect(again.current).toMatchObject({ ticket_id: win.id, left_off: "hinges ordered, door next" });
  await act(again.current!.item_id, { action: "start" });
  expect(col(win.id, "parked_note")).toBe("");
});

function resetPlanOnly(): void {
  localSql(`delete from public.day_plans where created_by = '${TESS.id}'`);
}

test("three things in progress: starting a fourth asks to park one first, but never for a five-minute thing", async () => {
  const busy = [await ticket("in progress 1"), await ticket("in progress 2"), await ticket("in progress 3")];
  for (const b of busy) expect((await api.post(`/api/tickets/${b.key}/move`, { data: { category: "doing" } })).status()).toBe(200);
  const big = await ticket("a proper job", { deadline_on: TODAY, minutes: 60 });
  const tiny = await ticket("two-minute thing", { scheduled_on: TODAY, minutes: 3 });

  const t = await today();
  const bigItem = t.items.find((i) => i.ticket_id === big.id)!;
  const tinyItem = t.items.find((i) => i.ticket_id === tiny.id)!;

  const refused = await act(bigItem.item_id, { action: "start" });
  expect(refused.status).toBe(409);
  expect(refused.body.wip?.limit).toBe(3);
  expect(refused.body.wip?.in_progress.map((p) => p.id).sort()).toEqual(busy.map((b) => b.id).sort());
  expect(category(big.id)).toBe("next");

  expect((await act(tinyItem.item_id, { action: "start" })).status, "a tiny thing is never blocked").toBe(200);
  expect((await act(bigItem.item_id, { action: "start", force: true })).status, "and the limit is soft").toBe(200);
  expect(category(big.id)).toBe("doing");
});

test("a date that slipped a week ago gets one card: re-date, someday or drop", async () => {
  const redate = await ticket("slipped: re-date me", { scheduled_on: london(-9) });
  const someday = await ticket("slipped: someday", { scheduled_on: london(-12) });
  const drop = await ticket("slipped: drop me", { deadline_on: london(-20) });
  const t = await today();
  expect(t.slipped.map((s) => s.id).sort()).toEqual([redate.id, someday.id, drop.id].sort());
  expect(t.items.some((i) => [redate.id, someday.id, drop.id].includes(i.ticket_id)), "none is put back at the front").toBe(false);

  const decide = async (ticket_id: string, decision: string) => {
    const res = await api.post("/api/daily/slipped", { data: { ticket_id, decision } });
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()) as Today;
  };
  expect((await decide(redate.id, "redate")).slipped.map((s) => s.id)).not.toContain(redate.id);
  expect(col(redate.id, "scheduled_on")).toBe(london(1));
  await decide(someday.id, "someday");
  expect(col(someday.id, "someday")).toBe("true");
  expect(col(someday.id, "scheduled_on")).toBe("");
  const last = await decide(drop.id, "drop");
  expect(category(drop.id)).toBe("cancelled");
  expect(last.slipped).toEqual([]);

  // Offered once: tomorrow's proposal does not ask again about the one still dated in the past… there is none left;
  // and a ticket that is not waiting for a decision is refused.
  expect((await api.post("/api/daily/slipped", { data: { ticket_id: redate.id, decision: "drop" } })).status()).toBe(404);
});

test("the morning prompt prepares the day once, and an untouched plan applies itself after forty-five minutes", async () => {
  const win = await ticket("the one thing", { deadline_on: TODAY, minutes: 20 });
  const first = await api.post("/api/daily/morning");
  expect(first.status()).toBe(200);
  const body = (await first.json()) as { ok: boolean; say: string; today: Today };
  expect(body.ok).toBe(true);
  expect(body.say).toContain("the one thing");
  expect(body.say).toContain("First step:");
  expect(body.today.current?.ticket_id).toBe(win.id);
  const promptedAt = localSql(`select prompted_at from public.day_plans where id = '${body.today.plan_id}'`)[0][0];
  expect(promptedAt).not.toBe("");

  // Calling again (the alarm automation can fire twice) changes nothing.
  await api.post("/api/daily/morning");
  expect(localSql(`select prompted_at from public.day_plans where id = '${body.today.plan_id}'`)[0][0]).toBe(promptedAt);
  expect((await today()).status).toBe("proposed");

  // Forty-six minutes later, untouched: it is the plan.
  localSql(`update public.day_plans set prompted_at = now() - interval '46 minutes' where id = '${body.today.plan_id}'`);
  const later = await today();
  expect(later.status).toBe("accepted");
  expect(later.needs_ok).toBe(false);
  expect(localSql(`select accepted_by from public.day_plans where id = '${body.today.plan_id}'`)[0][0]).toBe("auto");
});

test("Looks right accepts the day with one tap", async () => {
  await ticket("one tap", { deadline_on: TODAY });
  expect((await today()).needs_ok).toBe(true);
  const res = await api.post("/api/daily/today", { data: { action: "accept" } });
  expect(res.status()).toBe(200);
  const t = (await res.json()) as Today;
  expect(t.status).toBe("accepted");
  expect(localSql(`select accepted_by from public.day_plans where id = '${t.plan_id}'`)[0][0]).toBe("tap");
});

test("the evening close: what got done first, a decision per open item, and Close the day always works", async () => {
  const done = await ticket("finished earlier", { deadline_on: TODAY, minutes: 5 });
  const finishNow = await ticket("finish at close", { scheduled_on: TODAY, minutes: 5 });
  const tomorrow = await ticket("not today", { scheduled_on: TODAY, minutes: 5 });
  const drop = await ticket("let it go", { scheduled_on: TODAY, minutes: 5 });
  const undecided = await ticket("no decision made", { scheduled_on: TODAY, minutes: 5 });

  const t = await today();
  const item = (id: string) => t.items.find((i) => i.ticket_id === id)!.item_id;
  await act(item(done.id), { action: "start" });
  await act(item(done.id), { action: "done" });

  const view = (await (await api.get("/api/daily/close")).json()) as { finished: Card[]; open: Card[]; won: boolean; status: string };
  expect(view.finished.map((c) => c.ticket_id)).toEqual([done.id]);
  expect(view.open.map((c) => c.ticket_id).sort()).toEqual([finishNow.id, tomorrow.id, drop.id, undecided.id].sort());
  expect(view.won).toBe(true);

  const closed = await api.post("/api/daily/close", {
    data: {
      decisions: [
        { item_id: item(finishNow.id), decision: "done" },
        { item_id: item(tomorrow.id), decision: "tomorrow" },
        { item_id: item(drop.id), decision: "drop" },
      ],
    },
  });
  expect(closed.status(), await closed.text()).toBe(200);
  const result = (await closed.json()) as { status: string; summary: { won: boolean; done: number; moved: number; dropped: number; planned: number } };
  expect(result.status).toBe("closed");
  expect(result.summary).toMatchObject({ won: true, done: 2, moved: 2, dropped: 1, planned: 5 });

  expect(category(finishNow.id)).toBe("done");
  expect(category(drop.id)).toBe("cancelled");
  expect(col(tomorrow.id, "scheduled_on")).toBe(london(1));
  expect(col(undecided.id, "scheduled_on"), "whatever was left undecided moves to tomorrow").toBe(london(1));
  expect(category(undecided.id)).toBe("next");

  // Closing again is harmless, and a closed day takes no more taps.
  expect((await api.post("/api/daily/close", { data: {} })).status()).toBe(200);
  expect((await act(item(tomorrow.id), { action: "start" })).status).toBe(409);
});

test("the Today page: one card, Start shows the countdown, Done says the day is won", async ({ page }) => {
  await ticket("on the page", { deadline_on: TODAY, minutes: 10 });
  await page.goto("/today");
  const card = page.getByTestId("focus-card");
  await expect(card.getByRole("heading", { level: 1 })).toContainText("on the page");
  await expect(card.getByText("Today's one thing")).toBeVisible();
  await expect(card.getByText("First step")).toBeVisible();
  for (const name of ["Start", "Not now", "Swap"]) await expect(card.getByRole("button", { name, exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Start", exact: true }).click();
  await expect(card.getByTestId("countdown")).toBeVisible();
  for (const name of ["Done", "10 more minutes", "Park"]) await expect(card.getByRole("button", { name, exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Done", exact: true }).click();
  await expect(card.getByText("The day is won", { exact: false })).toBeVisible();
  // Nothing on the page counts what was not done, or says a forbidden word.
  await expect(page.locator("body")).not.toContainText(/overdue|missed|you still haven|don't forget/i);
});

test("the Close page: the deck answers by button, and the day closes", async ({ page }) => {
  const a = await ticket("close me by button", { deadline_on: TODAY, minutes: 5 });
  await today();
  await page.goto("/close");
  const close = page.getByTestId("close-day");
  await expect(close.getByText("Nothing finished today, and that is fine.")).toBeVisible();
  await expect(close.getByTestId("deck-card")).toContainText("close me by button");
  await close.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await close.getByTestId("close-the-day").click();
  await expect(close.getByRole("heading", { name: "Day closed." })).toBeVisible();
  expect(col(a.id, "scheduled_on")).toBe(london(1));
});

test("once the day is closed, the Day log's evening conversation follows on the same screen, as on Telegram", async ({ page }) => {
  const clearDaylog = () => localSql(`delete from public.daylog_days where created_by = '${TESS.id}' and day = '${TODAY}'`);
  clearDaylog();
  try {
    await ticket("close me, then the journal", { deadline_on: TODAY, minutes: 5 });
    await today();
    await page.goto("/close");
    const close = page.getByTestId("close-day");
    await expect(close.getByTestId("evening-journal"), "not offered before the day is closed").toHaveCount(0);
    await close.getByTestId("close-the-day").click();
    await expect(close.getByRole("heading", { name: "Day closed." })).toBeVisible();

    // The bot's opening, and its three choices.
    const journal = close.getByTestId("evening-journal");
    await expect(journal.getByRole("listitem").first()).toContainText(/^Evening\..*Talk, Quick or Skip\?$/);
    for (const name of ["Talk", "Quick", "Skip"]) await expect(journal.getByRole("button", { name, exact: true })).toBeVisible();
    await expect(journal.getByRole("link", { name: "Open the day" })).toHaveAttribute("href", `/journal/${TODAY}`);

    // Skip: the score line and nothing else, answered as digits, as on Telegram.
    await journal.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(journal.getByRole("listitem").last()).toContainText("1–5");
    await journal.getByRole("textbox", { name: "Your reply" }).fill("3 2 4 4");
    await journal.getByRole("textbox", { name: "Your reply" }).press("Enter");
    await expect(journal.getByText("Scores logged.")).toBeVisible();
    await expect(journal.getByRole("link", { name: "Read the entry" })).toHaveAttribute("href", `/journal/${TODAY}`);
    await expect(journal.getByRole("textbox")).toHaveCount(0);

    // One record, the Day log's own: the same row the bot and /journal read.
    const [[status, mode, scores]] = localSql(`select status, mode, scores::text from public.daylog_days where created_by = '${TESS.id}' and day = '${TODAY}'`);
    expect({ status, mode }).toEqual({ status: "skipped", mode: "skip" });
    expect(JSON.parse(scores)).toEqual({ mood: 3, energy: 2, sleep: 4, productivity: 4 });

    // Coming back to the closed day shows where it was left, with no choices to make again.
    await page.reload();
    await expect(page.getByTestId("evening-journal").getByText("Scores logged.")).toBeVisible();
    await expect(page.getByTestId("evening-journal").getByRole("button", { name: "Talk", exact: true })).toHaveCount(0);
  } finally {
    clearDaylog();
  }
});

test("when the phone asks, it gets the line and nothing is pushed on top; each is offered once", async () => {
  await ticket("automation asks", { deadline_on: TODAY, minutes: 10 });
  const pushed = () => localSql(`select count(*) from public.interruptions where created_by = '${TESS.id}' and day = '${TODAY}' and kind in ('morning', 'evening')`)[0][0];
  const before = pushed();

  const morning = (await (await api.post("/api/daily/morning")).json()) as { ok: boolean; status: string; prompted: boolean; say: string };
  expect(morning).toMatchObject({ ok: true, status: "ok", prompted: true });
  expect(morning.say).toContain("automation asks");
  expect(((await (await api.post("/api/daily/morning")).json()) as { prompted: boolean }).prompted, "the alarm stopped twice").toBe(false);

  const evening = (await (await api.post("/api/daily/close", { data: { action: "prompt" } })).json()) as { ok: boolean; status: string; prompted: boolean; say: string };
  expect(evening).toMatchObject({ ok: true, status: "ok", prompted: true });
  expect(evening.say.length).toBeGreaterThan(5);
  const again = (await (await api.post("/api/daily/close", { data: { action: "prompt" } })).json()) as { prompted: boolean; say: string };
  expect(again.prompted, "plugged in a second time").toBe(false);
  expect(again.say).toBe(evening.say);

  expect(localSql(`select (prompted_at is not null)::text, (evening_prompted_at is not null)::text from public.day_plans where created_by = '${TESS.id}' and day = '${TODAY}'`)[0]).toEqual(["true", "true"]);
  expect(pushed(), "the phone showed it: the server sent nothing").toBe(before);

  // A closed day is not offered again.
  await api.post("/api/daily/close", { data: {} });
  expect(((await (await api.post("/api/daily/close", { data: { action: "prompt" } })).json()) as { prompted: boolean; say: string })).toMatchObject({ prompted: false, say: "Day closed." });
});
