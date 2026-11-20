/**
 * Work, as Phil (MYC-174): Your work, the issue navigator, projects by
 * category, a project's overview, board, backlog with sprints and
 * burndown, settings, and the old URLs that now land on Work.
 *
 * The issue page has its own spec (work-issue), as do workflows and
 * notifications. One project is made over the API for the journeys and a
 * second through the dialog; both are archived at the end (the app has no
 * delete for a project) and their tickets hard-deleted.
 */
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { apiAs, expect, get, keyFor, newRunId, patientHook, PHIL, send, tag, test, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);
const KEY = keyFor(RUN, "E");
const KEY2 = keyFor(RUN, "F");
const KEY3 = keyFor(RUN, "G");

type Ticket = { id: string; key: string; title: string };
type Meta = {
  categories: Array<{ id: string; name: string }>;
  workflows: Array<{ is_default: boolean; statuses: Array<{ id: string; name: string; category: string }> }>;
  filters: Array<{ id: string; slug: string; name: string }>;
};

let api: APIRequestContext;
let meta: Meta;
let alpha: Ticket;
let beta: Ticket;
let gamma: Ticket;
const ticketKeys: string[] = [];
const filterIds: string[] = [];
const sprintIds: string[] = [];
const projectKeys: string[] = [];

async function newTicket(body: Record<string, unknown>): Promise<Ticket> {
  const res = await send<{ ticket: Ticket }>(api, "POST", "/api/work/tickets", body);
  ticketKeys.push(res.ticket.id);
  return res.ticket;
}

function londonDay(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const section = (page: Page, heading: RegExp): Locator => page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
const exactly = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
const column = (page: Page, name: string): Locator => page.locator("section").filter({ has: page.locator("header > span:first-child", { hasText: exactly(name) }) });

test.beforeEach(async () => {
  // enough writes in hand for one check
  await writeBudget(PHIL, 40);
});

test.beforeAll(async () => {
  patientHook();
  await writeBudget(PHIL, 100);
  api = await apiAs(PHIL);
  meta = await get<Meta>(api, "/api/work/meta");
  const technical = meta.categories.find((c) => c.name === "Technical");
  await send(api, "POST", "/api/work/projects", { name: `${TAG} project`, key: KEY, board_type: "kanban", category_id: technical?.id });
  projectKeys.push(KEY);
  alpha = await newTicket({ title: `${TAG} alpha`, project: KEY });
  beta = await newTicket({ title: `${TAG} beta`, project: KEY, points: 3 });
  gamma = await newTicket({ title: `${TAG} gamma`, project: KEY, type: "bug" });
});

test.afterAll(async () => {
  patientHook();
  // tickets made through the UI are found by the run's tag
  const found = await get<{ tickets: Ticket[] }>(api, `/api/work/tickets?jql=${encodeURIComponent(`text ~ "${TAG}"`)}&limit=200`);
  for (const t of found.tickets) if (t.title.startsWith(TAG)) await api.delete(`/api/work/tickets/${t.id}?hard=1`);
  for (const id of ticketKeys) await api.delete(`/api/work/tickets/${id}?hard=1`);
  for (const id of filterIds) await api.delete(`/api/work/filters/${id}`);
  const fresh = await get<Meta>(api, "/api/work/meta");
  for (const f of fresh.filters) if (f.name.startsWith(TAG)) await api.delete(`/api/work/filters/${f.id}`);
  for (const id of sprintIds) await api.delete(`/api/work/sprints/${id}`);
  for (const key of projectKeys) await api.delete(`/api/work/projects/${key}`);
  await api.dispose();
});

test.describe("Your work", () => {
  test("opens with its sections and links", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto("/work");
    await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
    for (const h of [/^In progress/, /^Assigned to me/, /^Due in the next week/, /^Projects/, /^Recently viewed/, /^Mentions/]) {
      await expect(page.getByRole("heading", { name: h })).toBeVisible();
    }
    // the run's project is listed in the side panel and leads to its board
    await section(page, /^Projects/).getByRole("link", { name: new RegExp(`${TAG} project`) }).click();
    await expect(page).toHaveURL(new RegExp(`/work/projects/${KEY}/board$`));
    await w.check();
  });

  test("a ticket made from the Create dialog, assigned and due, shows under Assigned to me and Due in the next week", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    const title = `${TAG} created in the dialog`;
    await page.goto("/work");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New ticket" });
    await expect(dialog).toBeVisible();
    // Create stays disabled until there is a title
    await expect(dialog.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: /General/ }).click();
    await dialog.getByRole("listbox", { name: "Project" }).getByRole("option", { name: new RegExp(`${TAG} project`) }).click();
    await dialog.getByRole("button", { name: "Unassigned" }).click();
    await dialog.getByRole("listbox", { name: "Assignee" }).getByRole("option", { name: "Phil" }).click();
    await dialog.getByLabel("Due").fill(londonDay(2));
    await dialog.getByLabel("Description").fill("Made by the end-to-end check.");
    const created = page.waitForResponse((r) => r.url().endsWith("/api/work/tickets") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    expect((await created).status()).toBe(201);
    await expect(dialog).toBeHidden();

    await expect(section(page, /^Assigned to me/).getByRole("link", { name: title })).toBeVisible();
    await expect(section(page, /^Due in the next week/).getByRole("link", { name: title })).toBeVisible();

    // started, it joins In progress
    const made = (await get<{ tickets: Ticket[] }>(api, `/api/work/tickets?jql=${encodeURIComponent(`text ~ "${title}"`)}`)).tickets[0];
    expect(made.key).toMatch(new RegExp(`^${KEY}-\\d+$`));
    const inProgress = meta.workflows.find((x) => x.is_default)!.statuses.find((s) => s.name === "In Progress")!;
    await send(api, "PATCH", `/api/work/tickets/${made.key}`, { status_id: inProgress.id });
    await page.reload();
    await expect(section(page, /^In progress/).getByRole("link", { name: title })).toBeVisible();
    await w.check();
  });
});

