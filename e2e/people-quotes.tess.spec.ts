/**
 * People, People review and Quotes as Tess, a second user with her own
 * space: she sees none of Phil's people, contacts, suggestions, ignored
 * words or quotes, cannot change them by id, and her own pages work and
 * show their empty states.
 *
 * Phil's side is set up through the API secret (which acts as Phil) and
 * removed afterwards. Tess's own rows carry `E2E-people-<run>` /
 * `E2E-quotes-<run>` and are removed too; nothing else of hers is touched.
 */
import { test, type APIRequestContext, type Page } from "@playwright/test";
import {
  closePending,
  createPerson,
  createQuote,
  expect,
  getPerson,
  letters,
  listIgnored,
  listPending,
  listPeople,
  listQuotes,
  PATIENT,
  PATIENT_USE,
  philApi,
  removeIgnored,
  removePerson,
  send,
  titleWord,
  type PersonRow,
  type QuoteRow,
} from "./people.shared.ts";

test.describe.configure(PATIENT);
test.use(PATIENT_USE);
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(PATIENT_USE.actionTimeout);
  page.setDefaultNavigationTimeout(PATIENT_USE.navigationTimeout);
});

const RUN = letters(6);
const P = `E2E-people-${RUN}`;
const Q = `E2E-quotes-${RUN}`;
const words = () => `${letters(7)} ${letters(9)} ${letters(6)} ${letters(8)} ${letters(7)}`;

let phil: APIRequestContext;
let philPerson: PersonRow;
let philContact: PersonRow;
let philBinned: PersonRow;
let philQuote: QuoteRow;
let philTicket = "";
const philAlias = titleWord();
const philIgnored = titleWord();
const philUnknown = `${titleWord()} ${titleWord()}`;
const tessPeople: string[] = [];

test.beforeAll(async () => {
  phil = await philApi();
  philPerson = await createPerson(phil, { first_name: `${P}-PhilOnly`, aliases: [philAlias], phone: "07700 900555", email: `phil.${RUN}@example.test` });
  philContact = await createPerson(phil, { first_name: `${P}-PhilContact`, tier: "contact" });
  philBinned = await createPerson(phil, { first_name: `${P}-PhilBinned` });
  expect((await phil.delete(`/api/people/${philBinned.id}`)).status()).toBe(200);
  philQuote = await createQuote(phil, { text: `${Q} phil ${words()}`, said_by_person_id: philPerson.id, skip_research: true });
  expect((await phil.post("/api/people/ignored", { data: { term: philIgnored } })).status()).toBe(200);
  const ticket = await send(() => phil.post("/api/work/tickets", { data: { title: `${P} ring ${philUnknown} about the roof` } }));
  expect(ticket.status(), await ticket.text()).toBe(201);
  philTicket = ((await ticket.json()) as { key: string }).key;
});

test.afterAll(async ({ request }) => {
  for (const q of await listQuotes(request, "limit=500")) if (q.text.includes(RUN)) await request.delete(`/api/quotes/${q.id}`);
  for (const id of tessPeople) await removePerson(request, id);
  for (const p of await listPeople(request)) if (p.first_name.includes(RUN)) await removePerson(request, p.id);
  if (philTicket) await send(() => phil.delete(`/api/tickets/${philTicket}?hard=1`));
  await closePending(phil, [philUnknown]);
  await removeIgnored(phil, [philIgnored]);
  await phil.delete(`/api/quotes/${philQuote.id}`);
  for (const p of [philPerson, philContact, philBinned]) await removePerson(phil, p.id);
  await phil.dispose();
});

const personCard = (page: Page, name: string) => page.locator("a[href^='/organisation/people/'], a[href='#']").filter({ hasText: name });

test("Phil's side is really there (so not seeing it means something)", async () => {
  expect((await listPeople(phil)).map((p) => p.id)).toEqual(expect.arrayContaining([philPerson.id, philContact.id]));
  expect((await listQuotes(phil, "limit=500")).some((q) => q.id === philQuote.id)).toBe(true);
  expect((await listPending(phil)).some((p) => p.entity_name === philUnknown)).toBe(true);
  expect((await listIgnored(phil)).some((t) => t.term_key === philIgnored.toLowerCase())).toBe(true);
});

