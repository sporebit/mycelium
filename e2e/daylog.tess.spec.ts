/**
 * Day log as Tess, a second user with her own space and no team in common
 * with Phil: she sees nothing of his days, cannot reach them by date, by id
 * or through their parts, and her own day log works on its own.
 *
 * Phil's side of each check is set up through API_SECRET (which acts as
 * Phil) on a date that had no row, and removed afterwards.
 */
import { test, type APIRequestContext } from "@playwright/test";
import { expect } from "./daylog.helpers.ts";
import { CRON_AUTH, NO_SESSION, SCORE_LINE, appToday, freeDay, json, m, philApi, readDay, removeDay, tag, turn, watch, type Turn } from "./daylog.helpers.ts";

const T = tag("daylog");
const SECRET = `${T}-PhilOnly`;


let phil: APIRequestContext;
let tess: APIRequestContext;
const philDays: string[] = [];
const tessDays: string[] = [];

test.beforeAll(async ({ playwright }) => {
  phil = await philApi(playwright);
});
test.beforeEach(({ request }) => {
  tess = request;
});
test.afterEach(async () => {
  for (const d of philDays.splice(0)) await removeDay(phil, d);
  for (const d of tessDays.splice(0)) await removeDay(tess, d);
});
test.afterAll(async () => {
  await phil.dispose();
});

/** A date free for both people. */
async function sharedFreeDay(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const d = await freeDay(phil);
    const hers = await json<{ days: unknown[] }>(await tess.get(`/api/journal/days?from=${d}&to=${d}`));
    if (hers.days.length === 0) return d;
  }
  throw new Error("no date free for both Phil and Tess");
}

