/**
 * Gifts phase 1 (claude/gifts-spec.md), as Phil: a birthday in People
 * becomes an occasion once (and only once) the engine runs; an idea added by
 * hand, the near-duplicate warning, the sheet's status moves, Buy this
 * making a shopping-list purchase, the notes thread; a captured gift idea
 * waiting for review with its recipient and occasion matched, approved into
 * a gift; the reminder task made once when the lead window is open; the
 * person's page and list count; the export.
 *
 * Cloud AI is off on this server, so captures are read by the regex
 * fallback. Capture checks go through the API (the sidebar's Capture button
 * sits under the dev-tools badge on a dev server).
 *
 * Everything here carries `E2E-gifts-<run>` and is removed afterwards.
 */
import { test, type APIRequestContext, type Page } from "@playwright/test";
import { processed, tidyCaptures } from "./capture.helpers.ts";
import { CRON_AUTH, londonNow, NO_SESSION } from "./daylog.helpers.ts";
import { createPerson, expect, letters, PATIENT, PATIENT_USE, removePerson, send, titleWord } from "./people.shared.ts";
import { E2E_ORIGIN } from "./support/env.ts";
import { localSql } from "../lib/access/introspect.ts";

test.describe.configure(PATIENT);
test.use(PATIENT_USE);
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(PATIENT_USE.actionTimeout);
  page.setDefaultNavigationTimeout(PATIENT_USE.navigationTimeout);
});

const RUN = letters(6);
const G = `E2E-gifts-${RUN}`;
const NAME = titleWord();

type Gift = { id: string; title: string; status: string; for_person_id: string | null; for_label: string | null; occasion_id: string | null; origin: string; purchase_id: string | null; capture_id: string | null; reason: string | null; comment_count?: number };
type Occasion = { id: string; name: string; kind: string; person_id: string | null; occurs_on: string; source: string; recurrence: string; reminder_task_id: string | null; lead_days: number[] };

const madePeople: string[] = [];
const madeCaptures: string[] = [];
const madeOccasions: string[] = [];

function shift(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const listGifts = async (api: APIRequestContext, qs = "include_rejected=1&limit=500"): Promise<Gift[]> => (await (await api.get(`/api/gifts?${qs}`)).json()).gifts as Gift[];
const mine = async (api: APIRequestContext) => (await listGifts(api)).filter((g) => g.title.includes(RUN));
const occasions = async (api: APIRequestContext, qs = ""): Promise<Occasion[]> => (await (await api.get(`/api/gift-occasions${qs ? `?${qs}` : ""}`)).json()).occasions as Occasion[];
const giftCard = (page: Page, text: string) => page.getByTestId("gift-card").filter({ hasText: text });

async function openGifts(page: Page) {
  await page.goto("/organisation/gifts");
  await page.getByLabel("View").selectOption("all");
  await page.getByPlaceholder("Search gift ideas…").fill(G);
}

async function cron() {
  const ctx = await (await import("@playwright/test")).request.newContext({ baseURL: E2E_ORIGIN, storageState: NO_SESSION, extraHTTPHeaders: CRON_AUTH });
  return ctx;
}

let person: { id: string };
let birthday: string; // this year's or next year's instance

/** The engine run, so this worker's person has their birthday occasion (Playwright restarts the worker after a failure, and beforeAll makes a new person). */
async function ensureOccasion(api: APIRequestContext) {
  if ((await occasions(api)).some((o) => o.person_id === person.id)) return;
  expect((await send(() => api.post("/api/gift-occasions/sync"))).status()).toBe(200);
}

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: E2E_ORIGIN, extraHTTPHeaders: { "x-api-secret": "e2e-api-secret" } });
  // a birthday 20 days out: inside the 30-day lead window, not on a lead day
  const today = londonNow().date;
  birthday = shift(today, 20);
  person = await createPerson(api, { first_name: NAME, birthday: `1990-${birthday.slice(5)}` });
  madePeople.push(person.id);
  await api.dispose();
});