test.describe("Issue navigator", () => {
  test("the filter bar narrows by text, project and type, and keeps the query in the URL", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto("/work/issues?jql=");
    await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
    await page.getByRole("button", { name: "Basic" }).click();
    await page.getByLabel("Search text").fill(`${TAG} alpha`);
    await expect(page).toHaveURL(/jql=text/);
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} beta`, exact: true })).toHaveCount(0);
    await expect(page.getByText("1 issue", { exact: true })).toBeVisible();

    // typed a key at a time, as a person does, every character lands
    await page.getByLabel("Search text").fill("");
    await page.getByLabel("Search text").pressSequentially(`${RUN} gamma`, { delay: 40 });
    await expect(page.getByLabel("Search text")).toHaveValue(`${RUN} gamma`);
    await expect(page.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toHaveCount(0);

    // project + type chips
    await page.getByLabel("Search text").fill("");
    await page.getByRole("button", { name: /^Project:/ }).click();
    await page.getByRole("listbox", { name: "Project" }).getByRole("option", { name: new RegExp(`${TAG} project`) }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`project(\\+|%20)(%3D|=)(\\+|%20)${KEY}`));
    await expect(page.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Type:/ }).click();
    await page.getByRole("listbox", { name: "Type" }).getByRole("option", { name: "Bug" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toHaveCount(0);

    // the same query, printed in the JQL box
    await page.getByRole("button", { name: "JQL" }).click();
    await expect(page.getByLabel("JQL")).toHaveValue(`project = ${KEY} AND type = bug`);

    // Clear empties it
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/work\/issues$/);
    await w.check();
  });

  test("JQL runs, reports a mistake with its position, and a query the bar cannot show keeps the box open", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto("/work/issues?jql=");
    await page.getByRole("button", { name: "JQL" }).click();
    const box = page.getByLabel("JQL");
    await box.fill(`project = ${KEY} AND points >= 3 ORDER BY created ASC`);
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByRole("link", { name: `${TAG} beta`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toHaveCount(0);

    await box.fill("bogus = 1");
    await box.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: 'Unknown field "bogus".' })).toContainText("(at 1)");

    // an OR cannot be drawn as chips
    await box.fill(`project = ${KEY} AND (type = bug OR points = 3) ORDER BY title ASC`);
    await box.press("Enter");
    await expect(page.getByRole("link", { name: `${TAG} beta`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Basic" })).toBeDisabled();

    // `me` and a relative date are accepted
    await box.fill(`project = ${KEY} AND reporter = me AND created >= -1d`);
    await box.press("Enter");
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toBeVisible();
    await w.check();
  });

  test("a query is saved as a filter, opened by its link, edited and updated", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    const name = `${TAG} bugs`;
    await page.goto(`/work/issues?jql=${encodeURIComponent(`project = ${KEY} AND type = bug`)}`);
    await expect(page.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save as…" }).click();
    const dialog = page.getByRole("dialog", { name: "Save filter" });
    // no name, no filter
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("A filter needs a name.");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/work\/issues\?filter=/);
    const slug = new URL(page.url()).searchParams.get("filter")!;
    const saved = (await get<Meta>(api, "/api/work/meta")).filters.find((f) => f.slug === slug);
    expect(saved?.name).toBe(name);
    filterIds.push(saved!.id);

    // the link alone brings the query back
    await page.goto(`/work/issues?filter=${slug}`);
    await expect(page.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Filter: ${name}` })).toBeVisible();

    // change it: "edited", then Update writes the new query to the same filter
    await page.getByRole("button", { name: "JQL" }).click();
    await page.getByLabel("JQL").fill(`project = ${KEY} AND type = task`);
    await page.getByLabel("JQL").press("Enter");
    await expect(page.getByText("· edited")).toBeVisible();
    const patched = page.waitForResponse((r) => r.url().includes(`/api/work/filters/${saved!.id}`) && r.request().method() === "PATCH");
    await page.getByRole("button", { name: `Update “${name}”` }).click();
    expect((await patched).status()).toBe(200);
    await expect(page.getByText("· edited")).toHaveCount(0);
    await page.goto(`/work/issues?filter=${slug}`);
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${TAG} gamma`, exact: true })).toHaveCount(0);
    await w.check();
  });

  test("the built-in filters load from the picker and from Your work's Inbox link", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto("/work/issues?jql=");
    await page.getByRole("button", { name: /^Filter:/ }).click();
    const list = page.getByRole("listbox", { name: "Filter" });
    for (const f of ["Now", "My open work", "Inbox", "Due this week", "Recently resolved"]) await expect(list.getByRole("option", { name: new RegExp(`^${f}`) })).toBeVisible();
    await list.getByRole("option", { name: /^Inbox/ }).click();
    await expect(page).toHaveURL(/\?filter=inbox$/);
    await page.getByRole("button", { name: "JQL" }).click();
    await expect(page.getByLabel("JQL")).toHaveValue("status = Inbox ORDER BY created ASC");
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toBeVisible();

    await page.goto("/work");
    await page.locator("header").getByRole("link", { name: "Inbox", exact: true }).click();
    await expect(page).toHaveURL(/\/work\/issues\?filter=inbox$/);
    await w.check();
  });

  test("a search with no match says so and offers to create", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto(`/work/issues?jql=${encodeURIComponent(`text ~ "${TAG} nothing-has-this-title"`)}`);
    await expect(page.getByText("No issues match")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create one" })).toBeVisible();
    await expect(page.getByText("0 issues", { exact: true })).toBeVisible();
    await w.check();
  });
});

test.describe("Projects", () => {
  test("the list groups projects by category and the dialog makes a new one", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto("/work/projects");
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(section(page, /^Technical/).getByRole("link", { name: new RegExp(`${TAG} project`) })).toBeVisible();
    // one General per space the person belongs to
    await expect(section(page, /^Life/).getByRole("link", { name: /General/ }).first()).toBeVisible();

    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await dialog.getByLabel("Name").fill(`${TAG} second`);
    await dialog.getByLabel("Key").fill(KEY2.toLowerCase());
    await expect(dialog.getByLabel("Key")).toHaveValue(KEY2);
    await dialog.getByRole("button", { name: "None" }).click();
    await dialog.getByRole("listbox", { name: "Category" }).getByRole("option", { name: "Life" }).click();
    await dialog.getByRole("button", { name: "Kanban" }).click();
    await dialog.getByRole("listbox", { name: "Board" }).getByRole("option", { name: /Scrum/ }).click();
    const made = page.waitForResponse((r) => r.url().endsWith("/api/work/projects") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    expect((await made).status()).toBe(201);
    projectKeys.push(KEY2);
    await expect(dialog).toBeHidden();
    const card = section(page, /^Life/).getByRole("link", { name: new RegExp(`${TAG} second`) });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Scrum");
    await expect(card).toContainText("0 / 0 done");

    // a key already in use is refused in the dialog, in words
    await page.getByRole("button", { name: "New project" }).click();
    await dialog.getByLabel("Name").fill(`${TAG} clash`);
    await dialog.getByLabel("Key").fill(KEY2);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog.getByRole("alert")).not.toBeEmpty();
    await expect(dialog).toBeVisible();
    await w.check();
  });

  test("overview shows progress, recent issues, lead, dates and components", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await send(api, "PATCH", `/api/work/projects/${KEY}`, { description: `${TAG} overview text`, target_on: londonDay(30), links: [{ label: "Spec", url: "https://example.com/spec" }] });
    await page.goto(`/work/projects/${KEY}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${TAG} project`);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Technical");
    await expect(page.getByText(`${TAG} overview text`)).toBeVisible();
    const progress = await get<{ progress: { todo: number; in_progress: number; done: number } }>(api, `/api/work/projects/${KEY}`);
    await expect(page.getByRole("link", { name: /^To do/ })).toContainText(String(progress.progress.todo));
    await expect(page.getByRole("link", { name: /^In progress/ })).toContainText(String(progress.progress.in_progress));
    await expect(section(page, /^Recently updated/).getByRole("link", { name: `${TAG} alpha`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Spec" })).toHaveAttribute("href", "https://example.com/spec");
    await expect(page.getByText("No active sprint.")).toBeVisible();
    await expect(page.getByText("Every type in the space")).toBeVisible();

    // a stat is a link into the navigator with the project's scope
    await page.getByRole("link", { name: /^To do/ }).click();
    await expect(page).toHaveURL(/\/work\/issues\?jql=/);
    await expect(page.getByRole("link", { name: `${TAG} alpha`, exact: true })).toBeVisible();

    // the four tabs
    await page.goto(`/work/projects/${KEY}`);
    // inside the page: the sidebar's own navigation is also called "Sections"
    const tabs = page.locator("main").getByRole("navigation", { name: "Sections" });
    for (const [label, path] of [["Board", "/board"], ["Backlog", "/backlog"], ["Settings", "/settings"], ["Overview", ""]] as const) {
      await tabs.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/work/projects/${KEY}${path}$`));
      await expect(tabs.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    }
    await w.check();
  });

  test("a project that does not exist says so", async ({ page }) => {
    await page.goto("/work/projects/ZZQQX");
    await expect(page.getByRole("alert").filter({ hasText: 'No project "ZZQQX".' })).toBeVisible();
  });
});

