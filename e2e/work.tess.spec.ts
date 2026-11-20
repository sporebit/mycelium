/**
 * Work, as Tess (MYC-174): a second user with her own space sees none of
 * Phil's projects, issues, saved filters, workflows or notifications, in
 * the pages or over the API, and her own Work opens and works.
 *
 * Phil's side is made over the API with his own session before the checks
 * and removed afterwards (the project is archived; the app has no delete).
 */
import type { APIRequestContext, Page } from "@playwright/test";
import { apiAs, dropSeededNotifications, E2E_ORIGIN, expect, get, keyFor, newRunId, patientHook, PHIL, seedNotification, send, tag, TESS, test, uuid, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);
const KEY = keyFor(RUN, "K");

type Ticket = { id: string; key: string; title: string };
type Home = { assigned: Ticket[]; in_progress: Ticket[]; due_soon: Ticket[]; recent: Ticket[]; mentions: unknown[] };
type Inbox = { notifications: Array<{ id: string; title: string; read_at: string | null }>; unread: number };

let phil: APIRequestContext;
let tess: APIRequestContext;
let project: { id: string; key: string };
let ticket: Ticket;
let commentId = "";
let sharedFilter: { id: string; slug: string };
let privateFilter: { id: string; slug: string };
let workflow: { id: string; statuses: Array<{ id: string }> };
let sprintId = "";
const notificationId = uuid();
const tessTickets: string[] = [];

/** Nothing on the page names anything of this run's Phil data. */
async function noneOfPhils(page: Page) {
  await expect(page.locator("body")).not.toContainText(`${TAG} phil`);
}

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
  project = (await send<{ project: { id: string; key: string } }>(phil, "POST", "/api/work/projects", { name: `${TAG} phil project`, key: KEY })).project;
  ticket = (await send<{ ticket: Ticket }>(phil, "POST", "/api/work/tickets", { title: `${TAG} phil ticket`, project: KEY, assignee_id: PHIL.id, due: new Date().toISOString().slice(0, 10) })).ticket;
  const c = await send<{ comment?: { id: string }; id?: string }>(phil, "POST", `/api/work/tickets/${ticket.key}/comments`, { body: `${TAG} phil comment` });
  commentId = c.comment?.id ?? c.id ?? "";
  sharedFilter = (await send<{ filter: { id: string; slug: string } }>(phil, "POST", "/api/work/filters", { name: `${TAG} phil shared filter`, jql: `project = ${KEY}`, shared: true })).filter;
  privateFilter = (await send<{ filter: { id: string; slug: string } }>(phil, "POST", "/api/work/filters", { name: `${TAG} phil private filter`, jql: `project = ${KEY}`, shared: false })).filter;
  workflow = (await send<{ workflow: { id: string; statuses: Array<{ id: string }> } }>(phil, "POST", "/api/work/workflows", { name: `${TAG} phil flow` })).workflow;
  const day = new Date().toISOString().slice(0, 10);
  sprintId = (await send<{ sprint: { id: string } }>(phil, "POST", "/api/work/sprints", { project_id: project.id, name: `${TAG} phil sprint`, starts_on: day, ends_on: day })).sprint.id;
  seedNotification(PHIL, { id: notificationId, event: "mention", title: `${TAG} phil notification`, url: `${E2E_ORIGIN}/work/browse/${ticket.key}`, ticketId: ticket.id });
});

test.afterAll(async () => {
  patientHook();
  dropSeededNotifications(RUN);
  for (const id of tessTickets) await tess.delete(`/api/work/tickets/${id}?hard=1`);
  const mine = await get<{ tickets: Ticket[] }>(tess, `/api/work/tickets?jql=${encodeURIComponent(`text ~ "${TAG}"`)}&limit=100`);
  for (const t of mine.tickets) await tess.delete(`/api/work/tickets/${t.id}?hard=1`);
  await phil.delete(`/api/work/tickets/${ticket.id}?hard=1`);
  await phil.delete(`/api/work/filters/${sharedFilter.id}`);
  await phil.delete(`/api/work/filters/${privateFilter.id}`);
  await phil.delete(`/api/work/workflows/${workflow.id}`);
  await phil.delete(`/api/work/sprints/${sprintId}`);
  await phil.delete(`/api/work/projects/${KEY}`);
  await phil.dispose();
  await tess.dispose();
});