test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: E2E_ORIGIN, extraHTTPHeaders: { "x-api-secret": "e2e-api-secret" } });
  for (const g of await mine(api)) {
    if (g.purchase_id) await api.delete(`/api/purchases/${g.purchase_id}`);
    await api.delete(`/api/gifts/${g.id}`);
  }
  await tidyCaptures(api, madeCaptures);
  for (const o of await occasions(api, "past=1&archived=1")) if (o.person_id === person.id || madeOccasions.includes(o.id)) {
    if (o.reminder_task_id) await api.delete(`/api/tickets/${o.reminder_task_id}?hard=1`);
    await api.delete(`/api/gift-occasions/${o.id}`);
  }
  for (const id of madePeople) await removePerson(api, id);
  await api.dispose();
});

test("a birthday in People becomes an occasion when the engine runs, once; the fixed calendar comes with it", async ({ request }) => {
  const first = await send(() => request.post("/api/gift-occasions/sync"));
  expect(first.status(), await first.text()).toBe(200);
  let rows = (await occasions(request)).filter((o) => o.person_id === person.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: "birthday", source: "person_dob", recurrence: "annual", occurs_on: birthday, lead_days: [30, 7], reminder_task_id: null });
  expect(rows[0].name).toContain(NAME);

  // again: the same instance, no second row
  expect((await send(() => request.post("/api/gift-occasions/sync"))).status()).toBe(200);
  rows = (await occasions(request)).filter((o) => o.person_id === person.id);
  expect(rows).toHaveLength(1);

  const kinds = new Set((await occasions(request)).map((o) => o.kind));
  expect(kinds.has("christmas") || kinds.has("valentines"), "the fixed calendar is seeded").toBe(true);
});

test("add an idea by hand for them; the same words again warn first, Add anyway makes two", async ({ page, request }) => {
  const title = `${G} ${letters(8)} knife`;
  await page.goto("/organisation/gifts");
  await page.getByRole("button", { name: "+ IDEA" }).click();
  await expect(page.getByRole("button", { name: "SAVE", exact: true })).toBeDisabled();
  await page.getByLabel(/^Gift/).fill(title);
  await page.getByLabel(/^For/).selectOption(person.id);
  await page.getByLabel(/^Why it suits them/).fill("keeps saying his knives are blunt");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/gifts") && r.request().method() === "POST");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  expect((await created).status()).toBe(201);

  await openGifts(page);
  const card = giftCard(page, title);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(NAME);
  await expect(card).toContainText("keeps saying his knives are blunt");
  await expect(card).toContainText("idea");

  const row = (await mine(request)).find((g) => g.title === title)!;
  expect(row).toMatchObject({ for_person_id: person.id, for_label: null, status: "idea", origin: "manual", reason: "keeps saying his knives are blunt" });
  // the list carries the count
  const people = (await (await request.get("/api/people")).json()).people as Array<{ id: string; gift_idea_count: number }>;
  expect(people.find((p) => p.id === person.id)?.gift_idea_count).toBeGreaterThanOrEqual(1);

  // again, for the same person
  await page.getByRole("button", { name: "+ IDEA" }).click();
  await page.getByLabel(/^Gift/).fill(title);
  await page.getByLabel(/^For/).selectOption(person.id);
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.getByTestId("gift-dupes")).toContainText("Looks like an idea you already have for them");
  expect((await mine(request)).filter((g) => g.title === title)).toHaveLength(1);
  const forced = page.waitForResponse((r) => r.url().endsWith("/api/gifts") && r.request().method() === "POST");
  await page.getByRole("button", { name: "ADD ANYWAY" }).click();
  expect((await forced).status()).toBe(201);
  expect((await mine(request)).filter((g) => g.title === title)).toHaveLength(2);
});

