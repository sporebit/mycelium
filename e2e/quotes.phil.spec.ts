/**
 * Quotes, as Phil: the list, adding by hand, the near-duplicate warning,
 * editing in the sheet, linking the speaker to a person, merch and the
 * export, research with the AI switched off, and the review path for a
 * quote capture (approve creates the quote; keep / replace for a
 * near-duplicate; an unknown speaker never becomes a person).
 *
 * Cloud AI is off on this server, so captures are read by the regex
 * fallback: "Quote from <name>: <words>" is a quote said by <name>.
 *
 * Every quote and capture here carries `E2E-quotes-<run>`; quotes and
 * people are deleted afterwards and the captures are discarded.
 */
import { test, type APIRequestContext, type Page } from "@playwright/test";
import { processed } from "./capture.helpers.ts";
import { createPerson, createQuote, expect, letters, PATIENT, PATIENT_USE, listQuotes, peopleNamed, removePerson, send, titleWord, type QuoteRow } from "./people.shared.ts";

test.describe.configure(PATIENT);
test.use(PATIENT_USE);
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(PATIENT_USE.actionTimeout);
  page.setDefaultNavigationTimeout(PATIENT_USE.navigationTimeout);
});

const RUN = letters(6);
const Q = `E2E-quotes-${RUN}`;

const madePeople: string[] = [];
const madeCaptures: string[] = [];

/** Words long and random enough that no two of this run's quotes look alike to the duplicate check. */
const words = () => `${letters(7)} ${letters(9)} ${letters(6)} ${letters(8)} ${letters(7)}`;
const quoteText = (tag: string) => `${Q} ${tag} ${words()}`;

async function person(api: APIRequestContext, body: Record<string, unknown>) {
  const p = await createPerson(api, body);
  madePeople.push(p.id);
  return p;
}

/** A text capture, as the Shortcut or the bot would send it. Returns the capture id. */
async function capture(api: APIRequestContext, text: string): Promise<string> {
  // Since the pipeline was rebuilt (2026-11-20) a capture is answered 202 "saved" at once and worked out
  // afterwards: what it is and where it went are read from the row once it is processed.
  const res = await api.post("/api/capture", { data: { text } });
  expect(res.status(), `capture: ${await res.text()}`).toBe(202);
  const j = (await res.json()) as { status: string; capture_id: string };
  expect(j.status).toBe("saved");
  madeCaptures.push(j.capture_id);
  const done = await processed(j.capture_id);
  expect(done.classification.kind).toBe("quote");
  expect(done.routed_to).toBe("raw_captures");
  return j.capture_id;
}

const mine = async (api: APIRequestContext): Promise<QuoteRow[]> => (await listQuotes(api, "limit=500")).filter((q) => q.text.includes(RUN) || (q.raw_text ?? "").includes(RUN));

async function openQuotes(page: Page): Promise<void> {
  await page.goto("/organisation/quotes");
  await page.getByPlaceholder("Search quotes…").fill(Q);
}

const quoteCard = (page: Page, text: string) => page.locator("article").filter({ hasText: text });
const reviewCard = (page: Page, text: string) => page.locator("article").filter({ hasText: text });

async function openReview(page: Page, text: string) {
  await page.goto("/organisation/captures/review");
  const card = reviewCard(page, text);
  await expect(card).toHaveCount(1);
  return card;
}

async function approve(page: Page, card: ReturnType<typeof reviewCard>, captureId: string): Promise<void> {
  const done = page.waitForResponse((r) => r.url().endsWith(`/api/captures/${captureId}/review`) && r.request().method() === "PATCH");
  await card.getByRole("button", { name: "APPROVE" }).click();
  expect((await done).status()).toBe(200);
  await expect(card).toHaveCount(0);
}

test.afterAll(async ({ request }) => {
  for (const q of await mine(request)) await request.delete(`/api/quotes/${q.id}`);
  for (const id of madeCaptures) await request.patch(`/api/captures/${id}/review`, { data: { action: "discard" } });
  for (const id of madePeople) await removePerson(request, id);
});

