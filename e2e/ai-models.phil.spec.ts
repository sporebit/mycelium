/**
 * The live AI model list (MYC-190, Stream H harvest), as Phil, the instance
 * owner. The e2e server has no provider keys, so the daily job runs and
 * reports "no key" for each provider, retiring nothing; the owner reads the
 * list through one route and nobody else does; Settings → AI offers only
 * the priced models and shows what was seen, with first and last seen and
 * a retirement as a fact.
 *
 * Rows seeded here are named E2E-… and removed afterwards.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_CRON_SECRET } from "./support/env.ts";
import { storageStateFor, TESS } from "./support/users.ts";

const cron = { authorization: `Bearer ${E2E_CRON_SECRET}` };
const signedOut = { storageState: { cookies: [], origins: [] } };
const SEEN = "E2E-claude-seen";
const GONE = "E2E-claude-gone";

type Listed = {
  priced: Array<{ id: string; label: string; usdPerMTok: [number, number] }>;
  in_use: Array<{ role: string; model: string }>;
  models: Array<{ provider: string; model_id: string; first_seen: string; last_seen: string; retired_at: string | null }> | null;
};

function seed(): void {
  localSql(`delete from public.ai_models where model_id like 'E2E-%'`);
  localSql(
    `insert into public.ai_models (provider, model_id, display_name, first_seen, last_seen, retired_at) values ` +
      `('anthropic', '${SEEN}', 'E2E seen', now() - interval '10 days', now(), null), ` +
      `('anthropic', '${GONE}', 'E2E gone', now() - interval '30 days', now() - interval '3 days', now() - interval '1 day')`,
  );
}

test.afterAll(() => {
  localSql(`delete from public.ai_models where model_id like 'E2E-%'`);
});

test("the daily job needs the cron secret, and without provider keys it reports so and retires nothing", async ({ playwright, baseURL, request }) => {
  seed();
  const anon = await playwright.request.newContext({ baseURL, ...signedOut });
  expect((await anon.get("/api/cron/ai-models")).status()).toBe(401);
  await anon.dispose();
  expect((await request.get("/api/cron/ai-models")).status()).toBe(401);

  const sys = await playwright.request.newContext({ baseURL, ...signedOut, extraHTTPHeaders: cron });
  const res = await sys.post("/api/cron/ai-models");
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { ok: boolean; providers: Record<string, { ok: boolean; error?: string; retired: string[] }>; nudges: unknown[] };
  expect(body.ok).toBe(true);
  for (const provider of ["anthropic", "openai"]) {
    expect(body.providers[provider]?.ok, provider).toBe(false);
    expect(body.providers[provider]?.error, provider).toBe("no key");
    expect(body.providers[provider]?.retired, provider).toEqual([]);
  }
  expect(body.nudges).toEqual([]);
  // A provider that was not reached leaves every row as it was.
  expect(localSql(`select retired_at is null from public.ai_models where model_id = '${SEEN}'`)[0][0]).toBe("t");
  expect(localSql(`select retired_at is not null from public.ai_models where model_id = '${GONE}'`)[0][0]).toBe("t");
  await sys.dispose();
});

test("the owner reads the list, with first-seen, last-seen and a retirement; nobody else does", async ({ playwright, baseURL, request }) => {
  seed();
  const res = await request.get("/api/ai/models");
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as Listed;
  expect(body.priced.map((m) => m.id)).toContain("claude-sonnet-4-5");
  expect(body.in_use.map((u) => u.role)).toEqual(expect.arrayContaining(["chat", "fast", "vision"]));
  const seen = body.models!.find((m) => m.model_id === SEEN)!;
  const gone = body.models!.find((m) => m.model_id === GONE)!;
  expect(seen.retired_at).toBeNull();
  expect(new Date(seen.first_seen).getTime()).toBeLessThan(new Date(seen.last_seen).getTime());
  expect(gone.retired_at).not.toBeNull();

  const anon = await playwright.request.newContext({ baseURL, ...signedOut });
  expect((await anon.get("/api/ai/models")).status()).toBe(401);
  expect((await anon.post("/api/ai/models")).status()).toBe(401);
  await anon.dispose();

  const tess: APIRequestContext = await playwright.request.newContext({ baseURL, storageState: storageStateFor(TESS) });
  const hers = await tess.get("/api/ai/models");
  expect(hers.status()).toBe(200);
  expect(((await hers.json()) as Listed).models).toBeNull();
  expect((await tess.post("/api/ai/models")).status()).toBe(403);
  await tess.dispose();
});

test("Settings → AI offers only priced models, says what is in use, and lists what was seen with a retirement as a fact", async ({ page, request }) => {
  seed();
  const priced = ((await (await request.get("/api/ai/models")).json()) as Listed).priced;
  await page.goto("/other/settings?tab=ai");
  await expect(page.getByText("AI CONFIG", { exact: true })).toBeVisible();
  await expect(page.getByText("Only models with a price on file can be chosen. Nothing switches on its own.")).toBeVisible();

  // The options come from /api/ai/models; "In use now" appears once it has answered.
  await expect(page.getByTestId("ai-in-use")).toBeVisible();
  const primary = page.getByLabel("Primary model");
  const labels = await primary.locator("option").allTextContents();
  // Every option is a priced model, except a stored choice that is no longer priced, which is marked.
  for (const label of labels) expect(label).toMatch(/per MTok$|\(not priced: choose another\)$/);
  expect(labels.filter((l) => l.endsWith("per MTok"))).toHaveLength(priced.length);

  await expect(page.getByTestId("ai-in-use")).toContainText("chat:");
  const list = page.getByTestId("ai-live-list");
  await expect(list).toContainText(SEEN);
  const gone = list.getByRole("row").filter({ hasText: GONE });
  await expect(gone).toContainText("retired");
  await expect(list.getByRole("row").filter({ hasText: SEEN })).toContainText("seen");
});
