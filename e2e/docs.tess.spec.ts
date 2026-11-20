/**
 * Docs, as Tess (MYC-174): she sees her own doc spaces and none of Phil's
 * pages, versions, templates or search hits, in the pages or over the
 * API; and her own Docs opens and takes a page.
 *
 * Phil's doc space is made over the API with his session and removed at
 * the end, pages first.
 */
import type { APIRequestContext } from "@playwright/test";
import { apiAs, expect, get, keyFor, newRunId, patientHook, PHIL, send, tag, TESS, test, uuid, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);
const KEY = keyFor(RUN, "L");

type DocPage = { id: string; title: string; version: number; body_text: string };

let phil: APIRequestContext;
let tess: APIRequestContext;
let philSpaceId = "";
let philHome = "";
let philPage: DocPage;
let philTemplate = "";
const tessPages: string[] = [];

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

test.beforeEach(async () => {
  // enough writes in hand for one check
  await writeBudget(TESS, 30);
  await writeBudget(PHIL, 20);
});

test.beforeAll(async () => {
  patientHook();
  await writeBudget(PHIL, 60);
  await writeBudget(TESS, 60);
  phil = await apiAs(PHIL);
  tess = await apiAs(TESS);
  const space = (await send<{ space: { id: string; home_page_id: string } }>(phil, "POST", "/api/work/docs/spaces", { key: KEY, name: `${TAG} phil space` })).space;
  philSpaceId = space.id;
  philHome = space.home_page_id;
  philPage = (await send<{ page: DocPage }>(phil, "POST", "/api/work/docs/pages", { doc_space: KEY, title: `${TAG} phil page`, body: { type: "doc", content: [para(`phil-secret-${RUN} first`)] } })).page;
  await send(phil, "PATCH", `/api/work/docs/pages/${philPage.id}`, { body: { type: "doc", content: [para(`phil-secret-${RUN} first`), para(`phil-secret-${RUN} second`)] } });
  philTemplate = (await send<{ template: { slug: string } }>(phil, "POST", "/api/work/docs/templates", { from_page: philPage.id, name: `${TAG} phil template` })).template.slug;
});

test.afterAll(async () => {
  patientHook();
  for (const id of tessPages) await tess.delete(`/api/work/docs/pages/${id}?hard=1`);
  await phil.delete(`/api/work/docs/templates/${philTemplate}`);
  await phil.patch(`/api/work/docs/spaces/${KEY}`, { data: { home_page_id: null } });
  await phil.delete(`/api/work/docs/pages/${philPage.id}?hard=1`);
  await phil.delete(`/api/work/docs/pages/${philHome}?hard=1`);
  await phil.delete(`/api/work/docs/spaces/${KEY}`);
  await phil.dispose();
  await tess.dispose();
});