test("People as Tess: none of Phil's people, contacts or archived people, under any chip", async ({ page, request }) => {
  const hers = await listPeople(request);
  expect(hers.some((p) => p.first_name.includes(`${P}-Phil`))).toBe(false);

  await page.goto("/organisation/people");
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await page.getByLabel("Search people").fill(`${P}-Phil`);
  await expect(personCard(page, `${P}-Phil`)).toHaveCount(0);
  await expect(page.getByText(hers.some((p) => p.tier === "person" && !p.archived_at) ? "No people match these filters." : /^No people yet\. Add one above/)).toBeVisible();

  await page.getByRole("button", { name: "CONTACTS", exact: true }).click();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(personCard(page, `${P}-Phil`)).toHaveCount(0);
  await expect(page.getByText(hers.some((p) => p.tier === "contact" && !p.archived_at) ? "No people match these filters." : /^No contacts\. Import a \.vcf above/)).toBeVisible();

  await page.getByRole("button", { name: "PEOPLE", exact: true }).click();
  await page.getByRole("button", { name: /^REVIEW NEEDED/ }).click();
  await expect(page.getByText("No people waiting for review. 🌱")).toBeVisible();
  await page.getByRole("button", { name: "ARCHIVED", exact: true }).click();
  await expect(page.getByText(/^Nobody archived\./)).toBeVisible();
});

test("Phil's person by id: not found for Tess, in the API and on the page", async ({ page, request }) => {
  for (const id of [philPerson.id, philContact.id, philBinned.id]) {
    expect((await request.get(`/api/people/${id}`)).status()).toBe(404);
  }
  for (const path of ["mentions", "quotes", "links", "captures", "days"]) {
    const res = await request.get(`/api/people/${philPerson.id}/${path}`);
    expect(res.status(), path).toBeLessThan(500);
    const text = await res.text();
    expect(text, path).not.toContain(RUN);
    expect(text, path).not.toContain(philQuote.id);
  }
  await page.goto(`/organisation/people/${philPerson.id}`);
  await expect(page.getByText("This person is not here.")).toBeVisible();
  await expect(page.getByText(`${P}-PhilOnly`)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "← PEOPLE" })).toBeVisible();
});

test("Tess cannot change, bin, reject, merge or restore Phil's people", async ({ request }) => {
  const id = philPerson.id;
  expect((await request.patch(`/api/people/${id}`, { data: { first_name: "Taken", notes: "by Tess", archived: true } })).status()).toBe(404);
  await request.delete(`/api/people/${id}`);
  await request.delete(`/api/people/${id}?reject=1`);
  await request.delete(`/api/people/${id}?hard=1`);
  await request.post(`/api/people/${id}/promote`);
  await request.post(`/api/people/${philBinned.id}/restore`);
  await request.post(`/api/people/${id}/aliases`, { data: { alias: `Tess${letters(8)}` } });
  await request.post(`/api/people/${id}/phones`, { data: { number_raw: "07700 900556" } });
  await request.post("/api/people/bulk", { data: { ids: [id, philContact.id], action: "reject" } });
  await request.post("/api/people/bulk", { data: { ids: [id, philContact.id], action: "archive" } });
  const mine = await createPerson(request, { first_name: `${P}-TessMergeBait` });
  tessPeople.push(mine.id);
  expect((await request.post("/api/people/merge", { data: { survivor_id: mine.id, loser_id: id } })).status()).toBe(404);
  expect((await request.post("/api/people/merge", { data: { survivor_id: id, loser_id: mine.id } })).status()).toBe(404);

  const after = await getPerson(phil, id);
  expect(after).toMatchObject({ id, first_name: `${P}-PhilOnly`, needs_review: false });
  expect(after?.archived_at ?? null).toBeNull();
  expect(after?.phones).toHaveLength(1);
  expect(after?.aliases?.map((a) => a.alias).sort()).toEqual([philAlias, `E2e-people-${RUN}-philonly`].sort());
  expect((await getPerson(phil, philContact.id))?.tier).toBe("contact");
  expect(await getPerson(phil, philBinned.id)).toBeNull();
  // and none of Phil's names landed on either ignore list
  expect((await listIgnored(phil)).some((t) => t.term_key.includes(`${P}-philonly`.toLowerCase()))).toBe(false);
  expect((await listIgnored(request)).some((t) => t.term_key.includes(RUN))).toBe(false);
});