test("add a quote by hand: it heads the list as mine, with its context", async ({ page, request }) => {
  const text = quoteText("hand");
  await page.goto("/organisation/quotes");
  await page.getByRole("button", { name: "+ ADD" }).click();
  await expect(page.getByLabel("Who")).toHaveValue("__me");
  // nothing typed yet: Save stays off
  await expect(page.getByRole("button", { name: "SAVE", exact: true })).toBeDisabled();
  await page.getByLabel(/^Quote/).fill(text);
  await page.getByLabel("Context").fill("on the allotment");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/quotes") && r.request().method() === "POST");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  expect((await created).status()).toBe(201);

  const card = quoteCard(page, text);
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Me", { exact: true })).toBeVisible();
  await expect(card).toContainText("on the allotment");
  await expect(card).toContainText("added");
  // newest first
  await expect(page.locator("article").first()).toContainText(text);

  const row = (await mine(request)).find((q) => q.text === text)!;
  expect(row).toMatchObject({ is_own: true, said_by_person_id: null, speaker_confidence: "certain", context: "on the allotment", merch: false, raw_text: null });
});

test("adding the same words again warns first; Cancel keeps one, Add anyway makes two", async ({ page, request }) => {
  const text = quoteText("twice");
  await createQuote(request, { text, skip_research: true });
  await page.goto("/organisation/quotes");
  await page.getByRole("button", { name: "+ ADD" }).click();
  await page.getByLabel(/^Quote/).fill(text);
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await expect(page.getByText("Looks like a quote you already have:")).toBeVisible();
  await expect(page.getByText("(100%)")).toBeVisible();
  expect((await mine(request)).filter((q) => q.text === text)).toHaveLength(1);

  await page.getByRole("button", { name: "CANCEL", exact: true }).click();
  await expect(page.getByText("Looks like a quote you already have:")).toHaveCount(0);
  expect((await mine(request)).filter((q) => q.text === text)).toHaveLength(1);

  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await page.getByRole("button", { name: "ADD ANYWAY" }).click();
  await expect(quoteCard(page, text)).toHaveCount(2);
  expect((await mine(request)).filter((q) => q.text === text)).toHaveLength(2);
});

test("edit in the sheet and link the speaker: the card, the person page and the People list all show it", async ({ page, request }) => {
  const speaker = await person(request, { first_name: `${Q}-Speaker` });
  const original = quoteText("edit");
  const changed = quoteText("edited");
  const row = await createQuote(request, { text: original, skip_research: true });

  await openQuotes(page);
  await quoteCard(page, original).getByRole("button", { name: new RegExp(original) }).click();
  const sheet = page.getByRole("dialog", { name: "Quote" });
  await sheet.getByRole("textbox", { name: "Text", exact: true }).fill(changed);
  await sheet.getByLabel("Said by").selectOption({ label: `${Q}-Speaker` });
  await sheet.getByLabel("Context").fill("at the pub");
  await sheet.getByLabel("Source (if quoting something)").fill("a film");
  await sheet.getByLabel("Attributed to").fill("Somebody Famous");
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/quotes/${row.id}`) && r.request().method() === "PATCH");
  await sheet.getByRole("button", { name: "SAVE", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.keyboard.press("Escape");

  const card = quoteCard(page, changed);
  await expect(card).toHaveCount(1);
  await expect(quoteCard(page, original)).toHaveCount(0);
  await expect(card).toContainText("at the pub");
  // an attribution typed by hand shows on the card, not only in the sheet
  await expect(card).toContainText("orig. Somebody Famous");
  const chip = card.getByRole("link", { name: `${Q}-Speaker` });
  await expect(chip).toHaveAttribute("href", `/organisation/people/${speaker.id}`);

  const after = (await mine(request)).find((q) => q.id === row.id)!;
  expect(after).toMatchObject({ text: changed, said_by_person_id: speaker.id, is_own: false, context: "at the pub", attributed_to: "Somebody Famous" });

  // the person's page lists the quote and links back to the filtered list
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/organisation/people/${speaker.id}$`));
  await expect(page.locator("article").filter({ hasText: changed })).toHaveCount(1);
  await page.getByRole("link", { name: "1 →" }).click();
  await expect(page).toHaveURL(new RegExp(`/organisation/quotes\\?person=${speaker.id}$`));
  await expect(quoteCard(page, changed)).toHaveCount(1);
  await expect(page.getByRole("button", { name: `${Q}-Speaker`, exact: true })).toHaveAttribute("aria-pressed", "true");

  // and the People list counts it
  await page.goto("/organisation/people");
  await page.getByLabel("Search people").fill(`${Q}-Speaker`);
  await expect(page.locator("a").filter({ hasText: `${Q}-Speaker` })).toContainText("1 quote");

  // "Me" in the sheet takes the person off again
  const own = await send(() => request.patch(`/api/quotes/${row.id}`, { data: { is_own: true } }));
  expect(((await own.json()) as { quote: QuoteRow }).quote).toMatchObject({ is_own: true, said_by_person_id: null });
});