test("Tess sees none of Phil's day: not in the list, not by date, not by id, not through its parts", async ({ page }) => {
  const seen = watch(page);
  const d = await sharedFreeDay();
  philDays.push(d);
  await turn(phil, d, { start: "quick" });
  const photo = await phil.post(`/api/journal/days/${d}/media`, { multipart: { file: { name: "p.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") } } });
  expect(photo.status()).toBe(201);
  await turn(phil, d, { text: `${SECRET}-Friend / ${SECRET}-Place / ${SECRET} what Phil did` });
  await turn(phil, d, { text: "5 4 3 2" });
  const his = await readDay(phil, d);
  expect(his.day.status).toBe("closed");
  expect(his.scenes).toHaveLength(1);
  expect(his.pending).toBe(2);
  expect(his.media).toHaveLength(1);

  // -- the lists ------------------------------------------------------------
  const list = await json<{ days: Array<{ id: string }> }>(await tess.get(`/api/journal/days?from=${d}&to=${d}`));
  expect(list.days).toEqual([]);
  expect((await json<{ series: unknown[] }>(await tess.get(`/api/journal/scores?from=${d}&to=${d}`))).series).toEqual([]);
  expect((await json<{ scenes: unknown[] }>(await tess.get(`/api/journal/shared?from=${d}&to=${d}`))).scenes).toEqual([]);
  const pend = await tess.get(`/api/pending-entities?day_id=${his.day.id}&resolved=true`);
  expect(pend.status()).toBe(200);
  expect((await json<{ pending: unknown[] }>(pend)).pending).toEqual([]);
  expect(JSON.stringify(await (await tess.get("/api/pending-entities")).json())).not.toContain(SECRET);

  // -- by id ----------------------------------------------------------------
  expect((await tess.get(`/api/journal/days/${his.day.id}`)).status()).toBe(404);
  expect((await tess.patch(`/api/journal/days/${his.day.id}`, { data: { summary: "hers now" } })).status()).toBe(404);
  expect((await tess.delete(`/api/journal/days/${his.day.id}`)).status()).toBe(404);
  expect((await tess.patch(`/api/journal/scenes/${his.scenes[0].id}`, { data: { title: "hers now" } })).status()).toBe(404);
  expect((await tess.delete(`/api/journal/scenes/${his.scenes[0].id}`)).status()).toBe(404);
  expect((await tess.patch(`/api/journal/media/${his.media[0].id}`, { data: { shareable: true } })).status()).toBe(404);
  expect((await tess.delete(`/api/journal/media/${his.media[0].id}`)).status()).toBe(404);
  const pendingId = (await json<{ pending: Array<{ id: string }> }>(await phil.get(`/api/pending-entities?day_id=${his.day.id}`))).pending[0].id;
  expect((await tess.post(`/api/pending-entities/${pendingId}/resolve`, { data: { action: "create_new" } })).status()).toBe(404);
  expect((await page.goto(`/journal/${his.day.id}`))!.status()).toBe(404);

  // -- by date: the same date is her own, empty day -------------------------
  tessDays.push(d);
  await page.goto(`/journal/${d}`);
  await expect(m(page).getByText("pending", { exact: true })).toBeVisible();
  await expect(m(page).getByText("Nothing yet.")).toBeVisible();
  await expect(m(page).getByText("No messages.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(SECRET);
  const hers = await readDay(tess, d);
  expect(hers.day.id).not.toBe(his.day.id);
  expect(hers).toMatchObject({ scenes: [], facts: [], pending: 0, media: [] });
  expect(hers.day.transcript).toEqual([]);

  // -- writing by date lands on her row, never his --------------------------
  const started = await turn(tess, d, { start: "skip" });
  expect(started.reply).toBe(SCORE_LINE);
  await turn(tess, d, { text: "1 1 1 1" });
  expect((await tess.delete(`/api/journal/days/${d}`)).status()).toBe(200);
  tessDays.pop();

  await page.goto("/journal");
  await expect(m(page).getByRole("heading", { name: "Journal" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(SECRET);
  await expect(m(page).locator(`a[href="/journal/${d}"]`)).toHaveCount(0);

  // Phil's day is exactly as he left it
  const after = await readDay(phil, d);
  expect(after.day.transcript).toEqual(his.day.transcript);
  expect(after.day.scores).toEqual({ mood: 5, energy: 4, sleep: 3, productivity: 2 });
  expect(after.day.summary).toBe(his.day.summary);
  expect(after.scenes[0].title).toBe(`${SECRET}-Place`);
  expect(after.media).toHaveLength(1);
  expect(after.pending).toBe(2);
  expect(seen.serverErrors).toEqual([]);
  expect(seen.crashes).toEqual([]);
});

test("Tess keeps her own day log, and Phil sees none of it", async ({ page }) => {
  const seen = watch(page);
  const d = await sharedFreeDay();
  tessDays.push(d);
  await page.goto(`/journal/${d}`);
  const say = async (text: string): Promise<Turn> => {
    const answered = page.waitForResponse((r) => r.url().includes("/messages") && r.request().method() === "POST");
    const box = m(page).locator("section").filter({ has: page.getByText("Conversation", { exact: true }) }).getByRole("textbox");
    await box.fill(text);
    await box.press("Enter");
    const res = await answered;
    expect(res.status()).toBe(200);
    return (await res.json()) as Turn;
  };
  const started = page.waitForResponse((r) => r.url().includes("/messages") && r.request().method() === "POST");
  await m(page).getByRole("button", { name: "QUICK", exact: true }).click();
  expect((await started).status()).toBe(200);
  await say(`${T}-TessFriend / ${T}-TessPlace / ${T} what Tess did`);
  const closed = await say("2 3 4 5");
  expect(closed.state).toBe("closed");
  await expect(m(page).getByText("closed · quick", { exact: true })).toBeVisible();
  await expect(m(page).getByRole("heading", { name: `${T}-TessPlace` })).toBeVisible();
  await expect(m(page).getByRole("link", { name: "2 TO REVIEW" })).toBeVisible();

  const hers = await readDay(tess, d);
  expect(hers.day.scores).toEqual({ mood: 2, energy: 3, sleep: 4, productivity: 5 });
  expect(hers.pending).toBe(2);

  // Phil: nothing on that date, nothing by id, nothing in his review queue
  expect((await json<{ days: unknown[] }>(await phil.get(`/api/journal/days?from=${d}&to=${d}`))).days).toEqual([]);
  expect((await phil.get(`/api/journal/days/${hers.day.id}`)).status()).toBe(404);
  expect((await json<{ pending: unknown[] }>(await phil.get(`/api/pending-entities?day_id=${hers.day.id}`))).pending).toEqual([]);
  expect((await phil.patch(`/api/journal/scenes/${hers.scenes[0].id}`, { data: { title: "his now" } })).status()).toBe(404);

  // her review items are hers to settle
  await m(page).getByRole("link", { name: "2 TO REVIEW" }).click();
  const group = m(page).locator("section").filter({ has: page.getByRole("link", { name: `Day log · ${d}` }) });
  await expect(group.getByRole("listitem")).toHaveCount(2);
  for (const name of [`${T}-TessFriend`, `${T}-TessPlace`]) {
    const done = page.waitForResponse((r) => /\/api\/pending-entities\/.+\/resolve$/.test(new URL(r.url()).pathname));
    await group.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "REJECT" }).click();
    expect((await done).status()).toBe(200);
  }
  await expect(m(page).getByText("Nothing left to review for that day.")).toBeVisible();
  expect((await readDay(tess, d)).pending).toBe(0);
  expect(seen.serverErrors).toEqual([]);
  expect(seen.crashes).toEqual([]);
});

test("the cron tick is Phil's: it leaves Tess's open day alone", async ({ playwright }) => {
  const d = await sharedFreeDay();
  tessDays.push(d);
  await turn(tess, d, { start: "talk" });
  await turn(tess, d, { text: `${T} Tess is mid-conversation` });
  const today = await appToday(phil);
  const philHadToday = (await json<{ days: unknown[] }>(await phil.get(`/api/journal/days?from=${today}&to=${today}`))).days.length > 0;
  const cron = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: CRON_AUTH, storageState: NO_SESSION });
  const res = await cron.get("/api/cron/daylog");
  expect(res.status()).toBe(200);
  const report = await json<{ closedIdle: string[]; skipped: string[] }>(res);
  await cron.dispose();
  expect(report.closedIdle).not.toContain(d);
  expect(report.skipped).not.toContain(d);
  expect((await readDay(tess, d)).day.status).toBe("open");
  // in the evening window the tick makes Phil's row for today; remove it only if this tick made it and it is still empty
  if (!philHadToday) {
    const made = (await json<{ days: Array<{ day: string; status: string; user_turns: number }> }>(await phil.get(`/api/journal/days?from=${today}&to=${today}`))).days;
    for (const r of made) if (r.status === "pending" && r.user_turns === 0) await phil.delete(`/api/journal/days/${r.day}`);
  }
});

test.fixme("FINDING daylog-1: for anyone but Phil, a companion called Phil is dropped from the day", async () => {
  // lib/daylog/extraction.ts SELF = { i, me, myself, phil, we, us } hard-codes the owner's first name (spec §12.1
  // deviation 11, "revisit with Part E"). For Tess, "Phil" is another person and must be queued for review like
  // anyone else; her own name is the one that should be dropped.
  const d = await sharedFreeDay();
  tessDays.push(d);
  await turn(tess, d, { start: "quick" });
  await turn(tess, d, { text: `Phil and ${T}-Zed / ${T}-Cafe / coffee` });
  await turn(tess, d, { text: "3 3 3 3" });
  const { day } = await readDay(tess, d);
  const pending = await json<{ pending: Array<{ entity_type: string; entity_name: string }> }>(await tess.get(`/api/pending-entities?day_id=${day.id}`));
  expect(pending.pending.filter((p) => p.entity_type === "daylog_new_person").map((p) => p.entity_name).sort()).toEqual(["Phil", `${T}-Zed`].sort());
});
