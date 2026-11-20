/**
 * Capture as Tess, a second user with her own space, on the rebuilt
 * pipeline: she sees none of Phil's captures and cannot act on them; what
 * she captures is stored, worked out, split, swept and filed in her own
 * space; a client id is hers alone; and the evening close shows her her
 * own cards to accept, fix or discard.
 */
import { test, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL, TESS, personalSpace } from "./support/users.ts";
import { CRON_AUTH, NO_SESSION, expect, json, philApi, tag, watch } from "./daylog.helpers.ts";
import { autoCapture, childrenOf, processed, row, ticket, tidyCaptures, type Row } from "./capture.helpers.ts";

const T = tag("capture");
const SECRET = `${T}-PhilOnly`;

type Capture = { id: string; raw_text: string; classification: Record<string, unknown>; routed_to: string; reviewed_at: string | null };
type TypedAnswer = { ok: boolean; status: string; kind: string; routed_to: string; routed_id: string; ticket_key: string | null; review: string; capture_id: string; deduplicated?: boolean };

let phil: APIRequestContext;
let tess: APIRequestContext;
const philCaptures: string[] = [];
const tessCaptures: string[] = [];

test.beforeAll(async ({ playwright }, info) => {
  phil = await philApi(playwright);
  // A run cut off before its tidy-up (a server swap, a session ended under it) leaves this spec's own
  // captures in Tess's queue, where they would sit in front of the evening deck. Remove them first.
  const left = localSql(`select id from public.raw_captures where space_id = '${personalSpace(TESS)}' and deleted_at is null and raw_text like 'E2E-capture-%'`).map((r) => r[0]);
  if (left.length) {
    const hers = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: info.project.use.storageState as string });
    await tidyCaptures(hers, left);
    await hers.dispose();
  }
});
test.beforeEach(({ request }) => {
  tess = request;
});
test.afterEach(async () => {
  await tidyCaptures(phil, philCaptures.splice(0));
  await tidyCaptures(tess, tessCaptures.splice(0));
});
test.afterAll(async () => {
  await phil.dispose();
});

const ownerOf = (captureId: string) => localSql(`select p.id from public.raw_captures c join public.profiles p on p.personal_space_id = c.space_id where c.id = '${captureId}'`)[0]?.[0];
const list = async (who: APIRequestContext, path: string) => (await json<{ captures: Capture[] }>(await who.get(path))).captures;
const inQueue = async (who: APIRequestContext, id: string) => (await list(who, "/api/captures/review?limit=200")).some((c) => c.id === id);
const pending = async (who: APIRequestContext) => (await json<{ count: number }>(await who.get("/api/captures/review/pending-count"))).count;