test("filters and views: Mine, a person's chip, by person and by month", async ({ page, request }) => {
  const speaker = await person(request, { first_name: `${Q}-Filter` });
  const own = quoteText("own");
  const theirs = quoteText("theirs");
  await createQuote(request, { text: own, skip_research: true });
  await createQuote(request, { text: theirs, said_by_person_id: speaker.id, skip_research: true });

  await openQuotes(page);
  await expect(quoteCard(page, own)).toHaveCount(1);
  await expect(quoteCard(page, theirs)).toHaveCount(1);

  await page.getByRole("button", { name: "Mine", exact: true }).click();
  await expect(quoteCard(page, own)).toHaveCount(1);
  await expect(quoteCard(page, theirs)).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();

  await page.getByRole("button", { name: `${Q}-Filter`, exact: true }).click();
  await expect(quoteCard(page, theirs)).toHaveCount(1);
  await expect(quoteCard(page, own)).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();

  const view = page.getByRole("combobox").filter({ hasText: "By month" });
  await view.selectOption("person");
  await expect(page.getByText(new RegExp(`^${Q}-Filter · 1$`))).toBeVisible();
  await expect(page.getByText(/^Me · \d+$/)).toBeVisible();
  await view.selectOption("month");
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  await expect(page.getByText(month, { exact: true })).toBeVisible();

  // search finds a fragment of the words
  await page.getByPlaceholder("Search quotes…").fill(own.split(" ").slice(2, 4).join(" "));
  await expect(quoteCard(page, own)).toHaveCount(1);
  await expect(quoteCard(page, theirs)).toHaveCount(0);
});

test("merch: tick on the card, the Merch filter, and the export in both formats", async ({ page, request }) => {
  const flagged = quoteText("merch");
  const plain = quoteText("plain");
  const row = await createQuote(request, { text: flagged, context: 'said "loudly", twice', skip_research: true });
  await createQuote(request, { text: plain, skip_research: true });

  await openQuotes(page);
  const patched = page.waitForResponse((r) => r.url().endsWith(`/api/quotes/${row.id}`) && r.request().method() === "PATCH");
  await quoteCard(page, flagged).getByRole("button", { name: "merch", exact: true }).click();
  expect((await patched).status()).toBe(200);
  await expect(quoteCard(page, flagged).getByRole("button", { name: "✓ merch" })).toBeVisible();

  await page.getByRole("button", { name: "Merch", exact: true }).click();
  await expect(quoteCard(page, flagged)).toHaveCount(1);
  await expect(quoteCard(page, plain)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "EXPORT", exact: true })).toHaveAttribute("href", "/api/quotes/export?format=csv&merch=1");

  const csv = await request.get("/api/quotes/export?format=csv&merch=1");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toMatch(/attachment; filename="quotes-\d{4}-\d{2}-\d{2}\.csv"/);
  const lines = (await csv.text()).split("\r\n");
  expect(lines[0]).toBe("Quote,Said by,Own,Said at,Added at,Context,Source,Attributed to,Research,Merch");
  const line = lines.find((l) => l.includes(flagged))!;
  expect(line).toMatch(/,Me,yes,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},/);
  expect(line).toContain('"said ""loudly"", twice"');
  expect(line.endsWith(",yes")).toBe(true);
  expect(lines.some((l) => l.includes(plain))).toBe(false);

  const txt = await (await request.get("/api/quotes/export?format=txt&merch=1")).text();
  expect(txt).toContain(`“${flagged}”\n— Me, `);
  expect((await (await request.get("/api/quotes/export?format=csv")).text())).toContain(plain);
});