test("the bin, the ignore list, the suggestions, the review queue, the export and the import list hold nothing of Phil's", async ({ page, request }) => {
  const read = async (path: string) => {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    return res.text();
  };
  for (const path of ["/api/people/bin", "/api/people/ignored", "/api/pending-entities", "/api/pending-entities?resolved=true", "/api/people/review-queue", "/api/people/export.vcf", "/api/people/import/batches", "/api/people?tier=all&archived=all"]) {
    const text = await read(path);
    expect(text, path).not.toContain(`${P}-Phil`);
    expect(text, path).not.toContain(`phil.${RUN}@example.test`);
    expect(text.toLowerCase(), path).not.toContain(philIgnored.toLowerCase());
    expect(text, path).not.toContain(philUnknown);
    expect(text, path).not.toContain(philAlias);
  }
  // resolving Phil's suggestion by id is not hers to do
  const philPending = (await listPending(phil)).find((p) => p.entity_name === philUnknown)!;
  expect((await request.post(`/api/pending-entities/${philPending.id}/resolve`, { data: { action: "create_new" } })).status()).toBe(404);
  expect((await listPending(phil)).some((p) => p.id === philPending.id)).toBe(true);
  expect((await listPeople(request)).some((p) => p.first_name === philUnknown)).toBe(false);

  await page.goto("/other/settings/people");
  await expect(page.getByText("BIN — DELETED PEOPLE")).toBeVisible();
  await expect(page.getByText("IGNORED WORDS — NEVER PEOPLE")).toBeVisible();
  await expect(page.getByText(`${P}-PhilBinned`)).toHaveCount(0);
  await expect(page.getByText(philIgnored)).toHaveCount(0);

  await page.goto("/organisation/captures/review?tab=entities");
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(page.getByText(philUnknown)).toHaveCount(0);
});

test("Phil's ignored word and Phil's people mean nothing in Tess's space: her ticket with the same words queues her own suggestion", async ({ request }) => {
  const res = await send(() => request.post("/api/work/tickets", { data: { title: `${P} tess asks ${philIgnored} and ${philAlias} for a hand` } }));
  expect(res.status(), await res.text()).toBe(201);
  const key = ((await res.json()) as { key: string }).key;
  try {
    const hers = await listPending(request);
    expect(hers.filter((p) => p.entity_name === philIgnored)).toHaveLength(1);
    expect(hers.filter((p) => p.entity_name === philAlias)).toHaveLength(1);
    // nothing was linked to Phil's person, and nobody was created anywhere
    const mentions = (await (await phil.get(`/api/people/${philPerson.id}/mentions?limit=50`)).json()) as { mentions: unknown[] };
    expect(mentions.mentions).toHaveLength(0);
    expect((await listPeople(request)).some((p) => [philIgnored, philAlias].includes(p.first_name))).toBe(false);
  } finally {
    await send(() => request.delete(`/api/tickets/${key}?hard=1`));
    await closePending(request, [philIgnored, philAlias]);
  }
});

test("Quotes as Tess: none of Phil's quotes, by list, search, id, person, export or the duplicate check", async ({ page, request }) => {
  const hers = await listQuotes(request, "limit=500");
  expect(hers.some((q) => q.id === philQuote.id)).toBe(false);

  await page.goto("/organisation/quotes");
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(page.getByText(philQuote.text)).toHaveCount(0);
  if (hers.length === 0) await expect(page.getByText("No quotes yet. Say “quote from Jake: …” to the bot, or add one.")).toBeVisible();
  await page.getByPlaceholder("Search quotes…").fill(philQuote.text.slice(0, 40));
  await expect(page.locator("article").filter({ hasText: RUN })).toHaveCount(0);

  expect((await request.get(`/api/quotes/${philQuote.id}`)).status()).toBe(404);
  expect((await request.patch(`/api/quotes/${philQuote.id}`, { data: { text: "Tess was here" } })).status()).toBe(404);
  expect((await request.delete(`/api/quotes/${philQuote.id}`)).status()).toBe(404);
  expect((await request.patch(`/api/quotes/${philQuote.id}/research`, { data: { action: "wrong" } })).status()).toBe(404);
  expect((await request.post(`/api/quotes/${philQuote.id}/research`)).status()).toBeLessThan(500);
  expect(await (await request.get(`/api/quotes?person=${philPerson.id}`)).text()).not.toContain(RUN);
  expect(await (await request.get(`/api/people/${philPerson.id}/quotes`)).text()).not.toContain(RUN);
  expect(await (await request.get("/api/quotes/export?format=csv")).text()).not.toContain(RUN);
  expect(await (await request.get("/api/quotes/export?format=txt")).text()).not.toContain(RUN);
  // the near-duplicate check must not reveal that someone else has these words
  const similar = (await (await request.get(`/api/quotes/similar?text=${encodeURIComponent(philQuote.text)}`)).json()) as { similar: unknown[] };
  expect(similar.similar).toHaveLength(0);
  const same = await send(() => request.post("/api/quotes", { data: { text: philQuote.text, skip_research: true } }));
  expect(same.status(), "Tess was told Phil already has this quote").toBe(201);

  const still = (await listQuotes(phil, "limit=500")).find((q) => q.id === philQuote.id);
  expect(still).toMatchObject({ text: philQuote.text, said_by_person_id: philPerson.id, research_status: "skipped" });
});

