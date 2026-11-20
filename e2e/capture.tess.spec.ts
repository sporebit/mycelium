/**
 * Capture as Tess, a second user with her own space: she sees none of
 * Phil's captures and cannot act on them, and what she captures lands in
 * her own space, in her own review queue and her own Tickets Inbox.
 */
import { test, type APIRequestContext } from "@playwright/test";
import { expect } from "./daylog.helpers.ts";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL, TESS } from "./support/users.ts";
import { json, philApi, tag, watch } from "./daylog.helpers.ts";

const T = tag("capture");
const SECRET = `${T}-PhilOnly`;


type Capture = { id: string; raw_text: string; classification: Record<string, unknown>; routed_to: string; reviewed_at: string | null };
type TypedAnswer = { ok: boolean; kind: string; routed_to: string; routed_id: string; ticket_key: string | null; review: string; capture_id: string };

let phil: APIRequestContext;
let tess: APIRequestContext;
const philCaptures: string[] = [];
const tessCaptures: string[] = [];
const tessTickets: string[] = [];
const philTickets: string[] = [];

test.beforeAll(async ({ playwright }) => {
  phil = await philApi(playwright);
});
test.beforeEach(({ request }) => {
  tess = request;
});
test.afterEach(async () => {
  for (const id of philTickets.splice(0)) await phil.delete(`/api/tickets/${id}?hard=1`);
  for (const id of tessTickets.splice(0)) await tess.delete(`/api/tickets/${id}?hard=1`);
  for (const id of philCaptures.splice(0)) await phil.delete(`/api/captures/${id}`);
  for (const id of tessCaptures.splice(0)) await tess.delete(`/api/captures/${id}`);
});
test.afterAll(async () => {
  await phil.dispose();
});

const spaceOf = (captureId: string) => localSql(`select p.id from public.raw_captures c join public.profiles p on p.personal_space_id = c.space_id where c.id = '${captureId}'`)[0]?.[0];
const all = async (who: APIRequestContext, path: string) => (await json<{ captures: Capture[] }>(await who.get(path))).captures;

