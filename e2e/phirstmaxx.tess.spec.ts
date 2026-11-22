/**
 * PhirstMaxx (0185; claude/phirstmaxx-spec.md), end to end. Tess and Phil
 * share a team made by SQL, as the family spec does; the family space is set
 * up through the API because PhirstMaxx lives in it (spec D5). Tess drives
 * the app in a browser and over its API; Phil's side goes through the API
 * with the secret that acts as him. Every call names the space.
 *
 * What is checked: a drop answers 202 and the same client id is one drop;
 * the inbox is POST-only with an unknown token a plain 404; five painted
 * ranges across four days save as one transaction and one undo row;
 * replace and trim do what they say; undo puts the last save back; and the
 * pages open. Research itself is a queued job and is not run here.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { londonInstant, shiftDate, weekStartOf } from "../lib/phirstmaxx/grid.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, TESS } from "./support/users.ts";

const RUN = `E2E-pm-${Date.now().toString(36)}`;
const TEAM = randomUUID();
const SPACE = randomUUID();
const q = `?space=${SPACE}`;
// a week three weeks on, so nothing else on the local stack sits in it
const WEEK = weekStartOf(shiftDate(new Date().toISOString().slice(0, 10), 21));
/** An ISO instant for a London wall-clock time on a day of the week (0 = Monday). */
const at = (dow: number, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(londonInstant(shiftDate(WEEK, dow), h * 60 + m)).toISOString();
};
const count = (sql: string) => Number(localSql(sql)[0]?.[0] ?? "0");

type WeekData = { me: string; blocks: Array<{ id: string; person_id: string; starts_at: string; ends_at: string; type_id: string }>; types: Array<{ id: string; name: string }>; canUndo: boolean; windows: unknown[] };
type SaveReply = { batch_id: string; created: number; removed: number; trimmed: number; week: WeekData };

let phil: APIRequestContext;
let nobody: APIRequestContext;
let workType: string;
let busyType: string;
let freeType: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright, request }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  nobody = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] } });
  localSql(`delete from public.family_profile where space_id in (select s.id from public.spaces s join public.teams t on t.id = s.team_id where t.name like 'E2E-pm-%')`);
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${RUN} household', '${RUN.toLowerCase()}', '${PHIL.id}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${SPACE}', 'team', '${TEAM}')`);
  localSql(`update public.teams set space_id = '${SPACE}' where id = '${TEAM}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL.id}', 'owner'), ('${TEAM}', '${TESS.id}', 'member')`);
  const made = await request.post("/api/family", { data: { action: "setup", space: SPACE } });
  expect(made.status(), await made.text()).toBe(201);
  await request.post("/api/family", { data: { action: "ack", space: SPACE } });
});