test("Tess's quote cannot be pinned on one of Phil's people", async ({ request }) => {
  const text = `${Q} tess pin ${words()}`;
  const res = await send(() => request.post("/api/quotes", { data: { text, said_by_person_id: philPerson.id, is_own: false, skip_research: true, force: true } }));
  expect(res.status()).toBeLessThan(500);
  if (res.status() === 201) {
    const row = ((await res.json()) as { quote: QuoteRow }).quote;
    expect(row.said_by_person_id, "the quote kept a link to a person in someone else's space").toBeNull();
  }
  const own = await createQuote(request, { text: `${Q} tess own ${words()}`, skip_research: true });
  const patched = await send(() => request.patch(`/api/quotes/${own.id}`, { data: { said_by_person_id: philPerson.id } }));
  expect(patched.status()).toBeLessThan(500);
  const after = (await listQuotes(request, "limit=500")).find((q) => q.id === own.id)!;
  expect(after.said_by_person_id, "the quote kept a link to a person in someone else's space").toBeNull();
  // Phil's person does not gain a quote he cannot see, and a link from Tess does not promote his contact
  expect((await listPeople(phil)).find((p) => p.id === philPerson.id)?.quote_count).toBe(1);
  await send(() => request.post("/api/quotes", { data: { text: `${Q} tess contact ${words()}`, said_by_person_id: philContact.id, is_own: false, skip_research: true, force: true } }));
  expect((await getPerson(phil, philContact.id))?.tier).toBe("contact");
});

test("Tess's own journey: add a person and a quote, link them, and Phil sees neither", async ({ page, request }) => {
  const first = `${P}-TessFriend`;
  await page.goto("/organisation/people");
  await page.getByRole("button", { name: "+ ADD PERSON" }).click();
  const drawer = page.getByRole("dialog", { name: "Add person" });
  await drawer.locator('input[type="text"]').nth(0).fill(first);
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();
  await page.getByLabel("Search people").fill(first);
  await expect(personCard(page, first)).toHaveCount(1);
  const friend = (await listPeople(request)).find((p) => p.first_name === first)!;
  tessPeople.push(friend.id);

  const text = `${Q} tess ${words()}`;
  await page.goto("/organisation/quotes");
  await page.getByRole("button", { name: "+ ADD" }).click();
  await page.getByLabel(/^Quote/).fill(text);
  await page.getByLabel("Who").selectOption({ label: first });
  // her picker offers her people only
  await expect(page.getByLabel("Who").locator("option", { hasText: `${P}-PhilOnly` })).toHaveCount(0);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/quotes") && r.request().method() === "POST");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  expect((await created).status()).toBe(201);
  const card = page.locator("article").filter({ hasText: text });
  await expect(card.getByRole("link", { name: first })).toHaveAttribute("href", `/organisation/people/${friend.id}`);

  expect((await listPeople(phil)).some((p) => p.id === friend.id)).toBe(false);
  expect((await phil.get(`/api/people/${friend.id}`)).status()).toBe(404);
  expect((await listQuotes(phil, "limit=500")).some((q) => q.text === text)).toBe(false);
  expect(await (await phil.get("/api/people/export.vcf")).text()).not.toContain(first);
});
