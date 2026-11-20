/**
 * People review (MYC-175, R1–R6), as Phil.
 *
 *   R1  no path creates a person: a ticket whose title holds Title Case
 *       words queues one review suggestion and nothing else
 *   R2  reject bins the person and ignores their words; restore undoes both
 *   R3  archive hides a person and stops their name being suggested again
 *   R4  the ignore list: exact, case-insensitive, with add and remove in Settings
 *   R6  Keep / Archive / Reject on a Review Needed card, and in bulk
 *
 * The unknown names are made-up words ("Zq" + ten letters), so nothing real
 * can match them. Tickets carry `E2E-people-<run>` and are deleted for good.
 */
import { test, type APIRequestContext, type Page } from "@playwright/test";
import { closePending, createPerson, expect, getPerson, PATIENT, PATIENT_USE, letters, listIgnored, listPending, listPeople, peopleNamed, removeIgnored, removePerson, send, titleWord } from "./people.shared.ts";

test.describe.configure(PATIENT);
test.use(PATIENT_USE);
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(PATIENT_USE.actionTimeout);
  page.setDefaultNavigationTimeout(PATIENT_USE.navigationTimeout);
});

const RUN = letters(6);
const P = `E2E-people-${RUN}`;

const madePeople: string[] = [];
const madeTickets: string[] = [];
const madeWords: string[] = [];

/** Two made-up Title Case words: the extractor reads them as one name. */
function unknownName(): string {
  const name = `${titleWord()} ${titleWord()}`;
  madeWords.push(name);
  return name;
}

async function person(api: APIRequestContext, body: Record<string, unknown>) {
  const p = await createPerson(api, body);
  madePeople.push(p.id);
  return p;
}

async function workTicket(api: APIRequestContext, title: string, extra: Record<string, unknown> = {}): Promise<{ key: string; id: string }> {
  const res = await send(() => api.post("/api/work/tickets", { data: { title, ...extra } }));
  expect(res.status(), `create ticket: ${await res.text()}`).toBe(201);
  const j = (await res.json()) as { key: string; ticket: { id: string } };
  madeTickets.push(j.key);
  return { key: j.key, id: j.ticket.id };
}

async function retitle(api: APIRequestContext, key: string, title: string): Promise<void> {
  const res = await send(() => api.patch(`/api/tickets/${key}`, { data: { title } }));
  expect(res.status(), `retitle: ${await res.text()}`).toBe(200);
}

const pendingFor = async (api: APIRequestContext, name: string) => (await listPending(api)).filter((p) => p.entity_name.toLowerCase() === name.toLowerCase());

const card = (page: Page, name: string) => page.locator("a[href^='/organisation/people/'], a[href='#']").filter({ hasText: name });

async function openReviewNeeded(page: Page, search: string): Promise<void> {
  await page.goto("/organisation/people");
  await page.getByRole("button", { name: /^REVIEW NEEDED/ }).click();
  await page.getByLabel("Search people").fill(search);
}

test.afterAll(async ({ request }) => {
  // deletes draw on the same write budget as every other suite acting as Phil
  for (const key of madeTickets) await send(() => request.delete(`/api/tickets/${key}?hard=1`));
  await closePending(request, madeWords);
  for (const id of madePeople) await removePerson(request, id);
  // people the checks made through the UI, and anything a reject left tagged with them
  for (const p of await listPeople(request)) if (p.first_name.includes(P) || madeWords.some((w) => w.toLowerCase() === p.first_name.toLowerCase())) await removePerson(request, p.id);
  const bin = (await (await request.get("/api/people/bin")).json()) as { people: Array<{ id: string; first_name: string }> };
  for (const p of bin.people ?? []) if (p.first_name.includes(P) || madeWords.some((w) => w.toLowerCase() === p.first_name.toLowerCase())) await removePerson(request, p.id);
  await removeIgnored(request, [...madeWords, ...(await listIgnored(request)).filter((t) => t.term_raw.toLowerCase().includes(P.toLowerCase())).map((t) => t.term_raw)]);
});

