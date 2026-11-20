/**
 * The weekly close-out, the monthly measures, the notices before a switch
 * and the Boys' group routes (0174; master run §6, Stream B part 2), end to
 * end as Tess: her space is quiet, so the week's fill is made of this
 * spec's plans and nothing else.
 *
 * A person has one close-out a week and one plan a day, so every test
 * starts by removing Tess's close-outs and plans (SQL, on tables only this
 * feature writes).
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_CRON_SECRET } from "./support/env.ts";
import { personalSpace, TESS } from "./support/users.ts";

const RUN = `E2E-closeout-${Date.now().toString(36)}`;
const london = (offsetDays = 0): string => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
const TODAY = london();
const londonHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(new Date()));

type View = {
  week: string;
  row: { started_at: string | null; finished_at: string | null; plan: string | null; report: string | null; section_key: string | null; section_decision: string | null; section_why: string | null; screen_minutes: number | null; fill: unknown; lifetime: { weeks_closed: number } | null; measures: unknown };
  box_left: number | null;
  box_minutes: number;
  fill: { week: string; win_days: number; finished: number; started: number; planned: number; dropped: number; days_planned: number };
  lifetime: { win_days: number; finished: number; weeks_closed: number; days: number };
  section: { key: string; label: string; question: string } | null;
  measures: { current: { month: string }; previous: { month: string } | null; rows: Array<{ key: string; now: string; before: string }> } | null;
  cards: Array<{ id: string; source: string; title: string }>;
  slot: { day: number; time: string };
};

const made: string[] = [];
let api: APIRequestContext;
let space: string;

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
  space = personalSpace(TESS);
});

test.afterAll(async () => {
  reset();
  await api.dispose();
});

function reset(): void {
  localSql(`delete from public.weekly_closeouts where created_by = '${TESS.id}'`);
  localSql(`delete from public.day_plans where created_by = '${TESS.id}'`);
  localSql(`delete from public.interruptions where created_by = '${TESS.id}'`);
  localSql(`delete from public.body_metrics where created_by = '${TESS.id}' and notes like '${RUN}%'`);
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")})`);
  made.length = 0;
}

test.beforeEach(() => reset());

async function ticket(title: string, fields: Record<string, unknown> = {}): Promise<string> {
  const res = await api.post("/api/tickets", { data: { title: `${RUN} ${title}`, category: "next", ...fields } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  const body = (await res.json()) as { ticket?: { id: string }; task?: { id: string } };
  const id = (body.ticket ?? body.task!).id;
  made.push(id);
  return id;
}

/** A closed plan on a day with items in the given states; item one is the win. */
async function plan(day: string, states: string[]): Promise<void> {
  const [planId] = localSql(
    `insert into public.day_plans (day, status, space_id, created_by, proposed_at, accepted_at, closed_at) values ('${day}', 'closed', '${space}', '${TESS.id}', '${day}T07:00:00Z', '${day}T08:30:00Z', '${day}T21:00:00Z') returning id`,
  )[0];
  for (let i = 0; i < states.length; i++) {
    const t = await ticket(`${day} item ${i}`);
    const started = states[i] === "planned" || states[i] === "moved" ? "null" : `'${day}T09:0${i}:00Z'`;
    const finished = states[i] === "done" || states[i] === "good_enough" ? `'${day}T10:0${i}:00Z'` : "null";
    localSql(
      `insert into public.day_plan_items (plan_id, ticket_id, position, is_win, state, shown_minutes, first_step, space_id, created_by, started_at, finished_at) values ('${planId}', '${t}', ${i}, ${i === 0}, '${states[i]}', 10, 'step', '${space}', '${TESS.id}', ${started}, ${finished})`,
    );
  }
}

async function view(): Promise<View> {
  const res = await api.get("/api/daily/closeout");
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as View;
}

async function act(body: Record<string, unknown>): Promise<{ status: number; body: View & { error?: string } }> {
  const res = await api.post("/api/daily/closeout", { data: body });
  return { status: res.status(), body: await res.json() };
}

