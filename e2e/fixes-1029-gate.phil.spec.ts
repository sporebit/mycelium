/**
 * 2026-10-29 fix (41c5035): `/api/health` is public exactly, not as a
 * prefix. Before it, every `/api/health/*` route (the whole health module)
 * skipped the auth gate: unauthenticated calls reached the handlers and
 * came back 500 from the anon role, and x-api-secret was never honoured.
 *
 * The routes come from the file system, so a health route added later is
 * covered the day it is added. Runs once (as the Phil project) because it
 * signs nobody in.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect as baseExpect, test, type APIRequestContext } from "@playwright/test";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";

// The dev server is shared with four other test runs and compiles routes on first visit:
// a slow answer is not a failure, so waits are longer than the suite default.
const expect = baseExpect.configure({ timeout: 90_000 });
test.describe.configure({ timeout: 600_000 });

const HEALTH_DIR = path.resolve(process.cwd(), "app/api/health");
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

type Route = { url: string; methods: string[]; dynamic: boolean };

function healthRoutes(dir: string, out: Route[] = []): Route[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      healthRoutes(full, out);
    } else if (name === "route.ts") {
      const rel = path.relative(path.resolve(process.cwd(), "app"), dir).split(path.sep).join("/");
      const methods = [...readFileSync(full, "utf8").matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      out.push({ url: "/" + rel.replace(/\[[^\]]+\]/g, PLACEHOLDER_ID), methods, dynamic: rel.includes("[") });
    }
  }
  return out;
}

const ALL = healthRoutes(HEALTH_DIR).sort((a, b) => a.url.localeCompare(b.url));
const SMOKE = ALL.find((r) => r.url === "/api/health");
const MODULE = ALL.filter((r) => r.url !== "/api/health");

let anon: APIRequestContext;
let withSecret: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  const noSession = { cookies: [], origins: [] };
  anon = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: noSession });
  withSecret = await playwright.request.newContext({ baseURL: E2E_ORIGIN, storageState: noSession, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET } });
});

test.afterAll(async () => {
  await anon.dispose();
  await withSecret.dispose();
});

test("the route list was read from the file system", () => {
  expect(SMOKE, "app/api/health/route.ts").toBeTruthy();
  expect(MODULE.length).toBeGreaterThanOrEqual(20);
  for (const r of MODULE) expect(r.methods.length, `${r.url} exports no handler`).toBeGreaterThan(0);
});

test("the deploy smoke check itself stays public", async () => {
  const res = await anon.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});

for (const route of MODULE) {
  for (const method of route.methods) {
    test(`unauthenticated ${method} ${route.url} is stopped at the gate with 401`, async () => {
      const res = await anon.fetch(route.url, { method, data: method === "GET" || method === "DELETE" ? undefined : {} });
      expect(res.status()).toBe(401);
      // The gate's own answer, word for word: the handler never ran, so nothing of the module leaks
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });
  }
}

test("a wrong secret, or a client that claims a principal in a header, is still 401", async () => {
  const wrong = await anon.get("/api/health/recipes", { headers: { "x-api-secret": "not-the-secret" } });
  expect(wrong.status()).toBe(401);
  const claimed = await anon.get("/api/health/recipes", { headers: { "x-principal": "system", "x-principal-user": PLACEHOLDER_ID } });
  expect(claimed.status()).toBe(401);
});

test("with the API secret the health module answers as Phil instead of running as the anon role", async () => {
  // The other half of the fix: before it these came back 500 ("permission denied for table")
  for (const route of MODULE.filter((r) => r.methods.includes("GET") && !r.dynamic)) {
    const res = await withSecret.get(route.url);
    expect([200, 400], `GET ${route.url} answered ${res.status()}`).toContain(res.status());
  }
  const gousto = await withSecret.get("/api/health/gousto?limit=1");
  expect(gousto.status()).toBe(200);
  expect(await gousto.json()).toHaveProperty("total");
});

test("a health page sends a visitor who is not signed in to the login page", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(`${E2E_ORIGIN}/health/recipes/gousto`);
  await expect(page).toHaveURL(/\/login\?next=%2Fhealth%2Frecipes%2Fgousto$/);
  await context.close();
});
