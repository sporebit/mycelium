/**
 * People contacts (MYC-165), as Phil: the People / Contacts tiers, adding
 * and editing a person, numbers and emails, merge, delete to the bin and
 * restore, archive, and a vCard import and export round trip.
 *
 * Every person here is named `E2E-people-<run>…` and removed for good
 * afterwards. Import batches have no delete in the app, so the batch rows
 * (file name `E2E-people-<run>….vcf`) stay behind.
 */
import { writeFileSync } from "node:fs";
import { request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { createPerson, expect, getPerson, letters, listPeople, PATIENT, PATIENT_USE, removePerson } from "./people.shared.ts";
import { E2E_ORIGIN } from "./support/env.ts";

test.describe.configure(PATIENT);
test.use(PATIENT_USE);
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(PATIENT_USE.actionTimeout);
  page.setDefaultNavigationTimeout(PATIENT_USE.navigationTimeout);
});

const RUN = letters(6);
const P = `E2E-people-${RUN}`;
/** 07700 900xxx is Ofcom's drama range: never a real number. */
const phoneTail = () => String(Math.floor(Math.random() * 900) + 100);

/** Every live or binned person this run made, by its marker in the name. */
async function sweep(api: APIRequestContext): Promise<void> {
  const mine = (p: { first_name: string; last_name: string | null; display_name: string | null }) => [p.first_name, p.last_name, p.display_name].some((v) => (v ?? "").includes(P));
  for (const p of await listPeople(api)) if (mine(p)) await removePerson(api, p.id);
  const bin = (await (await api.get("/api/people/bin")).json()) as { people: Array<{ id: string; first_name: string; last_name: string | null; display_name: string | null }> };
  for (const p of bin.people ?? []) if (mine(p)) await removePerson(api, p.id);
}

async function openPeople(page: Page, search: string): Promise<void> {
  await page.goto("/organisation/people");
  await page.getByLabel("Search people").fill(search);
}

const card = (page: Page, name: string) => page.locator("a[href^='/organisation/people/'], a[href='#']").filter({ hasText: name });

test.afterAll(async ({ request }) => {
  await sweep(request);
});

test("add a person in the drawer: the card, the person page, the number and the alias", async ({ page, request }) => {
  const first = `${P}-Drawer`;
  const alias = `Zq${letters(10)}`;
  const tail = phoneTail();
  await page.goto("/organisation/people");
  await page.getByRole("button", { name: "+ ADD PERSON" }).click();
  const drawer = page.getByRole("dialog", { name: "Add person" });
  await drawer.locator('input[type="text"]').nth(0).fill(first);
  await drawer.locator('input[type="text"]').nth(1).fill("Example");
  await drawer.locator("select").selectOption("Friend");
  await drawer.locator('input[type="tel"]').fill(`07700 900${tail}`);
  await drawer.locator('input[type="email"]').fill(`drawer.${RUN}@example.test`);
  await drawer.getByPlaceholder("type + Enter").fill(alias);
  await drawer.getByPlaceholder("type + Enter").press("Enter");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();

  await page.getByLabel("Search people").fill(first);
  await expect(card(page, first)).toHaveCount(1);
  await card(page, first).click();
  await expect(page).toHaveURL(/\/organisation\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${first} Example`);
  await expect(page.getByText("Friend", { exact: true })).toBeVisible();
  // the number is stored in E.164 and shown that way
  await expect(page.getByText(`+447700900${tail}`)).toBeVisible();
  await expect(page.getByText(`drawer.${RUN}@example.test`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove ${alias}` })).toBeVisible();

  const id = page.url().split("/").pop()!;
  const saved = await getPerson(request, id);
  expect(saved?.tier).toBe("person");
  expect(saved?.needs_review).toBe(false);
  expect(saved?.phones?.[0]?.number_e164).toBe(`+447700900${tail}`);
});