test.afterAll(async () => {
  localSql(`delete from public.jobs where kind = 'pm_research' and payload->>'space_id' = '${SPACE}'`);
  for (const t of [
    "pm_plan_legs", "pm_plan_responses", "pm_notifications", "pm_plans", "pm_travel", "pm_thing_facts", "pm_research_runs", "pm_drops", "pm_things", "pm_api_calls",
    "pm_undo", "pm_patterns", "pm_waking", "pm_blocks", "pm_block_types", "pm_pets", "pm_people", "pm_places",
    "family_entries", "family_list_items", "family_lists", "family_acks", "family_profile", "tickets",
  ]) {
    localSql(`delete from public.${t} where space_id = '${SPACE}'`);
  }
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`update public.teams set space_id = null where id = '${TEAM}'`);
  localSql(`delete from public.spaces where id = '${SPACE}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
  await phil.dispose();
  await nobody.dispose();
});

test("the first visit seeds the section: starter block types and a row for each of them", async ({ request }) => {
  const res = await request.get(`/api/phirstmaxx/week${q}&week=${WEEK}`);
  expect(res.status(), await res.text()).toBe(200);
  const week = (await res.json()) as WeekData & { people: Array<{ id: string }> };
  expect(week.me).toBe(TESS.id);
  expect(week.types.map((t) => t.name)).toEqual(expect.arrayContaining(["Work", "Shift", "Busy", "Free", "Walk", "Sit", "Faith"]));
  expect(week.people.map((p) => p.id).sort()).toEqual([PHIL.id, TESS.id].sort());
  expect(week.blocks).toEqual([]);
  expect(week.canUndo).toBe(false);
  workType = week.types.find((t) => t.name === "Work")!.id;
  busyType = week.types.find((t) => t.name === "Busy")!.id;
  freeType = week.types.find((t) => t.name === "Free")!.id;
  expect(count(`select count(*) from public.pm_people where space_id = '${SPACE}'`)).toBe(2);
  // nothing here is public
  expect((await nobody.get(`/api/phirstmaxx/week${q}`)).status()).toBeLessThan(500);
  expect([401, 302, 307]).toContain((await nobody.get(`/api/phirstmaxx/week${q}`)).status());
});

test("a drop answers 202 at once and research is queued; the same client id twice is one drop", async ({ request }) => {
  const clientId = `${RUN}-drop-1`;
  const started = Date.now();
  const first = await request.post("/api/phirstmaxx/drops", { data: { space: SPACE, client_id: clientId, url: "https://example.com/hackfall-woods", text: "Looks lovely in autumn" } });
  expect(first.status(), await first.text()).toBe(202);
  expect(Date.now() - started, "under a second (spec §2.1)").toBeLessThan(1000 + 1500); // the first request also compiles the route on a dev server
  const a = (await first.json()) as { id: string; duplicate: boolean };
  expect(a.duplicate).toBe(false);

  const again = await request.post("/api/phirstmaxx/drops", { data: { space: SPACE, client_id: clientId, url: "https://example.com/hackfall-woods" } });
  expect(again.status()).toBe(202);
  const b = (await again.json()) as { id: string; duplicate: boolean };
  expect(b).toEqual({ id: a.id, duplicate: true, thing_id: null });
  expect(count(`select count(*) from public.pm_drops where space_id = '${SPACE}' and client_id = '${clientId}'`)).toBe(1);
  expect(localSql(`select kind, lane from public.jobs where kind = 'pm_research' and payload->>'drop_id' = '${a.id}'`)[0], "research is a queued job, separate from saving").toEqual(["pm_research", "cloud"]);

  expect((await request.post("/api/phirstmaxx/drops", { data: { space: SPACE, client_id: `${RUN}-empty` } })).status(), "nothing to drop").toBe(400);
  const list = (await (await request.get(`/api/phirstmaxx/drops${q}`)).json()) as { drops: Array<{ id: string; url: string | null; thing: unknown }> };
  expect(list.drops.find((d) => d.id === a.id)).toMatchObject({ url: "https://example.com/hackfall-woods", thing: null });
  // Phil sees the same drop
  const his = (await (await phil.get(`/api/phirstmaxx/drops${q}`)).json()) as { drops: Array<{ id: string }> };
  expect(his.drops.map((d) => d.id)).toContain(a.id);
});

test("the inbox takes POST only; an unknown token is a 404 and a real one drops as its owner with no session", async ({ request }) => {
  const fake = `pmi_${"0".repeat(40)}`;
  expect((await nobody.get(`/api/phirstmaxx/inbox/${fake}`)).status(), "GET is not defined").toBe(405);
  const wrong = await nobody.post(`/api/phirstmaxx/inbox/${fake}`, { data: { url: "https://example.com/nope" } });
  expect(wrong.status()).toBe(404);
  expect(await wrong.text()).not.toContain("token");
  expect((await nobody.post(`/api/phirstmaxx/inbox/not-a-token`, { data: { url: "https://example.com/nope" } })).status()).toBe(404);

  const rotated = await request.post("/api/phirstmaxx/settings", { data: { space: SPACE, action: "rotate_inbox_token" } });
  expect(rotated.status(), await rotated.text()).toBe(200);
  const { token, hint } = (await rotated.json()) as { token: string; hint: string };
  expect(token).toMatch(/^pmi_[0-9a-f]{40}$/);
  expect(hint).toBe(`…${token.slice(-4)}`);
  // the row keeps a hash and the hint, never the token
  expect(localSql(`select inbox_token_hash, inbox_token_hint from public.pm_people where space_id = '${SPACE}' and person_id = '${TESS.id}'`)[0]).toEqual([expect.not.stringContaining(token.slice(4)), hint]);
  const settings = (await (await request.get(`/api/phirstmaxx/settings${q}`)).json()) as { inbox: { hint: string } };
  expect(JSON.stringify(settings)).not.toContain(token);

  const posted = await nobody.post(`/api/phirstmaxx/inbox/${token}`, { data: { url: `https://example.com/${RUN}-inbox` } });
  expect(posted.status(), await posted.text()).toBe(202);
  const { id } = (await posted.json()) as { id: string };
  expect(localSql(`select person_id, source from public.pm_drops where id = '${id}'`)[0]).toEqual([TESS.id, "inbox"]);
  // the same thing again from a sender with no id of its own is still one drop
  expect(((await (await nobody.post(`/api/phirstmaxx/inbox/${token}`, { data: { url: `https://example.com/${RUN}-inbox` } })).json()) as { duplicate: boolean }).duplicate).toBe(true);
});

