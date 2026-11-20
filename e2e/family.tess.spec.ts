/**
 * The family space (master run §8; 0171), end to end. Tess and Phil share a
 * team made by SQL (creating one through the app would make Tess an owner,
 * who then needs an authenticator, and her account is shared by every
 * suite). Tess drives the app in a browser and over its API; Phil's side
 * goes through the API with the secret that acts as him. Every call names
 * the space, so a family space left behind by another run cannot be picked
 * up by mistake.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_CRON_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, personalSpace, TESS } from "./support/users.ts";

const RUN = `E2E-fam-${Date.now().toString(36)}`;
const TEAM = randomUUID();
const SPACE = randomUUID();
const TEAM_NAME = `${RUN} household`;
const q = `?space=${SPACE}`;
// a 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

type Overview = {
  space_id: string;
  today: string;
  profile: { due_on: string | null; born_on: string | null };
  members: Array<{ id: string; me: boolean; acked: boolean }>;
  pregnancy: { week: number; label: string; days_to_go: number; signposts: string[] } | null;
  baby: { label: string } | null;
  upcoming: Array<{ id: string; title: string }>;
  letter: { question: string; answered_by: string[] };
  baby_log: unknown;
};
let phil: APIRequestContext;
const view = async (r: APIRequestContext) => ((await (await r.get(`/api/family${q}`)).json()) as { family: Overview | null; candidates?: Array<{ id: string; label: string }> });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  phil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  // a family space left by an earlier run of this file would be the one the page opens
  localSql(`delete from public.family_profile where space_id in (select s.id from public.spaces s join public.teams t on t.id = s.team_id where t.name like 'E2E-fam-%')`);
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${TEAM_NAME}', '${RUN.toLowerCase()}', '${PHIL.id}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${SPACE}', 'team', '${TEAM}')`);
  localSql(`update public.teams set space_id = '${SPACE}' where id = '${TEAM}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL.id}', 'owner'), ('${TEAM}', '${TESS.id}', 'member')`);
});

test.afterAll(async () => {
  // Files go through the app: Supabase refuses a direct delete from its storage table, and removing a row
  // through the API removes its file with it.
  for (const list of ["entries", "household"] as const) {
    const got = (await (await phil.get(`/api/family/${list}${q}`)).json().catch(() => ({}))) as { entries?: Array<{ id: string }>; items?: Array<{ id: string }> };
    for (const row of got.entries ?? got.items ?? []) await phil.delete(`/api/family/${list}/${row.id}${q}`);
  }
  for (const t of ["baby_log", "household_costs", "household_items", "family_list_items", "family_lists", "family_name_votes", "family_names", "family_entries", "family_acks", "family_profile", "jobs", "doc_pages", "doc_spaces", "tickets"]) {
    localSql(`delete from public.${t} where space_id = '${SPACE}'`);
  }
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`update public.teams set space_id = null where id = '${TEAM}'`);
  localSql(`delete from public.spaces where id = '${SPACE}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
  await phil.dispose();
});

test("there is no family space until someone makes one, from a team and never from a personal space", async ({ request }) => {
  const before = await view(request);
  expect(before.family).toBeNull();
  expect(before.candidates).toContainEqual({ id: SPACE, label: TEAM_NAME });
  expect((await request.get(`/api/family/names${q}`)).status()).toBe(404);

  const own = await request.post("/api/family", { data: { action: "setup", space: personalSpace(TESS) } });
  expect(own.status()).toBe(400);
  const made = await request.post("/api/family", { data: { action: "setup", space: SPACE } });
  expect(made.status(), await made.text()).toBe(201);
  expect((await request.post("/api/family", { data: { action: "setup", space: SPACE } })).status(), "once").toBe(409);

  const after = await view(request);
  expect(after.family).toMatchObject({ space_id: SPACE, pregnancy: null, baby: null, baby_log: null });
  expect(after.family!.members.map((m) => m.id).sort()).toEqual([PHIL.id, TESS.id].sort());
  // the starter lists came with it
  const lists = (await (await request.get(`/api/family/list-items${q}`)).json()) as { lists: Array<{ slug: string; items: unknown[]; totals: { items: number; total_pence: number } }> };
  expect(lists.lists.map((l) => l.slug)).toEqual(["hospital-bag", "nursery", "buying"]);
  expect(lists.lists[0].items.length).toBe(18);
  expect(lists.lists[0].totals).toMatchObject({ items: 18, total_pence: 0 });
});

test("each person confirms for themselves that what they add here is shared", async ({ request }) => {
  expect((await view(request)).family!.members.find((m) => m.me)!.acked).toBe(false);
  expect((await request.post("/api/family", { data: { action: "ack", space: SPACE } })).status()).toBe(200);
  const members = (await view(request)).family!.members;
  expect(members.find((m) => m.id === TESS.id)!.acked).toBe(true);
  expect(members.find((m) => m.id === PHIL.id)!.acked, "Phil has not, and she cannot do it for him").toBe(false);
  expect((await view(phil)).family!.members.find((m) => m.me)!.acked).toBe(false);
});

test("the due date sets the week; a date that does not exist is refused", async ({ request }) => {
  expect((await request.patch("/api/family", { data: { space: SPACE, due_on: "2027-02-30" } })).status()).toBe(400);
  const set = await request.patch("/api/family", { data: { space: SPACE, due_on: day(140) } });
  expect(set.status(), await set.text()).toBe(200);
  const p = ((await set.json()) as { family: Overview }).family.pregnancy!;
  // 140 days to go is twenty weeks exactly; a day either side at midnight is still week 19 or 20
  expect([19, 20]).toContain(p.week);
  expect(Math.abs(p.days_to_go - 140)).toBeLessThanOrEqual(1);
  expect(p.signposts.join(" ")).toMatch(/anomaly|MAT B1/);
});

test("the timeline takes a note, an appointment with a time, and a picture; both of them read it", async ({ request }) => {
  const note = await request.post("/api/family/entries", { data: { space: SPACE, kind: "note", title: `${RUN} first kick`, body: "Felt it on the sofa." } });
  expect(note.status(), await note.text()).toBe(201);
  expect((await request.post("/api/family/entries", { data: { space: SPACE, kind: "appointment", title: `${RUN} midwife` } })).status(), "an appointment needs a time").toBe(400);
  const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const appt = await request.post("/api/family/entries", { data: { space: SPACE, kind: "appointment", title: `${RUN} midwife`, starts_at: at, place: "Health centre" } });
  expect(appt.status(), await appt.text()).toBe(201);
  expect((await view(request)).family!.upcoming.map((u) => u.title)).toContain(`${RUN} midwife`);

  const pic = await request.post("/api/family/entries", { multipart: { space: SPACE, title: `${RUN} scan picture`, kind: "scan", file: { name: "scan.png", mimeType: "image/png", buffer: PNG } } });
  expect(pic.status(), await pic.text()).toBe(201);
  const picRow = ((await pic.json()) as { row: { id: string; has_media: boolean; media_path?: string } }).row;
  expect(picRow.has_media).toBe(true);
  expect(picRow.media_path, "the path stays on the server").toBeUndefined();
  expect((await request.post("/api/family/entries", { multipart: { space: SPACE, title: "nope", file: { name: "x.zip", mimeType: "application/zip", buffer: Buffer.from("PK") } } })).status()).toBe(415);

  for (const who of [request, phil]) {
    const list = (await (await who.get(`/api/family/entries${q}`)).json()) as { entries: Array<{ id: string; title: string; week: number | null; has_media: boolean }> };
    expect(list.entries.map((e) => e.title)).toEqual(expect.arrayContaining([`${RUN} first kick`, `${RUN} midwife`, `${RUN} scan picture`]));
    expect([19, 20]).toContain(list.entries.find((e) => e.title === `${RUN} first kick`)!.week);
    const file = await who.get(`/api/family/entries/${picRow.id}/media`);
    expect(file.status()).toBe(200);
    expect((await file.body()).equals(PNG)).toBe(true);
  }
});

test("names: one of each, a vote each, and the ones they both like come first", async ({ request }) => {
  const added = await request.post("/api/family/names", { data: { space: SPACE, name: "Robin" } });
  expect(added.status(), await added.text()).toBe(201);
  const robin = ((await added.json()) as { row: { id: string } }).row.id;
  expect((await request.post("/api/family/names", { data: { space: SPACE, name: " robin " } })).status(), "the same name twice").toBe(409);
  const wren = ((await (await phil.post("/api/family/names", { data: { space: SPACE, name: "Wren" } })).json()) as { row: { id: string } }).row.id;

  expect((await request.post(`/api/family/names/${wren}/vote`, { data: { space: SPACE, vote: 2 } })).status()).toBe(200);
  expect((await request.post(`/api/family/names/${robin}/vote`, { data: { space: SPACE, vote: -1 } })).status()).toBe(200);
  expect((await request.post(`/api/family/names/${robin}/vote`, { data: { space: SPACE, vote: 7 } })).status()).toBe(400);
  expect((await phil.post(`/api/family/names/${wren}/vote`, { data: { space: SPACE, vote: 1 } })).status()).toBe(200);

  type Names = { names: Array<{ name: string; mine: number | null; score: number; everyone: boolean; votes: unknown[] }> };
  let names = ((await (await request.get(`/api/family/names${q}`)).json()) as Names).names;
  expect(names.map((n) => n.name)).toEqual(["Wren", "Robin"]);
  expect(names[0]).toMatchObject({ mine: 2, score: 3, everyone: true });
  expect(names[1]).toMatchObject({ mine: -1, everyone: false });
  // she changes her mind, then takes the vote back
  await request.post(`/api/family/names/${wren}/vote`, { data: { space: SPACE, vote: 1 } });
  await request.post(`/api/family/names/${robin}/vote`, { data: { space: SPACE, vote: null } });
  names = ((await (await request.get(`/api/family/names${q}`)).json()) as Names).names;
  expect(names.find((n) => n.name === "Wren")).toMatchObject({ mine: 1, score: 2 });
  expect(names.find((n) => n.name === "Robin")).toMatchObject({ mine: null, votes: [] });
  expect(Number(localSql(`select count(*) from public.family_name_votes where space_id = '${SPACE}'`)[0][0]), "one vote each on Wren, none on Robin").toBe(2);
});

test("a prep list keeps its running total as prices and ticks go in", async ({ request }) => {
  type Lists = { lists: Array<{ id: string; slug: string; items: Array<{ id: string; title: string }>; totals: Record<string, number> }>; totals: Record<string, number> };
  const read = async () => (await (await request.get(`/api/family/list-items${q}`)).json()) as Lists;
  const nursery = (await read()).lists.find((l) => l.slug === "nursery")!;
  const [cot, mattress] = nursery.items;
  expect((await request.patch(`/api/family/list-items/${cot.id}`, { data: { space: SPACE, price: "£249.99", link: "https://example.com/cot" } })).status()).toBe(200);
  expect((await request.patch(`/api/family/list-items/${mattress.id}`, { data: { space: SPACE, price_pence: 6000, bought: true } })).status()).toBe(200);
  expect((await request.patch(`/api/family/list-items/${cot.id}`, { data: { space: SPACE, link: "javascript:alert(1)" } })).status(), "a link is a web address").toBe(400);
  expect((await request.patch(`/api/family/list-items/${cot.id}`, { data: { space: SPACE, price: "lots" } })).status()).toBe(400);
  const added = await request.post("/api/family/list-items", { data: { space: SPACE, list_id: nursery.id, title: `${RUN} mobile`, price: "15" } });
  expect(added.status(), await added.text()).toBe(201);
  expect((await request.post("/api/family/list-items", { data: { space: SPACE, list_id: randomUUID(), title: "nowhere" } })).status()).toBe(400);

  const after = await read();
  expect(after.lists.find((l) => l.slug === "nursery")!.totals).toMatchObject({ items: 13, bought: 1, total_pence: 32499, spent_pence: 6000, left_pence: 26499, unpriced: 10 });
  expect(after.totals.total_pence).toBe(32499);
  // who ticked it is the server's word
  expect(localSql(`select bought_by from public.family_list_items where id = '${mattress.id}'`)[0][0]).toBe(TESS.id);
});

test("the baby log: one tap a row, one sleep at a time, and today adds up", async ({ request }) => {
  type Log = { rows: Array<{ id: string; kind: string }>; summary: { last_feed: { how: string } | null; asleep: { id: string } | null; today: { feeds: number; bottle_ml: number; wet: number; dirty: number } } };
  const read = async (who: APIRequestContext = request) => (await (await who.get(`/api/family/baby-log${q}`)).json()) as Log;
  const tap = (who: APIRequestContext, data: Record<string, unknown>) => who.post("/api/family/baby-log", { data: { space: SPACE, ...data } });

  expect((await tap(request, { kind: "feed", how: "left" })).status()).toBe(201);
  expect((await tap(phil, { kind: "feed", how: "bottle", ml: 90 })).status()).toBe(201);
  expect((await tap(request, { kind: "nappy", what: "both" })).status()).toBe(201);
  expect((await tap(request, { kind: "bath" })).status()).toBe(400);
  expect((await tap(request, { kind: "feed", at: new Date(Date.now() + 3_600_000).toISOString() })).status(), "not in the future").toBe(400);

  const asleep = await tap(request, { kind: "sleep" });
  expect(asleep.status()).toBe(201);
  expect((await tap(phil, { kind: "sleep" })).status(), "a second sleep while one is running").toBe(409);
  let log = await read(phil);
  expect(log.summary.today).toMatchObject({ feeds: 2, bottle_ml: 90, wet: 1, dirty: 1 });
  expect(log.summary.last_feed?.how).toBe("bottle");
  expect(log.summary.asleep?.id).toBe(((await asleep.json()) as { row: { id: string } }).row.id);

  // Phil taps Awake on the sleep Tess started
  expect((await phil.patch(`/api/family/baby-log/${log.summary.asleep!.id}`, { data: { space: SPACE, ended_at: "now" } })).status()).toBe(200);
  log = await read();
  expect(log.summary.asleep).toBeNull();
  // Undo removes the row
  const feed = log.rows.find((r) => r.kind === "feed")!;
  expect((await request.delete(`/api/family/baby-log/${feed.id}${q}`)).status()).toBe(200);
  expect((await read()).summary.today.feeds).toBe(1);
});

test("the household budget says who paid what and what would even it up; it is not the finance section", async ({ request }) => {
  const month = (await view(request)).family!.today.slice(0, 7);
  expect((await request.post("/api/family/costs", { data: { space: SPACE, title: `${RUN} gas`, amount: "100", category: "bill" } })).status()).toBe(201);
  expect((await phil.post("/api/family/costs", { data: { space: SPACE, title: `${RUN} pram deposit`, amount_pence: 4000, category: "baby" } })).status()).toBe(201);
  expect((await request.post("/api/family/costs", { data: { space: SPACE, title: "x", amount: "10", paid_by: randomUUID() } })).status(), "paid by someone outside the family space").toBe(400);
  expect((await request.post("/api/family/costs", { data: { space: SPACE, title: "x", amount: "ten" } })).status()).toBe(400);

  type Costs = { costs: Array<{ title: string; paid_by: string }>; money: { total_pence: number; by_category: Record<string, number>; even_up: { from: string; to: string; pence: number } | null } };
  const got = (await (await request.get(`/api/family/costs${q}&month=${month}`)).json()) as Costs;
  expect(got.money.total_pence).toBe(14000);
  expect(got.money.by_category).toEqual({ bill: 10000, baby: 4000 });
  expect(got.money.even_up).toEqual({ from: PHIL.id, to: TESS.id, pence: 3000 });
  expect(got.costs.find((c) => c.title === `${RUN} gas`)!.paid_by, "whoever adds it paid it, unless they say otherwise").toBe(TESS.id);
  // nothing of it is in the finance tables
  expect(Number(localSql(`select count(*) from public.transactions where description like '${RUN}%'`)[0][0])).toBe(0);
});

test("household: a bin says when it is next collected, a warranty when it runs out", async ({ request }) => {
  const bin = await request.post("/api/family/household", { data: { space: SPACE, kind: "bin", title: `${RUN} recycling`, schedule: { weekday: 4, every_weeks: 2, anchor_on: day(-3) } } });
  expect(bin.status(), await bin.text()).toBe(201);
  expect((await request.post("/api/family/household", { data: { space: SPACE, kind: "bin", title: "bad", schedule: { weekday: 9 } } })).status()).toBe(400);
  expect((await request.post("/api/family/household", { data: { space: SPACE, kind: "warranty", title: `${RUN} washing machine`, expires_on: day(400) } })).status()).toBe(201);
  const got = (await (await request.get(`/api/family/household${q}`)).json()) as { items: Array<{ title: string; next_on: string | null; expires_on: string | null }>; today: string };
  expect(got.items.find((i) => i.title === `${RUN} recycling`)!.next_on).toBe(day(11));
  expect(got.items.find((i) => i.title === `${RUN} washing machine`)).toMatchObject({ next_on: null, expires_on: day(400) });
});

test("a letter answers this week's question; one spoken aloud gets its words from the PC afterwards", async ({ request }) => {
  const question = (await view(request)).family!.letter.question;
  expect(question.length).toBeGreaterThan(10);
  const typed = await request.post("/api/family/entries", { data: { space: SPACE, kind: "letter", title: `${RUN} letter`, prompt: question, body: "We painted your room today." } });
  expect(typed.status(), await typed.text()).toBe(201);
  expect((await view(request)).family!.letter.answered_by).toEqual([TESS.id]);
  expect((await view(phil)).family!.letter.question, "the same question for both of them").toBe(question);

  const spoken = await request.post("/api/family/entries", { multipart: { space: SPACE, kind: "letter", title: `${RUN} spoken letter`, prompt: question, file: { name: "letter.webm", mimeType: "audio/webm", buffer: Buffer.from("not really audio, but it is stored as given") } } });
  expect(spoken.status(), await spoken.text()).toBe(201);
  const id = ((await spoken.json()) as { row: { id: string; transcribed: boolean; body: string | null } }).row.id;
  expect(localSql(`select transcribed::text, coalesce(body, '') from public.family_entries where id = '${id}'`)[0]).toEqual(["false", ""]);

  // the job for the PC: free, and never the cloud
  const job = localSql(`select id, kind, lane, status from public.jobs where payload->>'family_entry_id' = '${id}'`)[0];
  expect(job.slice(1)).toEqual(["transcribe", "pc", "queued"]);
  // the PC takes it and posts the words back
  localSql(`update public.jobs set status = 'claimed', claimed_by = 'e2e-family', claimed_at = now(), lease_until = now() + interval '5 minutes', attempts = attempts + 1 where id = '${job[0]}'`);
  const done = await request.post("/api/worker/finish", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` }, data: { id: job[0], worker: "e2e-family", ok: true, result: { text: "Hello little one, it rained all day." } } });
  expect(done.status(), await done.text()).toBe(200);
  expect(localSql(`select transcribed::text, body from public.family_entries where id = '${id}'`)[0]).toEqual(["true", "Hello little one, it rained all day."]);
});

test("the page: the week, the one-time note that it is shared, and each tab doing its one thing", async ({ page }) => {
  // Phil has not confirmed; Tess has. Show her the banner once more by taking her confirmation back.
  localSql(`delete from public.family_acks where space_id = '${SPACE}' and member_id = '${TESS.id}'`);
  await page.goto("/family");
  await expect(page.getByTestId("family-headline")).toContainText(/Week (19|20)/);
  await expect(page.getByTestId("family-header")).toContainText(`${RUN} midwife`);
  const ack = page.getByTestId("family-ack");
  await expect(ack).toContainText("Everything you add here is seen by Phil");
  await ack.getByRole("button", { name: "Understood" }).click();
  await expect(ack).toHaveCount(0);

  await expect(page.getByTestId("family-timeline")).toContainText(`${RUN} first kick`);

  await page.getByRole("radio", { name: "Baby log" }).click();
  await expect(page).toHaveURL(/\/family\?tab=baby/);
  await page.getByRole("button", { name: "Nappy, wet" }).click();
  await expect(page.getByTestId("baby-log-today")).toContainText("2 wet");

  await page.getByRole("radio", { name: "Names" }).click();
  await expect(page.getByTestId("name-row").first()).toContainText("Wren");
  await expect(page.getByTestId("name-row").first()).toContainText("you both like it");

  await page.getByRole("radio", { name: "Lists" }).click();
  await expect(page.getByTestId("prep-lists")).toContainText("£324.99 priced");
  // the sheet: type in the empty row, Enter, and it is there
  const add = page.getByTestId("prep-list").filter({ hasText: "Hospital bag" }).getByLabel("Add something to this list");
  await add.fill(`${RUN} tens machine`);
  await add.press("Enter");
  await expect(page.getByTestId("prep-list").filter({ hasText: "Hospital bag" }).getByTestId("list-totals")).toContainText("of 19 bought");

  await page.getByRole("radio", { name: "Budget" }).click();
  await expect(page.getByTestId("budget-total")).toHaveText("£140");
  await expect(page.getByTestId("budget-even-up")).toContainText("£30 from Phil to Tess");

  await page.getByRole("radio", { name: "Letters" }).click();
  await expect(page.getByTestId("letter-question")).not.toBeEmpty();
  await expect(page.getByTestId("family-letters")).toContainText("Hello little one, it rained all day.");

  // a reload lands on the same tab
  await page.goto("/family?tab=home");
  await expect(page.getByTestId("family-household")).toContainText(`${RUN} recycling`);
});

test("once the baby is born the page counts their age and the baby log comes first", async ({ request, page }) => {
  expect((await request.patch("/api/family", { data: { space: SPACE, born_on: day(-9), baby_name: "Wren" } })).status()).toBe(200);
  const f = (await view(request)).family!;
  expect(f.pregnancy).toBeNull();
  expect(f.baby?.label).toMatch(/^(8|9|10) days old$/);
  expect(f.baby_log).not.toBeNull();
  await page.goto("/family");
  await expect(page.getByTestId("family-headline")).toContainText(/Wren is (8|9|10) days old/);
  await expect(page.getByRole("radiogroup", { name: "Family sections" }).getByRole("radio").first()).toHaveText("Baby log");
});