/** "2026-W47" for a Monday. */
function weekOf(mon: string): string {
  const [y, m, d] = mon.split("-").map(Number);
  const thursday = new Date(Date.UTC(y, m - 1, d + 3));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday of the current London week. */
function monday(): string {
  const [y, m, d] = TODAY.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (dow - 1));
  return date.toISOString().slice(0, 10);
}

test("the week's fill and the lifetime totals come from the plans, with nothing about what was not done", async () => {
  await plan(TODAY, ["done", "started", "planned", "dropped"]);
  // A plan from long ago counts for lifetime, not for the week.
  await plan("2026-01-05", ["done", "moved"]);

  const v = await view();
  expect(v.week).toBe(weekOf(monday()));
  expect(v.row.started_at).toBeNull();
  expect(v.box_left).toBeNull();
  expect(v.box_minutes).toBe(45);
  expect(v.slot).toEqual({ day: 7, time: "18:00" });
  expect(v.fill).toEqual({ week: v.week, win_days: 1, finished: 1, started: 2, planned: 4, dropped: 1, days_planned: 1 });
  expect(v.lifetime).toEqual({ win_days: 2, finished: 2, weeks_closed: 0, days: 2 });
  expect(v.section, "nothing of Tess's has gone quiet: nothing is raised").toBeNull();
  expect(v.cards).toEqual([]);
  expect(localSql(`select count(*) from public.weekly_closeouts where created_by = '${TESS.id}'`)[0][0], "asking makes this week's row, once").toBe("1");
  expect((await view()).week).toBe(v.week);
  expect(localSql(`select count(*) from public.weekly_closeouts where created_by = '${TESS.id}'`)[0][0]).toBe("1");
});

test("the box begins with the plan said; the week closes with the report, the Screen Time and the fill kept", async () => {
  await plan(TODAY, ["done", "planned"]);
  const started = await act({ action: "start", plan: "Clear the inbox and pick next week's one thing." });
  expect(started.status).toBe(200);
  expect(started.body.row.plan).toBe("Clear the inbox and pick next week's one thing.");
  expect(started.body.row.started_at).not.toBeNull();
  expect(started.body.box_left).toBe(45);

  // Starting twice does not restart the box.
  const again = await act({ action: "start", plan: "something else" });
  expect(again.body.row.plan).toBe("Clear the inbox and pick next week's one thing.");

  const finished = await act({ action: "finish", report: "Done in thirty.", screen_minutes: 540, partner_answers: { helping: "Mostly", costing: "Not much" } });
  expect(finished.status).toBe(200);
  expect(finished.body.row.finished_at).not.toBeNull();
  expect(finished.body.row.report).toBe("Done in thirty.");
  expect(finished.body.row.screen_minutes).toBe(540);
  expect(finished.body.row.fill).toMatchObject({ win_days: 1, finished: 1, started: 1, planned: 2 });
  expect(finished.body.row.lifetime).toMatchObject({ weeks_closed: 1 });
  expect(finished.body.lifetime.weeks_closed).toBe(1);
  expect(finished.body.cards).toEqual([]);
  expect(localSql(`select partner_answers->>'helping' from public.weekly_closeouts where created_by = '${TESS.id}'`)[0][0]).toBe("Mostly");

  // Closing again changes nothing.
  const twice = await act({ action: "finish", report: "again" });
  expect(twice.body.row.report).toBe("Done in thirty.");
});