test("research with the AI off: nothing breaks, Re-run says why, Wrong and Their own still work", async ({ page, request }) => {
  const text = quoteText("research");
  const res = await send(() => request.post("/api/quotes", { data: { text, force: true } }));
  expect(res.status()).toBe(201);
  const row = ((await res.json()) as { quote: QuoteRow }).quote;
  expect(row.research_status).toBe("pending");

  await openQuotes(page);
  await quoteCard(page, text).getByRole("button", { name: new RegExp(text) }).click();
  const sheet = page.getByRole("dialog", { name: "Quote" });
  const rerun = page.waitForResponse((r) => r.url().endsWith(`/api/quotes/${row.id}/research`) && r.request().method() === "POST");
  await sheet.getByRole("button", { name: "RE-RUN" }).click();
  const answered = await rerun;
  expect(answered.status(), "re-running research with the AI off answered a server error").toBeLessThan(500);
  await expect(sheet.getByText("Research is unavailable: no AI key is set on this server.")).toBeVisible();
  // the quote is untouched and still waiting
  expect((await mine(request)).find((q) => q.id === row.id)?.research_status).toBe("pending");

  await sheet.getByRole("button", { name: "WRONG" }).click();
  await expect(sheet.getByText("wrong", { exact: true }).first()).toBeVisible();
  expect((await mine(request)).find((q) => q.id === row.id)).toMatchObject({ research_status: "wrong", attributed_to: null });

  await sheet.getByRole("button", { name: "THEIR OWN" }).click();
  await expect(sheet.getByText("original", { exact: true }).first()).toBeVisible();
  const own = (await mine(request)).find((q) => q.id === row.id)!;
  expect(own.research_status).toBe("none");
  expect(own.research).toMatchObject({ verdict: "original", overridden: "own" });

  // the sweeper needs its bearer, and with it runs without a server error
  expect((await request.post("/api/cron/quotes-research", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  expect((await request.post("/api/cron/quotes-research", { headers: { authorization: "Bearer e2e-cron-secret" } })).status()).toBe(200);
  expect((await request.patch(`/api/quotes/${row.id}/research`, { data: { action: "nonsense" } })).status()).toBe(400);
});

test("with the AI off a new quote does not claim to be researching", async ({ page, request }) => {
  const text = quoteText("badge");
  await send(() => request.post("/api/quotes", { data: { text, force: true } }));
  await openQuotes(page);
  const card = quoteCard(page, text);
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("button", { name: /research off/i })).toBeVisible();
  await expect(card.getByRole("button", { name: /researching/i })).toHaveCount(0);
});

test("delete from the sheet asks first, then the quote is gone", async ({ page, request }) => {
  const text = quoteText("delete");
  const row = await createQuote(request, { text, skip_research: true });
  await openQuotes(page);
  await quoteCard(page, text).getByRole("button", { name: new RegExp(text) }).click();
  const sheet = page.getByRole("dialog", { name: "Quote" });

  page.once("dialog", (d) => void d.dismiss());
  await sheet.getByRole("button", { name: "DELETE" }).click();
  expect((await request.get(`/api/quotes/${row.id}`)).status()).toBe(200);

  page.once("dialog", (d) => void d.accept());
  await sheet.getByRole("button", { name: "DELETE" }).click();
  await expect(quoteCard(page, text)).toHaveCount(0);
  expect((await request.get(`/api/quotes/${row.id}`)).status()).toBe(404);
});

test("review path: a quote capture is not a quote until approved; Approve creates it with the matched speaker", async ({ page, request }) => {
  const alias = titleWord();
  const speaker = await person(request, { first_name: `${Q}-Jake`, aliases: [alias] });
  const said = quoteText("review");
  const raw = `Quote from ${alias}: ${said}`;
  const captureId = await capture(request, raw);
  expect((await mine(request)).some((q) => q.text === said)).toBe(false);

  const card = await openReview(page, raw);
  await expect(card.getByRole("textbox", { name: "Quote" })).toHaveValue(said);
  await expect(card.getByLabel(/^Said by/)).toHaveValue(speaker.id);
  await approve(page, card, captureId);

  const made = (await mine(request)).filter((q) => q.text === said);
  expect(made).toHaveLength(1);
  expect(made[0]).toMatchObject({ said_by_person_id: speaker.id, is_own: false, speaker_confidence: "certain", capture_id: captureId, raw_text: raw });

  // the quote's sheet shows the words exactly as captured
  await openQuotes(page);
  await quoteCard(page, said).getByRole("button", { name: new RegExp(said) }).click();
  const sheet = page.getByRole("dialog", { name: "Quote" });
  await expect(sheet.getByText("As captured")).toBeVisible();
  await expect(sheet.getByText(raw, { exact: true })).toBeVisible();

  // approving the same capture a second time does not make a second quote
  const again = await request.patch(`/api/captures/${captureId}/review`, { data: { action: "approve", kind: "quote" } });
  expect(again.status()).toBe(200);
  expect((await mine(request)).filter((q) => q.text === said)).toHaveLength(1);
});

// Was a finding until the pipeline rebuild of 2026-11-20: the queue listed every capture whose
// confidence is "low" whether or not it had been reviewed, and a quote is always stored that way,
// so an approved quote came back under NEEDS REVIEW. The queue is now "not yet reviewed" for all.
test("review path: an approved quote capture leaves Needs review for good", async ({ page, request }) => {
  const said = quoteText("stays");
  const raw = `I said a quote: ${said}`;
  const captureId = await capture(request, raw);
  const card = await openReview(page, raw);
  await approve(page, card, captureId);
  await page.reload();
  await expect(page.getByRole("tab", { name: "NEEDS REVIEW" })).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(reviewCard(page, raw)).toHaveCount(0);
});

test("review path: a speaker nobody knows is never made a person; approved as unknown, not as mine", async ({ page, request }) => {
  const stranger = titleWord();
  const said = quoteText("stranger");
  const raw = `Quote from ${stranger}: ${said}`;
  const captureId = await capture(request, raw);
  expect(peopleNamed(stranger)).toBe(0);

  const card = await openReview(page, raw);
  await expect(card.getByText(`No person called “${stranger}” — pick one, or approve as unknown.`)).toBeVisible();
  await approve(page, card, captureId);

  expect(peopleNamed(stranger), "approving a quote created a person").toBe(0);
  const made = (await mine(request)).find((q) => q.text === said)!;
  expect(made).toMatchObject({ said_by_person_id: null, is_own: false, speaker_confidence: "uncertain" });

  await openQuotes(page);
  await expect(quoteCard(page, said)).toContainText("unknown speaker");
  await expect(quoteCard(page, said)).toContainText("speaker uncertain");
});

test("review path: 'I said' is mine, and Me can be chosen on the card", async ({ page, request }) => {
  const alias = titleWord();
  await person(request, { first_name: `${Q}-Other`, aliases: [alias] });
  const mineSaid = quoteText("isaid");
  const reassigned = quoteText("reassign");
  const first = await capture(request, `I said a quote: ${mineSaid}`);
  const second = await capture(request, `Quote from ${alias}: ${reassigned}`);

  let card = await openReview(page, mineSaid);
  await expect(card.getByLabel(/^Said by/)).toHaveValue("__me");
  await approve(page, card, first);
  expect((await mine(request)).find((q) => q.text === mineSaid)).toMatchObject({ is_own: true, said_by_person_id: null });

  card = reviewCard(page, reassigned);
  await card.getByLabel(/^Said by/).selectOption("__me");
  await approve(page, card, second);
  expect((await mine(request)).find((q) => q.text === reassigned)).toMatchObject({ is_own: true, said_by_person_id: null });
});

test("review path: a near-duplicate can replace the existing quote's words, be dropped in its favour, or be kept as new", async ({ page, request }) => {
  const base = quoteText("dupe");
  const existing = await createQuote(request, { text: base, skip_research: true });
  const reworded = `${base} indeed`;

  // replace its text
  let raw = `I said a quote: ${reworded}`;
  let captureId = await capture(request, raw);
  let card = await openReview(page, raw);
  await expect(card.getByText("Near-duplicate of a quote you already have:")).toBeVisible();
  await expect(card.getByText(`“${base}”`)).toBeVisible();
  await card.getByRole("button", { name: "replace its text" }).click();
  await approve(page, card, captureId);
  let rows = (await mine(request)).filter((q) => q.text.startsWith(base));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: existing.id, text: reworded, raw_text: raw });

  // keep existing
  raw = `I said a quote: ${reworded} truly`;
  captureId = await capture(request, raw);
  card = await openReview(page, raw);
  await card.getByRole("button", { name: "keep existing" }).click();
  await approve(page, card, captureId);
  rows = (await mine(request)).filter((q) => q.text.startsWith(base));
  expect(rows).toHaveLength(1);
  expect(rows[0].text).toBe(reworded);

  // neither picked: saved as a new quote
  raw = `I said a quote: ${reworded} really`;
  captureId = await capture(request, raw);
  card = await openReview(page, raw);
  await expect(card.getByText("Approve with neither selected to save it as a new quote.")).toBeVisible();
  await approve(page, card, captureId);
  rows = (await mine(request)).filter((q) => q.text.startsWith(base));
  expect(rows.map((q) => q.text).sort()).toEqual([reworded, `${reworded} really`].sort());
});

