/**
 * The Gousto cookbook (0151–0155) as Phil.
 *
 * The local index is empty and the sync script is never run (it calls
 * Gousto's site), so the spec seeds five synthetic recipes through the same
 * routes the PC script posts to: raw listing entries into /ingest, raw
 * detail entries into /[slug]/detail, both with the x-api-secret header.
 * Two rows then have their `categories` column rewritten with SQL into the
 * legacy "X Recipes" spelling the hosted index still holds, which no write
 * path produces any more and the 0155 facet exists to merge.
 *
 * Everything is slugged `e2e-gousto-<run>-…` and removed afterwards (SQL:
 * the app has no delete for a Gousto row).
 */
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";

// The dev server is shared with four other test runs and compiles routes on first visit:
// a slow answer is not a failure, so waits are longer than the suite default.
const expect = baseExpect.configure({ timeout: 90_000 });
test.describe.configure({ timeout: 600_000 });

const RUN = Date.now().toString(36);
const SLUG = `e2e-gousto-${RUN}`;
const TITLE = `E2E-gousto-${RUN}`;
const CAT = `E2Ecat ${RUN} Family`;
const CAT_QUICK = `E2Ecat ${RUN} Quick`;
const CUISINE_A = `E2Ecuisine ${RUN} Indian`;
const CUISINE_B = `E2Ecuisine ${RUN} Mexican`;
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const slug = (name: string) => `${SLUG}-${name}`;
const A = slug("alpha-chicken-curry");
const B = slug("bravo-beef-chilli");
const C = slug("charlie-veggie-pasta");
const D = slug("delta-fish-pie");
const E = slug("echo-gone-stew");
const TITLES: Record<string, string> = {
  [A]: `${TITLE} Alpha Chicken Curry`,
  [B]: `${TITLE} Bravo Beef Chilli`,
  [C]: `${TITLE} Charlie Veggie Pasta`,
  [D]: `${TITLE} Delta Fish Pie`,
  [E]: `${TITLE} Echo Gone Stew`,
};

type Listing = { uid: string; gousto_uid: string; title: string; url: string; media?: unknown; rating?: { average?: number; count?: number }; prep_times?: { for_2?: number; for_4?: number } };

function listing(s: string, rating?: { average: number; count: number }, prep?: { for_2: number; for_4: number }, uid = `uid-${s}`): Listing {
  return {
    uid,
    gousto_uid: uid,
    title: TITLES[s],
    url: `/${s}`,
    media: { images: [{ image: PIXEL, width: 50 }, { image: PIXEL, width: 700 }] },
    rating,
    prep_times: prep,
  };
}

/** The listing batch the sync would post: A twice (a re-issue under an older uid with fewer ratings), and three entries the server must drop. */
const LISTING: unknown[] = [
  listing(A, { average: 4.1, count: 10 }, { for_2: 25, for_4: 35 }, `uid-${A}-old`),
  listing(A, { average: 4.8, count: 900 }, { for_2: 25, for_4: 35 }),
  listing(B, { average: 4.2, count: 500 }, { for_2: 40, for_4: 40 }),
  listing(C, { average: 4.9, count: 100 }, { for_2: 15, for_4: 20 }),
  listing(D, { average: 3.5, count: 50 }, { for_2: 30, for_4: 45 }),
  listing(E),
  null,
  "not an entry",
  { gousto_uid: "no-url-or-title" },
];

const NUTRITION = { energy_kcal: 612, fat_mg: 23400, fat_saturates_mg: 8100, carbs_mg: 61000, carbs_sugars_mg: 9900, fibre_mg: 7400, protein_mg: 38200, salt_mg: 1800 };
const INGREDIENTS = ["Chicken breast strips (250g)", "Basmati rice (130g)", "Curry powder (1tbsp)"];
const BASICS = ["Vegetable oil", "Salt"];
const ALLERGENS = ["Mustard", "Celery"];
const CANONICAL = `https://www.gousto.co.uk/cookbook/recipes/${A}`;

