/**
 * Bulk reference data out of the hosted database (master run §9): three
 * recipes, one cold, one a favourite, one opened this week. The Sunday
 * sweep hands only the cold one to the PC; the hosted detail is cleared
 * only once the PC says it holds it; a recipe whose detail is on the PC
 * still shows its listing, says where the rest is, and asks the PC for it
 * when the PC is on; the PC's answer puts the detail back. A worker stands
 * in for the PC's store.
 */
import { type APIRequestContext, expect, test } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_CRON_SECRET } from "./support/env.ts";
import { PHIL, personalSpace } from "./support/users.ts";

const RUN = `e2eref${Date.now().toString(36)}`;
const WORKER = `e2e-store-${RUN}`;
const bearer = { authorization: `Bearer ${E2E_CRON_SECRET}` };
const COLD = `${RUN}-cold`;
const FAV = `${RUN}-fav`;
const OPENED = `${RUN}-opened`;
const DETAIL = JSON.stringify({ description: "A test recipe.", cuisine: "British", categories: ["Quick"], ingredients: [{ label: "Eggs", image: null }], basics: ["Salt"], steps: [{ order: 1, html: "<p>Boil.</p>", text: "Boil.", image: null }], allergens: [], nutrition: { per_portion: null, per_100g: null }, portions: [2], canonical: null });

const pcOn = (request: APIRequestContext) => request.post("/api/worker/claim", { headers: bearer, data: { worker: WORKER, kinds: ["ping"] } });
const pcOff = () => localSql(`update public.workers set last_seen_at = now() - interval '1 hour' where lane = 'pc'`);
const row = (slug: string) => localSql(`select (detail is not null)::text, (detail_offloaded_at is not null)::text from public.gousto_recipes where slug = '${slug}'`)[0];

test.beforeAll(() => {
  const space = personalSpace(PHIL);
  const insert = (slug: string, extra: string) =>
    localSql(
      `insert into public.gousto_recipes (gousto_uid, slug, title, url, detail, detail_fetched_at, space_id, created_by ${extra ? "," + extra.split("=")[0] : ""})
       values ('${slug}', '${slug}', 'Test ${slug}', 'https://www.gousto.co.uk/cookbook/recipes/${slug}', '${DETAIL}'::jsonb, now() - interval '10 days', '${space}', '${PHIL.id}' ${extra ? "," + extra.split("=")[1] : ""})`,
    );
  insert(COLD, "");
  insert(FAV, "is_favourite=true");
  insert(OPENED, "detail_opened_at=now()");
});

test.afterAll(() => {
  localSql(`delete from public.jobs where (kind = 'reference_offload' and space_id = '${personalSpace(PHIL)}') or (kind = 'reference_get' and payload->>'slug' like '${RUN}-%')`);
  localSql(`delete from public.gousto_recipes where slug like '${RUN}-%'`);
  localSql(`delete from public.workers where name = '${WORKER}'`);
});

test("the sweep is queued on request and refuses a caller without the key", async ({ request }) => {
  expect((await request.post("/api/cron/reference?force=1")).status()).toBe(401);
  // Another suite may have left a sweep waiting: start clean so the dedupe key is ours to test.
  localSql(`delete from public.jobs where kind = 'reference_offload' and status in ('queued', 'claimed')`);
  const res = await request.post("/api/cron/reference?force=1", { headers: bearer });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { queued: number; already: number };
  expect(body.queued).toBeGreaterThanOrEqual(1);
  const again = (await (await request.post("/api/cron/reference?force=1", { headers: bearer })).json()) as { queued: number; already: number };
  expect(again.queued).toBe(0);
  expect(again.already).toBeGreaterThanOrEqual(1);
});

