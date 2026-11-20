/**
 * /work/workflows and the project settings' workflow map, as Phil
 * (MYC-174). A workflow is made, its statuses edited, mapped to a project
 * made for this run, and removed again. The space default is never
 * changed: other checks run against it at the same time.
 */
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { apiAs, expect, get, keyFor, newRunId, patientHook, PHIL, send, tag, test, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);
const KEY = keyFor(RUN, "J");
const FLOW = `${TAG} flow`;

type Status = { id: string; name: string; category: string; sort_order: number };
type Workflow = { id: string; name: string; is_default: boolean; archived_at: string | null; statuses: Status[] };
type Ticket = { id: string; key: string; title: string; status: { id: string; name: string } };

let api: APIRequestContext;
let projectId = "";
let ticket: Ticket;

const workflows = async () => (await get<{ workflows: Workflow[] }>(api, "/api/work/workflows")).workflows;
const flow = async () => (await workflows()).find((w) => w.name === FLOW) ?? null;
const exactly = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
const section = (page: Page, heading: RegExp): Locator => page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
const column = (page: Page, name: string): Locator => page.locator("section").filter({ has: page.locator("header > span:first-child", { hasText: exactly(name) }) });

/** The card of the workflow with this name (its name is an input, so it is found by value). */
async function card(page: Page, name: string): Promise<Locator> {
  const cards = page.locator("section").filter({ has: page.getByLabel("Workflow name") });
  await expect(cards.first()).toBeVisible();
  await expect.poll(async () => cards.getByLabel("Workflow name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toContain(name);
  const names = await cards.getByLabel("Workflow name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  return cards.nth(names.indexOf(name));
}
const statusNames = (c: Locator) => c.getByLabel("Status name", { exact: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
async function statusRow(c: Locator, name: string): Promise<Locator> {
  await expect.poll(() => statusNames(c)).toContain(name);
  const names = await statusNames(c);
  return c.locator("ul > li").nth(names.indexOf(name));
}

test.beforeEach(async () => {
  // enough writes in hand for one check
  await writeBudget(PHIL, 40);
});

test.beforeAll(async () => {
  patientHook();
  await writeBudget(PHIL, 100);
  api = await apiAs(PHIL);
  const p = await send<{ project: { id: string } }>(api, "POST", "/api/work/projects", { name: `${TAG} flows`, key: KEY });
  projectId = p.project.id;
  ticket = (await send<{ ticket: Ticket }>(api, "POST", "/api/work/tickets", { title: `${TAG} card`, project: KEY })).ticket;
});

test.afterAll(async () => {
  patientHook();
  const meta = await get<{ workflow_map: Array<{ project_id: string | null; issue_type_id: string | null }> }>(api, "/api/work/meta");
  for (const m of meta.workflow_map) {
    if (m.project_id === projectId) await api.put("/api/work/workflows/map", { data: { project_id: projectId, issue_type_id: m.issue_type_id, workflow_id: null } });
  }
  await api.delete(`/api/work/tickets/${ticket.id}?hard=1`);
  for (const w of await workflows()) if (w.name.startsWith(TAG)) await api.delete(`/api/work/workflows/${w.id}`);
  await api.delete(`/api/work/projects/${KEY}`);
  await api.dispose();
});

test("the space default is shown as such and cannot be archived or deleted", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/work/workflows");
  await expect(page.getByRole("heading", { name: "Workflows", exact: true })).toBeVisible();
  const def = (await workflows()).find((x) => x.is_default)!;
  const c = await card(page, def.name);
  await expect(c).toContainText("Space default");
  await expect(c.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  expect(await statusNames(c)).toEqual(def.statuses.map((s) => s.name));
  // the route refuses too
  const res = await api.delete(`/api/work/workflows/${def.id}`);
  expect(res.status()).toBe(409);
  await expect(page.getByText("Every workflow needs at least one status in each of the three categories.")).toBeVisible();
  await w.check();
});

test("a workflow is made and its statuses added, renamed, re-categorised and reordered", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/work/workflows");
  await page.getByRole("button", { name: "New workflow" }).click();
  const dialog = page.getByRole("dialog", { name: "New workflow" });
  await expect(dialog.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
  await dialog.getByLabel("Name").fill(FLOW);
  await dialog.getByLabel("Description").fill("Made by the end-to-end check.");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  const c = await card(page, FLOW);
  expect(await statusNames(c)).toEqual(["To Do", "In Progress", "Done"]);
  await expect(c).toContainText("Not mapped to any project or type.");

  // the same name again is refused, in the dialog
  await page.getByRole("button", { name: "New workflow" }).click();
  await dialog.getByLabel("Name").fill(FLOW);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(`There is already a workflow called "${FLOW}".`);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // add
  await c.getByLabel("New status name").fill("Blocked");
  await c.getByLabel("New status name").press("Enter");
  await expect.poll(() => statusNames(c)).toEqual(["To Do", "In Progress", "Done", "Blocked"]);

  // rename
  let row = await statusRow(c, "Blocked");
  await row.getByLabel("Status name", { exact: true }).fill("Stuck");
  await row.getByLabel("Status name", { exact: true }).press("Enter");
  await expect.poll(async () => (await flow())?.statuses.map((s) => s.name)).toEqual(["To Do", "In Progress", "Done", "Stuck"]);

  // re-categorise: To Do → In Progress
  row = await statusRow(c, "Stuck");
  await row.getByRole("button", { name: "To Do" }).click();
  await page.getByRole("listbox", { name: "Category" }).getByRole("option", { name: "In Progress" }).click();
  await expect.poll(async () => (await flow())?.statuses.find((s) => s.name === "Stuck")?.category).toBe("in_progress");

  // reorder: up one place, past Done
  row = await statusRow(c, "Stuck");
  await row.getByRole("button", { name: "Move up" }).click();
  await expect.poll(() => statusNames(c)).toEqual(["To Do", "In Progress", "Stuck", "Done"]);
  expect((await flow())?.statuses.map((s) => s.name)).toEqual(["To Do", "In Progress", "Stuck", "Done"]);

  // the last Done status cannot go: every workflow keeps one in each category
  row = await statusRow(c, "Done");
  await row.getByRole("button", { name: "Delete Done" }).click();
  await expect(c.getByRole("alert")).not.toBeEmpty();
  expect((await flow())?.statuses.map((s) => s.name)).toContain("Done");
  await w.check();
});

test("mapped to a project, its statuses become the board's columns and its tickets move over", async ({ page }, testInfo) => {
  const f = await flow();
  test.skip(!f, "the workflow was not created");
  const w = watch(page, testInfo);
  await page.goto(`/work/projects/${KEY}/settings`);
  const wf = section(page, /^Workflows/);
  await expect(wf.getByRole("link", { name: "Edit the workflows and their statuses →" })).toHaveAttribute("href", "/work/workflows");
  const whole = wf.locator("div.grid").filter({ hasText: "Whole project" });
  const put = page.waitForResponse((r) => r.url().endsWith("/api/work/workflows/map") && r.request().method() === "PUT");
  await whole.getByRole("button", { name: "Space default" }).click();
  await page.getByRole("listbox", { name: "Workflow", exact: true }).getByRole("option", { name: FLOW }).click();
  expect((await put).status()).toBe(200);
  await expect(whole).toContainText("Stuck");

  // the ticket that sat in Inbox now sits in this workflow's To Do status
  await expect.poll(async () => (await get<{ ticket: Ticket }>(api, `/api/work/tickets/${ticket.key}`)).ticket.status.name).toBe("To Do");
  await page.goto(`/work/projects/${KEY}/board`);
  for (const name of ["To Do", "In Progress", "Stuck", "Done"]) await expect(column(page, name)).toBeVisible();
  await expect(column(page, "Inbox")).toHaveCount(0);
  await expect(column(page, "To Do").locator(`[data-key="${ticket.key}"]`)).toBeVisible();

  // the issue page offers this workflow's statuses, and only these
  await page.goto(`/work/browse/${ticket.key}`);
  await page.getByRole("button", { name: /^Status:/ }).click();
  const options = page.getByRole("listbox", { name: "Status" }).getByRole("option");
  await expect(options).toHaveCount(4);
  await options.filter({ hasText: "Stuck" }).click();
  await expect(page.getByRole("button", { name: /^Status:/ })).toContainText("Stuck");

  // /work/workflows says who uses it
  await page.goto("/work/workflows");
  const c = await card(page, FLOW);
  await expect(c).toContainText(`Used by ${TAG} flows.`);
  await w.check();
});

test("a status with a ticket in it asks where the ticket goes; a workflow in use is not deleted", async ({ page }, testInfo) => {
  const f = await flow();
  test.skip(!f, "the workflow was not created");
  const w = watch(page, testInfo);
  const stuck = f!.statuses.find((s) => s.name === "Stuck");
  test.skip(!stuck, "the Stuck status was not created");
  await send(api, "PUT", "/api/work/workflows/map", { project_id: projectId, issue_type_id: null, workflow_id: f!.id });
  await send(api, "PATCH", `/api/work/tickets/${ticket.key}`, { status_id: stuck!.id });

  await page.goto("/work/workflows");
  const c = await card(page, FLOW);
  const row = await statusRow(c, "Stuck");
  await row.getByRole("button", { name: "Delete Stuck" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Stuck" });
  await expect(dialog).toContainText("One ticket is in Stuck. Where should it go?");
  await expect(dialog.getByRole("button", { name: "Move and delete" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Pick a status" }).click();
  await dialog.getByRole("listbox", { name: "Move to" }).getByRole("option", { name: /^In Progress/ }).click();
  await dialog.getByRole("button", { name: "Move and delete" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => statusNames(c)).toEqual(["To Do", "In Progress", "Done"]);
  expect((await get<{ ticket: Ticket }>(api, `/api/work/tickets/${ticket.key}`)).ticket.status.name).toBe("In Progress");

  // deleting the workflow while the ticket uses it is refused, in words
  await c.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${FLOW}?` });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(c.getByRole("alert")).toContainText("uses this workflow");
  expect(await flow()).not.toBeNull();
  await w.check();
});

test("a type can override the project's workflow, and clearing the map hands tickets back to the default", async ({ page }, testInfo) => {
  const f = await flow();
  test.skip(!f, "the workflow was not created");
  const w = watch(page, testInfo);
  await send(api, "PUT", "/api/work/workflows/map", { project_id: projectId, issue_type_id: null, workflow_id: f!.id });
  await page.goto(`/work/projects/${KEY}/settings`);
  const wf = section(page, /^Workflows/);

  // Bug → the space default, while the project as a whole stays on the run's workflow
  const def = (await workflows()).find((x) => x.is_default)!;
  const bug = wf.locator("div.grid").filter({ has: page.locator("span", { hasText: exactly("Bug") }) });
  let put = page.waitForResponse((r) => r.url().endsWith("/api/work/workflows/map") && r.request().method() === "PUT");
  await bug.getByRole("button", { name: "Inherit" }).click();
  await page.getByRole("listbox", { name: "Bug workflow" }).getByRole("option", { name: new RegExp(`^${def.name}`) }).click();
  expect((await put).status()).toBe(200);
  await expect(bug).toContainText("Inbox");
  const made = await send<{ ticket: Ticket }>(api, "POST", "/api/work/tickets", { title: `${TAG} bug`, project: KEY, type: "bug" });
  expect(made.ticket.status.name).toBe("Inbox");
  await api.delete(`/api/work/tickets/${made.ticket.id}?hard=1`);
  put = page.waitForResponse((r) => r.url().endsWith("/api/work/workflows/map") && r.request().method() === "PUT");
  await bug.getByRole("button").first().click();
  await page.getByRole("listbox", { name: "Bug workflow" }).getByRole("button", { name: "Clear" }).click();
  expect((await put).status()).toBe(200);

  // clear the project's own choice
  const whole = wf.locator("div.grid").filter({ hasText: "Whole project" });
  put = page.waitForResponse((r) => r.url().endsWith("/api/work/workflows/map") && r.request().method() === "PUT");
  await whole.getByRole("button").first().click();
  await page.getByRole("listbox", { name: "Workflow", exact: true }).getByRole("button", { name: "Clear" }).click();
  expect((await put).status()).toBe(200);
  await expect(whole.getByRole("button").first()).toContainText("Space default");
  // the ticket is back on a status of the default workflow
  const names = def.statuses.map((s) => s.name);
  await expect.poll(async () => names.includes((await get<{ ticket: Ticket }>(api, `/api/work/tickets/${ticket.key}`)).ticket.status.name)).toBe(true);
  await w.check();
});

test("an unused workflow is archived, restored and deleted", async ({ page }, testInfo) => {
  const f = await flow();
  test.skip(!f, "the workflow was not created");
  const w = watch(page, testInfo);
  await api.put("/api/work/workflows/map", { data: { project_id: projectId, issue_type_id: null, workflow_id: null } });
  await page.goto("/work/workflows");
  let c = await card(page, FLOW);
  await c.getByRole("button", { name: "Archive" }).click();
  await expect.poll(async () => (await flow())?.archived_at ?? null).not.toBeNull();
  await expect.poll(async () => page.getByLabel("Workflow name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).not.toContain(FLOW);

  await page.getByLabel(/^Show archived/).check();
  c = await card(page, FLOW);
  await expect(c).toContainText("Archived");
  // an archived workflow takes no new status
  await expect(c.getByLabel("New status name")).toHaveCount(0);
  await c.getByRole("button", { name: "Restore" }).click();
  await expect.poll(async () => (await flow())?.archived_at ?? "live").toBe("live");

  c = await card(page, FLOW);
  await c.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${FLOW}?` });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(async () => await flow()).toBeNull();
  await expect.poll(async () => page.getByLabel("Workflow name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).not.toContain(FLOW);
  await w.check();
});