function detailEntry(s: string, opts: { cuisine?: string; categories: string[]; full?: boolean }) {
  return {
    ...listing(s),
    rating: undefined,
    prep_times: undefined,
    description: `Description of ${TITLES[s]}.`,
    cuisine: opts.cuisine ? { slug: "x", title: opts.cuisine } : null,
    categories: opts.categories.map((title) => ({ title, url: "/x" })),
    ingredients: opts.full ? INGREDIENTS.map((label) => ({ label, media: { images: [{ image: PIXEL, width: 200 }] } })) : [{ label: "One pack" }],
    basics: opts.full ? BASICS.map((title) => ({ title })) : [],
    cooking_instructions: opts.full
      ? [
          // out of order on purpose: the server sorts by `order`
          {
            order: 2,
            instruction: '<p>Serve the curry over the rice</p><img src=x onerror="window.__e2e_xss=3"',
          },
          {
            order: 1,
            instruction:
              '<p class="x" onclick="window.__e2e_xss=1">Boil the <strong>rice</strong> for 10 min</p><script>window.__e2e_xss=2</script><a href="https://example.invalid/">a link</a>',
          },
        ]
      : [{ order: 1, instruction: "<p>Cook it.</p>" }],
    allergens: opts.full ? [{ title: ALLERGENS[0] }, ALLERGENS[1]] : [],
    nutritional_information: opts.full ? { per_portion: NUTRITION, per_hundred_grams: { energy_kcal: 150 } } : undefined,
    portion_sizes: opts.full ? [{ portions: 2, is_offered: true }, { portions: 3, is_offered: false }, { portions: 4 }] : [],
    seo: opts.full ? { canonical: CANONICAL } : undefined,
  };
}

let sync: APIRequestContext; // what the PC script is: no session, the API secret
let anon: APIRequestContext; // no session, no secret
const savedRecipeIds: string[] = [];

const titleQ = encodeURIComponent(TITLE);
const mine = (page: Page) => page.locator(`a[href^="/health/recipes/gousto/${SLUG}-"]`);
const card = (page: Page, s: string) => page.locator(`a[href="/health/recipes/gousto/${s}"]`);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }) => {
  const noSession = { cookies: [], origins: [] };
  sync = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: noSession, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
  anon = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: noSession });
});

test.afterAll(async () => {
  for (const id of savedRecipeIds) await sync.delete(`/api/health/recipes/${id}`);
  localSql(`delete from public.gousto_recipes where slug like '${SLUG}-%'`);
  await sync.dispose();
  await anon.dispose();
});