test("five ranges across four days save in one go: five blocks, one undo row, the grid redrawn from the answer", async ({ request }) => {
  const ranges = [
    { start: at(0, "09:00"), end: at(0, "17:00") },
    { start: at(1, "09:00"), end: at(1, "13:00") },
    { start: at(1, "14:00"), end: at(1, "17:00") },
    { start: at(3, "08:00"), end: at(3, "16:00") },
    { start: at(5, "10:00"), end: at(5, "12:00") },
  ];
  expect((await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "save", week: WEEK, ranges: [{ start: at(0, "09:10"), end: at(0, "10:00") }], type_id: workType, firmness: "firm" } })).status(), "half hours only").toBe(400);
  const saved = await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "save", week: WEEK, ranges, type_id: workType, firmness: "firm", overlap_policy: "replace" } });
  expect(saved.status(), await saved.text()).toBe(201);
  const r = (await saved.json()) as SaveReply;
  expect(r).toMatchObject({ created: 5, removed: 0, trimmed: 0 });
  expect(r.week.blocks.filter((b) => b.person_id === TESS.id)).toHaveLength(5);
  expect(r.week.canUndo).toBe(true);
  expect(count(`select count(*) from public.pm_blocks where space_id = '${SPACE}' and person_id = '${TESS.id}'`)).toBe(5);
  expect(count(`select count(*) from public.pm_undo where space_id = '${SPACE}'`)).toBe(1);
  expect(localSql(`select distinct entered_by from public.pm_blocks where space_id = '${SPACE}'`)).toEqual([[TESS.id]]);
});