test.describe("Board", () => {
  test("columns follow the workflow, a card is added in a column and dragged to another", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto(`/work/projects/${KEY}/board`);
    for (const name of ["Inbox", "In Progress", "Done"]) await expect(column(page, name)).toBeVisible();
    await expect(column(page, "Inbox").locator(`[data-key="${alpha.key}"]`)).toBeVisible();

    // quick create at the foot of a column lands in that column's status
    const selected = column(page, "Selected for Development");
    await selected.getByLabel("New ticket title").fill(`${TAG} quick card`);
    await selected.getByLabel("New ticket title").press("Enter");
    await expect(selected.getByRole("link", { name: `${TAG} quick card` })).toBeVisible();

    // drag alpha from Inbox to In Progress
    const card = page.locator(`[data-key="${alpha.key}"]`);
    const moved = page.waitForResponse((r) => r.url().includes(`/api/work/boards/${KEY}/move`) && r.request().method() === "POST");
    await card.dragTo(column(page, "In Progress"));
    const res = await moved;
    expect(res.status(), await res.text()).toBe(200);
    await expect(column(page, "In Progress").locator(`[data-key="${alpha.key}"]`)).toBeVisible();
    await expect(column(page, "Inbox").locator(`[data-key="${alpha.key}"]`)).toHaveCount(0);

    // it is a real status change: it survives a reload and the issue says so
    await page.reload();
    await expect(column(page, "In Progress").locator(`[data-key="${alpha.key}"]`)).toBeVisible();
    const after = await get<{ ticket: { status: { name: string } }; activity: Array<{ field: string | null; to_value: string | null }> }>(api, `/api/work/tickets/${alpha.key}`);
    expect(after.ticket.status.name).toBe("In Progress");
    expect(after.activity.some((a) => a.to_value === "In Progress")).toBe(true);
    await w.check();
  });

  test("a card dropped between two others takes that place", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    // three cards in On Hold, in a known order
    const hold = meta.workflows.find((x) => x.is_default)!.statuses.find((s) => s.name === "On Hold")!;
    const one = await newTicket({ title: `${TAG} order one`, project: KEY, status_id: hold.id });
    const two = await newTicket({ title: `${TAG} order two`, project: KEY, status_id: hold.id });
    const three = await newTicket({ title: `${TAG} order three`, project: KEY, status_id: hold.id });
    await send(api, "POST", `/api/work/boards/${KEY}/move`, { ticket: one.key, status_id: hold.id });
    await send(api, "POST", `/api/work/boards/${KEY}/move`, { ticket: two.key, status_id: hold.id });
    await send(api, "POST", `/api/work/boards/${KEY}/move`, { ticket: three.key, status_id: hold.id });

    await page.goto(`/work/projects/${KEY}/board`);
    const col = column(page, "On Hold");
    const keys = () => col.locator("[data-key]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));
    await expect.poll(keys).toEqual([one.key, two.key, three.key]);

    // drop "three" on the upper half of "two": it lands between one and two
    const target = col.locator(`[data-key="${two.key}"]`);
    const box = (await target.boundingBox())!;
    const moved = page.waitForResponse((r) => r.url().includes(`/api/work/boards/${KEY}/move`) && r.request().method() === "POST");
    await col.locator(`[data-key="${three.key}"]`).dragTo(target, { targetPosition: { x: box.width / 2, y: 3 } });
    expect((await moved).status()).toBe(200);
    await expect.poll(keys).toEqual([one.key, three.key, two.key]);
    await page.reload();
    await expect.poll(keys).toEqual([one.key, three.key, two.key]);
    await w.check();
  });

  test("quick filters narrow the board and live in the URL; swimlanes group by assignee", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await send(api, "PATCH", `/api/work/tickets/${beta.key}`, { assignee_id: PHIL.id });
    await page.goto(`/work/projects/${KEY}/board`);
    await expect(page.locator(`[data-key="${gamma.key}"]`)).toBeVisible();
    await page.getByRole("button", { name: /^Type:/ }).click();
    await page.getByRole("listbox", { name: "Type" }).getByRole("option", { name: "Bug" }).click();
    await expect(page).toHaveURL(/\?type=bug$/);
    await expect(page.locator(`[data-key="${gamma.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-key="${beta.key}"]`)).toHaveCount(0);

    await page.goto(`/work/projects/${KEY}/board?assignee=me`);
    await expect(page.locator(`[data-key="${beta.key}"]`)).toBeVisible();
    await expect(page.locator(`[data-key="${gamma.key}"]`)).toHaveCount(0);

    await page.goto(`/work/projects/${KEY}/board`);
    await page.getByRole("button", { name: /^Swimlanes:/ }).click();
    await page.getByRole("listbox", { name: "Swimlanes" }).getByRole("option", { name: "By assignee" }).click();
    await expect(page.getByRole("heading", { name: "Phil", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Unassigned", level: 3 })).toBeVisible();
    await page.getByRole("button", { name: /^Swimlanes:/ }).click();
    await page.getByRole("listbox", { name: "Swimlanes" }).getByRole("option", { name: "None" }).click();
    await expect(page.getByRole("heading", { name: "Unassigned", level: 3 })).toHaveCount(0);
    await w.check();
  });
});

test.describe("Backlog and sprints", () => {
  test("a sprint is planned, filled, started, shows its burndown, and is completed", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    const sprint = `${TAG} sprint`;
    page.on("dialog", (d) => void d.accept());
    await page.goto(`/work/projects/${KEY}/backlog`);
    const backlog = section(page, /^Backlog/);
    await expect(backlog.getByRole("link", { name: `${TAG} beta`, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "New sprint" }).click();
    const dialog = page.getByRole("dialog", { name: "New sprint" });
    await expect(dialog.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
    await dialog.getByLabel("Name").fill(sprint);
    await dialog.getByLabel("Goal").fill("Prove the backlog.");
    // "Length" sets the end from the start: a week from the 1st ends on the 7th.
    // A summer date on purpose: in British Summer Time this used to come out a day short.
    await dialog.getByLabel("Starts").fill("2026-07-01");
    await dialog.getByRole("button", { name: "Set the end from the start" }).click();
    await dialog.getByRole("listbox", { name: "Length" }).getByRole("option", { name: "One week" }).click();
    await expect(dialog.getByLabel("Ends")).toHaveValue("2026-07-07");
    await dialog.getByLabel("Starts").fill(londonDay(-2));
    await dialog.getByRole("button", { name: "Set the end from the start" }).click();
    await dialog.getByRole("listbox", { name: "Length" }).getByRole("option", { name: "One week" }).click();
    await expect(dialog.getByLabel("Ends")).toHaveValue(londonDay(4));
    const made = page.waitForResponse((r) => r.url().endsWith("/api/work/sprints") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    const madeBody = (await (await made).json()) as { sprint: { id: string } };
    sprintIds.push(madeBody.sprint.id);

    const block = section(page, new RegExp(`^${sprint}`));
    await expect(block).toContainText("planned");
    await expect(block).toContainText("Prove the backlog.");
    await expect(block).toContainText("Nothing planned yet.");

    // plan: the picker on a backlog row moves it into the sprint
    const betaRow = backlog.locator("div.cursor-grab").filter({ hasText: `${TAG} beta` });
    await betaRow.getByLabel("Sprint").selectOption({ label: sprint });
    await expect(block.getByRole("link", { name: `${TAG} beta`, exact: true })).toBeVisible();
    await expect(backlog.getByRole("link", { name: `${TAG} beta`, exact: true })).toHaveCount(0);
    // and a drag onto the sprint block does the same
    const gammaRow = backlog.locator("div.cursor-grab").filter({ hasText: `${TAG} gamma` });
    const patched = page.waitForResponse((r) => r.url().includes(`/api/work/tickets/${gamma.key}`) && r.request().method() === "PATCH");
    await gammaRow.dragTo(block.getByRole("heading", { level: 3 }));
    expect((await patched).status()).toBe(200);
    await expect(block.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await expect(block).toContainText("0 / 3 pts");

    // start: active, days left, burndown drawn
    await block.getByRole("button", { name: "Start sprint" }).click();
    await expect(block).toContainText("active");
    await expect(block).toContainText("days left");
    await expect(block.getByRole("img", { name: /^Burndown/ })).toBeVisible();
    const chart = await get<{ burndown: Array<{ date: string; remaining: number; ideal: number }> }>(api, `/api/work/sprints/${madeBody.sprint.id}`);
    expect(chart.burndown.length).toBeGreaterThanOrEqual(2);
    expect(chart.burndown[0].ideal).toBe(3);

    // the project's overview names the running sprint
    await page.goto(`/work/projects/${KEY}`);
    await expect(section(page, /^Sprints/).getByRole("link", { name: new RegExp(sprint) })).toBeVisible();

    // finishing beta counts in the sprint's figures
    const done = meta.workflows.find((x) => x.is_default)!.statuses.find((s) => s.name === "Done")!;
    await send(api, "PATCH", `/api/work/tickets/${beta.key}`, { status_id: done.id });
    await page.goto(`/work/projects/${KEY}/backlog`);
    await expect(block).toContainText("1 / 2 done");
    await expect(block).toContainText("3 / 3 pts");

    // complete: the block goes, the unfinished ticket is back in the backlog
    await block.getByRole("button", { name: "Complete sprint" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`^${sprint}`) })).toHaveCount(0);
    await expect(backlog.getByRole("link", { name: `${TAG} gamma`, exact: true })).toBeVisible();
    await w.check();
  });

  // FINDING (not fixed, outside this surface): the burndown reads `ticket_completions`, which only
  // POST /api/tickets/[key]/complete writes. A ticket finished from the issue page, the board or
  // PATCH /api/work/tickets leaves no row there, so the line stays flat while the sprint's own
  // "pts" figure counts it. See lib/tickets/sprints.ts burndown().
  test.fixme("a ticket finished from the Work pages burns the sprint's line down", async () => {
    // close whatever the test above left running: a project has one active sprint
    const open = await get<{ sprints: Array<{ id: string; status: string }> }>(api, `/api/work/sprints?project=${(await get<{ project: { id: string } }>(api, `/api/work/projects/${KEY}`)).project.id}`);
    for (const s of open.sprints) if (s.status === "active") await send(api, "PATCH", `/api/work/sprints/${s.id}`, { status: "closed", carry_to: null });
    const projectId = (await get<{ project: { id: string } }>(api, `/api/work/projects/${KEY}`)).project.id;
    const sprint = (await send<{ sprint: { id: string } }>(api, "POST", "/api/work/sprints", { project_id: projectId, name: `${TAG} burn`, starts_on: londonDay(-1), ends_on: londonDay(5), activate: true })).sprint;
    const t = await newTicket({ title: `${TAG} burns`, project: KEY, points: 5, sprint_id: sprint.id });
    type Chart = { burndown: Array<{ date: string; remaining: number; ideal: number }> };
    const before = await get<Chart>(api, `/api/work/sprints/${sprint.id}`);
    expect(before.burndown.find((p) => p.date === londonDay(0))?.remaining).toBe(5);
    // the same write the Status picker and a board drag make
    const done = meta.workflows.find((x) => x.is_default)!.statuses.find((s) => s.name === "Done")!;
    await send(api, "PATCH", `/api/work/tickets/${t.key}`, { status_id: done.id });
    const after = await get<Chart>(api, `/api/work/sprints/${sprint.id}`);
    await send(api, "PATCH", `/api/work/sprints/${sprint.id}`, { status: "closed", carry_to: null });
    expect(after.burndown.find((p) => p.date === londonDay(0))?.remaining).toBe(0);
  });

  test("a Scrum board with no running sprint points at the Backlog", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    const scrum = keyFor(RUN, "S");
    await send(api, "POST", "/api/work/projects", { name: `${TAG} scrum`, key: scrum, board_type: "scrum" });
    projectKeys.push(scrum);
    await page.goto(`/work/projects/${scrum}/board`);
    await expect(page.getByText("No active sprint")).toBeVisible();
    await page.getByRole("link", { name: "Plan one in the Backlog →" }).click();
    await expect(page).toHaveURL(new RegExp(`/work/projects/${scrum}/backlog$`));
    await expect(page.getByText("The backlog is empty")).toBeVisible();
    await w.check();
  });
});

test.describe("Project settings", () => {
  test("details save and survive a reload", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto(`/work/projects/${KEY}/settings`);
    await page.locator("#p-desc").fill(`${TAG} described in settings`);
    await page.locator("#p-repo").fill("example/e2e-work");
    await page.locator("#p-start").fill(londonDay(-1));
    await page.getByRole("button", { name: "Nobody" }).click();
    await page.getByRole("listbox", { name: "Lead" }).getByRole("option", { name: "Phil" }).click();
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/work/projects/${KEY}`) && r.request().method() === "PATCH");
    await section(page, /^Details/).getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("#p-desc")).toHaveValue(`${TAG} described in settings`);
    await expect(page.locator("#p-repo")).toHaveValue("example/e2e-work");
    await page.goto(`/work/projects/${KEY}`);
    await expect(page.getByText(`${TAG} described in settings`)).toBeVisible();
    await expect(page.locator("dl")).toContainText("Phil");
    await expect(page.locator("dl")).toContainText("example/e2e-work");
    await w.check();
  });

  test("components are added, renamed, archived and deleted; issue types are narrowed and widened", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    page.on("dialog", (d) => void d.accept());
    await page.goto(`/work/projects/${KEY}/settings`);
    const comps = section(page, /^Components/);
    await comps.getByLabel("New component").fill("Engine");
    await comps.getByLabel("New component").press("Enter");
    await expect(comps.getByLabel("Component name")).toHaveValue("Engine");
    await comps.getByLabel("Component name").fill("Engine room");
    await comps.getByLabel("Component name").blur();
    await expect.poll(async () => (await get<{ components: Array<{ name: string }> }>(api, `/api/work/projects/${KEY}/components`)).components.map((c) => c.name)).toEqual(["Engine room"]);

    // the issue page offers it, the overview links it
    await page.goto(`/work/projects/${KEY}`);
    await expect(section(page, /^Components/).getByRole("link", { name: "Engine room" })).toBeVisible();

    await page.goto(`/work/projects/${KEY}/settings`);
    await comps.getByRole("button", { name: "Archive" }).click();
    await expect(comps.getByRole("button", { name: "Restore" })).toBeVisible();
    await comps.getByRole("button", { name: "Delete Engine room" }).click();
    await expect(comps.getByLabel("Component name")).toHaveCount(0);

    // untick Audit: the project now offers a named list without it
    const types = section(page, /^Issue types/);
    const put = page.waitForResponse((r) => r.url().endsWith(`/api/work/projects/${KEY}/types`) && r.request().method() === "PUT");
    await types.locator("label").filter({ hasText: "Audit" }).click();
    expect((await put).status()).toBe(200);
    const offered = await get<{ types_restricted: boolean; types: Array<{ name: string }> }>(api, `/api/work/projects/${KEY}`);
    expect(offered.types_restricted).toBe(true);
    expect(offered.types.map((t) => t.name)).not.toContain("Audit");
    expect(offered.types.map((t) => t.name)).toContain("Task");
    // tick it again: back to "every type"
    const put2 = page.waitForResponse((r) => r.url().endsWith(`/api/work/projects/${KEY}/types`) && r.request().method() === "PUT");
    await types.locator("label").filter({ hasText: "Audit" }).click();
    expect((await put2).status()).toBe(200);
    expect((await get<{ types_restricted: boolean }>(api, `/api/work/projects/${KEY}`)).types_restricted).toBe(false);
    await w.check();
  });

  test("board columns can be laid out by hand and handed back to the workflow", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto(`/work/projects/${KEY}/settings`);
    const board = section(page, /^Board/);
    // the layout starts from the workflow's statuses, one column each
    await expect(board.getByText("Inbox", { exact: true })).toBeVisible();
    await board.getByRole("button", { name: "Lay out columns" }).click();
    await expect(board.getByLabel("Column name")).toHaveCount(meta.workflows.find((x) => x.is_default)!.statuses.length);
    await board.getByLabel("Column name").first().fill("Intake");
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/work/boards/${KEY}`) && r.request().method() === "PATCH");
    await board.getByRole("button", { name: "Save columns" }).click();
    expect((await saved).status()).toBe(200);
    await page.goto(`/work/projects/${KEY}/board`);
    await expect(column(page, "Intake")).toBeVisible();
    await expect(column(page, "Inbox")).toHaveCount(0);

    await page.goto(`/work/projects/${KEY}/settings`);
    const back = page.waitForResponse((r) => r.url().endsWith(`/api/work/boards/${KEY}`) && r.request().method() === "PATCH");
    await board.getByRole("button", { name: "Back to the workflow’s columns" }).click();
    expect((await back).status()).toBe(200);
    await page.goto(`/work/projects/${KEY}/board`);
    await expect(column(page, "Inbox")).toBeVisible();
    await w.check();
  });

  test("a project's key changes while no ticket carries it, and is for good once one does", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    const from = keyFor(RUN, "R");
    await send(api, "POST", "/api/work/projects", { name: `${TAG} rekey`, key: from });
    projectKeys.push(from);
    await page.goto(`/work/projects/${from}/settings`);
    await expect(page.getByText("Free to change until a ticket carries it. After that the key is for good.")).toBeVisible();
    // no tickets yet: the key changes and the page follows to its new address
    await page.locator("#p-key").fill(KEY3);
    await section(page, /^Details/).getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/work/projects/${KEY3}/settings$`));
    projectKeys.splice(projectKeys.indexOf(from), 1, KEY3);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(KEY3);

    // one ticket later the key is refused a change, in words, and stays
    const t = await newTicket({ title: `${TAG} keyed`, project: KEY3 });
    expect(t.key).toBe(`${KEY3}-1`);
    await page.reload();
    await page.locator("#p-key").fill(from);
    const refused = page.waitForResponse((r) => r.url().endsWith(`/api/work/projects/${KEY3}`) && r.request().method() === "PATCH");
    await section(page, /^Details/).getByRole("button", { name: "Save", exact: true }).click();
    expect((await refused).status()).toBe(409);
    await expect(section(page, /^Details/).getByRole("alert")).toHaveText(`Tickets already carry the key ${KEY3}, so it cannot change.`);
    expect((await get<{ project: { key: string } }>(api, `/api/work/projects/${KEY3}`)).project.key).toBe(KEY3);
    await w.check();
  });

  test("a ticket moved into a project takes that project's key, and its old key still lands on it", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    // made in General, so its key is the space's own
    const t = await newTicket({ title: `${TAG} moved in` });
    expect(t.key).not.toMatch(new RegExp(`^${KEY}-`));
    await page.goto(`/work/browse/${t.key}`);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} moved in`);
    const moved = page.waitForResponse((r) => r.url().endsWith(`/api/work/tickets/${t.key}`) && r.request().method() === "PATCH");
    await page.locator("main aside > div").filter({ has: page.locator("span.uppercase", { hasText: /^Project$/ }) }).getByRole("button").click();
    await page.getByRole("listbox", { name: "Project" }).getByRole("option", { name: new RegExp(`${TAG} project`) }).click();
    expect((await moved).status()).toBe(200);
    // the page settles on the new key and says what it used to be
    await expect(page).toHaveURL(new RegExp(`/work/browse/${KEY}-\\d+$`));
    await expect(page.getByText(`formerly ${t.key}`)).toBeVisible();
    const now = new URL(page.url()).pathname.split("/").pop()!;
    // the old address (a Telegram message, a commit) still opens it
    await page.goto(`/work/browse/${t.key}`);
    await expect(page).toHaveURL(new RegExp(`/work/browse/${now}$`));
    await page.goto(`/organisation/tickets/${t.key}`);
    await expect(page).toHaveURL(new RegExp(`/work/browse/${now}$`));
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} moved in`);
    await w.check();
  });
  test("the default project keeps its key and cannot be archived", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto("/work/projects/PW/settings");
    await expect(page.locator("#p-key")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Archive project" })).toHaveCount(0);
    await w.check();
  });

  test("archiving a project takes it off the list", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    page.on("dialog", (d) => void d.accept());
    const gone = keyFor(RUN, "X");
    await send(api, "POST", "/api/work/projects", { name: `${TAG} to archive`, key: gone });
    projectKeys.push(gone);
    await page.goto(`/work/projects/${gone}/settings`);
    await page.getByRole("button", { name: "Archive project" }).click();
    await expect(page).toHaveURL(/\/work\/projects$/);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`${TAG} to archive`) })).toHaveCount(0);
    // archived, not gone: its page still opens and says so
    await page.goto(`/work/projects/${gone}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("archived");
    await w.check();
  });
});