test("Your work is her own: none of Phil's work, and the empty states where she has nothing", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  // Phil does see what was made for him: the check below would be empty otherwise
  const philHome = await get<Home>(phil, "/api/work/home");
  expect(philHome.assigned.some((t) => t.id === ticket.id)).toBe(true);

  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Mentions/ })).toBeVisible();
  await noneOfPhils(page);
  const home = await get<Home>(tess, "/api/work/home");
  expect(JSON.stringify(home)).not.toContain(TAG);
  // each list either shows her rows or says it is empty, as her own data has it
  if (home.assigned.length === 0) await expect(page.getByText("Nothing is assigned to you.")).toBeVisible();
  if (home.in_progress.length === 0) await expect(page.getByText("Nothing is under way.")).toBeVisible();
  if (home.due_soon.length === 0) await expect(page.getByText("Nothing is due soon.")).toBeVisible();
  if (home.mentions.length === 0) await expect(page.getByText("Nobody has mentioned you yet.")).toBeVisible();
  if (home.recent.length === 0) await expect(page.getByText("Open an issue and it will be listed here.")).toBeVisible();
  if (home.assigned.length + home.in_progress.length + home.due_soon.length === 0) {
    await expect(page.getByText("A clear desk")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a ticket" })).toBeVisible();
  } else {
    testInfo.annotations.push({ type: "note", description: "Tess had work of her own on this stack, so the clear-desk state was not shown" });
  }
  await w.check();
});

test("the issue navigator finds none of Phil's issues and offers none of his saved filters", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto(`/work/issues?jql=${encodeURIComponent(`text ~ "${TAG} phil"`)}`);
  await expect(page.getByText("No issues match")).toBeVisible();
  await expect(page.getByText("0 issues", { exact: true })).toBeVisible();

  // his project's key is not a project of hers
  await page.goto(`/work/issues?jql=${encodeURIComponent(`project = ${KEY}`)}`);
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await noneOfPhils(page);
  await expect(page.getByRole("link", { name: ticket.key })).toHaveCount(0);

  // the picker has the built-in filters and neither of his, shared or private
  await page.goto("/work/issues?jql=");
  await page.getByRole("button", { name: /^Filter:/ }).click();
  const list = page.getByRole("listbox", { name: "Filter" });
  await expect(list.getByRole("option", { name: /^Inbox/ })).toBeVisible();
  await expect(list.getByRole("option", { name: new RegExp(TAG) })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // a link to his filter does not load his query
  await page.goto(`/work/issues?filter=${sharedFilter.slug}`);
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await noneOfPhils(page);
  await page.getByRole("button", { name: "JQL" }).click();
  await expect(page.getByLabel("JQL")).not.toHaveValue(new RegExp(KEY));
  await w.check();
});

