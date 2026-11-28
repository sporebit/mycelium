/**
 * The Field guide (docs/run/2026-11-28/field-guide-design.md §7), as Phil.
 *
 * A guide ticket is made through the API with the repo's example Field
 * guide (docs/guides/example-field-guide.json); an old run-book ticket is
 * made with docs/checklists/rotate-secrets.json to prove the old shape
 * still renders and ticks in the new renderer. Both tickets carry
 * E2E-guide-<run> in their titles and are hard-deleted at the end with
 * their activity rows.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { apiAs, expect, newRunId, patientHook, PHIL, test, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = `E2E-guide-${RUN}`;
const load = (f: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), f), "utf8")) as Record<string, unknown> & { phases: Array<{ id: string; steps: Array<{ id: string }> }> };
const EXAMPLE = load("docs/guides/example-field-guide.json");
const OLD = load("docs/checklists/rotate-secrets.json");
const ALL_STEPS = EXAMPLE.phases.flatMap((p) => p.steps.map((s) => s.id));

let api: APIRequestContext;
let guideKey = "";
let guideId = "";
let oldKey = "";
let oldId = "";

function tomorrowLondon(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function steps(key: string): Promise<{ state: { steps: Record<string, { done: boolean }>; failures?: Record<string, { note: string }>; park?: { step_id: string; note: string } | null; toggles: Record<string, string> } }> {
  const res = await api.get(`/api/tickets/${key}/steps`);
  expect(res.status()).toBe(200);
  return res.json();
}

async function patchSteps(key: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await api.patch(`/api/tickets/${key}/steps`, { data: body });
  return { status: res.status(), json: (await res.json()) as Record<string, unknown> };
}

async function makeTicket(title: string, kind: string, definition: unknown): Promise<{ key: string; id: string }> {
  const res = await api.post("/api/tickets", { data: { title, kind, category: "next" } });
  expect(res.status(), await res.text()).toBe(201);
  const j = (await res.json()) as { key: string; ticket: { id: string } };
  const set = await patchSteps(j.key, { definition });
  expect(set.status, JSON.stringify(set.json)).toBe(200);
  return { key: j.key, id: j.ticket.id };
}

async function openGuide(page: Page) {
  await page.goto(`/guides/${guideKey}`);
  await expect(page.getByTestId("field-guide")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  patientHook();
  await writeBudget(PHIL, 60);
  api = await apiAs(PHIL);
  ({ key: guideKey, id: guideId } = await makeTicket(`${TAG} local stack`, "guide", EXAMPLE));
  ({ key: oldKey, id: oldId } = await makeTicket(`${TAG} rotate secrets`, "runbook", OLD));
});

test.afterAll(async () => {
  const ids = [guideId, oldId].filter(Boolean);
  if (ids.length) {
    const list = ids.map((i) => `'${i}'`).join(",");
    localSql(`delete from public.ticket_activity where ticket_id in (${list})`);
    localSql(`delete from public.tickets where id in (${list})`);
  }
  await api?.dispose();
});

test("a Field guide missing a step's check is refused, and nobody signed out reaches a guide", async ({ playwright, baseURL }) => {
  const broken = JSON.parse(JSON.stringify(EXAMPLE)) as { phases: Array<{ steps: Array<Record<string, unknown>> }> };
  delete broken.phases[0].steps[0].expect_html;
  const res = await patchSteps(guideKey, { definition: broken });
  expect(res.status).toBe(400);
  expect(JSON.stringify(res.json.errors)).toContain("1.1");

  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await anon.get("/api/guides")).status()).toBe(401);
  expect((await anon.get(`/api/tickets/${guideKey}/guide.html`)).status()).toBe(401);
  const page = await anon.get("/guides", { maxRedirects: 0 });
  expect(page.status()).toBe(307);
  expect(page.headers().location).toContain("/login");
  await anon.dispose();
});

test("on the ticket page it renders as a Field guide: the answer, the thread, one open sitting", async ({ page }) => {
  await page.goto(`/work/browse/${guideKey}`);
  const guide = page.getByTestId("field-guide");
  await expect(guide).toBeVisible();
  await expect(guide.getByTestId("guide-answer")).toContainText("three sittings");
  await expect(guide.getByTestId("guide-thread")).toBeVisible();
  await expect(guide.getByTestId("guide-pct")).toHaveText("0%");
  await expect(guide.locator("[data-open=true]")).toHaveCount(1);
  await expect(guide.locator("[data-open=true]")).toHaveAttribute("data-phase", "1");
  await expect(guide.locator('[data-phase="3"]')).toContainText("about 12 min");
  await expect(guide.getByRole("button", { name: "Open anyway" })).toHaveCount(2);
  await expect(guide.getByTestId("expect-1.2")).toContainText("API URL");
  await expect(guide.getByText("Last verified 28 Nov 2026")).toBeVisible();
});

test("ticking a step moves the thread and saves the time", async ({ page }) => {
  await openGuide(page);
  await page.getByTestId("tick-1.1").click();
  await expect(page.getByTestId("guide-pct")).toHaveText("10%");
  await expect.poll(async () => (await steps(guideKey)).state.steps["1.1"]?.done).toBe(true);
});

test("This did not work saves a note on the step, unfolds its troubleshooting, and refuses a secret", async ({ page }) => {
  await openGuide(page);
  const step = page.locator('[data-step="1.2"]');
  await step.getByRole("button", { name: "This did not work" }).click();
  await step.getByRole("textbox", { name: /What happened/ }).fill("sk-ant-api03-abcdefghijklmnopqrstu");
  await step.getByRole("button", { name: "Save note" }).click();
  await expect(step.getByRole("alert")).toContainText("That looks like a secret");
  await step.getByRole("textbox", { name: /What happened/ }).fill("Port 54322 is already allocated");
  await step.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByTestId("failure-1.2")).toContainText("Port 54322 is already allocated");
  await expect(step.locator("details", { hasText: "If it did not work" })).toHaveAttribute("open", "");
  await expect.poll(async () => (await steps(guideKey)).state.failures?.["1.2"]?.note).toBe("Port 54322 is already allocated");
  // The step stays unticked, and the server refuses a secret even from a script.
  expect((await steps(guideKey)).state.steps["1.2"]).toBeUndefined();
  expect((await patchSteps(guideKey, { answers: { result: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" } })).status).toBe(400);
});

test("an irreversible step takes a second tap to tick", async ({ page }) => {
  await openGuide(page);
  await page.locator('[data-phase="3"]').getByRole("button", { name: "Open anyway" }).click();
  const step = page.locator('[data-step="3.3"]');
  await expect(step).toContainText("Cannot be undone");
  await page.getByTestId("tick-3.3").click();
  await expect(step.getByText("Tap again to confirm")).toBeVisible();
  expect((await steps(guideKey)).state.steps["3.3"]).toBeUndefined();
  await page.getByTestId("tick-3.3").click();
  await expect.poll(async () => (await steps(guideKey)).state.steps["3.3"]?.done).toBe(true);
});

test("the resume line says where you were and the page opens at the next step", async ({ page }) => {
  await openGuide(page);
  await expect(page.getByTestId("guide-resume")).toContainText("Where you were: ticked 3.3 at");
  await expect(page.getByTestId("guide-resume")).toContainText("Next: 1.2 Start the Supabase stack.");
  await expect(page.getByTestId("tick-1.2")).toBeFocused();
});

test("Park puts the guide on tomorrow's list, logs it, and Unpark takes it off", async ({ page }) => {
  await openGuide(page);
  await page.keyboard.press("p");
  const form = page.getByTestId("guide-park-form");
  await expect(form).toBeVisible();
  await form.getByRole("textbox").fill("Docker is still starting");
  await form.getByRole("button", { name: "Park" }).click();
  await expect(page.getByTestId("guide-park-banner")).toContainText("Parked at 1.2 today: Docker is still starting. Back on tomorrow's list.");
  await expect.poll(() => localSql(`select scheduled_on::text from public.tickets where id = '${guideId}'`)[0][0]).toBe(tomorrowLondon());
  expect(localSql(`select count(*) from public.ticket_activity where ticket_id = '${guideId}' and action = 'park'`)[0][0]).toBe("1");
  await page.getByRole("button", { name: "Unpark" }).click();
  await expect(page.getByTestId("guide-park-banner")).toHaveCount(0);
  await expect.poll(() => localSql(`select coalesce(scheduled_on::text, 'none') from public.tickets where id = '${guideId}'`)[0][0]).toBe("none");
});

test("the flight plan shows every sitting, its time, needs and the hard part", async ({ page }) => {
  await openGuide(page);
  await page.keyboard.press("f");
  const plan = page.getByTestId("flight-plan");
  await expect(plan).toBeVisible();
  await expect(plan.locator("li")).toHaveCount(3);
  await expect(page.getByTestId("flight-total")).toContainText("3 sittings, about 32 minutes");
  await expect(plan).toContainText("Needs: Docker Desktop");
  await expect(plan).toContainText("The tricky bit:");
  await page.keyboard.press("f");
  await expect(plan).toHaveCount(0);
});

test("for someone else: no step ids, no shell blocks, larger type, the basics on top", async ({ page }) => {
  await openGuide(page);
  const guide = page.getByTestId("field-guide");
  await expect(guide.locator("pre", { hasText: /^supabase start$/ })).toBeVisible();
  await page.getByTestId("guide-mode").click();
  await expect(guide).toHaveAttribute("data-mode", "someone");
  await expect.poll(async () => (await steps(guideKey)).state.toggles.mode).toBe("someone");
  await expect(guide.getByText("The basics")).toBeVisible();
  await expect(guide.locator("pre", { hasText: /^supabase start$/ })).toHaveCount(0);
  await expect(guide.locator('[data-step="1.2"]')).toContainText("Phil runs this part.");
  await expect(guide.locator('[data-step="1.2"]').locator(".fg-mono", { hasText: /^1\.2$/ })).toHaveCount(0);
  await page.getByTestId("guide-mode").click();
  await expect(guide).toHaveAttribute("data-mode", "me");
  await expect.poll(async () => (await steps(guideKey)).state.toggles.mode).toBe("me");
});

test("ticking the last step finishes: the thread completes, every phase fruits, what now works", async ({ page }) => {
  const all = Object.fromEntries(ALL_STEPS.map((id) => [id, true]));
  expect((await patchSteps(guideKey, { steps: all })).status).toBe(200);
  await openGuide(page);
  await expect(page.getByTestId("guide-pct")).toHaveText("100%");
  await expect(page.getByTestId("guide-finish")).toContainText("What now works");
  for (const p of ["1", "2", "3"]) await expect(page.getByTestId(`fruit-${p}`)).toBeVisible();
  await expect(page.getByTestId("guide-finish").getByRole("button", { name: /Copy prompt/ })).toBeVisible();
});

test("the download is an attachment with no script in it", async () => {
  const res = await api.get(`/api/tickets/${guideKey}/guide.html`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toMatch(new RegExp(`attachment; filename="${guideKey}-local-stack-one-spec\\.html"`));
  const body = await res.text();
  expect(body).not.toMatch(/<script/i);
  expect(body).toContain("Start the local stack and run one e2e spec");
  expect(body).toContain("Port 54322 is already allocated");
});

test("an old run-book renders in the Field guide and still ticks", async ({ page }) => {
  await page.goto(`/work/browse/${oldKey}`);
  const guide = page.getByTestId("field-guide");
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("During the run two secrets were exposed once");
  await expect(guide.getByTestId("expect-1.1")).toContainText("No check written for this step");
  await guide.getByTestId("tick-1.1").click();
  await expect.poll(async () => (await steps(oldKey)).state.steps["1.1"]?.done).toBe(true);
});

test("the Guides list shows both, newest first, with the percentage and Open guide", async ({ page }) => {
  await page.goto("/guides");
  // Both were touched last, so both sit in the first seven rows, the old run-book (ticked last) first.
  const rows = page.getByTestId("guide-row");
  await expect(rows.nth(0)).toHaveAttribute("data-key", oldKey);
  await expect(rows.nth(1)).toHaveAttribute("data-key", guideKey);
  await expect(page.locator(`[data-testid="guide-row"][data-key="${guideKey}"]`)).toContainText("100");
  await page.locator(`[data-testid="guide-row"][data-key="${oldKey}"]`).getByRole("link", { name: "Open guide" }).click();
  await expect(page).toHaveURL(new RegExp(`/guides/${oldKey}$`));
  await expect(page.getByTestId("field-guide")).toBeVisible();
});
