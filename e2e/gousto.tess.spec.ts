/**
 * The Gousto cookbook as Tess. The index is per space (0151): Tess has her
 * own, empty until a sync fills it, and Phil's rows are not hers to read,
 * favourite, save or overwrite.
 *
 * A recipe is put into Phil's index through the sync's own route (the
 * x-api-secret header acts as Phil), then every route and both pages are
 * tried with Tess's session. One recipe is ingested with Tess's session to
 * show it lands in her space and stays out of Phil's.
 */
import { expect as baseExpect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, TESS, personalSpace } from "./support/users.ts";

// The dev server is shared with four other test runs and compiles routes on first visit:
// a slow answer is not a failure, so waits are longer than the suite default.
const expect = baseExpect.configure({ timeout: 90_000 });
test.describe.configure({ timeout: 600_000 });

const RUN = Date.now().toString(36);
const SLUG = `e2e-gousto-${RUN}-t`;
const PHILS = `${SLUG}-phils-curry`;
const HERS = `${SLUG}-tess-pie`;
const TITLE = `E2E-gousto-${RUN}-t`;

const entry = (slug: string, title: string) => ({ uid: `uid-${slug}`, gousto_uid: `uid-${slug}`, title, url: `/${slug}`, rating: { average: 4.5, count: 12 } });
const detail = (slug: string, title: string) => ({ ...entry(slug, title), description: "A description.", ingredients: [{ label: "One pack" }], cooking_instructions: [{ order: 1, instruction: "<p>Cook it.</p>" }] });

let asPhil: APIRequestContext;
let tessHadRows = 0;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  asPhil = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  const ingest = await asPhil.post("/api/health/gousto/ingest", { data: { entries: [entry(PHILS, `${TITLE} Phil's Curry`)] } });
  expect(ingest.status()).toBe(200);
  expect((await asPhil.put(`/api/health/gousto/${PHILS}/detail`, { data: { entry: detail(PHILS, `${TITLE} Phil's Curry`) } })).status()).toBe(200);
  tessHadRows = Number(localSql(`select count(*) from public.gousto_recipes where space_id = '${personalSpace(TESS)}'`)[0][0]);
});

test.afterAll(async () => {
  localSql(`delete from public.gousto_recipes where slug like '${SLUG}-%'`);
  await asPhil.dispose();
});

test("an empty index shows how to fill it, not an error", async ({ page }) => {
  test.skip(tessHadRows > 0, "Tess's index is not empty on this database, so the empty state cannot be shown");
  const serverErrors: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
  });
  await page.goto("/health/recipes/gousto");
  await expect(page.getByRole("heading", { name: "Gousto cookbook" })).toBeVisible();
  await expect(page.getByText("0 RECIPES · 0 FAVOURITES")).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
  await expect(page.getByText("npm run gousto:sync")).toBeVisible();
  await expect(page.getByLabel("Search Gousto recipes")).toHaveCount(0);
  expect(serverErrors).toEqual([]);
});

test("Phil's recipes are not in Tess's list, facets or sync queue", async ({ request }) => {
  const list = await request.get(`/api/health/gousto?q=${encodeURIComponent(TITLE)}`);
  expect(list.status()).toBe(200);
  const body = await list.json();
  expect(body.matched).toBe(0);
  expect(body.recipes).toEqual([]);
  expect(body.total).toBe(tessHadRows);
  const missing = await (await request.get("/api/health/gousto/missing?limit=2000")).json();
  expect(missing.slugs).not.toContain(PHILS);
  // and Phil does have it
  expect((await (await asPhil.get(`/api/health/gousto?q=${encodeURIComponent(TITLE)}`)).json()).matched).toBe(1);
});

test("Tess cannot read, favourite, save or overwrite one of Phil's recipes", async ({ request, page }) => {
  expect((await request.get(`/api/health/gousto/${PHILS}`)).status()).toBe(404);
  expect((await request.patch(`/api/health/gousto/${PHILS}`, { data: { is_favourite: true } })).status()).toBe(404);
  expect((await request.post(`/api/health/gousto/${PHILS}/save`)).status()).toBe(404);
  expect((await request.put(`/api/health/gousto/${PHILS}/detail`, { data: { entry: null } })).status()).toBe(404);
  expect((await request.put(`/api/health/gousto/${PHILS}/detail`, { data: { entry: detail(PHILS, "Overwritten by Tess") } })).status()).toBe(404);

  const row = localSql(`select title, is_favourite, saved_recipe_id is null, space_id from public.gousto_recipes where slug = '${PHILS}'`);
  expect(row).toHaveLength(1);
  expect(row[0]).toEqual([`${TITLE} Phil's Curry`, "f", "t", personalSpace(PHIL)]);
  expect(localSql(`select count(*) from public.recipes where title like '${TITLE}%'`)[0][0]).toBe("0");

  await page.goto(`/health/recipes/gousto/${PHILS}`);
  await expect(page.getByText("No such recipe. Run the Gousto sync on the PC first.")).toBeVisible();
  await expect(page.getByText("Phil's Curry")).toHaveCount(0);
});

test("a recipe Tess ingests lands in her own space, and Phil does not see it", async ({ request, page }) => {
  const res = await request.post("/api/health/gousto/ingest", { data: { entries: [entry(HERS, `${TITLE} Tess Pie`), entry(PHILS, `${TITLE} Same Slug As Phil's`)] } });
  expect(res.status()).toBe(200);
  expect((await res.json()).upserted).toBe(2);

  const rows = localSql(`select slug, space_id, title from public.gousto_recipes where slug like '${SLUG}-%' order by slug, title`);
  // the slug is unique per space, so the same Gousto recipe sits once in each index
  expect(rows).toEqual([
    [PHILS, personalSpace(PHIL), `${TITLE} Phil's Curry`],
    [PHILS, personalSpace(TESS), `${TITLE} Same Slug As Phil's`],
    [HERS, personalSpace(TESS), `${TITLE} Tess Pie`],
  ]);

  expect((await (await asPhil.get(`/api/health/gousto?q=${encodeURIComponent(TITLE)}`)).json()).matched, "Phil still sees only his own").toBe(1);
  expect((await asPhil.get(`/api/health/gousto/${HERS}`)).status()).toBe(404);
  // each of them opens their own row for the shared slug
  expect((await (await asPhil.get(`/api/health/gousto/${PHILS}`)).json()).recipe.title).toBe(`${TITLE} Phil's Curry`);
  expect((await (await request.get(`/api/health/gousto/${PHILS}`)).json()).recipe.title).toBe(`${TITLE} Same Slug As Phil's`);

  await page.goto("/health/recipes/gousto");
  await page.getByLabel("Search Gousto recipes").fill(TITLE);
  await expect(page.locator(`a[href^="/health/recipes/gousto/${SLUG}-"]`)).toHaveCount(2);
  await expect(page.getByText(`${TITLE} Tess Pie`)).toBeVisible();
  await expect(page.getByText("Phil's Curry")).toHaveCount(0);
});