test("Phil's issue, project, board, backlog and settings do not open for her", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  for (const ref of [ticket.key, ticket.id]) {
    await page.goto(`/work/browse/${ref}`);
    await expect(page.getByRole("alert").filter({ hasText: `No issue "${ref}" in your spaces.` })).toBeVisible();
    await noneOfPhils(page);
  }
  for (const path of ["", "/board", "/backlog", "/settings"]) {
    await page.goto(`/work/projects/${KEY}${path}`);
    await expect(page.getByRole("alert").filter({ hasText: `No project "${KEY}".` })).toBeVisible();
    await noneOfPhils(page);
  }
  await page.goto(`/work/projects/${project.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "No project" })).toBeVisible();
  // the old URL for a ticket lands on the same refusal
  await page.goto(`/organisation/tickets/${ticket.key}`);
  await expect(page.getByRole("alert").filter({ hasText: `No issue "${ticket.key}" in your spaces.` })).toBeVisible();
  await w.check();
});

test("Projects and Workflows list her own, not his", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/work/projects");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /General/ })).toBeVisible();
  await noneOfPhils(page);
  const hers = await get<{ projects: Array<{ id: string; name: string }> }>(tess, "/api/work/projects?status=all");
  expect(hers.projects.some((p) => p.id === project.id)).toBe(false);

  await page.goto("/work/workflows");
  await expect(page.getByRole("heading", { name: "Workflows", exact: true })).toBeVisible();
  await expect(page.getByLabel("Workflow name").first()).toHaveValue("Default");
  await expect.poll(async () => page.getByLabel("Workflow name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).not.toContain(`${TAG} phil flow`);
  await w.check();
});

test("her notifications are her own: Phil's row is not in her inbox or behind her bell", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  expect((await get<Inbox>(phil, "/api/work/notifications?limit=200")).notifications.some((n) => n.id === notificationId)).toBe(true);
  const hers = await get<Inbox>(tess, "/api/work/notifications?limit=200");
  expect(hers.notifications.some((n) => n.id === notificationId)).toBe(false);

  await page.goto("/work/notifications");
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByText(`${hers.unread} unread`, { exact: true })).toBeVisible();
  await noneOfPhils(page);
  if (hers.notifications.length === 0) {
    await expect(page.getByText("Nothing yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  }
  if (hers.unread === 0) await expect(page.getByRole("link", { name: "Notifications", exact: true }).first()).toBeVisible();
  await w.check();
});

test("over the API every one of Phil's Work rows answers as if it were not there, and stays as it was", async () => {
  const refusals: Array<[string, string, string, unknown?]> = [
    ["GET", `/api/work/tickets/${ticket.key}`, "ticket by key"],
    ["GET", `/api/work/tickets/${ticket.id}`, "ticket by id"],
    ["PATCH", `/api/work/tickets/${ticket.id}`, "ticket edit", { title: `${TAG} taken over` }],
    ["DELETE", `/api/work/tickets/${ticket.id}?hard=1`, "ticket delete"],
    ["POST", `/api/work/tickets/${ticket.id}/comments`, "comment", { body: "hello" }],
    ["GET", `/api/work/tickets/${ticket.id}/comments`, "comments"],
    ["DELETE", `/api/work/tickets/${ticket.id}/comments?id=${commentId || uuid()}`, "comment delete"],
    ["POST", `/api/work/tickets/${ticket.id}/watch`, "watch"],
    ["GET", `/api/work/projects/${KEY}`, "project by key"],
    ["GET", `/api/work/projects/${project.id}`, "project by id"],
    ["PATCH", `/api/work/projects/${project.id}`, "project edit", { name: `${TAG} taken over` }],
    ["DELETE", `/api/work/projects/${project.id}`, "project archive"],
    ["GET", `/api/work/projects/${project.id}/backlog`, "backlog"],
    ["POST", `/api/work/projects/${project.id}/components`, "component", { name: "Hers" }],
    ["GET", `/api/work/boards/${project.id}`, "board"],
    ["POST", `/api/work/boards/${project.id}/move`, "board move", { ticket: ticket.id, status_id: workflow.statuses[0].id }],
    ["GET", `/api/work/filters/${sharedFilter.id}`, "shared filter"],
    ["GET", `/api/work/filters/${privateFilter.id}`, "private filter"],
    ["PATCH", `/api/work/filters/${sharedFilter.id}`, "filter edit", { name: `${TAG} taken over` }],
    ["DELETE", `/api/work/filters/${sharedFilter.id}`, "filter delete"],
    ["GET", `/api/work/workflows/${workflow.id}`, "workflow"],
    ["PATCH", `/api/work/workflows/${workflow.id}`, "workflow edit", { name: `${TAG} taken over` }],
    ["DELETE", `/api/work/workflows/${workflow.id}`, "workflow delete"],
    ["POST", `/api/work/workflows/${workflow.id}/statuses`, "status add", { name: "Hers", status_category: "todo" }],
    ["GET", `/api/work/sprints/${sprintId}`, "sprint"],
    ["PATCH", `/api/work/sprints/${sprintId}`, "sprint edit", { name: `${TAG} taken over` }],
    ["DELETE", `/api/work/sprints/${sprintId}`, "sprint delete"],
    ["DELETE", `/api/work/notifications?id=${notificationId}`, "notification delete"],
  ];
  const wrong: string[] = [];
  for (const [method, path, what, data] of refusals) {
    const res = await tess.fetch(path, { method, data });
    if (res.status() !== 404) wrong.push(`${what}: ${method} ${path} answered ${res.status()} ${(await res.text()).slice(0, 120)}`);
  }
  expect(wrong, "requests that should have answered 404").toEqual([]);

  // marking his notification read changes nothing
  const marked = await send<{ changed: number }>(tess, "PATCH", "/api/work/notifications", { ids: [notificationId], read: true });
  expect(marked.changed).toBe(0);
  // a sprint or a ticket cannot be made in his project
  const sprint = await tess.post("/api/work/sprints", { data: { project_id: project.id, name: `${TAG} hers`, starts_on: "2026-01-01", ends_on: "2026-01-02" } });
  if (sprint.ok()) await tess.delete(`/api/work/sprints/${((await sprint.json()) as { sprint: { id: string } }).sprint.id}`);
  expect(sprint.status(), "a sprint in a project that is not hers").toBe(404);
  const made = await tess.post("/api/work/tickets", { data: { title: `${TAG} planted`, project: KEY } });
  if (made.ok()) {
    const body = (await made.json()) as { ticket: { id: string; project: { id: string } | null } };
    tessTickets.push(body.ticket.id);
    expect(body.ticket.project?.id, "a ticket Tess made landed in Phil's project").not.toBe(project.id);
  }
  // searches never return his rows
  for (const jql of [`text ~ "${TAG}"`, `key = ${ticket.key}`, `project = ${KEY}`, ""]) {
    const res = await tess.get(`/api/work/tickets?jql=${encodeURIComponent(jql)}&limit=200`);
    if (res.ok()) expect(JSON.stringify(await res.json())).not.toContain(ticket.id);
    else expect(res.status()).toBeLessThan(500);
  }
  expect(JSON.stringify(await get(tess, "/api/work/meta"))).not.toContain(TAG);

  // and Phil's rows are exactly as he left them
  const after = await get<{ ticket: Ticket; comments: unknown[] }>(phil, `/api/work/tickets/${ticket.id}`);
  expect(after.ticket.title).toBe(`${TAG} phil ticket`);
  expect(after.comments).toHaveLength(1);
  expect((await get<{ project: { name: string; status: string } }>(phil, `/api/work/projects/${KEY}`)).project).toMatchObject({ name: `${TAG} phil project`, status: "active" });
  expect((await get<{ filter: { name: string } }>(phil, `/api/work/filters/${sharedFilter.id}`)).filter.name).toBe(`${TAG} phil shared filter`);
  const inbox = await get<Inbox>(phil, "/api/work/notifications?limit=200");
  expect(inbox.notifications.find((n) => n.id === notificationId)?.read_at ?? null).toBeNull();
  const flows = await get<{ workflows: Array<{ id: string; name: string; statuses: unknown[] }> }>(phil, "/api/work/workflows");
  expect(flows.workflows.find((x) => x.id === workflow.id)).toMatchObject({ name: `${TAG} phil flow` });
  expect(flows.workflows.find((x) => x.id === workflow.id)?.statuses).toHaveLength(3);
});

// POST /api/sprints, the 0123 path that /api/work/sprints wraps, used to take a project id from any space (the insert
// policy on `sprints` checks the space and not the project). The row landed in the caller's own space and nothing of
// the other person's was read or changed, but it should not exist. Both paths now look the project up first.
test("the older /api/sprints path refuses a sprint in a project that is not hers", async () => {
  const sprint = await tess.post("/api/sprints", { data: { project_id: project.id, name: `${TAG} hers too`, starts_on: "2026-01-01", ends_on: "2026-01-02" } });
  if (sprint.ok()) await tess.delete(`/api/sprints/${((await sprint.json()) as { sprint: { id: string } }).sprint.id}`);
  expect(sprint.status()).toBe(404);
});

test("her own Work works: she makes a ticket, finds it, moves it and comments, and Phil sees none of it", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  const title = `${TAG} tess ticket`;
  await page.goto("/work/issues?jql=");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New ticket" });
  await dialog.getByLabel("Title").fill(title);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/work/tickets") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const made = ((await res.json()) as { ticket: Ticket }).ticket;
  tessTickets.push(made.id);
  await expect(dialog).toBeHidden();

  await page.goto(`/work/issues?jql=${encodeURIComponent(`text ~ "${title}"`)}`);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  await page.getByRole("button", { name: /^Status:/ }).click();
  await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: /^In Progress/ }).click();
  await expect(page.getByRole("button", { name: /^Status:/ })).toContainText("In Progress");
  const comments = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Comments/ }) });
  await comments.getByRole("textbox", { name: "Text" }).click();
  await page.keyboard.type("Hers alone");
  await comments.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(comments.locator("li").filter({ hasText: "Hers alone" })).toContainText("Tess");

  // her board shows it; her project is her own General
  const hers = await get<{ projects: Array<{ key: string; is_default: boolean }> }>(tess, "/api/work/projects");
  const general = hers.projects.find((p) => p.is_default)!;
  await page.goto(`/work/projects/${general.key}/board`);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // Phil cannot see it, by key, by id or by search
  for (const ref of [made.key, made.id]) {
    const got = await phil.get(`/api/work/tickets/${ref}`);
    if (got.ok()) expect(((await got.json()) as { ticket: Ticket }).ticket.id, `Phil opened Tess's ticket by ${ref}`).not.toBe(made.id);
    else expect(got.status()).toBe(404);
  }
  const search = await get<{ tickets: Ticket[] }>(phil, `/api/work/tickets?jql=${encodeURIComponent(`text ~ "${title}"`)}`);
  expect(search.tickets).toEqual([]);
  await w.check();
});