test("the worker is handed the cold detail only; the hosted copy is cleared once the PC holds it", async ({ request }) => {
  await pcOn(request);
  const claim = await request.post("/api/worker/claim", { headers: bearer, data: { worker: WORKER, kinds: ["reference_offload"], limit: 10 } });
  const { jobs } = (await claim.json()) as { jobs: Array<{ id: string; payload: { table: string; rows: Array<{ slug: string; detail: unknown; fetched_at: string | null }>; more: boolean } }> };
  const job = jobs.find((j) => j.payload.rows?.some((r) => r.slug === COLD));
  expect(job, "Phil's sweep, with the cold recipe in its batch").toBeTruthy();
  const slugs = job!.payload.rows.map((r) => r.slug);
  expect(slugs).toContain(COLD);
  expect(slugs).not.toContain(FAV);
  expect(slugs).not.toContain(OPENED);
  const cold = job!.payload.rows.find((r) => r.slug === COLD)!;
  expect((cold.detail as { steps: unknown[] }).steps).toHaveLength(1);

  // The PC says it holds the cold one and (wrongly) the favourite too: only the cold one is cleared.
  const done = await request.post("/api/worker/finish", { headers: bearer, data: { id: job!.id, worker: WORKER, ok: true, result: { table: "gousto_recipes", held: [COLD, FAV], more: false } } });
  expect((await done.json()).status).toBe("done");
  expect(row(COLD)).toEqual(["false", "true"]);
  expect(row(FAV)).toEqual(["true", "false"]);
  expect(row(OPENED)).toEqual(["true", "false"]);
});

test("a recipe whose detail is on the PC keeps its listing, says so, and gets its detail back when the PC answers", async ({ request }) => {
  localSql(`update public.gousto_recipes set detail = null, detail_offloaded_at = now() where slug = '${COLD}'`);

  // PC off: the listing, a plain word about where the rest is, nothing queued.
  pcOff();
  let res = await request.get(`/api/health/gousto/${COLD}`);
  let body = (await res.json()) as { recipe: { title: string; detail: unknown }; held: string; pending: boolean; needs_detail: boolean };
  expect(body.recipe.title).toBe(`Test ${COLD}`);
  expect(body.recipe.detail).toBeNull();
  expect(body).toMatchObject({ held: "pc", pending: false, needs_detail: true });
  expect(localSql(`select count(*) from public.jobs where kind = 'reference_get' and payload->>'slug' = '${COLD}'`)[0][0]).toBe("0");

  // PC on: asked once, however many times the page asks.
  await pcOn(request);
  res = await request.get(`/api/health/gousto/${COLD}`);
  body = await res.json();
  expect(body).toMatchObject({ held: "pc", pending: true });
  await request.get(`/api/health/gousto/${COLD}`);
  expect(localSql(`select count(*) from public.jobs where kind = 'reference_get' and payload->>'slug' = '${COLD}' and status in ('queued', 'claimed')`)[0][0]).toBe("1");

  // The PC answers; the detail is on the row again and stays (opened today).
  const claim = await request.post("/api/worker/claim", { headers: bearer, data: { worker: WORKER, kinds: ["reference_get"], limit: 10 } });
  const { jobs } = (await claim.json()) as { jobs: Array<{ id: string; payload: { slug: string } }> };
  const job = jobs.find((j) => j.payload.slug === COLD);
  expect(job).toBeTruthy();
  const done = await request.post("/api/worker/finish", { headers: bearer, data: { id: job!.id, worker: WORKER, ok: true, result: { table: "gousto_recipes", slug: COLD, detail: JSON.parse(DETAIL) } } });
  expect((await done.json()).status).toBe("done");
  res = await request.get(`/api/health/gousto/${COLD}`);
  body = await res.json();
  expect(body.held).toBe("hosted");
  expect((body.recipe.detail as { ingredients: Array<{ label: string }> }).ingredients[0].label).toBe("Eggs");
  expect(localSql(`select (detail_offloaded_at is null)::text, (detail_opened_at > now() - interval '1 minute')::text from public.gousto_recipes where slug = '${COLD}'`)[0]).toEqual(["true", "true"]);
});

test("the page says where the detail is", async ({ page }) => {
  localSql(`update public.gousto_recipes set detail = null, detail_offloaded_at = now() where slug = '${COLD}'`);
  pcOff();
  await page.goto(`/health/recipes/gousto/${COLD}`);
  await expect(page.getByTestId("detail-on-pc")).toContainText("kept on the PC");
  await expect(page.getByRole("heading", { name: `Test ${COLD}` })).toBeVisible();
});