test("R1: a ticket with Title Case words creates no person, only one suggestion, however often it is saved", async ({ request }) => {
  const name = unknownName();
  const title = `${P} chase ${name} about the fence`;
  const ticket = await workTicket(request, title);

  expect(peopleNamed(name), "a person was created from a ticket title").toBe(0);
  expect((await listPeople(request)).some((p) => [p.first_name, p.last_name, p.display_name].join(" ").toLowerCase().includes(name.split(" ")[0].toLowerCase()))).toBe(false);
  const queued = await pendingFor(request, name);
  expect(queued).toHaveLength(1);
  expect(queued[0].entity_type).toBe("person");
  expect(queued[0].additional_data).toMatchObject({ source_kind: "ticket", snippet: title, ticket_id: ticket.id });

  // a ticket rebuilds its mentions on every save: still one suggestion, still no person
  await retitle(request, ticket.key, `${title} again`);
  await retitle(request, ticket.key, `${title} once more`);
  expect(await pendingFor(request, name)).toHaveLength(1);
  expect(peopleNamed(name)).toBe(0);

  // a second ticket with the same words does not queue a second one
  await workTicket(request, `${P} ring ${name} back`);
  expect(await pendingFor(request, name)).toHaveLength(1);
  expect(peopleNamed(name)).toBe(0);
});

test("R1: the older ticket route and a description behave the same way", async ({ request }) => {
  const inTitle = unknownName();
  const inDescription = unknownName();
  const res = await send(() => request.post("/api/tickets", { data: { title: `${P} legacy ${inTitle} ticket` } }));
  expect(res.status(), await res.text()).toBe(201);
  const key = ((await res.json()) as { key: string }).key;
  madeTickets.push(key);
  const patched = await send(() => request.patch(`/api/tickets/${key}`, { data: { description: `Ask ${inDescription} for the keys.` } }));
  expect(patched.status(), await patched.text()).toBe(200);

  expect(peopleNamed(inTitle)).toBe(0);
  expect(peopleNamed(inDescription)).toBe(0);
  expect(await pendingFor(request, inTitle)).toHaveLength(1);
  expect(await pendingFor(request, inDescription)).toHaveLength(1);
});

test("the suggestion shows in New entities with the ticket's words; Reject ignores the name and it never comes back", async ({ page, request }) => {
  const name = unknownName();
  const title = `${P} order ${name} for the shed`;
  const ticket = await workTicket(request, title);

  await page.goto("/organisation/captures/review?tab=entities");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("person");
  const source = row.getByRole("link", { name: new RegExp(title) });
  await expect(source).toContainText("ticket");
  const sourceHref = await source.getAttribute("href");

  await row.getByRole("button", { name: "REJECT" }).click();
  await expect(row).toHaveCount(0);
  expect(await pendingFor(request, name)).toHaveLength(0);
  const ignored = (await listIgnored(request)).find((t) => t.term_key === name.toLowerCase());
  expect(ignored).toMatchObject({ source: "pending", person_id: null });
  expect(peopleNamed(name)).toBe(0);

  // saved again, and written into a new ticket: nothing is suggested, nobody is created
  await retitle(request, ticket.key, `${title} today`);
  await workTicket(request, `${P} collect ${name} from the yard`);
  expect(await pendingFor(request, name)).toHaveLength(0);
  expect(peopleNamed(name)).toBe(0);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

  // Settings shows why it is ignored; removing it there lets the name be suggested again
  await page.goto("/other/settings/people");
  const term = page.getByRole("listitem").filter({ hasText: name });
  await expect(term).toContainText("not a person (review)");
  await term.getByRole("button", { name: "REMOVE" }).click();
  await expect(term).toHaveCount(0);
  await retitle(request, ticket.key, `${title} tomorrow`);
  expect(await pendingFor(request, name)).toHaveLength(1);

  // the suggestion's source link opens the ticket it came from
  await page.goto(sourceHref ?? "");
  await expect(page.getByText(title).first()).toBeVisible();
});

test("R4: a word added by hand in Settings is ignored whatever its case, and only that exact word", async ({ page, request }) => {
  const word = titleWord();
  const longer = `${word}son`;
  madeWords.push(word, longer);
  await page.goto("/other/settings/people");
  await page.getByLabel("Ignore a word").fill(word.toLowerCase());
  await page.getByRole("button", { name: "IGNORE", exact: true }).click();
  const term = page.getByRole("listitem").filter({ hasText: new RegExp(`^${word}`, "i") });
  await expect(term).toContainText("added here");

  await workTicket(request, `${P} ask ${word} about the gate`);
  expect(await pendingFor(request, word)).toHaveLength(0);
  expect(peopleNamed(word)).toBe(0);
  // exact match only: a longer word that starts the same way is still suggested
  await workTicket(request, `${P} ask ${longer} about the gate`);
  expect(await pendingFor(request, longer)).toHaveLength(1);

  // the same word twice is one entry
  const again = await request.post("/api/people/ignored", { data: { term: word.toUpperCase() } });
  expect(((await again.json()) as { added: number }).added).toBe(0);
  expect((await listIgnored(request)).filter((t) => t.term_key === word.toLowerCase())).toHaveLength(1);
});

