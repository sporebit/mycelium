/**
 * Gifts as Tess, a second user with her own space: gifts are owner-only
 * (spec §11), so she sees none of Phil's ideas or occasions, cannot read,
 * change, convert or delete one by id, cannot aim an idea at his person,
 * and her own page works with her own rows.
 *
 * Phil's side is set up through the API secret and removed afterwards.
 * Tess's rows carry `E2E-gifts-<run>` and are removed too.
 */
import { test, type APIRequestContext } from "@playwright/test";
import { createPerson, expect, letters, PATIENT, PATIENT_USE, philApi, removePerson, send } from "./people.shared.ts";

test.describe.configure(PATIENT);
test.use(PATIENT_USE);

const RUN = letters(6);
const G = `E2E-gifts-${RUN}`;

type Gift = { id: string; title: string; for_person_id: string | null; occasion_id: string | null };
type Occasion = { id: string; name: string; person_id: string | null };

let phil: APIRequestContext;
let philPerson: { id: string };
let philGift: Gift;
let philOccasion: Occasion;
const tessGifts: string[] = [];

const gifts = async (api: APIRequestContext) => ((await (await api.get("/api/gifts?include_rejected=1&limit=500")).json()).gifts ?? []) as Gift[];
const occasions = async (api: APIRequestContext) => ((await (await api.get("/api/gift-occasions?past=1&archived=1")).json()).occasions ?? []) as Occasion[];

test.beforeAll(async () => {
  phil = await philApi();
  philPerson = await createPerson(phil, { first_name: `Zq${letters(10)}` });
  const o = await send(() => phil.post("/api/gift-occasions", { data: { name: `${G} Phil's do`, kind: "other", occurs_on: "2099-06-01" } }));
  expect(o.status(), await o.text()).toBe(201);
  philOccasion = (await o.json()).occasion;
  const g = await send(() => phil.post("/api/gifts", { data: { title: `${G} Phil's idea ${letters(6)}`, for_person_id: philPerson.id, occasion_id: philOccasion.id } }));
  expect(g.status(), await g.text()).toBe(201);
  philGift = (await g.json()).gift;
});

test.afterAll(async ({ request }) => {
  for (const id of tessGifts) await request.delete(`/api/gifts/${id}`);
  for (const g of await gifts(request)) if (g.title.includes(RUN)) await request.delete(`/api/gifts/${g.id}`);
  await phil.delete(`/api/gifts/${philGift.id}`);
  await phil.delete(`/api/gift-occasions/${philOccasion.id}`);
  await removePerson(phil, philPerson.id);
  await phil.dispose();
});

test("Tess sees none of Phil's gifts or occasions, and cannot reach one by id", async ({ request }) => {
  expect((await gifts(request)).some((g) => g.id === philGift.id)).toBe(false);
  expect((await occasions(request)).some((o) => o.id === philOccasion.id)).toBe(false);
  expect((await request.get(`/api/gifts/${philGift.id}`)).status()).toBe(404);
  expect((await request.get(`/api/gift-occasions/${philOccasion.id}`)).status()).toBe(404);
  expect((await (await request.get(`/api/gifts/${philGift.id}/comments`)).json()).comments ?? null).toBeNull();
  expect((await request.patch(`/api/gifts/${philGift.id}`, { data: { title: "Tess was here" } })).status()).toBe(404);
  expect((await request.patch(`/api/gift-occasions/${philOccasion.id}`, { data: { name: "Tess was here" } })).status()).toBe(404);
  expect((await request.post(`/api/gifts/${philGift.id}/convert`)).status()).toBe(404);
  expect((await request.post(`/api/gifts/${philGift.id}/comments`, { data: { body: "hello" } })).status()).toBe(404);
  expect((await request.delete(`/api/gifts/${philGift.id}`)).status()).toBe(404);
  expect((await request.delete(`/api/gift-occasions/${philOccasion.id}`)).status()).toBe(404);
  // still Phil's, untouched
  const still = await phil.get(`/api/gifts/${philGift.id}`);
  expect(still.status()).toBe(200);
  expect(((await still.json()).gift as Gift).title).toBe(philGift.title);
  // the person's gifts, through the people route: none for her
  expect(((await (await request.get(`/api/people/${philPerson.id}/gifts`)).json()).gifts ?? []).length).toBe(0);
  // the export has none of his
  expect(await (await request.get("/api/gifts/export?format=csv&include_rejected=1")).text()).not.toContain(philGift.title);
});

test("Tess cannot aim an idea at Phil's person or occasion", async ({ request }) => {
  const byPerson = await send(() => request.post("/api/gifts", { data: { title: `${G} aimed`, for_person_id: philPerson.id } }));
  expect(byPerson.status()).toBe(400);
  expect(((await byPerson.json()) as { error: string }).error).toBe("No such person.");
  const byOccasion = await send(() => request.post("/api/gifts", { data: { title: `${G} aimed`, occasion_id: philOccasion.id } }));
  expect(byOccasion.status()).toBe(400);
  expect(((await byOccasion.json()) as { error: string }).error).toBe("No such occasion.");
  expect((await gifts(request)).some((g) => g.title === `${G} aimed`)).toBe(false);
});

test("her own page works with her own ideas, and Phil does not see them", async ({ page, request }) => {
  const title = `${G} Tess's idea ${letters(6)}`;
  await page.goto("/organisation/gifts");
  await expect(page.getByRole("heading", { name: "Gifts" })).toBeVisible();
  await expect(page.getByText(philGift.title)).toHaveCount(0);
  await page.getByRole("button", { name: "+ IDEA" }).click();
  await page.getByLabel(/^Gift/).fill(title);
  await page.getByLabel(/^Or a name/).fill("Nan");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/gifts") && r.request().method() === "POST");
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  expect((await created).status()).toBe(201);
  await page.getByLabel("View").selectOption("all");
  await page.getByPlaceholder("Search gift ideas…").fill(G);
  const card = page.getByTestId("gift-card").filter({ hasText: title });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Nan");

  const hers = (await gifts(request)).find((g) => g.title === title)!;
  tessGifts.push(hers.id);
  expect((await gifts(phil)).some((g) => g.id === hers.id), "Phil's list has none of hers").toBe(false);
  expect((await phil.get(`/api/gifts/${hers.id}`)).status()).toBe(404);
});