test("discarding a quote capture makes no quote", async ({ page, request }) => {
  const said = quoteText("discard");
  const raw = `I said a quote: ${said}`;
  await capture(request, raw);
  const card = await openReview(page, raw);
  await card.getByRole("button", { name: "DISCARD" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("tab", { name: "NEEDS REVIEW" })).toBeVisible();
  await expect(reviewCard(page, raw)).toHaveCount(0);
  expect((await mine(request)).some((q) => q.text === said)).toBe(false);
});

test("the quotes routes refuse bad input without a server error", async ({ request }) => {
  expect((await request.post("/api/quotes", { data: { text: "   " } })).status()).toBe(400);
  const missing = "00000000-0000-4000-8000-000000000000";
  expect((await request.get(`/api/quotes/${missing}`)).status()).toBe(404);
  expect((await request.patch(`/api/quotes/${missing}`, { data: { merch: true } })).status()).toBe(404);
  expect((await request.delete(`/api/quotes/${missing}`)).status()).toBe(404);
  const row = await createQuote(request, { text: quoteText("guard"), skip_research: true });
  expect((await request.patch(`/api/quotes/${row.id}`, { data: { text: "" } })).status()).toBe(400);
  expect((await request.patch(`/api/quotes/${row.id}`, { data: { merch: "yes" } })).status()).toBe(400);
  expect((await request.patch(`/api/quotes/${row.id}`, { data: { said_at: "not a date" } })).status()).toBe(400);
  // a field outside the whitelist is ignored, not written
  expect((await request.patch(`/api/quotes/${row.id}`, { data: { research_status: "found" } })).status()).toBe(400);
  // a speaker who does not exist is refused in words, on create and on edit (it used to be a 500 quoting the database)
  const nobody = await request.post("/api/quotes", { data: { text: quoteText("nobody"), said_by_person_id: missing, is_own: false, skip_research: true, force: true } });
  expect(nobody.status()).toBe(400);
  expect(((await nobody.json()) as { error: string }).error).toBe("No such person.");
  expect((await request.patch(`/api/quotes/${row.id}`, { data: { said_by_person_id: missing } })).status()).toBe(400);
  expect((await request.patch(`/api/quotes/${row.id}`, { data: { said_by_person_id: "not-a-uuid" } })).status()).toBe(400);
  expect((await request.get("/api/quotes/similar?text=")).status()).toBe(200);
});