test("a suggestion becomes a person only when Create is pressed", async ({ page, request }) => {
  const name = titleWord();
  madeWords.push(name);
  await workTicket(request, `${P} meet ${name} at the allotment`);
  expect(peopleNamed(name)).toBe(0);

  await page.goto("/organisation/captures/review?tab=entities");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: "CREATE", exact: true }).click();
  await expect(row).toHaveCount(0);

  const made = (await listPeople(request)).filter((p) => p.first_name === name);
  expect(made).toHaveLength(1);
  madePeople.push(made[0].id);
  expect(made[0].needs_review).toBe(false);
  expect(made[0].aliases?.map((a) => a.alias)).toContain(name);
  expect(await pendingFor(request, name)).toHaveLength(0);
  // now a known person: the next ticket links to them and suggests nothing
  await workTicket(request, `${P} thank ${name} for the seeds`);
  expect(await pendingFor(request, name)).toHaveLength(0);
  expect(peopleNamed(name)).toBe(1);
});

test("Link to existing adds the wording as an alias of the chosen person", async ({ page, request }) => {
  const known = await person(request, { first_name: `${P}-Linkable` });
  const name = titleWord();
  madeWords.push(name);
  await workTicket(request, `${P} text ${name} the address`);

  await page.goto("/organisation/captures/review?tab=entities");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: "LINK TO EXISTING" }).click();
  await row.getByRole("combobox").selectOption({ label: `${P}-Linkable` });
  await row.getByRole("button", { name: "LINK", exact: true }).click();
  await expect(row).toHaveCount(0);

  expect(peopleNamed(name)).toBe(0);
  expect((await getPerson(request, known.id))?.aliases?.map((a) => a.alias)).toContain(name);
  await workTicket(request, `${P} thank ${name} again`);
  expect(await pendingFor(request, name)).toHaveLength(0);
});

test("R6: a Review Needed card shows where the name came from, and Keep clears the flag", async ({ page, request }) => {
  const alias = titleWord();
  const first = `${P}-Keep`;
  const p = await person(request, { first_name: first, aliases: [alias] });
  const title = `${P} lend ${alias} the ladder`;
  const ticket = await workTicket(request, title);
  expect((await request.patch(`/api/people/${p.id}`, { data: { needs_review: true } })).status()).toBe(200);

  await openReviewNeeded(page, first);
  const c = card(page, first);
  await expect(c).toHaveCount(1);
  await expect(c).toContainText("review");
  await expect(c).toContainText("1 mention");
  await expect(c).toContainText(`${ticket.key} — ${title}`);
  await expect(c.getByRole("button", { name: "ARCHIVE" })).toBeVisible();
  await expect(c.getByRole("button", { name: "REJECT" })).toBeVisible();

  await c.getByRole("button", { name: "KEEP" }).click();
  await expect(card(page, first)).toHaveCount(0);
  expect((await getPerson(request, p.id))?.needs_review).toBe(false);
  await page.getByRole("button", { name: "ALL", exact: true }).click();
  await expect(card(page, first)).toHaveCount(1);
});

test("R3: Archive from the card hides the person and stops their name being suggested; Unarchive undoes it", async ({ page, request }) => {
  const alias = titleWord();
  const first = `${P}-Shelve`;
  const p = await person(request, { first_name: first, aliases: [alias] });
  await request.patch(`/api/people/${p.id}`, { data: { needs_review: true } });

  await openReviewNeeded(page, first);
  await card(page, first).getByRole("button", { name: "ARCHIVE" }).click();
  await expect(card(page, first)).toHaveCount(0);
  const archived = await getPerson(request, p.id);
  expect(archived?.archived_at).toBeTruthy();
  expect(archived?.needs_review).toBe(false);
  expect((await listPeople(request, "tier=person")).some((x) => x.id === p.id)).toBe(false);

  // their alias in a ticket: not matched, not suggested as someone new
  const ticket = await workTicket(request, `${P} post ${alias} the keys`);
  expect(await pendingFor(request, alias)).toHaveLength(0);
  expect(peopleNamed(alias)).toBe(0);
  const mentions = (await (await request.get(`/api/people/${p.id}/mentions?limit=50`)).json()) as { mentions: Array<{ source_id: string }> };
  expect(mentions.mentions.some((m) => m.source_id === ticket.id)).toBe(false);

  await page.getByRole("button", { name: "ARCHIVED", exact: true }).click();
  await card(page, first).getByRole("button", { name: "UNARCHIVE" }).click();
  await expect(card(page, first)).toHaveCount(0);
  expect((await getPerson(request, p.id))?.archived_at ?? null).toBeNull();
  // matched again once unarchived
  await retitle(request, ticket.key, `${P} post ${alias} the keys today`);
  const after = (await (await request.get(`/api/people/${p.id}/mentions?limit=50`)).json()) as { mentions: Array<{ source_id: string }> };
  expect(after.mentions.some((m) => m.source_id === ticket.id)).toBe(true);
});

