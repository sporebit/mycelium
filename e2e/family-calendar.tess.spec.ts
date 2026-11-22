/**
 * The Family calendar on Google (0184; family calendar spec §4), end to end,
 * with Google switched off: the e2e server has no Google client and Phil has
 * no tokens, so every Google call answers "not connected". That is the
 * point. What is checked is everything around Google: the status and its
 * words, who may do what, that a write made while Google is unreachable is
 * queued and counted rather than lost, that the daily health check writes
 * the failure down and raises one ticket, that the webhook refuses what it
 * should, and that the lines show on the Family and Calendar pages.
 *
 * A connected calendar is staged by SQL, as the picker would leave it.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_CRON_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, TESS } from "./support/users.ts";

const RUN = `E2E-fcal-${Date.now().toString(36)}`;
const TEAM = randomUUID();
const SPACE = randomUUID();
const CAL = `${RUN.toLowerCase()}@group.calendar.google.com`;
const q = `?space=${SPACE}`;

type Status = {
  connected: boolean;
  calendar: { id: string; summary: string } | null;
  owner_is_me: boolean;
  staleness: { label: string; level: string };
  queue: number;
  queue_line: string | null;
  health: { ok: boolean | null; error: string | null };
  google_connected: boolean;
  needs_reconnect: boolean;
  channel: { on: boolean; error: string | null };
};
let phil: APIRequestContext;
let cron: APIRequestContext;
const status = async (r: APIRequestContext) => ((await (await r.get(`/api/family/calendar${q}`)).json()) as { status: Status }).status;
const sql = (s: string) => localSql(s);
const one = (s: string) => (sql(s)[0]?.[0] ?? "").trim();

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright, request }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  cron = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  sql(`delete from public.family_profile where space_id in (select s.id from public.spaces s join public.teams t on t.id = s.team_id where t.name like 'E2E-f%')`);
  sql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${RUN} household', '${RUN.toLowerCase()}', '${PHIL.id}')`);
  sql(`insert into public.spaces (id, kind, team_id) values ('${SPACE}', 'team', '${TEAM}')`);
  sql(`update public.teams set space_id = '${SPACE}' where id = '${TEAM}'`);
  sql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL.id}', 'owner'), ('${TEAM}', '${TESS.id}', 'member')`);
  const made = await request.post("/api/family", { data: { action: "setup", space: SPACE } });
  expect(made.status(), await made.text()).toBe(201);
  await request.post("/api/family", { data: { action: "ack", space: SPACE } });
});

test.afterAll(async () => {
  sql(`delete from public.jobs where kind = 'family_calendar_push' and payload->>'space_id' = '${SPACE}'`);
  sql(`delete from public.tickets where meta @> '{"family_calendar":"reconnect"}' and title like '%Family calendar%' and owner = '${PHIL.id}'`);
  for (const t of ["family_calendar_sync_log", "family_calendar_sync", "family_entries", "family_list_items", "family_lists", "family_acks", "family_profile", "tickets"]) sql(`delete from public.${t} where space_id = '${SPACE}'`);
  sql(`delete from public.team_members where team_id = '${TEAM}'`);
  sql(`update public.teams set space_id = null where id = '${TEAM}'`);
  sql(`delete from public.spaces where id = '${SPACE}'`);
  sql(`delete from public.teams where id = '${TEAM}'`);
  await phil.dispose();
  await cron.dispose();
});

test("nothing is connected to begin with, and nobody can act on Google without a connection of their own", async ({ request }) => {
  expect((await request.get(`/api/family/calendar${q}`)).status()).toBe(200);
  const s = await status(request);
  expect(s).toMatchObject({ connected: false, calendar: null, google_connected: false, queue: 0, queue_line: null, needs_reconnect: false });
  expect(s.staleness).toEqual({ label: "Never synced", level: "never" });
  for (const action of [{ action: "choose", calendar_id: CAL }, { action: "create" }, { action: "share", email: "kirsty@example.com" }, { action: "sync" }]) {
    const r = await request.post("/api/family/calendar", { data: { ...action, space: SPACE } });
    expect(r.status(), `${action.action}: ${await r.text()}`).toBe(409);
  }
  expect((await request.post("/api/family/calendar", { data: { action: "dance", space: SPACE } })).status()).toBe(400);
});

test("the API is not public: no session, no status; the webhook has no GET", async ({ playwright }) => {
  const nobody = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] } });
  const r = await nobody.get(`/api/family/calendar${q}`);
  expect([401, 302, 307]).toContain(r.status());
  // the push address is public for POST (Google carries no session) but answers nothing to a GET
  expect((await nobody.get("/api/google/push")).status()).toBe(405);
  // a POST with no channel, or a made-up one, is swallowed: 200 and nothing learned
  expect((await nobody.post("/api/google/push")).status()).toBe(200);
  const probe = await nobody.post("/api/google/push", { headers: { "x-goog-channel-id": randomUUID(), "x-goog-channel-token": "guess", "x-goog-resource-state": "exists" } });
  expect(probe.status()).toBe(200);
  expect(await probe.text()).toBe("");
  await nobody.dispose();
});

test("a connected calendar (staged as the picker leaves it) shows its name, whose it is, and when it last synced", async ({ request }) => {
  const threeMinAgo = new Date(Date.now() - 3 * 60_000).toISOString();
  sql(`insert into public.family_calendar_sync (space_id, calendar_id, calendar_summary, owner_user_id, last_synced_at, health_ok, health_checked_at)
       values ('${SPACE}', '${CAL}', 'Family', '${PHIL.id}', '${threeMinAgo}', true, now())`);
  const s = await status(request);
  expect(s.connected).toBe(true);
  expect(s.calendar).toEqual({ id: CAL, summary: "Family" });
  expect(s.owner_is_me, "Tess did not connect it").toBe(false);
  expect(s.staleness).toEqual({ label: "Last synced 3 min ago", level: "ok" });
  expect(s.needs_reconnect).toBe(false);
  expect(s.channel.on).toBe(false);
  // the owner's rights are the owner's
  expect((await request.post("/api/family/calendar", { data: { action: "share", email: "kirsty@example.com", space: SPACE } })).status()).toBe(403);
  expect((await request.post("/api/family/calendar", { data: { action: "disconnect", space: SPACE } })).status()).toBe(403);
  const asPhil = await status(phil);
  expect(asPhil.owner_is_me).toBe(true);
  // the calendar page carries the same line for both of them
  for (const who of [request, phil]) {
    const cal = (await (await who.get("/api/calendar")).json()) as { familySync?: { label: string; level: string } | null };
    expect(cal.familySync).toMatchObject({ label: "Last synced 3 min ago", level: "ok" });
  }
});

test("an appointment added while Google is unreachable is queued, counted, retried by the cloud lane, and never dropped", async ({ request }) => {
  const at = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const made = await request.post("/api/family/entries", { data: { space: SPACE, kind: "appointment", title: `${RUN} midwife`, starts_at: at, ends_at: new Date(Date.parse(at) + 45 * 60_000).toISOString(), place: "Health centre" } });
  expect(made.status(), await made.text()).toBe(201);
  const row = ((await made.json()) as { row: { id: string } }).row;
  // the save went through; the push did not reach Google (Phil has no tokens here) and sits on the queue
  const s = await status(request);
  expect(s.queue).toBe(1);
  expect(s.queue_line).toBe("1 change waiting to reach Google");
  expect(one(`select count(*) from public.jobs where kind = 'family_calendar_push' and payload->>'entry_id' = '${row.id}' and status = 'queued'`)).toBe("1");
  expect(one(`select string_agg(action, ',' order by at) from public.family_calendar_sync_log where space_id = '${SPACE}' and entry_id = '${row.id}'`)).toBe("queued");
  // the list says it is not on Google, and carries the end
  const list = (await (await request.get(`/api/family/entries${q}`)).json()) as { entries: Array<{ id: string; on_google: boolean; ends_at: string | null; all_day: boolean }> };
  const mine = list.entries.find((e) => e.id === row.id)!;
  expect(mine).toMatchObject({ on_google: false, all_day: false });
  expect(mine.ends_at).toBeTruthy();

  // the cloud lane picks it up, fails again (still no Google) and puts it back with a later run_after; attempt counted
  const run = await cron.get("/api/cron/jobs");
  expect(run.status(), await run.text()).toBe(200);
  const out = (await run.json()) as { claimed: number; done: number; failed: number; kinds: string[] };
  expect(out.kinds).toContain("family_calendar_push");
  expect(out.claimed).toBeGreaterThanOrEqual(1);
  expect(one(`select status || ':' || attempts from public.jobs where kind = 'family_calendar_push' and payload->>'entry_id' = '${row.id}'`)).toBe("queued:1");
  expect((await status(request)).queue, "still waiting, not lost").toBe(1);
  // editing it again does not make a second job for the same change
  expect((await request.patch(`/api/family/entries/${row.id}`, { data: { space: SPACE, place: "Hospital" } })).status()).toBe(200);
  expect(one(`select count(*) from public.jobs where kind = 'family_calendar_push' and payload->>'entry_id' = '${row.id}'`)).toBe("2");
  expect(one(`select string_agg(distinct payload->>'action', ',') from public.jobs where kind = 'family_calendar_push' and payload->>'entry_id' = '${row.id}'`)).toBe("create,update");
});

test("the tick pulls, finds Google refusing, and the daily health check writes it down, flags Reconnect needed and raises one ticket", async ({ request }) => {
  sql(`update public.family_calendar_sync set last_synced_at = now() - interval '2 days', health_checked_at = null where space_id = '${SPACE}'`);
  expect((await status(request)).staleness.level).toBe("red");
  const before = Number(one(`select count(*) from public.tickets where meta @> '{"family_calendar":"reconnect"}' and owner = '${PHIL.id}' and completed_at is null and cancelled_at is null and deleted_at is null`));

  const tick = await cron.get("/api/cron/family-calendar");
  expect(tick.status(), await tick.text()).toBe(200);
  const out = (await tick.json()) as { spaces: number; pulled: number; health: number; errors: string[] };
  expect(out.spaces).toBeGreaterThanOrEqual(1);
  expect(out.health).toBeGreaterThanOrEqual(1);

  const s = await status(request);
  expect(s.health.ok).toBe(false);
  expect(s.health.error).toBeTruthy();
  expect(s.needs_reconnect).toBe(true);
  expect(one(`select health_nudged_on::text from public.family_calendar_sync where space_id = '${SPACE}'`)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const after = Number(one(`select count(*) from public.tickets where meta @> '{"family_calendar":"reconnect"}' and owner = '${PHIL.id}' and completed_at is null and cancelled_at is null and deleted_at is null`));
  expect(after, "one ticket, for the owner").toBe(before + 1);
  // a second tick the same day does not add another
  expect((await cron.get("/api/cron/family-calendar")).status()).toBe(200);
  expect(Number(one(`select count(*) from public.tickets where meta @> '{"family_calendar":"reconnect"}' and owner = '${PHIL.id}' and completed_at is null and cancelled_at is null and deleted_at is null`))).toBe(after);
  // the calendar page line turns to the failure
  const cal = (await (await request.get("/api/calendar")).json()) as { familySync?: { level: string; error: string | null } | null };
  expect(cal.familySync?.error).toBeTruthy();
});

test("the Family page shows the calendar tab, the header line and the reconnect notice; the Calendar page shows its line", async ({ page }) => {
  await page.goto(`/family?tab=calendar`);
  await expect(page.getByTestId("family-calendar")).toBeVisible();
  await expect(page.getByTestId("family-calendar")).toContainText("Family");
  await expect(page.getByTestId("family-calendar-reconnect")).toContainText("Reconnect needed");
  await expect(page.getByTestId("family-calendar-reconnect"), "only the owner can reconnect, and Tess is not").toContainText(/Only .* can reconnect/);
  await expect(page.getByTestId("family-calendar-queue")).toContainText("waiting to reach Google");
  await expect(page.getByTestId("family-calendar-owner"), "the share and disconnect controls are the owner's").toHaveCount(0);
  await expect(page.getByTestId("family-sync-line")).toContainText("Reconnect needed");
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();

  await page.goto("/organisation/calendar");
  await expect(page.getByTestId("family-sync-line")).toContainText(/Family on Google/);
  await expect(page.getByTestId("family-sync-line")).toContainText(/Reconnect needed/);
});