test("the drawer refuses an empty first name and a second person with the same name", async ({ page, request }) => {
  const first = `${P}-Twice`;
  await createPerson(request, { first_name: first });
  await page.goto("/organisation/people");
  await page.getByRole("button", { name: "+ ADD PERSON" }).click();
  const drawer = page.getByRole("dialog", { name: "Add person" });
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText("First name required")).toBeVisible();
  await drawer.locator('input[type="text"]').nth(0).fill(first);
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText(/A person with this name exists/)).toBeVisible();
  await expect(drawer).toBeVisible();
  expect((await listPeople(request)).filter((p) => p.first_name === first)).toHaveLength(1);
});

test("edit a person: name and relationship from the drawer, notes and aliases on the page", async ({ page, request }) => {
  const first = `${P}-Edit`;
  const person = await createPerson(request, { first_name: first });
  await page.goto(`/organisation/people/${person.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(first);

  await page.getByRole("button", { name: "EDIT", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Edit person" });
  await drawer.locator('input[type="text"]').nth(1).fill("Renamed");
  await drawer.locator("select").selectOption("Colleague");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${first} Renamed`);
  await expect(page.getByText("Colleague", { exact: true })).toBeVisible();

  // notes save themselves a moment after typing stops
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/people/${person.id}`) && r.request().method() === "PATCH");
  await page.getByPlaceholder("Anything worth remembering…").fill(`Note ${RUN}`);
  expect((await saved).status()).toBe(200);

  const alias = `Zq${letters(10)}`;
  await page.getByPlaceholder("+ add alias").fill(alias);
  await page.getByPlaceholder("+ add alias").press("Enter");
  await expect(page.getByRole("button", { name: `Remove ${alias}` })).toBeVisible();

  await page.reload();
  await expect(page.getByPlaceholder("Anything worth remembering…")).toHaveValue(`Note ${RUN}`);
  await page.getByRole("button", { name: `Remove ${alias}` }).click();
  await expect(page.getByRole("button", { name: `Remove ${alias}` })).toHaveCount(0);

  const after = await getPerson(request, person.id);
  expect(after?.last_name).toBe("Renamed");
  expect(after?.aliases?.map((a) => a.alias)).not.toContain(alias);
});

test("numbers on the person page: add with a label, mark old (export goes off), remove", async ({ page, request }) => {
  const person = await createPerson(request, { first_name: `${P}-Numbers` });
  const tail = phoneTail();
  await page.goto(`/organisation/people/${person.id}`);
  await page.getByPlaceholder("+ add a number").fill(`07700 900${tail}`);
  await page.getByPlaceholder("label").first().fill("boat");
  await page.getByPlaceholder("+ add a number").press("Enter");
  const row = page.getByRole("listitem").filter({ hasText: `+447700900${tail}` });
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Label")).toHaveValue("boat");
  await expect(row.getByRole("checkbox")).toBeChecked();
  const exportedNumbers = async () => (await (await request.get("/api/people/export.vcf?tier=person")).text()).replace(/ /g, "");
  expect(await exportedNumbers()).toContain(`+447700900${tail}`);

  await row.getByRole("button", { name: "current" }).click();
  await expect(row.getByRole("button", { name: "old" })).toBeVisible();
  await expect(row.getByRole("checkbox")).not.toBeChecked();

  // an old number is left out of the export; the person is still in it
  const vcf = await exportedNumbers();
  expect(vcf).toContain(`${P}-Numbers`);
  expect(vcf).not.toContain(`+447700900${tail}`);

  page.once("dialog", (d) => void d.accept());
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
  expect((await getPerson(request, person.id))?.phones).toHaveLength(0);
});

test("tiers: a contact is under Contacts only, and Promote moves it to People", async ({ page, request }) => {
  const first = `${P}-Contact`;
  const contact = await createPerson(request, { first_name: first, tier: "contact", email: `contact.${RUN}@example.test` });
  expect(contact.tier).toBe("contact");

  await openPeople(page, first);
  await expect(page.getByText("No people match these filters.").or(page.getByText(/^No people yet/))).toBeVisible();
  await expect(card(page, first)).toHaveCount(0);

  await page.getByRole("button", { name: "CONTACTS", exact: true }).click();
  await expect(card(page, first)).toHaveCount(1);
  await expect(card(page, first)).toContainText(`contact.${RUN}@example.test`);
  await card(page, first).getByRole("button", { name: "promote" }).click();
  await expect(card(page, first)).toHaveCount(0);

  await page.getByRole("button", { name: "PEOPLE", exact: true }).click();
  await expect(card(page, first)).toHaveCount(1);
  expect((await getPerson(request, contact.id))?.tier).toBe("person");
});

test("merge two people from Select: one card left, numbers and aliases unioned, the old id opens the survivor", async ({ page, request }) => {
  const tag = `${P}-Merge`;
  const tail = phoneTail();
  const aliasB = `Zq${letters(10)}`;
  const a = await createPerson(request, { first_name: `${tag}-Keep`, phone: `07700 900${tail}`, notes: "kept note" });
  const b = await createPerson(request, { first_name: `${tag}-Gone`, email: `merge.${RUN}@example.test`, relationship: "Friend", aliases: [aliasB] });

  await openPeople(page, tag);
  await expect(card(page, tag)).toHaveCount(2);
  await page.getByRole("button", { name: "SELECT", exact: true }).click();
  await card(page, `${tag}-Keep`).click();
  await card(page, `${tag}-Gone`).click();
  await page.getByRole("button", { name: "MERGE 2/2" }).click();

  const dialog = page.getByRole("dialog", { name: "Merge people" });
  await expect(dialog.getByText("Survivor — keeps this id")).toBeVisible();
  // the first card picked is the survivor; keep the other one's relationship
  await expect(dialog.getByRole("button", { name: `MERGE INTO ${tag}-Keep`.toUpperCase() })).toBeEnabled();
  await dialog.getByText("Friend", { exact: true }).click();
  await dialog.getByRole("button", { name: `MERGE INTO ${tag}-Keep`.toUpperCase() }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, tag)).toHaveCount(1);
  await expect(card(page, `${tag}-Keep`)).toHaveCount(1);

  const survivor = await getPerson(request, a.id);
  expect(survivor?.phones?.map((x) => x.number_e164)).toContain(`+447700900${tail}`);
  expect(survivor?.emails?.map((x) => x.email)).toContain(`merge.${RUN}@example.test`);
  expect(survivor?.aliases?.map((x) => x.alias)).toContain(aliasB);
  expect((survivor as unknown as { relationship: string | null }).relationship).toBe("Friend");

  // the loser's id resolves to the survivor, in the API and in the browser
  const viaOld = (await (await request.get(`/api/people/${b.id}`)).json()) as { person: { id: string }; resolved_from: string | null };
  expect(viaOld.person.id).toBe(a.id);
  expect(viaOld.resolved_from).toBe(b.id);
  await page.goto(`/organisation/people/${b.id}`);
  await expect(page).toHaveURL(new RegExp(`/organisation/people/${a.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${tag}-Keep`);

  // the loser sits in the bin as merged: a link to the survivor, no Restore
  await page.goto("/other/settings/people");
  const binRow = page.getByRole("listitem").filter({ hasText: `${tag}-Gone` });
  await expect(binRow.getByRole("link", { name: "merged → open survivor" })).toBeVisible();
  await expect(binRow.getByRole("button", { name: "RESTORE" })).toHaveCount(0);
  expect((await request.post(`/api/people/${b.id}/restore`)).status()).toBe(409);
});

test("merge from the person page: Merge… picks the other person and lands on the survivor", async ({ page, request }) => {
  const tag = `${P}-PageMerge`;
  const a = await createPerson(request, { first_name: `${tag}-One` });
  const b = await createPerson(request, { first_name: `${tag}-Two` });
  await page.goto(`/organisation/people/${a.id}`);
  await page.getByRole("button", { name: "MERGE…" }).click();
  const picker = page.getByRole("dialog", { name: "Merge with" });
  await picker.getByPlaceholder("Search people and contacts").fill(`${tag}-Two`);
  await picker.getByRole("button", { name: new RegExp(`${tag}-Two`) }).click();
  const dialog = page.getByRole("dialog", { name: "Merge people" });
  await dialog.getByRole("button", { name: `MERGE INTO ${tag}-One`.toUpperCase() }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/organisation/people/${a.id}$`));
  expect(await getPerson(request, b.id).then((p) => p?.id)).toBe(a.id);
  // a person cannot be merged with themselves
  expect((await request.post("/api/people/merge", { data: { survivor_id: a.id, loser_id: a.id } })).status()).toBe(400);
});