async function typed(who: APIRequestContext, mine: string[], kind: string, fields: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<TypedAnswer> {
  const res = await who.post("/api/capture", { data: { typed: { kind, fields }, ...extra } });
  expect(res.status(), await res.text()).toBe(200);
  const body = await json<TypedAnswer>(res);
  mine.push(body.capture_id);
  return body;
}

async function auto(who: APIRequestContext, mine: string[], text: string, extra: Record<string, unknown> = {}): Promise<Row> {
  const saved = await autoCapture(who, text, extra);
  mine.push(saved.capture_id);
  return processed(saved.capture_id);
}

test("Tess sees none of Phil's captures and cannot review, discard or delete them", async ({ page }) => {
  const seen = watch(page);
  const note = await typed(phil, philCaptures, "note", { title: `${SECRET} note the alarm code`, summary: `${SECRET} detail`, tags: [] });
  const task = await typed(phil, philCaptures, "task", { title: `${SECRET} task`, description: "", due_window: "", key: false, tags: [] });
  const quote = await auto(phil, philCaptures, `quote: ${SECRET} said in confidence`);
  const dump = await auto(
    phil,
    philCaptures,
    `${SECRET} I need to change the alarm code before the weekend because too many people know it now. Also the side gate key is under the blue pot by the back door. Another thing, buy a new padlock for the shed.`,
  );
  const items = childrenOf(dump.id);
  philCaptures.push(...items.map((c) => c.id));
  expect(items).toHaveLength(3);
  expect(ownerOf(note.capture_id)).toBe(PHIL.id);
  for (const c of items) expect(ownerOf(c.id)).toBe(PHIL.id);

  // Phil has them all waiting
  const his = await list(phil, "/api/captures/review?limit=200");
  for (const id of [note.capture_id, task.capture_id, quote.id, ...items.map((c) => c.id)]) expect(his.some((c) => c.id === id), id).toBe(true);

  // Tess does not, on any list, nor in her count or her evening deck
  for (const path of ["/api/captures?limit=200", "/api/captures/review?limit=200", "/api/captures/review?tab=all&limit=200", "/api/captures/review?order=oldest&limit=200", "/api/daily/close"]) {
    const res = await tess.get(path);
    expect(res.status(), path).toBe(200);
    const body = await res.text();
    expect(body, path).not.toContain(SECRET);
    for (const c of items) expect(body, path).not.toContain(c.id);
  }
  expect(await (await tess.get("/api/tickets?list=inbox&limit=500")).text()).not.toContain(SECRET);
  expect((await tess.get(`/api/tickets/${task.routed_id}`)).status()).toBe(404);

  // nor can she act on one by id: his typed note, or an item held from his dump
  for (const id of [note.capture_id, items[0].id]) {
    for (const body of [{ action: "approve" }, { action: "discard" }, { action: "reroute", kind: "idea", fields: { title: "hers now" } }]) {
      expect((await tess.patch(`/api/captures/${id}/review`, { data: body })).status(), `${id} ${JSON.stringify(body)}`).toBe(404);
    }
    expect((await tess.delete(`/api/captures/${id}`)).status()).toBe(404);
  }

  for (const url of ["/organisation/captures", "/organisation/captures/review"]) {
    await page.goto(url);
    await expect(page.getByText("Loading…")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(SECRET);
  }
  await page.goto("/organisation/captures/review");
  await page.getByRole("tab", { name: "ALL", exact: true }).click();
  await expect(page.getByText(/\d+ SHOWN/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(SECRET);

  // Phil's are untouched
  expect(row(note.capture_id)).toMatchObject({ reviewed_at: null, discarded_at: null, deleted_at: null, raw_text: `${SECRET} note the alarm code` });
  expect(row(items[0].id)!.classification).toMatchObject({ kind: "task", held: true });
  expect(seen.serverErrors).toEqual([]);
  expect(seen.crashes).toEqual([]);
});

test("Tess captures into her own space: form, review queue, approve", async ({ page }) => {
  const seen = watch(page);
  const text = `${T} tess note the meter cupboard key`;
  await page.goto("/organisation/captures/review");
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Capture" }).click();
  const dialog = page.getByRole("dialog", { name: "Capture" });
  await dialog.getByLabel("Capture type").selectOption("note");
  await dialog.locator("#ef-note-title").fill(text);
  const posted = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/capture" && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Capture Note →" }).click();
  const res = await posted;
  expect(res.status()).toBe(200);
  const answer = (await res.json()) as TypedAnswer;
  tessCaptures.push(answer.capture_id);
  expect(answer).toMatchObject({ ok: true, status: "saved", kind: "note", review: "captures", routed_to: "raw_captures" });
  await expect(page.getByRole("status")).toHaveText("✓ Captured → Review");
  expect(ownerOf(answer.capture_id)).toBe(TESS.id);

  await page.goto("/organisation/captures/review");
  const card = page.getByRole("article").filter({ hasText: text });
  await expect(card).toBeVisible();
  const done = page.waitForResponse((r) => /\/api\/captures\/.+\/review$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH");
  await card.getByRole("button", { name: "APPROVE" }).click();
  expect((await done).status()).toBe(200);
  await expect(page.getByRole("article").filter({ hasText: text })).toHaveCount(0);

  // hers, reviewed; and nowhere in Phil's lists, nor his to act on
  expect(row(answer.capture_id)!.reviewed_at).not.toBeNull();
  for (const path of ["/api/captures?limit=200", "/api/captures/review?tab=all&limit=200"]) expect(await (await phil.get(path)).text()).not.toContain(text);
  expect((await phil.patch(`/api/captures/${answer.capture_id}/review`, { data: { action: "discard" } })).status()).toBe(404);
  // her learning row is hers too
  expect(localSql(`select chosen_kind || '|' || approved_kind from public.capture_learning where capture_id = '${answer.capture_id}'`)[0][0]).toBe("note|note");
  expect(seen.serverErrors).toEqual([]);
  expect(seen.crashes).toEqual([]);
});

test("Tess's captures are worked out in her space: a typed task, Auto with AI off, a long dump, her own count", async () => {
  const before = await pending(tess);
  const philBefore = await pending(phil);

  const task = await typed(tess, tessCaptures, "task", { title: `${T} tess task descale the kettle`, description: "", due_window: "month", key: false, tags: [] });
  expect(task).toMatchObject({ status: "saved", review: "tickets_inbox", routed_to: "tickets" });
  expect(task.ticket_key).toMatch(/^[A-Z0-9]+-\d+$/);
  expect(ticket(task.routed_id)).toMatchObject({ category: "inbox", suggested: { due_window: "month" } });
  expect(localSql(`select owner = '${TESS.id}' from public.tickets where id = '${task.routed_id}'`)[0][0]).toBe("t");
  const his = await json<{ tickets: Array<{ id: string }> }>(await phil.get("/api/tickets?list=inbox&limit=500"));
  expect(his.tickets.some((t) => t.id === task.routed_id)).toBe(false);

  const decided = await auto(tess, tessCaptures, `${T} tess auto decided to repaint the gate`);
  expect(decided).toMatchObject({ source: "web", llm_source: "regex", routed_to: "raw_captures", reviewed_at: null });
  expect(decided.classification.kind).toBe("decision");
  expect(ownerOf(decided.id)).toBe(TESS.id);
  expect(await inQueue(tess, decided.id)).toBe(true);

  const dump = await auto(
    tess,
    tessCaptures,
    `${T} tess I need to descale the kettle before the weekend because the element is furred up again. Also the airing cupboard door wants a new catch fitted. Another thing, buy a new washing line for the yard.`,
  );
  const items = childrenOf(dump.id);
  tessCaptures.push(...items.map((c) => c.id));
  expect(items.map((c) => c.classification.kind)).toEqual(["task", "capture", "purchase"]);
  for (const c of items) {
    expect(ownerOf(c.id)).toBe(TESS.id);
    expect(c.classification.held).toBe(true);
    expect(await inQueue(tess, c.id)).toBe(true);
  }
  expect(dump.reviewed_at).not.toBeNull();

  // her count is her queue: the task's card, the decision, the three items (not the dump itself)
  expect(await pending(tess)).toBe(before + 5);
  // accepting an item files it for her
  const accepted = await tess.patch(`/api/captures/${items[0].id}/review`, { data: { action: "approve" } });
  expect(accepted.status()).toBe(200);
  const made = (await json<{ capture: { routed_to: string; routed_id: string } }>(accepted)).capture;
  expect(made.routed_to).toBe("tickets");
  expect(ticket(made.routed_id)).toMatchObject({ category: "next" });
  expect(localSql(`select owner = '${TESS.id}' from public.tickets where id = '${made.routed_id}'`)[0][0]).toBe("t");
  expect(await pending(tess)).toBe(before + 4);

  // and none of it is Phil's: not on his lists, not in his count
  for (const path of ["/api/captures?limit=200", "/api/captures/review?limit=200"]) expect(await (await phil.get(path)).text()).not.toContain(`${T} tess`);
  expect(await pending(phil)).toBe(philBefore);
});

test("a client id is unique per person: Phil's id is simply a new capture for Tess, and never shows her his", async () => {
  // was FINDING capture-6: the id was unique across everyone, and the second person's capture answered 500
  const client_uuid = crypto.randomUUID();
  const his = await typed(phil, philCaptures, "note", { title: `${SECRET} uuid probe`, summary: "", tags: [] }, { client_uuid });

  const res = await tess.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${T} tess with the same id`, summary: "", tags: [] } }, client_uuid } });
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain(his.capture_id);
  const hers = JSON.parse(text) as TypedAnswer;
  tessCaptures.push(hers.capture_id);
  expect(hers.deduplicated).toBeUndefined();
  expect(hers.capture_id).not.toBe(his.capture_id);
  expect(ownerOf(hers.capture_id)).toBe(TESS.id);

  // her own retry is her own capture, typed or auto
  const again = await tess.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${T} tess with the same id`, summary: "", tags: [] } }, client_uuid } });
  expect(await json(again)).toEqual({ ok: true, status: "saved", deduplicated: true, capture_id: hers.capture_id });
  const asAuto = await tess.post("/api/capture", { data: { text: `${T} tess with the same id, as words`, client_uuid } });
  expect(asAuto.status()).toBe(202);
  expect(await json(asAuto)).toEqual({ ok: true, status: "saved", capture_id: hers.capture_id, deduplicated: true, summary: "Saved" });
  // one each
  expect(localSql(`select space_id from public.raw_captures where client_uuid = '${client_uuid}' order by created_at`).map((r) => r[0])).toEqual([personalSpace(PHIL), personalSpace(TESS)]);
  expect(row(his.capture_id)!.raw_text).toBe(`${SECRET} uuid probe`);

  // and the other way round, by the Auto door
  const second = crypto.randomUUID();
  const tessFirst = await auto(tess, tessCaptures, `${T} tess decided first with this id`, { client_uuid: second });
  const philSecond = await auto(phil, philCaptures, `${SECRET} decided second with the same id`, { client_uuid: second });
  expect(philSecond.id).not.toBe(tessFirst.id);
  expect(ownerOf(philSecond.id)).toBe(PHIL.id);
  expect(row(tessFirst.id)!.raw_text).toBe(`${T} tess decided first with this id`);
});