test("replace cuts the block already there; trim cuts the new range around it; undo puts the last save back", async ({ request }) => {
  // Monday 12:00–14:00 Busy over the 09:00–17:00 Work block: Work is split either side
  const replaced = await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "save", week: WEEK, ranges: [{ start: at(0, "12:00"), end: at(0, "14:00") }], type_id: busyType, firmness: "firm", overlap_policy: "replace" } });
  expect(replaced.status(), await replaced.text()).toBe(201);
  expect((await replaced.json()) as SaveReply).toMatchObject({ created: 1, removed: 1, trimmed: 2 });
  const monday = () => localSql(`select to_char(starts_at at time zone 'Europe/London', 'HH24:MI'), to_char(ends_at at time zone 'Europe/London', 'HH24:MI'), type_id from public.pm_blocks where space_id = '${SPACE}' and person_id = '${TESS.id}' and starts_at::date = '${WEEK}' order by starts_at`);
  expect(monday()).toEqual([["09:00", "12:00", workType], ["12:00", "14:00", busyType], ["14:00", "17:00", workType]]);

  // Monday 07:00–10:00 Free, trimmed: only 07:00–09:00 is new, nothing already there changes
  const trimmed = await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "save", week: WEEK, ranges: [{ start: at(0, "07:00"), end: at(0, "10:00") }], type_id: freeType, firmness: "flexible", overlap_policy: "trim" } });
  expect(trimmed.status(), await trimmed.text()).toBe(201);
  expect((await trimmed.json()) as SaveReply).toMatchObject({ created: 1, removed: 0, trimmed: 0 });
  expect(monday()).toEqual([["07:00", "09:00", freeType], ["09:00", "12:00", workType], ["12:00", "14:00", busyType], ["14:00", "17:00", workType]]);

  // undo takes back the trim save alone
  const undone = await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "undo", week: WEEK } });
  expect(undone.status(), await undone.text()).toBe(200);
  expect((await undone.json()) as { removed: number; restored: number; week: WeekData }).toMatchObject({ removed: 1, restored: 0 });
  expect(monday()).toEqual([["09:00", "12:00", workType], ["12:00", "14:00", busyType], ["14:00", "17:00", workType]]);
  expect(count(`select count(*) from public.pm_blocks where space_id = '${SPACE}' and person_id = '${TESS.id}'`)).toBe(7);
  expect((await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "undo", week: WEEK } })).status(), "nothing left to undo").toBe(409);

  // Phil may enter Tess's times; the block records who entered it
  const his = await phil.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "save", week: WEEK, person_id: TESS.id, ranges: [{ start: at(6, "18:00"), end: at(6, "20:00") }], type_id: busyType, firmness: "firm" } });
  expect(his.status(), await his.text()).toBe(201);
  expect(localSql(`select person_id, entered_by from public.pm_blocks where space_id = '${SPACE}' and starts_at = '${at(6, "18:00")}'`)[0]).toEqual([TESS.id, PHIL.id]);
  // a resize off the half hour is refused; on it, taken
  const block = localSql(`select id from public.pm_blocks where space_id = '${SPACE}' and starts_at = '${at(6, "18:00")}'`)[0][0];
  expect((await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "resize", id: block, starts_at: at(6, "18:00"), ends_at: at(6, "20:10") } })).status()).toBe(400);
  expect((await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "resize", id: block, starts_at: at(6, "18:00"), ends_at: at(6, "21:00") } })).status()).toBe(200);
  expect((await request.post("/api/phirstmaxx/week", { data: { space: SPACE, action: "delete", id: block } })).status()).toBe(200);
});

test("a block type in use cannot be removed; one that is not can", async ({ request }) => {
  const used = await request.post("/api/phirstmaxx/settings", { data: { space: SPACE, action: "delete_type", id: workType } });
  expect(used.status()).toBe(409);
  const made = await request.post("/api/phirstmaxx/settings", { data: { space: SPACE, action: "type", name: `${RUN} Choir`, engine_kind: "faith", colour: "#9a7fd1" } });
  expect(made.status(), await made.text()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  expect((await request.post("/api/phirstmaxx/settings", { data: { space: SPACE, action: "type", name: `${RUN} choir`, engine_kind: "faith" } })).status(), "the same name twice").toBe(409);
  expect((await request.post("/api/phirstmaxx/settings", { data: { space: SPACE, action: "delete_type", id } })).status()).toBe(200);
  // the spend cap is the owner's alone
  expect((await request.post("/api/phirstmaxx/settings", { data: { space: SPACE, action: "person", research_cap_pence: 200 } })).status()).toBe(403);
  expect((await phil.post("/api/phirstmaxx/settings", { data: { space: SPACE, action: "person", research_cap_pence: 200 } })).status()).toBe(200);
});

test("the pages open: home, week, things, plans and settings each show their surface", async ({ page }) => {
  await page.goto("/phirstmaxx");
  await expect(page.getByTestId("pm-home")).toBeVisible();
  await expect(page.getByTestId("pm-dropbox")).toBeVisible();
  await expect(page.getByTestId("pm-research-line")).toBeVisible();

  await page.goto(`/phirstmaxx/week?week=${WEEK}`);
  await expect(page.getByTestId("pm-week")).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous week" })).toBeVisible();
  // the blocks saved above are drawn on Tess's half
  await expect(page.getByRole("button", { name: /^Busy, .*set in stone, Tess$/ }).first()).toBeVisible();

  await page.goto("/phirstmaxx/things");
  await expect(page.getByTestId("pm-things")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fits this week" })).toBeVisible();

  await page.goto("/phirstmaxx/plans");
  await expect(page.getByTestId("pm-plans")).toBeVisible();

  await page.goto("/phirstmaxx/settings");
  await expect(page.getByTestId("pm-settings")).toBeVisible();
  await expect(page.getByTestId("pm-settings-inbox")).toContainText("is live");
});