test("Tess sees none of Phil's captures and cannot review, discard or delete them", async ({ page }) => {
  const seen = watch(page);
  const note = await json<TypedAnswer>(await phil.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${SECRET} note the alarm code`, summary: `${SECRET} detail`, tags: [] } } } }));
  philCaptures.push(note.capture_id);
  const task = await json<TypedAnswer>(await phil.post("/api/capture", { data: { typed: { kind: "task", fields: { title: `${SECRET} task`, description: "", due_window: "", key: false, tags: [] } } } }));
  philCaptures.push(task.capture_id);
  philTickets.push(task.routed_id);
  const auto = await json<{ routed_id: string }>(await phil.post("/api/capture", { data: { text: `quote: ${SECRET} said in confidence` } }));
  philCaptures.push(auto.routed_id);
  expect(spaceOf(note.capture_id)).toBe(PHIL.id);

  // Phil has them
  expect((await all(phil, "/api/captures/review?limit=200")).filter((c) => c.raw_text.includes(SECRET))).toHaveLength(3);

  // Tess does not, on any list
  for (const path of ["/api/captures?limit=200", "/api/captures/review?limit=200", "/api/captures/review?tab=all&limit=200"]) {
    const res = await tess.get(path);
    expect(res.status(), path).toBe(200);
    expect(await res.text(), path).not.toContain(SECRET);
  }
  expect(await (await tess.get("/api/tickets?list=inbox&limit=500")).text()).not.toContain(SECRET);
  expect((await tess.get(`/api/tickets/${task.routed_id}`)).status()).toBe(404);

  // nor can she act on one by id
  for (const body of [{ action: "approve" }, { action: "discard" }, { action: "reroute", kind: "idea", fields: { title: "hers now" } }]) {
    expect((await tess.patch(`/api/captures/${note.capture_id}/review`, { data: body })).status(), JSON.stringify(body)).toBe(404);
  }
  expect((await tess.delete(`/api/captures/${note.capture_id}`)).status()).toBe(404);

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
  const still = (await all(phil, "/api/captures/review?limit=200")).find((c) => c.id === note.capture_id);
  expect(still).toMatchObject({ reviewed_at: null, raw_text: `${SECRET} note the alarm code` });
  expect(still!.classification.kind).toBe("note");
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
  expect(answer).toMatchObject({ ok: true, kind: "note", review: "captures", routed_to: "raw_captures" });
  await expect(page.getByRole("status")).toHaveText("✓ Captured → Review");
  expect(spaceOf(answer.capture_id)).toBe(TESS.id);

  await page.goto("/organisation/captures/review");
  const card = page.getByRole("article").filter({ hasText: text });
  await expect(card).toBeVisible();
  const done = page.waitForResponse((r) => /\/api\/captures\/.+\/review$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH");
  await card.getByRole("button", { name: "APPROVE" }).click();
  expect((await done).status()).toBe(200);
  await expect(page.getByRole("article").filter({ hasText: text })).toHaveCount(0);

  // hers, reviewed; and nowhere in Phil's lists, nor his to act on
  expect((await all(tess, "/api/captures/review?tab=all&limit=200")).find((c) => c.id === answer.capture_id)?.reviewed_at).not.toBeNull();
  for (const path of ["/api/captures?limit=200", "/api/captures/review?tab=all&limit=200"]) expect(await (await phil.get(path)).text()).not.toContain(text);
  expect((await phil.patch(`/api/captures/${answer.capture_id}/review`, { data: { action: "discard" } })).status()).toBe(404);
  // her learning row is hers too
  expect(localSql(`select chosen_kind || '|' || approved_kind from public.capture_learning where capture_id = '${answer.capture_id}'`)[0][0]).toBe("note|note");
  expect(seen.serverErrors).toEqual([]);
  expect(seen.crashes).toEqual([]);
});

test("Tess's typed task is a ticket in her Inbox, not Phil's; Auto works for her with AI off", async () => {
  const res = await tess.post("/api/capture", { data: { typed: { kind: "task", fields: { title: `${T} tess task descale the kettle`, description: "", due_window: "month", key: false, tags: [] } } } });
  expect(res.status(), await res.text()).toBe(200);
  const answer = await json<TypedAnswer>(res);
  tessCaptures.push(answer.capture_id);
  tessTickets.push(answer.routed_id);
  expect(answer).toMatchObject({ review: "tickets_inbox", routed_to: "tickets" });
  expect(answer.ticket_key).toMatch(/^[A-Z0-9]+-\d+$/);
  const hers = await json<{ tickets: Array<{ id: string; suggested: Record<string, unknown> }> }>(await tess.get("/api/tickets?list=inbox&limit=500"));
  expect(hers.tickets.find((t) => t.id === answer.routed_id)?.suggested).toMatchObject({ due_window: "month" });
  const his = await json<{ tickets: Array<{ id: string }> }>(await phil.get("/api/tickets?list=inbox&limit=500"));
  expect(his.tickets.some((t) => t.id === answer.routed_id)).toBe(false);
  expect(localSql(`select owner = '${TESS.id}' from public.tickets where id = '${answer.routed_id}'`)[0][0]).toBe("t");

  const auto = await tess.post("/api/capture", { data: { text: `${T} tess auto decided to repaint the gate` } });
  expect(auto.status(), await auto.text()).toBe(200);
  const body = await json<{ kind: string; llm_source: string; routed_to: string; routed_id: string }>(auto);
  tessCaptures.push(body.routed_id);
  expect(body).toMatchObject({ kind: "decision", llm_source: "regex", routed_to: "raw_captures" });
  expect(spaceOf(body.routed_id)).toBe(TESS.id);
  expect(await (await phil.get("/api/captures?limit=200")).text()).not.toContain(`${T} tess auto`);
});

test.fixme("FINDING capture-6: a client_uuid already used by someone else answers 500", async () => {
  // raw_captures_client_uuid_key is unique across every space. The route's duplicate read runs under the
  // caller's RLS, so it cannot see the other person's row; the insert then hits the index and the route
  // answers 500 "capture failed". It should store the capture (uniqueness per space), or answer a 409.
  const client_uuid = crypto.randomUUID();
  const first = await json<TypedAnswer>(await phil.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${T} phil with a shared uuid`, summary: "", tags: [] } }, client_uuid } }));
  philCaptures.push(first.capture_id);
  const second = await tess.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${T} tess with the same uuid`, summary: "", tags: [] } }, client_uuid } });
  for (const id of localSql(`select id from public.raw_captures where raw_text = '${T} tess with the same uuid'`).map((r) => r[0])) tessCaptures.push(id);
  expect(second.status()).toBeLessThan(500);
});

test("a client_uuid used by Phil does not show Tess his capture", async () => {
  const client_uuid = crypto.randomUUID();
  const first = await json<TypedAnswer>(await phil.post("/api/capture", { data: { typed: { kind: "note", fields: { title: `${SECRET} uuid probe`, summary: "", tags: [] } }, client_uuid } }));
  philCaptures.push(first.capture_id);
  const second = await tess.post("/api/capture", { data: { text: `${T} tess probing a uuid`, client_uuid } });
  for (const id of localSql(`select id from public.raw_captures where raw_text = '${T} tess probing a uuid'`).map((r) => r[0])) tessCaptures.push(id);
  // whatever the answer, it must not carry Phil's wording or his capture id
  const body = await second.text();
  expect(body).not.toContain(SECRET);
  expect(body).not.toContain(first.capture_id);
  expect(localSql(`select count(*) from public.raw_captures where client_uuid = '${client_uuid}'`)[0][0]).toBe("1");
});