test("one quiet section is raised with the direct question; Keep / Pause / Retire and why are kept", async () => {
  // Body measurements go quiet after three weeks; one from a month ago is a gap of four weeks.
  localSql(`insert into public.body_metrics (date, source, notes, space_id, created_by, created_at) values ('2026-01-01', 'manual', '${RUN} old', '${space}', '${TESS.id}', now() - interval '31 days')`);
  const v = await view();
  expect(v.section).toMatchObject({ key: "body", label: "Body measurements" });
  expect(v.section!.question).toBe("Body measurements has not been touched for 4 weeks. Why? Keep it, pause it, or retire it.");

  const bad = await act({ action: "section", key: "body", decision: "maybe", why: "" });
  expect(bad.status).toBe(400);

  const paused = await act({ action: "section", key: "body", decision: "pause", why: "Using the Telegram bot instead for now." });
  expect(paused.status).toBe(200);
  expect(paused.body.row).toMatchObject({ section_key: "body", section_decision: "pause", section_why: "Using the Telegram bot instead for now." });
  expect(paused.body.section?.key).toBe("body");
  // The dormant marks themselves are unchanged: the feature is still quiet, the question is what the close-out asked.
  const dormant = (await (await api.get("/api/dormant")).json()) as { quiet: Array<{ key: string }> };
  expect(dormant.quiet.map((q) => q.key)).toContain("body");
});

test("a paused section is not raised again for four weeks; a retired one not until it is used", async () => {
  localSql(`insert into public.body_metrics (date, source, notes, space_id, created_by, created_at) values ('2026-01-01', 'manual', '${RUN} old', '${space}', '${TESS.id}', now() - interval '40 days')`);
  // Last week's close-out paused body measurements.
  localSql(`insert into public.weekly_closeouts (week, space_id, created_by, section_key, section_decision, finished_at, created_at) values ('2000-W01', '${space}', '${TESS.id}', 'body', 'pause', now() - interval '7 days', now() - interval '7 days')`);
  expect((await view()).section).toBeNull();
  // Five weeks ago it would be raised again.
  localSql(`update public.weekly_closeouts set finished_at = now() - interval '35 days', created_at = now() - interval '35 days' where week = '2000-W01' and created_by = '${TESS.id}'`);
  expect((await view()).section?.key).toBe("body");
  // Retired: stays settled however long ago, until the feature is used after the retirement.
  localSql(`update public.weekly_closeouts set section_decision = 'retire' where week = '2000-W01' and created_by = '${TESS.id}'`);
  expect((await view()).section).toBeNull();
  localSql(`update public.body_metrics set created_at = now() - interval '25 days' where notes = '${RUN} old'`);
  expect((await view()).section?.key).toBe("body");
});

test("the measures page lists each month measured, this month beside the one before", async () => {
  expect(await (await api.get("/api/daily/measures")).json()).toEqual({ months: [] });
  const measures = (month: string, win: number) => JSON.stringify({ month, win_rate: win, start_latency_min: 12, finish_ratio: 0.8, stuck_over_14_days: 1, plan_accuracy: 0.75, return_days: 2, nudge_response: 0.5, screen_minutes_per_week: 600, partner: { helping: null, costing: null }, days_planned: 20, days_in_month: 31 });
  localSql(`insert into public.weekly_closeouts (week, space_id, created_by, finished_at, measures) values ('2026-W36', '${space}', '${TESS.id}', now(), '${measures("2026-08", 2.5)}'), ('2026-W40', '${space}', '${TESS.id}', now(), '${measures("2026-09", 3.5)}')`);
  const res = (await (await api.get("/api/daily/measures")).json()) as { months: Array<{ month: string; rows: Array<{ key: string; now: string; before: string }> }> };
  expect(res.months.map((m) => m.month)).toEqual(["2026-09", "2026-08"]);
  expect(res.months[0].rows[0]).toMatchObject({ key: "win_rate", now: "3.5", before: "2.5" });
  expect(res.months[1].rows[0]).toMatchObject({ key: "win_rate", now: "2.5", before: "—" });
});