const cronApi = (playwright: PlaywrightWorkerArgs["playwright"]) => playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: CRON_AUTH, storageState: NO_SESSION });

test("the sweep and the seven-day rule run for Tess as herself", async ({ playwright }) => {
  // a capture of hers that was stored and never worked out (inserted directly: no route makes one on purpose)
  const stranded = localSql(
    `insert into public.raw_captures (source, raw_text, dictation_text, text_source, status, classification, space_id, created_by, created_at) values ('web', '${T} tess decided this was left behind', '${T} tess decided this was left behind', 'typed', 'received', '{"kind":"capture","title":"stranded","pending":true}', '${personalSpace(TESS)}', '${TESS.id}', now() - interval '3 minutes') returning id`,
  )[0][0];
  tessCaptures.push(stranded);
  // Phil capturing does not sweep her captures…
  await auto(phil, philCaptures, `${SECRET} a capture of Phil's, whose sweep is his own`);
  // …her own next capture does
  const stale = await auto(tess, tessCaptures, `${T} tess decided a week ago and never looked`);
  const swept = await processed(stranded, 30_000);
  expect(swept.classification.kind).toBe("decision");
  expect(ownerOf(stranded)).toBe(TESS.id);
  expect(await inQueue(tess, stranded)).toBe(true);
  expect(await inQueue(phil, stranded)).toBe(false);

  // a week later the nightly run files her unanswered card, as her
  const fresh = await auto(tess, tessCaptures, `${T} tess decided just now`);
  localSql(`update public.raw_captures set created_at = created_at - interval '8 days' where id = '${stale.id}'`);
  const cron = await cronApi(playwright);
  const res = await cron.get("/api/cron/tickets-nightly");
  expect(res.status(), await res.text()).toBe(200);
  const report = await json<{ captures: { users: number; auto_filed: number } }>(res);
  await cron.dispose();
  expect(report.captures.users).toBeGreaterThanOrEqual(2);
  expect(report.captures.auto_filed).toBeGreaterThanOrEqual(1);
  const filed = row(stale.id)!;
  expect(filed.auto_filed_at).not.toBeNull();
  expect(filed.reviewed_at).not.toBeNull();
  expect(filed.classification).toMatchObject({ kind: "decision", unreviewed: true });
  expect(await inQueue(tess, stale.id)).toBe(false);
  expect(row(fresh.id)).toMatchObject({ auto_filed_at: null, reviewed_at: null });
});