test("the sheet: shortlist, a note, Buy this makes a shopping-list purchase and the gift is bought", async ({ page, request }) => {
  const title = `${G} ${letters(8)} record player`;
  const made = await send(() => request.post("/api/gifts", { data: { title, for_person_id: person.id, target_price: 120, retailer: "Richer Sounds" } }));
  expect(made.status(), await made.text()).toBe(201);
  const gift = (await made.json()).gift as Gift;

  await openGifts(page);
  await giftCard(page, title).getByRole("button").first().click();
  const sheet = page.getByTestId("gift-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "BUY THIS" })).toHaveCount(0);

  // a note
  await sheet.getByPlaceholder("Add a note…").fill("the walnut one, not the black");
  await sheet.getByRole("button", { name: "ADD", exact: true }).click();
  await expect(sheet.getByTestId("gift-comment")).toContainText("the walnut one, not the black");

  // shortlist, then buy
  await sheet.getByRole("button", { name: "SHORTLIST" }).click();
  await expect(sheet.getByRole("button", { name: "BUY THIS" })).toBeVisible();
  const converted = page.waitForResponse((r) => r.url().endsWith(`/api/gifts/${gift.id}/convert`));
  await sheet.getByRole("button", { name: "BUY THIS" }).click();
  expect((await converted).status()).toBe(200);
  await expect(sheet.getByRole("button", { name: "GIVEN" })).toBeVisible();

  const row = (await mine(request)).find((g) => g.id === gift.id)!;
  expect(row.status).toBe("bought");
  expect(row.purchase_id).toMatch(/^[0-9a-f-]{36}$/);
  const [p] = localSql(`select title, amount::text, list_type, context_tag, want_or_need from public.purchases where id = '${row.purchase_id}'`);
  expect(p, "the purchase row exists").toBeTruthy();
  expect(p).toEqual([`${title} (Richer Sounds)`, "120", "shopping", "gift", "want"]);

  // a second Buy this is refused: one-way, once
  expect((await request.post(`/api/gifts/${gift.id}/convert`)).status()).toBe(409);

  // given
  await sheet.getByRole("button", { name: "GIVEN" }).click();
  await expect(sheet.getByText("given", { exact: true })).toBeVisible();
  expect((await mine(request)).find((g) => g.id === gift.id)?.status).toBe("given");
});

test("a captured gift idea waits for review with the recipient and occasion matched; approving makes the gift", async ({ request }) => {
  await ensureOccasion(request);
  const thing = `${letters(7)} ${letters(6)} ${G}`;
  const text = `Get ${NAME} a ${thing} for his birthday because he keeps asking`;
  const res = await send(() => request.post("/api/capture", { data: { text } }));
  expect(res.status(), await res.text()).toBe(202);
  const captureId = ((await res.json()) as { capture_id: string }).capture_id;
  madeCaptures.push(captureId);
  const done = await processed(captureId);
  expect(done.routed_to, "a gift idea waits for review").toBe("raw_captures");
  const cls = done.classification as { kind: string; gift: { title: string; person: string | null; occasion: string | null; reason: string | null }; gift_person_id: string | null; gift_occasion_id: string | null };
  expect(cls.kind).toBe("gift_idea");
  expect(cls.gift).toMatchObject({ title: thing, person: NAME, occasion: "birthday", reason: "he keeps asking" });
  expect(cls.gift_person_id, "the recipient is matched by alias, never created").toBe(person.id);
  const occ = (await occasions(request)).find((o) => o.person_id === person.id)!;
  expect(cls.gift_occasion_id, "the open birthday occasion is matched").toBe(occ.id);
  expect((await mine(request)).some((g) => g.title === thing), "nothing in gifts before approve").toBe(false);

  const approved = await send(() => request.patch(`/api/captures/${captureId}/review`, { data: { action: "approve", kind: "gift_idea", gift: { target_price: 35 } } }));
  expect(approved.status(), await approved.text()).toBe(200);
  const after = (await approved.json()) as { capture: { routed_to: string; routed_id: string } };
  expect(after.capture.routed_to).toBe("gifts");
  const gift = (await mine(request)).find((g) => g.id === after.capture.routed_id)!;
  expect(gift).toMatchObject({ title: thing, for_person_id: person.id, occasion_id: occ.id, origin: "capture", capture_id: captureId, status: "idea", reason: "he keeps asking" });

  // the same idea captured again: approving with "keep existing" points at the first and makes nothing
  const again = await send(() => request.post("/api/capture", { data: { text } }));
  const secondId = ((await again.json()) as { capture_id: string }).capture_id;
  madeCaptures.push(secondId);
  await processed(secondId);
  const similar = (await (await request.get(`/api/gifts/similar?title=${encodeURIComponent(thing)}&person=${person.id}`)).json()).similar as Array<{ id: string }>;
  expect(similar.map((s) => s.id)).toContain(gift.id);
  const kept = await send(() => request.patch(`/api/captures/${secondId}/review`, { data: { action: "approve", kind: "gift_idea", duplicate: { id: gift.id, action: "keep" } } }));
  expect(kept.status(), await kept.text()).toBe(200);
  expect(((await kept.json()) as { capture: { routed_id: string } }).capture.routed_id).toBe(gift.id);
  expect((await mine(request)).filter((g) => g.title === thing)).toHaveLength(1);
});

test("the reminder task is made once when the lead window is open, in Next, due a week before", async ({ request }) => {
  await ensureOccasion(request);
  const sys = await cron();
  const first = await sys.get("/api/cron/gift-reminders");
  expect(first.status(), await first.text()).toBe(200);
  const occ = (await occasions(request)).find((o) => o.person_id === person.id)!;
  expect(occ.reminder_task_id, "the task is recorded on the occasion").toMatch(/^[0-9a-f-]{36}$/);
  const ticket = await request.get(`/api/tickets/${occ.reminder_task_id}`);
  expect(ticket.status()).toBe(200);
  const t = (await ticket.json()).task as { title: string; category: string | null; deadline_on: string | null };
  expect(t.title).toBe(`Gift for ${NAME} — birthday, ${new Date(`${birthday}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`);
  expect(t.deadline_on).toBe(shift(birthday, -7));
  expect(t.category, "the task is in Next").toBe("next");

  // again: no second task
  expect((await sys.get("/api/cron/gift-reminders")).status()).toBe(200);
  expect((await occasions(request)).find((o) => o.person_id === person.id)?.reminder_task_id).toBe(occ.reminder_task_id);
  await sys.dispose();
});

test("the person's page lists their gift ideas; the export has the run's rows and headers without underscores", async ({ page, request }) => {
  for (const what of ["scarf", "book", "torch"]) expect((await send(() => request.post("/api/gifts", { data: { title: `${G} ${letters(6)} ${what}`, for_person_id: person.id, force: true } }))).status()).toBe(201);
  await page.goto(`/organisation/people/${person.id}`);
  const section = page.getByTestId("person-gifts");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("gift-card").first()).toContainText(G);

  const csv = await request.get(`/api/gifts/export?format=csv&person=${person.id}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const [header, ...lines] = (await csv.text()).split("\r\n");
  expect(header.startsWith("Title,For,Occasion,Needed By,Status")).toBe(true);
  expect(header.includes("_")).toBe(false);
  expect(lines.filter((l) => l.includes(G)).length).toBeGreaterThanOrEqual(3);
  expect(lines.some((l) => l.includes(NAME))).toBe(true);
});

test("rejecting keeps the row out of the list but in the record", async ({ request }) => {
  const title = `${G} ${letters(8)} socks`;
  const made = await send(() => request.post("/api/gifts", { data: { title, for_person_id: person.id } }));
  const gift = (await made.json()).gift as Gift;
  const rejected = await send(() => request.patch(`/api/gifts/${gift.id}`, { data: { status: "rejected", rejected_reason: "he has drawers of them" } }));
  expect(rejected.status()).toBe(200);
  expect((await listGifts(request, "limit=500")).some((g) => g.id === gift.id), "left out by default").toBe(false);
  expect((await listGifts(request, "include_rejected=1&limit=500")).find((g) => g.id === gift.id)).toMatchObject({ status: "rejected" });
});