test.describe("Old URLs", () => {
  const cases: Array<[string, RegExp]> = [
    ["/organisation/tasks", /\/work$/],
    ["/organisation/tickets", /\/work$/],
    ["/organisation/projects", /\/work\/projects$/],
    ["/organisation/tickets/sprints", /\/work\/projects$/],
  ];
  for (const [from, to] of cases) {
    test(`${from} lands on Work`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    });
  }

  test("/organisation/tickets/[key] lands on the issue", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    await page.goto(`/organisation/tickets/${gamma.key}`);
    await expect(page).toHaveURL(new RegExp(`/work/browse/${gamma.key}$`));
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} gamma`);
    await w.check();
  });

  test("/organisation/projects/[id] lands on that project's overview", async ({ page }, testInfo) => {
    const w = watch(page, testInfo);
    const p = await get<{ project: { id: string } }>(api, `/api/work/projects/${KEY}`);
    await page.goto(`/organisation/projects/${p.project.id}`);
    await expect(page).toHaveURL(new RegExp(`/work/projects/${p.project.id}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${TAG} project`);
    await w.check();
  });

  test("templates and the weekly review keep their own URLs", async ({ page }) => {
    for (const url of ["/organisation/tickets/templates", "/organisation/tickets/review"]) {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(url);
    }
  });
});

test.describe("With the AI switched off", () => {
  test("the smart ticket search falls back to a plain text match and says so", async () => {
    const res = await api.post("/api/tickets/smart", { data: { query: `${RUN} gamma` } });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string }>; explanation: string; fallback: boolean };
    expect(body.fallback).toBe(true);
    expect(body.explanation).toContain("plain text search");
    expect(body.tasks.map((t) => t.id)).toContain(gamma.id);
  });
});