test("the page: begin, the box, the section, close the week", async ({ page }) => {
  await plan(TODAY, ["done"]);
  localSql(`insert into public.body_metrics (date, source, notes, space_id, created_by, created_at) values ('2026-01-01', 'manual', '${RUN} old', '${space}', '${TESS.id}', now() - interval '31 days')`);
  await page.goto("/closeout");
  const root = page.getByTestId("closeout");
  await expect(root).toBeVisible();
  await expect(page.getByTestId("closeout-fill")).toContainText("1 win day");
  await page.getByTestId("closeout-plan").fill("Pick next week's one thing.");
  await page.getByTestId("closeout-begin").click();
  await expect(page.getByTestId("closeout-box")).toContainText("45 min");
  await expect(page.getByTestId("closeout-section")).toContainText("Body measurements has not been touched for 4 weeks. Why?");
  await page.getByTestId("closeout-why").fill("Capturing by voice now.");
  await page.getByTestId("closeout-keep").click();
  await expect(page.getByTestId("closeout-section")).toContainText("Body measurements: Keep.");
  await page.getByTestId("closeout-report").fill("Quick one.");
  await page.getByTestId("closeout-close").click();
  await expect(root).toContainText("Week closed.");
  expect(localSql(`select section_decision || '|' || report from public.weekly_closeouts where created_by = '${TESS.id}'`)[0][0]).toBe("keep|Quick one.");
});

test("a notice goes before a ticket with a time today, once a stage, on the tick, inside the budget", async () => {
  const hour = londonHour();
  test.skip(hour >= 22 || hour < 7, "quiet hours: nothing app-started is sent, and that is the point");
  // A thing at a time eight minutes from now, London.
  const at = new Date(Date.now() + 8 * 60_000);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const id = await ticket("dentist", { scheduled_on: TODAY });
  localSql(`update public.tickets set time_from = '${hhmm}:00' where id = '${id}'`);

  const run = async () => {
    const res = await api.get("/api/cron/daily-prompts", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()) as { notices: number };
  };
  await run();
  const rows = () => localSql(`select kind, channel, counted::text, title from public.interruptions where created_by = '${TESS.id}' and ticket_id = '${id}' order by at`);
  expect(rows()).toHaveLength(1);
  expect(rows()[0][0]).toBe("notice10");
  expect(rows()[0][1], "Tess has no phone or Telegram here: the wall is the channel left").toBe("wall");
  expect(rows()[0][2], "a notice counts against the day's three").toBe("true");
  expect(rows()[0][3]).toMatch(new RegExp(`^${RUN} dentist in [0-9] min\\.$`));
  // The same tick again says nothing more.
  await run();
  expect(rows()).toHaveLength(1);
  // Unauthorised knocks are refused.
  expect((await api.get("/api/cron/daily-prompts")).status()).toBe(401);
});

test("the Boys' routes: nothing without the secret, and the setup view names every token", async () => {
  expect((await api.post("/api/telegram/boys/da_boi", { data: { update_id: 1 } })).status()).toBe(401);
  expect((await api.post("/api/telegram/boys/nobody", { data: { update_id: 1 } })).status()).toBe(401);
  expect((await api.get("/api/telegram/boys/setup")).status()).toBe(401);
  const res = await api.get("/api/telegram/boys/setup", { headers: { authorization: `Bearer ${E2E_API_SECRET}` } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { group_chat_set: boolean; agents: Array<{ agentId: string; env: string; token_set: boolean; webhook_url: string }> };
  expect(body.agents.map((a) => a.env)).toEqual(["TELEGRAM_BOT_TOKEN_DA_BOI", "TELEGRAM_BOT_TOKEN_FITNESS", "TELEGRAM_BOT_TOKEN_FINANCE", "TELEGRAM_BOT_TOKEN_TASKS", "TELEGRAM_BOT_TOKEN_NUTRITION", "TELEGRAM_BOT_TOKEN_FOUNDER", "TELEGRAM_BOT_TOKEN_ENGINEER"]);
  expect(body.agents.every((a) => a.token_set === false)).toBe(true);
  expect(body.agents[0].webhook_url).toMatch(/\/api\/telegram\/boys\/da_boi$/);
});
