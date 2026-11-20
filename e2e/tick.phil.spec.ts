/**
 * The five-minute tick (MYC-187): one door for everything that must happen
 * during the day. Knocked on with the cron secret, it works out what is
 * due from lib/system/schedule.ts and runs each job; one failing does not
 * stop the others. No browser: these are the calls the PC worker and
 * cron-job.org make.
 */
import { expect, test } from "@playwright/test";
import { dueJobs, SCHEDULE } from "../lib/system/schedule.ts";
import { E2E_CRON_SECRET } from "./support/env.ts";

const cron = { authorization: `Bearer ${E2E_CRON_SECRET}` };
const signedOut = { storageState: { cookies: [], origins: [] } };

test("nobody without the secret can knock", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, ...signedOut });
  expect((await anon.get("/api/cron/tick")).status()).toBe(401);
  expect((await anon.get("/api/cron/daily-prompts")).status()).toBe(401);
  const wrong = await playwright.request.newContext({ baseURL, ...signedOut, extraHTTPHeaders: { authorization: "Bearer not-the-secret" } });
  expect((await wrong.get("/api/cron/tick")).status()).toBe(401);
  await anon.dispose();
  await wrong.dispose();
});

test("a signed-in person cannot knock either: the secret is the only key", async ({ request }) => {
  expect((await request.get("/api/cron/tick")).status()).toBe(401);
});

test("asked what is due, it answers from the schedule for this five-minute slot and runs nothing", async ({ playwright, baseURL }) => {
  const sys = await playwright.request.newContext({ baseURL, ...signedOut, extraHTTPHeaders: cron });
  const res = await sys.get("/api/cron/tick?dry=1");
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { ok: boolean; london_minutes: number; due: string[]; ran?: unknown };
  expect(body.ok).toBe(true);
  expect(body.ran).toBeUndefined();
  expect(body.due).toEqual(dueJobs(body.london_minutes).map((j) => j.path));
  // Reminders are due in every slot, whatever the hour.
  expect(body.due).toContain("/api/cron/reminders");
  for (const path of body.due) expect(SCHEDULE.map((j) => j.path)).toContain(path);
  await sys.dispose();
});

test("a real knock runs every job that is due and none of them fails", async ({ playwright, baseURL }) => {
  const sys = await playwright.request.newContext({ baseURL, ...signedOut, extraHTTPHeaders: cron, timeout: 120_000 });
  const res = await sys.post("/api/cron/tick");
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { ok: boolean; london_minutes: number; ran: Array<{ path: string; status: number; ms: number }> };
  expect(body.ran.map((r) => r.path)).toEqual(dueJobs(body.london_minutes).map((j) => j.path));
  // Exactly 200: "not a server error" once let a refused job (401, a different secret) pass as fine.
  for (const r of body.ran) expect(r.status, `${r.path} answered ${r.status}`).toBe(200);
  expect(body.ok).toBe(true);

  // Knocking twice in the same slot (the PC and cron-job.org together) is harmless.
  const again = await sys.get("/api/cron/tick");
  expect(again.status()).toBe(200);
  expect(((await again.json()) as { ok: boolean }).ok).toBe(true);
  await sys.dispose();
});

test("the daily prompts job goes round every person and reports what it sent", async ({ playwright, baseURL }) => {
  const sys = await playwright.request.newContext({ baseURL, ...signedOut, extraHTTPHeaders: cron });
  const res = await sys.get("/api/cron/daily-prompts");
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { ok: boolean; status: string; time: string; users: number; failed: number };
  expect(body).toMatchObject({ ok: true, status: "ok", failed: 0 });
  expect(body.time).toMatch(/^\d\d:\d\d$/);
  expect(body.users).toBeGreaterThanOrEqual(2);
  await sys.dispose();
});