test("R2: Reject bins the person and ignores every name they had; Restore takes the words off again", async ({ page, request }) => {
  const alias = titleWord();
  const first = `${P}-Reject`;
  madeWords.push(alias);
  const p = await person(request, { first_name: first, aliases: [alias] });
  await request.patch(`/api/people/${p.id}`, { data: { needs_review: true } });

  await openReviewNeeded(page, first);
  let asked = "";
  page.once("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  await card(page, first).getByRole("button", { name: "REJECT" }).click();
  await expect(page.getByText(/Rejected “.+” — 2 words now ignored\. Restore from Settings → People → Bin\./)).toBeVisible();
  expect(asked).toContain(first);
  expect(asked).toContain("ignored");
  await expect(card(page, first)).toHaveCount(0);

  expect((await request.get(`/api/people/${p.id}`)).status()).toBe(404);
  const tagged = (await listIgnored(request)).filter((t) => t.person_id === p.id);
  expect(tagged.map((t) => t.term_key).sort()).toEqual([alias.toLowerCase(), first.toLowerCase()].sort());
  expect(tagged.every((t) => t.source === "reject")).toBe(true);
  await workTicket(request, `${P} ask ${alias} about the hedge`);
  expect(await pendingFor(request, alias)).toHaveLength(0);

  // Settings: the words say they belong to someone in the bin; restoring that person removes them
  await page.goto("/other/settings/people");
  await expect(page.getByRole("listitem").filter({ hasText: alias })).toContainText("rejected person");
  await page.getByRole("listitem").filter({ hasText: first }).filter({ hasText: "deleted" }).getByRole("button", { name: "RESTORE" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: alias })).toHaveCount(0);
  expect((await listIgnored(request)).filter((t) => t.person_id === p.id)).toHaveLength(0);
  expect((await getPerson(request, p.id))?.id).toBe(p.id);
});

test("R6: Select on Review Needed acts on every picked card, with one confirm for Reject", async ({ page, request }) => {
  const tag = `${P}-Bulk`;
  const ids: string[] = [];
  for (const n of ["One", "Two", "Three"]) {
    const p = await person(request, { first_name: `${tag}-${n}` });
    await request.patch(`/api/people/${p.id}`, { data: { needs_review: true } });
    ids.push(p.id);
  }
  await openReviewNeeded(page, tag);
  await expect(card(page, tag)).toHaveCount(3);
  await page.getByRole("button", { name: "SELECT", exact: true }).click();
  await card(page, `${tag}-One`).click();
  await page.getByRole("button", { name: "KEEP 1" }).click();
  await expect(page.getByText("Keep: 1 person")).toBeVisible();
  await expect(card(page, tag)).toHaveCount(2);

  // ALL picks what the search shows, nothing else
  await page.getByRole("button", { name: "SELECT", exact: true }).click();
  await page.getByRole("button", { name: "ALL", exact: true }).first().click();
  let asked = "";
  page.once("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  await page.getByRole("button", { name: "REJECT 2" }).click();
  await expect(page.getByText("Reject: 2 people · 2 words now ignored")).toBeVisible();
  expect(asked).toContain("Reject 2 people?");
  await expect(card(page, tag)).toHaveCount(0);

  expect((await getPerson(request, ids[0]))?.needs_review).toBe(false);
  expect(await getPerson(request, ids[1])).toBeNull();
  expect(await getPerson(request, ids[2])).toBeNull();
  expect((await listIgnored(request)).filter((t) => ids.includes(t.person_id ?? ""))).toHaveLength(2);

  // the bulk route says no to an unknown action and to an empty pick
  expect((await request.post("/api/people/bulk", { data: { ids, action: "delete" } })).status()).toBe(400);
  expect((await request.post("/api/people/bulk", { data: { ids: [], action: "keep" } })).status()).toBe(400);
});

test("the review surfaces show their empty states when nothing of this run is waiting", async ({ page }) => {
  await openReviewNeeded(page, `${P}-nobody-${letters(8)}`);
  await expect(page.getByText("No people waiting for review. 🌱")).toBeVisible();
  await page.getByRole("button", { name: "ARCHIVED", exact: true }).click();
  await expect(page.getByText(/^Nobody archived\./)).toBeVisible();
});