test("delete to the bin and restore from Settings", async ({ page, request }) => {
  const first = `${P}-Binned`;
  const person = await createPerson(request, { first_name: first });
  await page.goto(`/organisation/people/${person.id}`);
  await page.getByRole("button", { name: "DELETE", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete person" });
  await expect(dialog.getByRole("heading")).toHaveText(`Delete ${first}?`);
  await expect(dialog.getByText(/Nothing links to them/)).toBeVisible();
  await dialog.getByRole("button", { name: "DELETE TO BIN" }).click();
  await expect(page).toHaveURL(/\/organisation\/people$/);

  await page.getByLabel("Search people").fill(first);
  await expect(card(page, first)).toHaveCount(0);
  expect((await request.get(`/api/people/${person.id}`)).status()).toBe(404);
  expect((await listPeople(request)).some((p) => p.id === person.id)).toBe(false);
  // their old address says so, rather than loading for ever
  await page.goto(`/organisation/people/${person.id}`);
  await expect(page.getByText("This person is not here.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings → People" })).toBeVisible();
  // a binned person is not exported
  expect(await (await request.get("/api/people/export.vcf")).text()).not.toContain(first);

  await page.goto("/other/settings/people");
  const row = page.getByRole("listitem").filter({ hasText: first });
  await expect(row).toContainText("deleted");
  await row.getByRole("button", { name: "RESTORE" }).click();
  await expect(row).toHaveCount(0);

  await openPeople(page, first);
  await expect(card(page, first)).toHaveCount(1);
  expect((await getPerson(request, person.id))?.deleted_at ?? null).toBeNull();
});

test("the delete dialog lists what is linked and offers Merge instead", async ({ page, request }) => {
  const first = `${P}-Linked`;
  const person = await createPerson(request, { first_name: first });
  const quote = await request.post("/api/quotes", { data: { text: `E2E-people-${RUN} linked quote ${letters(12)}`, said_by_person_id: person.id, skip_research: true, force: true } });
  expect(quote.status()).toBe(201);
  const quoteId = ((await quote.json()) as { quote: { id: string } }).quote.id;
  try {
    await page.goto(`/organisation/people/${person.id}`);
    await page.getByRole("button", { name: "DELETE", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete person" });
    await expect(dialog.getByText("1 quotes")).toBeVisible();
    await dialog.getByRole("button", { name: "MERGE INSTEAD…" }).click();
    await expect(page.getByRole("dialog", { name: "Merge with" })).toBeVisible();
  } finally {
    await request.delete(`/api/quotes/${quoteId}`);
  }
});

test("archive hides a person from the list; the Archived chip and Unarchive bring them back", async ({ page, request }) => {
  const first = `${P}-Archive`;
  const person = await createPerson(request, { first_name: first });
  await page.goto(`/organisation/people/${person.id}`);
  await page.getByRole("button", { name: "ARCHIVE", exact: true }).click();
  await expect(page.getByRole("button", { name: "unarchive" })).toBeVisible();

  await openPeople(page, first);
  await expect(card(page, first)).toHaveCount(0);
  await page.getByRole("button", { name: "ARCHIVED", exact: true }).click();
  await expect(card(page, first)).toHaveCount(1);
  await card(page, first).getByRole("button", { name: "UNARCHIVE" }).click();
  await expect(card(page, first)).toHaveCount(0);
  await page.getByRole("button", { name: "ALL", exact: true }).click();
  await expect(card(page, first)).toHaveCount(1);
  expect((await getPerson(request, person.id))?.archived_at ?? null).toBeNull();
});

test("search narrows the list by name, alias and email", async ({ page, request }) => {
  const alias = `Zq${letters(10)}`;
  await createPerson(request, { first_name: `${P}-SearchA`, aliases: [alias] });
  await createPerson(request, { first_name: `${P}-SearchB`, email: `findme.${RUN}@example.test` });
  await openPeople(page, `${P}-Search`);
  await expect(card(page, `${P}-Search`)).toHaveCount(2);
  await page.getByLabel("Search people").fill(alias);
  await expect(card(page, `${P}-SearchA`)).toHaveCount(1);
  await expect(card(page, `${P}-SearchB`)).toHaveCount(0);
  await page.getByLabel("Search people").fill(`findme.${RUN}`);
  await expect(card(page, `${P}-SearchB`)).toHaveCount(1);
  await page.getByLabel("Search people").fill(`${P}-nobody-${letters(8)}`);
  await expect(page.getByText("No people match these filters.")).toBeVisible();
});

test("vCard import and export round trip: new cards become contacts, a matching card waits for a decision, the export re-imports as nothing new", async ({ page, request }, testInfo) => {
  // 020 7946 0xxx is Ofcom's London drama range; three different numbers, and none the other checks use
  const start = Math.floor(Math.random() * 990);
  const tails = [0, 1, 2].map((n) => String(start + n).padStart(3, "0"));
  const existing = await createPerson(request, { first_name: `${P}-Existing`, phone: `020 7946 0${tails[2]}` });
  const given = [`Vc${letters(16)}`, `Vd${letters(16)}`, `Ve${letters(16)}`];
  const uid = (n: number) => `e2e-people-${RUN}-card-${n}`;
  const vcf = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uid(1)}`,
    `N:${P};${given[0]};;;`,
    `FN:${given[0]} ${P}`,
    `TEL;TYPE=CELL:+44 20 7946 0${tails[0]}`,
    `EMAIL;TYPE=WORK:card1.${RUN}@example.test`,
    `ORG:Orchard ${RUN}`,
    `NOTE:Round trip ${RUN}`,
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uid(2)}`,
    `N:${P};${given[1]};;;`,
    `FN:${given[1]} ${P}`,
    `item1.TEL:+442079460${tails[1]}`,
    "item1.X-ABLabel:Boat",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uid(3)}`,
    `N:${P};${given[2]};;;`,
    `FN:${given[2]} ${P}`,
    `TEL;TYPE=CELL:020 7946 0${tails[2]}`,
    `EMAIL;TYPE=HOME:card3.${RUN}@example.test`,
    "END:VCARD",
    "",
  ].join("\r\n");
  const fileName = `${P}.vcf`;
  const file = testInfo.outputPath(fileName);
  writeFileSync(file, vcf, "utf8");

  await page.goto("/organisation/people/import");
  await page.locator('input[type="file"]').setInputFiles(file);
  const batch = page.getByRole("button", { name: new RegExp(fileName.replace(/[.]/g, "\\.")) });
  await expect(batch).toContainText("3 cards · 2 imported · 1 to review (1 waiting) · 0 skipped · 0 failed");

  // the card that shares a number with an existing person waits, side by side with them
  await expect(page.getByText("Review — 1 waiting")).toBeVisible();
  await expect(page.getByText(/card #3 · matched on phone/)).toBeVisible();
  await expect(page.getByText(`Existing: ${P}-Existing`)).toBeVisible();
  await page.getByRole("button", { name: `MERGE INTO ${P}-Existing`.toUpperCase() }).click();
  await expect(page.getByText("Nothing waiting in this batch.")).toBeVisible();

  // two contacts, nobody new under People, and the existing person gained the card's email
  const contacts = (await listPeople(request, "tier=contact")).filter((p) => p.last_name === P);
  expect(contacts.map((p) => p.first_name).sort()).toEqual([given[0], given[1]].sort());
  const one = contacts.find((p) => p.first_name === given[0])!;
  expect(one.phones?.[0]).toMatchObject({ number_e164: `+442079460${tails[0]}`, label: "mobile" });
  expect(one.emails?.[0]).toMatchObject({ email: `card1.${RUN}@example.test`, label: "work" });
  const two = contacts.find((p) => p.first_name === given[1])!;
  expect(two.phones?.[0]).toMatchObject({ number_e164: `+442079460${tails[1]}`, label: "Boat" });
  expect((await listPeople(request, "tier=person")).filter((p) => p.last_name === P)).toHaveLength(0);
  expect((await getPerson(request, existing.id))?.emails?.map((e) => e.email)).toContain(`card3.${RUN}@example.test`);

  await page.goto("/organisation/people");
  await page.getByRole("button", { name: "CONTACTS", exact: true }).click();
  await page.getByLabel("Search people").fill(P);
  await expect(card(page, given[0])).toHaveCount(1);
  await expect(card(page, given[1])).toHaveCount(1);

  // export: vCard 3.0 with CRLF, the UIDs kept, unmodelled fields carried through, the custom label kept
  const exported = await request.get("/api/people/export.vcf?tier=all");
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-type"]).toContain("text/vcard");
  expect(exported.headers()["content-disposition"]).toContain(".vcf");
  const text = await exported.text();
  expect(text).not.toMatch(/[^\r]\n/);
  const cards = text.split(/(?=BEGIN:VCARD)/).filter((c) => c.includes(`e2e-people-${RUN}-card-`));
  expect(cards).toHaveLength(3);
  const unfolded = cards.map((c) => c.replace(/\r\n[ \t]/g, ""));
  const c1 = unfolded.find((c) => c.includes(`UID:${uid(1)}`))!;
  expect(c1).toContain("VERSION:3.0");
  expect(c1).toContain(`FN:${given[0]} ${P}`);
  expect(c1.replace(/ /g, "")).toContain(`+442079460${tails[0]}`);
  expect(c1).toContain(`card1.${RUN}@example.test`);
  expect(c1).toContain(`ORG:Orchard ${RUN}`);
  expect(c1).toContain(`NOTE:Round trip ${RUN}`);
  const c2 = unfolded.find((c) => c.includes(`UID:${uid(2)}`))!;
  expect(c2.replace(/ /g, "")).toContain(`:+442079460${tails[1]}`);
  expect(c2).toMatch(/item\d+\.TEL/);
  expect(c2).toMatch(/item\d+\.X-ABLabel:Boat/);
  // the merged card exports under the existing person's name, with both of their emails' worth of data
  const c3 = unfolded.find((c) => c.includes(`UID:${uid(3)}`))!;
  expect(c3).toContain(`FN:${P}-Existing`);
  expect(c3).toContain(`card3.${RUN}@example.test`);

  // the export, cut down to this run's cards, imports as nothing new; so does the original file
  const again = await request.post("/api/people/import/vcf", { data: { vcf: cards.join(""), filename: `${P}-reimport.vcf` } });
  expect(again.status()).toBe(201);
  expect(await again.json()).toMatchObject({ card_count: 3, imported: 0, review: 0, skipped: 3, failed: 0 });
  const original = await request.post("/api/people/import/vcf", { data: { vcf, filename: `${P}-again.vcf` } });
  expect(await original.json()).toMatchObject({ card_count: 3, imported: 0, review: 0, skipped: 3, failed: 0 });
  expect((await listPeople(request)).filter((p) => p.last_name === P)).toHaveLength(2);

  // the tier filter on the export
  const personOnly = await (await request.get("/api/people/export.vcf?tier=person")).text();
  expect(personOnly).not.toContain(uid(1));
  expect(personOnly).toContain(uid(3));
});

test("the import refuses a file that is not a vCard, and the export needs a session", async ({ page, request }, testInfo) => {
  const file = testInfo.outputPath(`${P}-not-a-card.vcf`);
  writeFileSync(file, "just some text\n", "utf8");
  await page.goto("/organisation/people/import");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("not a vCard file")).toBeVisible();
  expect((await request.post("/api/people/import/vcf", { data: { vcf: "", filename: "x.vcf" } })).status()).toBe(400);

  const anonymous = await playwrightRequest.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] } });
  const res = await anonymous.get("/api/people/export.vcf", { maxRedirects: 0 });
  expect(res.status()).not.toBe(200);
  expect(await res.text()).not.toContain("BEGIN:VCARD");
  await anonymous.dispose();
});