test("Docs home lists her doc spaces and not Phil's; search finds none of his text", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  // Phil's own search does find it: the check below would be empty otherwise
  expect(JSON.stringify(await get(phil, `/api/work/docs/pages?q=${encodeURIComponent(`phil-secret-${RUN}`)}`))).toContain(philPage.id);

  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Docs", exact: true })).toBeVisible();
  // more than one when the person belongs to several spaces: each has a doc space called Home
  await expect(page.getByRole("link", { name: /^Home\s*HOME/ }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(TAG);
  const hers = await get<{ spaces: Array<{ id: string }> }>(tess, "/api/work/docs/spaces?all=1");
  expect(hers.spaces.some((s) => s.id === philSpaceId)).toBe(false);

  await page.getByLabel("Search pages").fill(`phil-secret-${RUN}`);
  await expect(page.getByText(`No page mentions “phil-secret-${RUN}”.`)).toBeVisible();
  await w.check();
});

test("Phil's doc space, page and history do not open for her", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto(`/docs/${KEY}`);
  await expect(page.getByRole("alert").filter({ hasText: `No doc space "${KEY}".` })).toBeVisible();
  await page.goto(`/docs/${KEY}/${philPage.id}`);
  await expect(page.getByRole("alert").filter({ hasText: `No doc space "${KEY}".` })).toBeVisible();
  // his page id under her own doc space's address
  await page.goto(`/docs/HOME/${philPage.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "No such page, or it is restricted." })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(`phil-secret-${RUN}`);
  await page.goto(`/docs/HOME/${philPage.id}/history`);
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load the history." })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(TAG);
  await expect(page.locator("body")).not.toContainText(`phil-secret-${RUN}`);

  await page.goto("/docs/templates");
  await expect(page.getByRole("heading", { name: "Page templates" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(TAG);
  await w.check();
});

test("over the API every one of Phil's Docs rows answers as if it were not there, and stays as it was", async () => {
  const refusals: Array<[string, string, string, unknown?]> = [
    ["GET", `/api/work/docs/spaces/${KEY}`, "doc space by key"],
    ["GET", `/api/work/docs/spaces/${philSpaceId}`, "doc space by id"],
    ["PATCH", `/api/work/docs/spaces/${philSpaceId}`, "doc space edit", { name: `${TAG} taken over` }],
    ["DELETE", `/api/work/docs/spaces/${philSpaceId}`, "doc space delete"],
    ["GET", `/api/work/docs/pages/${philPage.id}`, "page"],
    ["PATCH", `/api/work/docs/pages/${philPage.id}`, "page edit", { title: `${TAG} taken over` }],
    ["DELETE", `/api/work/docs/pages/${philPage.id}?hard=1`, "page delete"],
    ["GET", `/api/work/docs/pages/${philPage.id}/versions`, "versions"],
    ["GET", `/api/work/docs/pages/${philPage.id}/versions?version=1`, "one version"],
    ["GET", `/api/work/docs/pages/${philPage.id}/versions?diff=1..2`, "diff"],
    ["POST", `/api/work/docs/pages/${philPage.id}/versions`, "restore", { restore: 1 }],
    ["GET", `/api/work/docs/pages/${philPage.id}/links`, "links"],
    ["GET", `/api/work/docs/pages/${philPage.id}/restrictions`, "restriction"],
    ["PUT", `/api/work/docs/pages/${philPage.id}/restrictions`, "restriction edit", { restricted: true, people: [] }],
    ["POST", "/api/work/docs/pages", "page in his doc space", { doc_space: philSpaceId, title: `${TAG} planted` }],
    ["POST", "/api/work/docs/templates", "template from his page", { from_page: philPage.id, name: `${TAG} lifted` }],
    ["GET", `/api/work/docs/templates/${philTemplate}`, "template"],
    ["DELETE", `/api/work/docs/templates/${philTemplate}`, "template delete"],
  ];
  const wrong: string[] = [];
  for (const [method, path, what, data] of refusals) {
    const res = await tess.fetch(path, { method, data });
    if (res.status() !== 404) wrong.push(`${what}: ${method} ${path} answered ${res.status()} ${(await res.text()).slice(0, 120)}`);
  }
  expect(wrong, "requests that should have answered 404").toEqual([]);

  // her own page cannot be hung under his, and his cannot be pulled under hers
  const own = (await send<{ page: DocPage }>(tess, "POST", "/api/work/docs/pages", { doc_space: "HOME", title: `${TAG} tess probe` })).page;
  tessPages.push(own.id);
  const under = await tess.patch(`/api/work/docs/pages/${own.id}`, { data: { parent_id: philPage.id } });
  expect(under.ok()).toBe(false);
  expect(under.status()).toBeLessThan(500);
  // searches and lists never return his rows
  for (const path of [`/api/work/docs/pages?q=${encodeURIComponent(`phil-secret-${RUN}`)}`, `/api/work/docs/pages?q=${encodeURIComponent(TAG)}&archived=1`, "/api/work/docs/templates", "/api/work/docs/spaces?all=1"]) {
    const body = JSON.stringify(await get(tess, path));
    expect(body, path).not.toContain(philPage.id);
    expect(body, path).not.toContain(`${TAG} phil`);
  }

  // Phil's page is exactly as he left it
  const after = (await get<{ page: DocPage }>(phil, `/api/work/docs/pages/${philPage.id}`)).page;
  expect(after.title).toBe(`${TAG} phil page`);
  expect(after.version).toBe(2);
  expect(after.body_text).toContain(`phil-secret-${RUN} second`);
});

test("her own Docs works: a page is made, edited and versioned in her Home doc space, and Phil cannot read it", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/docs/HOME");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Home");
  await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: "Top-level page" }).click();
  const dialog = page.getByRole("dialog", { name: "New page" });
  await dialog.getByLabel("Title").fill(`${TAG} tess page`);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/HOME\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  tessPages.push(id);
  const article = page.locator("article");
  await expect(article.getByRole("heading", { level: 2 }).first()).toHaveText(`${TAG} tess page`);
  await article.getByRole("button", { name: "Edit", exact: true }).click();
  await article.getByRole("textbox", { name: "Text" }).click();
  await page.keyboard.type(`tess-own-${RUN}`);
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${id}`) && r.request().method() === "PATCH");
  await article.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(article.locator(".work-doc-static")).toContainText(`tess-own-${RUN}`);
  await expect(article.getByRole("link", { name: "v2" })).toBeVisible();
  await expect(article).toContainText("by Tess");

  // a space of one: nobody to share with
  await page.getByRole("button", { name: "Page menu" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Who can see this…" }).click();
  await expect(page.getByRole("dialog", { name: "Who can see this page" }).getByText("You are the only member of this space.")).toBeVisible();

  expect((await phil.get(`/api/work/docs/pages/${id}`)).status()).toBe(404);
  expect(JSON.stringify(await get(phil, `/api/work/docs/pages?q=${encodeURIComponent(`tess-own-${RUN}`)}`))).not.toContain(id);
  // an address made of his doc space and her page does not open it either
  expect((await phil.get(`/api/work/docs/pages/${id}/versions`)).status()).toBe(404);
  await w.check();
});

test("a page id that does not exist answers 404, not an error", async () => {
  for (const path of [`/api/work/docs/pages/${uuid()}`, `/api/work/docs/pages/${uuid()}/versions`, "/api/work/docs/pages/not-a-uuid", "/api/work/docs/spaces/ZZQQX"]) {
    expect((await tess.get(path)).status(), path).toBe(404);
  }
});