test.describe("the write path the PC sync uses", () => {
  test("without a session or the secret every Gousto route answers 401", async () => {
    const calls: Array<[string, string, unknown?]> = [
      ["GET", "/api/health/gousto"],
      ["POST", "/api/health/gousto/ingest", { entries: [] }],
      ["GET", "/api/health/gousto/missing"],
      ["GET", `/api/health/gousto/${A}`],
      ["PATCH", `/api/health/gousto/${A}`, { is_favourite: true }],
      ["PUT", `/api/health/gousto/${A}/detail`, { entry: null }],
      ["POST", `/api/health/gousto/${A}/save`],
    ];
    for (const [method, path, data] of calls) {
      const res = await anon.fetch(path, { method, data });
      expect(res.status(), `${method} ${path}`).toBe(401);
    }
    const wrong = await anon.post("/api/health/gousto/ingest", { headers: { "x-api-secret": "not-the-secret" }, data: { entries: [] } });
    expect(wrong.status(), "a wrong secret").toBe(401);
  });

  test("ingest refuses a body that is not a list of entries, and a list above 1,000", async () => {
    for (const data of [{}, { entries: "x" }, { entries: { a: 1 } }]) {
      const res = await sync.post("/api/health/gousto/ingest", { data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
    const notJson = await sync.post("/api/health/gousto/ingest", { headers: { "content-type": "application/json" }, data: "{not json" });
    expect(notJson.status()).toBe(400);
    const tooMany = await sync.post("/api/health/gousto/ingest", { data: { entries: Array.from({ length: 1001 }, () => null) } });
    expect(tooMany.status()).toBe(400);
    const junkOnly = await sync.post("/api/health/gousto/ingest", { data: { entries: [null, 3, "x", { title: "no uid" }] } });
    expect(junkOnly.status()).toBe(200);
    expect((await junkOnly.json()).upserted).toBe(0);
  });

  test("ingest stores one row per slug, keeping the most-rated entry of a re-issued recipe", async () => {
    const before = (await (await sync.get("/api/health/gousto?limit=1")).json()).total as number;
    const res = await sync.post("/api/health/gousto/ingest", { data: { entries: LISTING } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.upserted).toBe(5);
    expect(body.total).toBe(before + 5);

    const rows = localSql(`select slug, gousto_uid, rating_count, rating_avg, prep_for_2, prep_for_4, url, title from public.gousto_recipes where slug like '${SLUG}-%' order by slug`);
    expect(rows.map((r) => r[0])).toEqual([A, B, C, D, E]);
    const a = rows[0];
    expect(a[1], "the entry with 900 ratings wins over the one with 10").toBe(`uid-${A}`);
    expect(Number(a[2])).toBe(900);
    expect(Number(a[3])).toBe(4.8);
    expect([Number(a[4]), Number(a[5])]).toEqual([25, 35]);
    expect(a[6]).toBe(`https://www.gousto.co.uk/cookbook/${A}`);
    expect(a[7]).toBe(TITLES[A]);
  });

  test("the detail route validates its slug and body", async () => {
    expect((await sync.put(`/api/health/gousto/${SLUG}-no-such-recipe/detail`, { data: { entry: null } })).status()).toBe(404);
    expect((await sync.put(`/api/health/gousto/${encodeURIComponent("bad slug!")}/detail`, { data: { entry: null } })).status()).toBe(404);
    expect((await sync.put(`/api/health/gousto/${A}/detail`, { data: {} })).status()).toBe(400);
    expect((await sync.put(`/api/health/gousto/${A}/detail`, { data: { entry: "text" } })).status()).toBe(400);
    expect((await sync.put(`/api/health/gousto/${A}/detail`, { data: { entry: 7 } })).status()).toBe(400);
  });

  test("missing lists the rows without a detail; a stored detail and a recipe Gousto no longer serves both leave the queue", async () => {
    const q = async (extra = "") => (await (await sync.get(`/api/health/gousto/missing?limit=2000${extra}`)).json()) as { slugs: string[]; remaining: number };
    const first = await q();
    for (const s of [A, B, C, D, E]) expect(first.slugs, s).toContain(s);

    const put = async (s: string, entry: unknown) => {
      const res = await sync.put(`/api/health/gousto/${s}/detail`, { data: { entry } });
      expect(res.status(), s).toBe(200);
      return res.json();
    };
    expect((await put(A, detailEntry(A, { cuisine: CUISINE_A, categories: [`${CAT} Recipes`, CAT, "All Gousto", CAT_QUICK], full: true }))).has_detail).toBe(true);
    await put(B, detailEntry(B, { cuisine: CUISINE_B, categories: [CAT] }));
    await put(C, detailEntry(C, { cuisine: CUISINE_A, categories: [CAT] }));
    expect((await put(E, null)).has_detail).toBe(false);

    const second = await q();
    expect(second.remaining).toBe(first.remaining - 4);
    expect(second.slugs).toContain(D);
    for (const s of [A, B, C, E]) expect(second.slugs, s).not.toContain(s);

    // --stale-days: a detail fetched 40 days ago is due again at 30, one fetched just now is not
    localSql(`update public.gousto_recipes set detail_fetched_at = now() - interval '40 days' where slug = '${B}'`);
    const stale = await q("&stale_days=30");
    expect(stale.slugs).toContain(B);
    expect(stale.slugs).toContain(D);
    expect(stale.slugs).not.toContain(A);

    // a favourite is fetched before the rest
    await sync.patch(`/api/health/gousto/${D}`, { data: { is_favourite: true } });
    const favFirst = await q("&stale_days=30");
    expect(favFirst.slugs.indexOf(D)).toBeLessThan(favFirst.slugs.indexOf(B));
    await sync.patch(`/api/health/gousto/${D}`, { data: { is_favourite: false } });
  });

  test("a detail is stored in the short category form and refreshes the listing columns", async () => {
    const res = await sync.get(`/api/health/gousto/${A}`);
    expect(res.status()).toBe(200);
    const { recipe, needs_detail } = await res.json();
    expect(needs_detail).toBe(false);
    expect(recipe.categories).toEqual([CAT, CAT_QUICK]);
    expect(recipe.cuisine).toBe(CUISINE_A);
    expect(recipe.detail.categories).toEqual([CAT, CAT_QUICK]);
    expect(recipe.detail.ingredients.map((i: { label: string }) => i.label)).toEqual(INGREDIENTS);
    expect(recipe.detail.basics).toEqual(BASICS);
    expect(recipe.detail.allergens).toEqual(ALLERGENS);
    expect(recipe.detail.portions, "the portion size Gousto does not offer is left out").toEqual([2, 4]);
    expect(recipe.detail.canonical).toBe(CANONICAL);
    expect(recipe.detail.steps.map((s: { order: number }) => s.order)).toEqual([1, 2]);
    expect(recipe.detail.steps[0].text).toContain("Boil the rice for 10 min");
    for (const step of recipe.detail.steps as Array<{ html: string }>) {
      expect(step.html).not.toMatch(/<\s*(script|a|img)\b[^>]*>/i);
      expect(step.html).not.toMatch(/onclick|class=/i);
    }
    // the listing's rating survives a detail payload that carries none
    expect(recipe.rating_count).toBe(900);

    const gone = await (await sync.get(`/api/health/gousto/${E}`)).json();
    expect(gone.needs_detail).toBe(true);
    expect(gone.recipe.detail_fetched_at).not.toBeNull();
  });

  test("a re-run of the listing never touches a favourite or a cached detail", async () => {
    expect((await sync.patch(`/api/health/gousto/${A}`, { data: { is_favourite: true } })).status()).toBe(200);
    const again = await sync.post("/api/health/gousto/ingest", { data: { entries: [listing(A, { average: 4.7, count: 950 }, { for_2: 25, for_4: 35 })] } });
    expect((await again.json()).upserted).toBe(1);
    const { recipe } = await (await sync.get(`/api/health/gousto/${A}`)).json();
    expect(recipe.rating_count, "the listing columns did refresh").toBe(950);
    expect(recipe.is_favourite).toBe(true);
    expect(recipe.detail?.ingredients).toHaveLength(INGREDIENTS.length);
    expect(recipe.categories).toEqual([CAT, CAT_QUICK]);
    expect(localSql(`select count(*) from public.gousto_recipes where slug = '${A}'`)[0][0]).toBe("1");
    await sync.patch(`/api/health/gousto/${A}`, { data: { is_favourite: false } });
    // back to the seeded figures for the sort checks below
    await sync.post("/api/health/gousto/ingest", { data: { entries: [listing(A, { average: 4.8, count: 900 }, { for_2: 25, for_4: 35 })] } });
  });
});

test.describe("the list route", () => {
  test.beforeAll(() => {
    // The hosted index holds categories as Gousto sent them before 0155:
    // sometimes the long name alone, sometimes both. No write path makes
    // these any more, so the two legacy shapes are written directly.
    localSql(`update public.gousto_recipes set categories = array['${CAT} Recipes'] where slug = '${B}'`);
    localSql(`update public.gousto_recipes set categories = array['${CAT}', '${CAT} Recipes'] where slug = '${C}'`);
  });

  const get = async (request: APIRequestContext, qs: string) => {
    const res = await request.get(`/api/health/gousto?q=${titleQ}&${qs}`);
    expect(res.status(), qs).toBe(200);
    return (await res.json()) as { recipes: Array<{ slug: string }>; matched: number; total: number; favourites: number; cuisines: Array<{ name: string; count: number }>; categories: Array<{ name: string; count: number }> };
  };
  const slugs = (body: { recipes: Array<{ slug: string }> }) => body.recipes.map((r) => r.slug);

  test("search, sort and paging", async ({ request }) => {
    const all = await get(request, "sort=title");
    expect(all.matched).toBe(5);
    expect(slugs(all)).toEqual([A, B, C, D, E]);
    expect(all.total).toBeGreaterThanOrEqual(5);

    // popular = most ratings first, unrated last; top rated = best average first, unrated last
    expect(slugs(await get(request, ""))).toEqual([A, B, C, D, E]);
    expect(slugs(await get(request, "sort=rating"))).toEqual([C, A, B, D, E]);

    const page2 = await get(request, "sort=title&limit=2&offset=2");
    expect(slugs(page2)).toEqual([C, D]);
    expect(page2.matched, "matched counts the filter, not the page").toBe(5);

    // nonsense paging falls back rather than failing
    for (const qs of ["limit=abc&offset=-4", "limit=0", "limit=99999", "sort=nonsense"]) {
      expect((await get(request, qs)).matched, qs).toBe(5);
    }

    // % and _ are literal in a search, not wildcards
    const underscore = await request.get(`/api/health/gousto?q=${encodeURIComponent(TITLE.replace("E2E-", "E2E_"))}`);
    expect((await underscore.json()).matched).toBe(0);
    const percent = await request.get(`/api/health/gousto?q=${encodeURIComponent(`${TITLE}%Curry`)}`);
    expect((await percent.json()).matched).toBe(0);
    const word = await request.get(`/api/health/gousto?q=${encodeURIComponent(`${RUN} alpha chicken`)}`);
    expect((await word.json()).recipes.map((r: { slug: string }) => r.slug), "search ignores case").toEqual([A]);
  });

  test("the category facet merges 'X' and 'X Recipes' and the filter finds all three spellings", async ({ request }) => {
    const all = await get(request, "sort=title");
    const names = all.categories.map((c) => c.name);
    expect(names).toContain(CAT);
    expect(names, "the long form is not offered separately").not.toContain(`${CAT} Recipes`);
    expect(all.categories.find((c) => c.name === CAT)?.count, "A (short), B (long only), C (both, counted once)").toBe(3);
    expect(all.categories.find((c) => c.name === CAT_QUICK)?.count).toBe(1);

    expect(slugs(await get(request, `sort=title&category=${encodeURIComponent(CAT)}`))).toEqual([A, B, C]);
    expect(slugs(await get(request, `sort=title&category=${encodeURIComponent(CAT_QUICK)}`))).toEqual([A]);
    expect((await get(request, `category=${encodeURIComponent(`${CAT} nothing`)}`)).matched).toBe(0);
  });

  test("the cuisine facet and filter, and the two together", async ({ request }) => {
    const all = await get(request, "sort=title");
    expect(all.cuisines.find((c) => c.name === CUISINE_A)?.count).toBe(2);
    expect(all.cuisines.find((c) => c.name === CUISINE_B)?.count).toBe(1);
    expect(slugs(await get(request, `sort=title&cuisine=${encodeURIComponent(CUISINE_A)}`))).toEqual([A, C]);
    expect(slugs(await get(request, `sort=title&cuisine=${encodeURIComponent(CUISINE_B)}&category=${encodeURIComponent(CAT)}`))).toEqual([B]);
    expect((await get(request, `cuisine=${encodeURIComponent(CUISINE_B)}&category=${encodeURIComponent(CAT_QUICK)}`)).matched).toBe(0);
  });

  test("the heart: validation, the favourites filter, most recent favourite first", async ({ request }) => {
    expect((await request.patch(`/api/health/gousto/${B}`, { data: { is_favourite: "yes" } })).status()).toBe(400);
    expect((await request.patch(`/api/health/gousto/${B}`, { data: {} })).status()).toBe(400);
    expect((await request.patch(`/api/health/gousto/${SLUG}-no-such-recipe`, { data: { is_favourite: true } })).status()).toBe(404);
    expect((await request.get(`/api/health/gousto/${SLUG}-no-such-recipe`)).status()).toBe(404);

    const before = (await get(request, "")).favourites;
    expect((await request.patch(`/api/health/gousto/${B}`, { data: { is_favourite: true } })).status()).toBe(200);
    expect((await request.patch(`/api/health/gousto/${C}`, { data: { is_favourite: true } })).status()).toBe(200);
    const favs = await get(request, "favourites=1");
    expect(slugs(favs), "the one favourited last comes first").toEqual([C, B]);
    expect(favs.favourites).toBe(before + 2);
    await request.patch(`/api/health/gousto/${B}`, { data: { is_favourite: false } });
    await request.patch(`/api/health/gousto/${C}`, { data: { is_favourite: false } });
    expect((await get(request, "favourites=1")).matched).toBe(0);
  });
});

test.describe("the cookbook page", () => {
  test("lists the index, searches, filters by category and cuisine, sorts", async ({ page, request }) => {
    const serverErrors: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });
    await page.goto("/health/recipes/gousto");
    await expect(page.getByRole("heading", { name: "Gousto cookbook" })).toBeVisible();
    const api = await (await request.get("/api/health/gousto?limit=1")).json();
    await expect(page.getByText(new RegExp(`^${api.total.toLocaleString("en-GB")} RECIPES · ${api.favourites} FAVOURITES?`))).toBeVisible();
    await expect(page.getByText("npm run gousto:sync")).toHaveCount(0);

    await page.getByLabel("Search Gousto recipes").fill(TITLE);
    await expect(mine(page)).toHaveCount(5);
    await expect(page.getByText("5 MATCHES", { exact: true })).toBeVisible();
    // popular order by default
    await expect(mine(page).first()).toContainText("Alpha Chicken Curry");
    await expect(card(page, A)).toContainText("4.8");
    await expect(card(page, A)).toContainText("(900)");
    await expect(card(page, A)).toContainText("25m");
    await expect(card(page, A)).toContainText(CUISINE_A);

    const category = page.getByLabel("Category");
    await expect(category.locator("option", { hasText: `${CAT} (3)` })).toHaveCount(1);
    await expect(category.locator("option", { hasText: `${CAT} Recipes` })).toHaveCount(0);
    await category.selectOption(CAT);
    await expect(mine(page)).toHaveCount(3);
    await expect(page.getByText("3 MATCHES", { exact: true })).toBeVisible();
    await expect(card(page, D)).toHaveCount(0);

    await page.getByLabel("Cuisine").selectOption(CUISINE_B);
    await expect(mine(page)).toHaveCount(1);
    await expect(page.getByText("1 MATCH", { exact: true })).toBeVisible();
    await expect(card(page, B)).toBeVisible();

    await category.selectOption(CAT_QUICK);
    await expect(page.getByText("Nothing matches.")).toBeVisible();

    await category.selectOption("");
    await page.getByLabel("Cuisine").selectOption("");
    await page.getByLabel("Sort").selectOption("rating");
    await expect(mine(page)).toHaveCount(5);
    await expect(mine(page).first()).toContainText("Charlie Veggie Pasta");
    await page.getByLabel("Sort").selectOption("title");
    await expect(mine(page).nth(4)).toContainText("Echo Gone Stew");
    await expect(mine(page).first()).toContainText("Alpha Chicken Curry");
    expect(serverErrors).toEqual([]);
  });

  test("the heart on a card favourites and unfavourites, and the Favourites filter follows", async ({ page }) => {
    await page.goto("/health/recipes/gousto");
    await page.getByLabel("Search Gousto recipes").fill(TITLE);
    await expect(mine(page)).toHaveCount(5);

    const favouritesTab = page.getByRole("button", { name: /Favourites/ });
    const countBefore = Number(((await favouritesTab.textContent()) ?? "").replace(/\D/g, ""));

    const patched = page.waitForResponse((r) => r.url().endsWith(`/api/health/gousto/${C}`) && r.request().method() === "PATCH");
    await card(page, C).getByRole("button", { name: "Add to favourites" }).click();
    expect((await patched).status()).toBe(200);
    await expect(page).toHaveURL(/\/health\/recipes\/gousto$/); // the heart does not follow the card's link
    await expect(card(page, C).getByRole("button", { name: "Remove from favourites" })).toHaveAttribute("aria-pressed", "true");
    await expect(favouritesTab).toHaveText(new RegExp(`Favourites ${countBefore + 1}$`));

    await favouritesTab.click();
    await expect(mine(page)).toHaveCount(1);
    await expect(card(page, C)).toBeVisible();

    await page.reload();
    await page.getByLabel("Search Gousto recipes").fill(TITLE);
    await expect(card(page, C).getByRole("button", { name: "Remove from favourites" })).toBeVisible();

    await page.getByRole("button", { name: /Favourites/ }).click();
    await expect(mine(page)).toHaveCount(1);
    const unpatched = page.waitForResponse((r) => r.url().endsWith(`/api/health/gousto/${C}`) && r.request().method() === "PATCH");
    await card(page, C).getByRole("button", { name: "Remove from favourites" }).click();
    expect((await unpatched).status()).toBe(200);
    await expect(mine(page)).toHaveCount(0);
    await expect(page.getByText("No favourites yet. Tap the heart on a recipe.")).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(mine(page)).toHaveCount(5);
  });

  test("a card opens the recipe", async ({ page }) => {
    await page.goto("/health/recipes/gousto");
    await page.getByLabel("Search Gousto recipes").fill(TITLE);
    await card(page, A).click();
    // the dev server compiles the recipe route on its first visit, which can outlast the default wait
    await expect(page).toHaveURL(new RegExp(`/health/recipes/gousto/${A}$`), { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: TITLES[A] })).toBeVisible();
  });
});

test.describe("the recipe page", () => {
  test("shows the cached detail: ingredients, cupboard, allergens, nutrition per portion, method", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (err) => crashes.push(err.message));
    await page.goto(`/health/recipes/gousto/${A}`);
    await expect(page.getByRole("heading", { name: TITLES[A] })).toBeVisible();
    await expect(page.getByText("25 min (for 4: 35)")).toBeVisible();
    await expect(page.getByText("serves 2 / 4")).toBeVisible();
    await expect(page.getByText(CUISINE_A)).toBeVisible();
    await expect(page.getByRole("link", { name: /gousto\.co\.uk/ })).toHaveAttribute("href", CANONICAL);
    await expect(page.getByText(`Description of ${TITLES[A]}.`)).toBeVisible();
    await expect(page.getByText(CAT, { exact: true })).toBeVisible();
    await expect(page.getByText(`${CAT} Recipes`)).toHaveCount(0);

    const box = page.locator("aside");
    for (const label of INGREDIENTS) await expect(box.getByText(label, { exact: true })).toBeVisible();
    await expect(box.getByText(BASICS.join(", "))).toBeVisible();
    await expect(box.getByText(ALLERGENS.join(", "))).toBeVisible();

    // Gousto sends milligrams; the table shows grams to one decimal, energy as it comes
    const row = (label: string) => box.getByRole("row").filter({ has: page.getByRole("cell", { name: label, exact: true }) });
    await expect(row("Energy")).toContainText(`${NUTRITION.energy_kcal} kcal`);
    const grams: Array<[string, number]> = [
      ["Fat", NUTRITION.fat_mg],
      ["of which saturates", NUTRITION.fat_saturates_mg],
      ["Carbohydrate", NUTRITION.carbs_mg],
      ["of which sugars", NUTRITION.carbs_sugars_mg],
      ["Fibre", NUTRITION.fibre_mg],
      ["Protein", NUTRITION.protein_mg],
      ["Salt", NUTRITION.salt_mg],
    ];
    for (const [label, mg] of grams) await expect(row(label), label).toContainText(`${mg / 1000} g`);

    const method = page.locator("section", { has: page.getByRole("heading", { name: "Method" }) }).locator("ol");
    await expect(method.locator("li")).toHaveCount(2);
    await expect(method.locator("li").first()).toContainText("Boil the rice for 10 min");
    await expect(method.locator("li").first().locator("strong")).toHaveText("rice");
    await expect(method.locator("li").nth(1)).toContainText("Serve the curry over the rice");
    // Gousto's HTML is cut down to p / strong / em / br: nothing else survives, nothing runs
    await expect(method.locator("script, a, img")).toHaveCount(0);
    await expect(method.locator("[onclick], [class='x']")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __e2e_xss?: number }).__e2e_xss)).toBeUndefined();
    expect(crashes).toEqual([]);
  });

  test("the heart persists across a reload", async ({ page, request }) => {
    await page.goto(`/health/recipes/gousto/${A}`);
    const patched = page.waitForResponse((r) => r.url().endsWith(`/api/health/gousto/${A}`) && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Add to favourites" }).click();
    expect((await patched).status()).toBe(200);
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove from favourites" })).toHaveAttribute("aria-pressed", "true");
    const unpatched = page.waitForResponse((r) => r.url().endsWith(`/api/health/gousto/${A}`) && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Remove from favourites" }).click();
    expect((await unpatched).status()).toBe(200);
    expect((await (await request.get(`/api/health/gousto/${A}`)).json()).recipe.is_favourite).toBe(false);
  });

  test("a recipe without a detail says so and cannot be saved; so does one Gousto no longer serves", async ({ page, request }) => {
    for (const s of [D, E]) {
      await page.goto(`/health/recipes/gousto/${s}`);
      await expect(page.getByRole("heading", { name: TITLES[s] })).toBeVisible();
      if (s === D) {
        // not fetched yet: the sync will get it
        await expect(page.getByText("have not been pulled yet")).toBeVisible();
        await expect(page.getByText("npm run gousto:sync")).toBeVisible();
      } else {
        // asked for and gone (48 such on the hosted index): running the sync again would not help, so the page does not say to
        await expect(page.getByText("Gousto no longer serves this recipe")).toBeVisible();
        await expect(page.getByText("npm run gousto:sync")).toHaveCount(0);
        await expect(page.getByText("have not been pulled yet")).toHaveCount(0);
      }
      await expect(page.getByRole("button", { name: "SAVE TO MY RECIPES" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /gousto\.co\.uk/ })).toHaveAttribute("href", `https://www.gousto.co.uk/cookbook/${s}`);
      const save = await request.post(`/api/health/gousto/${s}/save`);
      expect(save.status(), `save ${s}`).toBe(409);
      expect((await save.json()).error).toContain("has not been synced yet");
    }
  });

  test("an unknown recipe says so instead of crashing", async ({ page, request }) => {
    await page.goto(`/health/recipes/gousto/${SLUG}-no-such-recipe`);
    await expect(page.getByText("No such recipe. Run the Gousto sync on the PC first.")).toBeVisible();
    await expect(page.getByRole("link", { name: "← GOUSTO COOKBOOK" })).toBeVisible();
    expect((await request.post(`/api/health/gousto/${SLUG}-no-such-recipe/save`)).status()).toBe(404);
    expect((await request.post(`/api/health/gousto/${encodeURIComponent("bad slug!")}/save`)).status()).toBe(404);
  });

  test("SAVE TO MY RECIPES copies it into my recipes once, links back, and can be saved again after the copy is deleted", async ({ page, request }) => {
    await page.goto(`/health/recipes/gousto/${A}`);
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/health/gousto/${A}/save`));
    await page.getByRole("button", { name: "SAVE TO MY RECIPES" }).click();
    const saveRes = await saved;
    expect(saveRes.status()).toBe(201);
    const { recipe_id: recipeId, already } = await saveRes.json();
    savedRecipeIds.push(recipeId);
    expect(already).toBe(false);
    await expect(page).toHaveURL(new RegExp(`/health/recipes/${recipeId}$`));
    await expect(page.getByText(TITLES[A]).first()).toBeVisible();

    // what landed in my recipes
    const { recipe } = await (await request.get(`/api/health/recipes/${recipeId}`)).json();
    expect(recipe.title).toBe(TITLES[A]);
    expect(recipe.source_name).toBe("Gousto");
    expect(recipe.source_url).toBe(CANONICAL);
    expect(recipe.prep_time_minutes).toBe(25);
    expect(recipe.servings).toBe(2);
    expect(recipe.cuisine).toBe(CUISINE_A);
    expect(recipe.ingredients.map((i: { name: string }) => i.name)).toEqual([...INGREDIENTS, ...BASICS]);
    expect(recipe.ingredients.filter((i: { notes: string | null }) => i.notes === "from the cupboard").map((i: { name: string }) => i.name)).toEqual(BASICS);
    expect(recipe.method.map((m: { step: number }) => m.step)).toEqual([1, 2]);
    expect(recipe.method[0].instruction).toContain("Boil the rice for 10 min");
    expect(recipe.method[0].instruction, "the method is plain text").not.toMatch(/<[a-z/]/i);
    expect(recipe.tags).toEqual(["gousto", CAT.toLowerCase(), CAT_QUICK.toLowerCase()]);
    expect(recipe.notes).toContain(`Description of ${TITLES[A]}.`);
    expect(recipe.notes).toContain(`Allergens: ${ALLERGENS.join(", ")}`);
    const listed = await (await request.get("/api/health/recipes")).json();
    expect(listed.recipes.some((r: { id: string }) => r.id === recipeId), "it is in the My recipes list").toBe(true);

    // saving again answers with the same copy
    const again = await request.post(`/api/health/gousto/${A}/save`);
    expect(again.status()).toBe(200);
    expect(await again.json()).toMatchObject({ recipe_id: recipeId, already: true });
    expect(localSql(`select count(*) from public.recipes where title = '${TITLES[A]}'`)[0][0]).toBe("1");

    // the Gousto page links to the copy; the card is badged
    await page.goto(`/health/recipes/gousto/${A}`);
    await expect(page.getByRole("link", { name: "OPEN SAVED COPY" })).toHaveAttribute("href", `/health/recipes/${recipeId}`);
    await expect(page.getByRole("button", { name: "SAVE TO MY RECIPES" })).toHaveCount(0);
    await page.goto("/health/recipes/gousto");
    await page.getByLabel("Search Gousto recipes").fill(TITLE);
    await expect(card(page, A).getByText("SAVED", { exact: true })).toBeVisible();
    await expect(card(page, B).getByText("SAVED", { exact: true })).toHaveCount(0);

    // deleting the copy leaves the Gousto recipe, unsaved again
    expect((await request.delete(`/api/health/recipes/${recipeId}`)).status()).toBe(200);
    expect((await (await request.get(`/api/health/gousto/${A}`)).json()).recipe.saved_recipe_id).toBeNull();
    await page.goto(`/health/recipes/gousto/${A}`);
    await expect(page.getByRole("button", { name: "SAVE TO MY RECIPES" })).toBeVisible();
    const second = await request.post(`/api/health/gousto/${A}/save`);
    expect(second.status()).toBe(201);
    const secondId = (await second.json()).recipe_id as string;
    savedRecipeIds.push(secondId);
    expect(secondId).not.toBe(recipeId);
  });

  test("My recipes links to the cookbook and back", async ({ page }) => {
    await page.goto("/health/recipes");
    await page.getByRole("link", { name: "GOUSTO COOKBOOK" }).click();
    await expect(page).toHaveURL(/\/health\/recipes\/gousto$/);
    await page.getByRole("link", { name: "MY RECIPES" }).click();
    await expect(page).toHaveURL(/\/health\/recipes$/);
  });
});
