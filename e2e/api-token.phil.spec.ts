/**
 * An API token used for real, end to end: minted in Settings, sent as
 * `Authorization: Bearer mtk_…` with no cookie, as the iPhone Shortcuts and
 * the `tix` CLI send it.
 *
 * Until 2026-11-20 nothing did this, and a token could pass the gate and
 * then reach the database as nobody. These checks hold the whole path: the
 * token acts as its owner, only inside its route families, never on the
 * token-management or sensitive routes, and not at all once revoked.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL } from "./support/users.ts";

const RUN = `E2E-token-${Date.now().toString(36)}`;

type Minted = { token: string; record: { id: string } };

let bearer: APIRequestContext | null = null;
const tokenIds: string[] = [];
const captureIds: string[] = [];

async function mint(request: APIRequestContext, routes: string[], verbs = ["read", "write"]): Promise<Minted> {
  const res = await request.post("/api/settings/api-tokens", { data: { name: `${RUN} ${routes.join("+")}`, scopes: { projects: [], verbs, routes } } });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as Minted;
  expect(body.token.startsWith("mtk_")).toBe(true);
  tokenIds.push(body.record.id);
  return body;
}

test.afterAll(async ({ request }) => {
  await bearer?.dispose();
  for (const id of tokenIds) await request.delete(`/api/settings/api-tokens?id=${id}`);
  for (const id of captureIds) await request.delete(`/api/captures/${id}`);
});

test("a Shortcuts token captures as its owner, with no cookie", async ({ request, playwright, baseURL }) => {
  const { token } = await mint(request, ["capture", "daily"]);
  bearer = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { authorization: `Bearer ${token}` } });

  const clientUuid = `${RUN}-1`;
  const res = await bearer.post("/api/capture", { data: { text: `${RUN} buy garden string`, client_uuid: clientUuid, source: "shortcut" } });
  expect(res.status(), await res.text()).toBe(202);
  const body = (await res.json()) as { ok: boolean; status: string; capture_id: string };
  expect(body).toMatchObject({ ok: true, status: "saved" });
  captureIds.push(body.capture_id);

  // It is the owner's capture, in the owner's space: the database knew who was calling.
  const row = localSql(`select created_by::text, client_uuid from public.raw_captures where id = '${body.capture_id}'`)[0];
  expect(row).toEqual([PHIL.id, clientUuid]);

  // The same id again is the same capture, not a second one.
  const again = await bearer.post("/api/capture", { data: { text: `${RUN} buy garden string`, client_uuid: clientUuid, source: "shortcut" } });
  expect(((await again.json()) as { capture_id: string; deduplicated?: boolean })).toMatchObject({ capture_id: body.capture_id, deduplicated: true });

  // It is processed like any capture.
  await expect
    .poll(() => localSql(`select status from public.raw_captures where id = '${body.capture_id}'`)[0]?.[0], { timeout: 20_000 })
    .toBe("processed");
});

test("the same token reads today's one line and prepares the morning", async () => {
  const say = await bearer!.get("/api/daily/say");
  expect(say.status(), await say.text()).toBe(200);
  const body = (await say.json()) as { ok: boolean; status: string; say: string };
  expect(body.ok).toBe(true);
  expect(body.say.length).toBeGreaterThan(3);

  const morning = await bearer!.post("/api/daily/morning");
  expect(morning.status(), await morning.text()).toBe(200);
  expect(((await morning.json()) as { say: string }).say.length).toBeGreaterThan(3);
});

test("it reaches nothing outside its families: not review, tickets, people, settings, or the token page", async () => {
  for (const [method, path] of [
    ["GET", "/api/captures/review"],
    ["GET", "/api/tickets"],
    ["POST", "/api/tickets"],
    ["GET", "/api/people"],
    ["GET", "/api/settings/ui-prefs"],
    ["GET", "/api/settings/api-tokens"],
    ["GET", "/api/account/access-log"],
  ] as const) {
    const res = method === "GET" ? await bearer!.get(path) : await bearer!.post(path, { data: { title: `${RUN} should not exist` } });
    expect(res.status(), `${method} ${path}`).toBe(403);
    expect(((await res.json()) as { reason?: string }).reason, `${method} ${path}`).toBe("token_scope");
  }
  expect(localSql(`select count(*) from public.tickets where title = '${RUN} should not exist'`)[0][0]).toBe("0");
  // Pages are not for tokens either.
  const page = await bearer!.get("/today", { maxRedirects: 0 });
  expect(page.status()).toBe(403);
});

test("a tickets token reads tickets and cannot capture; a read-only one cannot write", async ({ request, playwright, baseURL }) => {
  const tickets = await mint(request, ["tickets"]);
  const t = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { authorization: `Bearer ${tickets.token}` } });
  const list = await t.get("/api/tickets?limit=1");
  expect(list.status(), await list.text()).toBe(200);
  expect((await t.post("/api/capture", { data: { text: "no" } })).status()).toBe(403);
  await t.dispose();

  const readOnly = await mint(request, ["capture", "daily"], ["read"]);
  const r = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { authorization: `Bearer ${readOnly.token}` } });
  expect((await r.get("/api/daily/say")).status()).toBe(200);
  expect((await r.post("/api/capture", { data: { text: `${RUN} read-only must not write` } })).status()).toBe(403);
  await r.dispose();
});

test("a revoked token stops at once, and a made-up one never worked", async ({ request, playwright, baseURL }) => {
  expect((await request.delete(`/api/settings/api-tokens?id=${tokenIds[0]}`)).status()).toBe(200);
  const dead = await bearer!.post("/api/capture", { data: { text: `${RUN} after revoke` } });
  expect(dead.status()).toBe(401);
  expect(((await dead.json()) as { reason?: string }).reason).toBe("bad_token");

  const fake = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { authorization: "Bearer mtk_0000000000000000000000000000000000000000" } });
  expect((await fake.get("/api/daily/say")).status()).toBe(401);
  await fake.dispose();
});