test("the evening close shows Tess her own cards: Accept files one, Fix makes one a task, Discard drops one", async ({ page }) => {
  const seen = watch(page);
  type Close = { open: unknown[]; captures: Array<{ id: string; text: string; kind: string; held: boolean; suggestion: string; from_dump: boolean }> };
  const close = async () => json<Close>(await tess.get("/api/daily/close"));
  const before = await close();
  test.skip(before.open.length > 0, "Tess has day items still to decide; the capture cards come after them");
  test.skip(before.captures.length > 0, "Tess already has capture cards waiting that this spec did not make");

  const accept = await auto(tess, tessCaptures, `${T} deck decided to keep the allotment`);
  const fix = await auto(tess, tessCaptures, `${T} deck the hedge wants cutting back`);
  const drop = await auto(tess, tessCaptures, `${T} deck what if the shed had a window`);

  // oldest first, each saying what accepting it does
  const deck = await close();
  expect(deck.captures.map((c) => c.id)).toEqual([accept.id, fix.id, drop.id]);
  expect(deck.captures.map((c) => c.suggestion)).toEqual(["Filed as a decision", "Filed as a note", "Filed as an idea"]);
  expect(deck.captures[0]).toMatchObject({ text: accept.raw_text, kind: "decision", held: false, from_dump: false });

  await page.goto("/close");
  const cards = page.getByTestId("capture-deck");
  const top = cards.getByTestId("deck-card");
  const answered = () => page.waitForResponse((r) => /\/api\/captures\/.+\/review$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH");

  // Accept
  await expect(top).toContainText(`${T} deck decided to keep the allotment`);
  await expect(top).toContainText("Filed as a decision");
  let done = answered();
  await cards.getByRole("button", { name: "Accept", exact: true }).click();
  expect((await done).status()).toBe(200);
  await expect(top).toContainText(`${T} deck the hedge wants cutting back`);
  expect(row(accept.id)).toMatchObject({ routed_to: "raw_captures", discarded_at: null });
  expect(row(accept.id)!.reviewed_at).not.toBeNull();

  // Fix → "A task": it becomes a ticket
  await cards.getByRole("button", { name: "Fix", exact: true }).click();
  const fixing = page.getByTestId("capture-fix");
  await expect(fixing).toContainText(`${T} deck the hedge wants cutting back`);
  await expect(fixing.getByRole("link", { name: "More choices" })).toHaveAttribute("href", `/organisation/captures/review?focus=${fix.id}`);
  done = answered();
  await fixing.getByRole("button", { name: "A task", exact: true }).click();
  expect((await done).status()).toBe(200);
  await expect(fixing).toHaveCount(0);
  const fixed = row(fix.id)!;
  expect(fixed.classification.kind).toBe("task");
  expect(fixed.routed_to).toBe("tickets");
  expect(fixed.reviewed_at).not.toBeNull();
  expect(ticket(fixed.routed_id!)).toMatchObject({ kind: "task", title: fix.classification.title });
  expect(localSql(`select owner = '${TESS.id}' from public.tickets where id = '${fixed.routed_id}'`)[0][0]).toBe("t");

  // Discard
  await expect(top).toContainText(`${T} deck what if the shed had a window`);
  done = answered();
  await cards.getByRole("button", { name: "Discard", exact: true }).click();
  expect((await done).status()).toBe(200);
  await expect(page.getByTestId("capture-deck")).toHaveCount(0);
  expect(row(drop.id)!.discarded_at).not.toBeNull();

  // nothing left for the deck, and nothing of it reached Phil
  expect((await close()).captures).toEqual([]);
  expect(await (await phil.get("/api/captures?limit=200")).text()).not.toContain(`${T} deck`);
  expect(seen.serverErrors).toEqual([]);
  expect(seen.crashes).toEqual([]);
});
