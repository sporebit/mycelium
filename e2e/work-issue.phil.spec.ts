/**
 * The issue page, as Phil (MYC-174): open by key, edit every field, move
 * through statuses, comment, and the rich editor with its @person and
 * #ticket chips. One project is made for it and archived at the end; its
 * tickets and the one label it adds are deleted.
 */
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { apiAs, expect, get, keyFor, newRunId, patientHook, PHIL, send, tag, test, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);
const KEY = keyFor(RUN, "H");

type Ticket = { id: string; key: string; title: string };
type Detail = {
  ticket: {
    key: string;
    title: string;
    description: string | null;
    description_doc: unknown;
    status: { name: string; category: string } | null;
    resolution: string | null;
    assignee: { id: string; name: string } | null;
    points: number | null;
    due: string | null;
    scheduled_on: string | null;
    epic: { key: string } | null;
    parent: { key: string } | null;
    labels: Array<{ name: string; field: string }>;
    components: Array<{ name: string }>;
    started_at: string | null;
    resolved_at: string | null;
  };
  comments: Array<{ id: string; body: string }>;
  children: Ticket[];
  epic_children: Ticket[];
  links: Array<{ url: string | null; label: string | null }>;
  watching: boolean;
  activity: Array<{ action: string; field: string | null; from_value: string | null; to_value: string | null }>;
};

let api: APIRequestContext;
let main: Ticket;
let other: Ticket;
let epic: Ticket;
const made: string[] = [];

async function newTicket(body: Record<string, unknown>): Promise<Ticket> {
  const res = await send<{ ticket: Ticket }>(api, "POST", "/api/work/tickets", body);
  made.push(res.ticket.id);
  return res.ticket;
}
const detail = (key: string) => get<Detail>(api, `/api/work/tickets/${key}`);

function londonDay(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const exactly = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
const section = (page: Page, heading: RegExp): Locator => page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
/** A row of the side panel, by its label. */
const side = (page: Page, label: string): Locator => page.locator("main aside > div").filter({ has: page.locator("span.uppercase", { hasText: exactly(label) }) });

/** Wait for the PATCH the page sends when a field changes. */
function patchOf(page: Page, key: string) {
  return page.waitForResponse((r) => r.url().endsWith(`/api/work/tickets/${key}`) && r.request().method() === "PATCH");
}

test.beforeEach(async () => {
  // enough writes in hand for one check
  await writeBudget(PHIL, 40);
});

test.beforeAll(async () => {
  patientHook();
  await writeBudget(PHIL, 100);
  api = await apiAs(PHIL);
  await send(api, "POST", "/api/work/projects", { name: `${TAG} issues`, key: KEY });
  await send(api, "POST", `/api/work/projects/${KEY}/components`, { name: "Engine" });
  main = await newTicket({ title: `${TAG} main`, project: KEY });
  other = await newTicket({ title: `${TAG} other`, project: KEY });
  epic = await newTicket({ title: `${TAG} epic`, project: KEY, type: "epic" });
});

test.afterAll(async () => {
  patientHook();
  const found = await get<{ tickets: Ticket[] }>(api, `/api/work/tickets?jql=${encodeURIComponent(`project = ${KEY}`)}&limit=200`);
  // children first, so a parent's delete does not trip over them
  for (const t of [...found.tickets].reverse()) await api.delete(`/api/work/tickets/${t.id}?hard=1`);
  for (const id of made) await api.delete(`/api/work/tickets/${id}?hard=1`);
  const labels = await get<{ fields: Array<{ labels: Array<{ id: string; name: string }> }> }>(api, "/api/work/labels");
  for (const f of labels.fields) for (const l of f.labels) if (l.name.startsWith(TAG)) await api.delete(`/api/work/labels/${l.id}`);
  await api.delete(`/api/work/projects/${KEY}`);
  await api.dispose();
});

test("opens by key with its breadcrumb, and an unknown key says so", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto(`/work/browse/${main.key}`);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} main`);
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs).toContainText(main.key);
  await expect(crumbs.getByRole("link", { name: `${TAG} issues` })).toHaveAttribute("href", `/work/projects/${KEY}`);
  await expect(page.getByText("No description.")).toBeVisible();
  // a lower-case key in the address still opens it
  await page.goto(`/work/browse/${main.key.toLowerCase()}`);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} main`);
  await w.check();

  await page.goto("/work/browse/ZZQQX-99999");
  await expect(page.getByRole("alert").filter({ hasText: 'No issue "ZZQQX-99999" in your spaces.' })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Your work" })).toBeVisible();
});

test("title, assignee, points, dates, type, epic, labels and components are edited in place", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto(`/work/browse/${main.key}`);
  const title = page.getByLabel("Title", { exact: true });
  await expect(title).toHaveValue(`${TAG} main`);

  let p = patchOf(page, main.key);
  await title.fill(`${TAG} main, renamed`);
  await title.press("Enter");
  expect((await p).status()).toBe(200);

  p = patchOf(page, main.key);
  await side(page, "Assignee").getByRole("button").click();
  await page.getByRole("listbox", { name: "Assignee" }).getByRole("option", { name: "Phil" }).click();
  expect((await p).status()).toBe(200);
  await expect(side(page, "Assignee").getByRole("button")).toContainText("Phil");

  p = patchOf(page, main.key);
  await side(page, "Points").getByRole("button").click();
  await page.getByRole("listbox", { name: "Points" }).getByRole("option", { name: "5" }).click();
  expect((await p).status()).toBe(200);

  p = patchOf(page, main.key);
  await page.getByLabel("Due date").fill(londonDay(3));
  expect((await p).status()).toBe(200);
  p = patchOf(page, main.key);
  await page.getByLabel("Scheduled date").fill(londonDay(1));
  expect((await p).status()).toBe(200);

  p = patchOf(page, main.key);
  await side(page, "Type").getByRole("button").click();
  await page.getByRole("listbox", { name: "Type" }).getByRole("option", { name: "Story" }).click();
  expect((await p).status()).toBe(200);

  p = patchOf(page, main.key);
  await side(page, "Epic").getByRole("button").click();
  await page.getByRole("listbox", { name: "Epic" }).getByRole("option", { name: new RegExp(`${TAG} epic`) }).click();
  expect((await p).status()).toBe(200);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: `${TAG} epic` })).toBeVisible();

  // a label that does not exist yet is made from the picker
  p = patchOf(page, main.key);
  await side(page, "Labels").getByRole("button").first().click();
  await page.getByLabel("Search Labels").fill(`${TAG}-label`);
  await expect(page.getByRole("button", { name: `Add “${TAG}-label”` })).toBeVisible();
  await page.keyboard.press("Enter");
  expect((await p).status()).toBe(200);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Labels" })).toBeHidden();
  // an existing one is ticked
  p = patchOf(page, main.key);
  await side(page, "Location").getByRole("button").first().click();
  await page.getByRole("listbox", { name: "Location" }).getByRole("option", { name: "Home" }).click();
  expect((await p).status()).toBe(200);
  await page.keyboard.press("Escape");

  p = patchOf(page, main.key);
  await side(page, "Components").getByRole("button").first().click();
  await page.getByRole("listbox", { name: "Components" }).getByRole("option", { name: "Engine" }).click();
  expect((await p).status()).toBe(200);
  await page.keyboard.press("Escape");

  // everything is on the server, and on the page after a reload
  const d = (await detail(main.key)).ticket;
  expect(d.title).toBe(`${TAG} main, renamed`);
  expect(d.assignee?.id).toBe(PHIL.id);
  expect(d.points).toBe(5);
  expect(d.due).toBe(londonDay(3));
  expect(d.scheduled_on).toBe(londonDay(1));
  expect(d.epic?.key).toBe(epic.key);
  expect(d.labels.map((l) => `${l.field}:${l.name}`).sort()).toEqual([`labels:${TAG}-label`, "location:Home"].sort());
  expect(d.components.map((c) => c.name)).toEqual(["Engine"]);

  await page.reload();
  await expect(title).toHaveValue(`${TAG} main, renamed`);
  await expect(side(page, "Points").getByRole("button")).toContainText("5");
  await expect(page.getByLabel("Due date")).toHaveValue(londonDay(3));
  await expect(side(page, "Labels").getByRole("button").first()).toContainText(`${TAG}-label`);

  // the epic's own page lists it
  await page.goto(`/work/browse/${epic.key}`);
  await expect(section(page, /^In this epic/).getByRole("link", { name: `${TAG} main, renamed` })).toBeVisible();

  // put the title back for the tests that follow
  await send(api, "PATCH", `/api/work/tickets/${main.key}`, { title: `${TAG} main` });
  await w.check();
});

test("status transitions: start, finish, reopen, cancel, each logged", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  page.on("dialog", (d) => void d.accept());
  const t = await newTicket({ title: `${TAG} transitions`, project: KEY });
  await page.goto(`/work/browse/${t.key}`);
  const status = page.getByRole("button", { name: /^Status:/ });
  await expect(status).toContainText("Inbox");

  let p = patchOf(page, t.key);
  await status.click();
  await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: /^In Progress/ }).click();
  expect((await p).status()).toBe(200);
  await expect(status).toContainText("In Progress");
  await expect(page.getByText(/^Started /)).toBeVisible();
  await expect(section(page, /^Activity/)).toContainText("Inbox → In Progress");

  p = patchOf(page, t.key);
  await status.click();
  await page.getByRole("listbox", { name: "Status" }).getByRole("option", { name: /^Done/ }).click();
  expect((await p).status()).toBe(200);
  await expect(page.getByText(/^Resolved /)).toBeVisible();
  let d = (await detail(t.key)).ticket;
  expect(d.status?.category).toBe("done");
  expect(d.resolution).toBe("done");
  expect(d.resolved_at).not.toBeNull();
  // a finished ticket offers Reopen, not Cancel
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);

  p = patchOf(page, t.key);
  await page.getByRole("button", { name: "Reopen" }).click();
  expect((await p).status()).toBe(200);
  d = (await detail(t.key)).ticket;
  expect(d.status?.category).toBe("todo");
  expect(d.resolution).toBeNull();
  expect(d.resolved_at).toBeNull();

  // Cancel resolves as Cancelled; nothing is removed
  const del = page.waitForResponse((r) => r.url().endsWith(`/api/work/tickets/${t.key}`) && r.request().method() === "DELETE");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await del).status()).toBe(200);
  await expect(status).toContainText("Cancelled");
  d = (await detail(t.key)).ticket;
  expect(d.resolution).toBe("cancelled");
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await w.check();
});

test("the description editor formats text and makes @person and #ticket chips", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto(`/work/browse/${main.key}`);
  await section(page, /^Description/).getByRole("button", { name: "Add" }).click();
  const editor = section(page, /^Description/).getByRole("textbox", { name: "Text" });
  await expect(editor).toBeVisible();
  await expect(section(page, /^Description/).getByRole("toolbar", { name: "Formatting" })).toBeVisible();
  await editor.click();

  // bold from the toolbar
  const bold = section(page, /^Description/).getByRole("button", { name: "Bold (Ctrl+B)" });
  await bold.click();
  // the button shows it is on before anything is typed
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("Important");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.type(" context. Depends on ");

  // # opens the ticket list; picking one makes a chip
  await page.keyboard.type(`#${other.key}`);
  const tickets = page.getByRole("listbox", { name: "Tickets" });
  await expect(tickets.getByRole("option", { name: new RegExp(other.key) })).toBeVisible();
  await tickets.getByRole("option", { name: new RegExp(other.key) }).click();
  await expect(editor.locator(".work-chip-ticket")).toHaveText(other.key);

  // @ opens the people list; Enter picks
  await page.keyboard.type("ask @Phi");
  const people = page.getByRole("listbox", { name: "People" });
  await expect(people.getByRole("option", { name: /Phil/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".work-chip-user")).toHaveText("@Phil");

  // a key typed out and followed by a space becomes a chip too
  await page.keyboard.type(`and see ${epic.key} for the plan`);
  await expect(editor.locator(".work-chip-ticket")).toHaveCount(2);

  const p = patchOf(page, main.key);
  await section(page, /^Description/).getByRole("button", { name: "Save" }).click();
  expect((await p).status()).toBe(200);

  // read-only rendering: bold text, a chip that links to the ticket, the mention
  const shown = section(page, /^Description/).locator(".work-doc-static");
  await expect(shown.locator("strong")).toHaveText("Important");
  await expect(shown.locator("a.work-chip-ticket").first()).toHaveAttribute("href", `/work/browse/${other.key}`);
  await expect(shown.locator(".work-chip-user")).toHaveText("@Phil");

  const d = (await detail(main.key)).ticket;
  const doc = JSON.stringify(d.description_doc);
  expect(doc).toContain('"type":"mention"');
  expect(doc).toContain(`"id":"${PHIL.id}"`);
  expect(doc).toContain(`"key":"${other.key}"`);
  expect(doc).toContain(`"key":"${epic.key}"`);
  // the plain text the rest of the app reads
  expect(d.description).toContain("Important context. Depends on");
  expect(d.description).toContain(other.key);
  expect(d.description).toContain("@Phil");

  // the chip is a link
  await shown.locator("a.work-chip-ticket").first().click();
  await expect(page).toHaveURL(new RegExp(`/work/browse/${other.key}$`));

  // editing again starts from what was saved; Cancel leaves it alone
  await page.goto(`/work/browse/${main.key}`);
  await section(page, /^Description/).getByRole("button", { name: "Edit" }).click();
  await expect(editor.locator(".work-chip-ticket")).toHaveCount(2);
  await editor.click();
  await page.keyboard.type(" THROWN AWAY");
  await section(page, /^Description/).getByRole("button", { name: "Cancel" }).click();
  await expect(shown).not.toContainText("THROWN AWAY");
  expect((await detail(main.key)).ticket.description).not.toContain("THROWN AWAY");
  await w.check();
});

test("comments are posted, with Ctrl+Enter too, and deleted", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  page.on("dialog", (d) => void d.accept());
  await page.goto(`/work/browse/${other.key}`);
  const comments = section(page, /^Comments/);
  const post = comments.getByRole("button", { name: "Comment", exact: true });
  await expect(post).toBeDisabled();
  const editor = comments.getByRole("textbox", { name: "Text" });
  await editor.click();
  await page.keyboard.type(`First comment, see ${main.key} `);
  await expect(editor.locator(".work-chip-ticket")).toHaveText(main.key);
  let sent = page.waitForResponse((r) => r.url().endsWith(`/api/work/tickets/${other.key}/comments`) && r.request().method() === "POST");
  await post.click();
  expect((await sent).status()).toBe(201);
  const first = comments.locator("li").filter({ hasText: "First comment, see" });
  await expect(first).toBeVisible();
  await expect(first).toContainText("Phil");
  await expect(first.locator("a.work-chip-ticket")).toHaveAttribute("href", `/work/browse/${main.key}`);
  await expect(comments.getByRole("heading")).toContainText("1");
  // the box is empty again
  await expect(editor).toHaveText("");

  await editor.click();
  await page.keyboard.type("Second comment");
  sent = page.waitForResponse((r) => r.url().endsWith(`/api/work/tickets/${other.key}/comments`) && r.request().method() === "POST");
  await page.keyboard.press("Control+Enter");
  expect((await sent).status()).toBe(201);
  await expect(comments.locator("li").filter({ hasText: "Second comment" })).toBeVisible();

  // format first, then type, in an empty box: what the button made is what gets typed into
  await editor.click();
  await comments.getByRole("button", { name: "Checklist" }).click();
  await page.keyboard.type("Buy string");
  await expect(editor.locator('ul[data-type="taskList"]')).toContainText("Buy string");
  sent = page.waitForResponse((r) => r.url().endsWith(`/api/work/tickets/${other.key}/comments`) && r.request().method() === "POST");
  await post.click();
  expect((await sent).status()).toBe(201);
  await expect(comments.locator('li ul[data-type="taskList"]')).toContainText("Buy string");
  await expect(comments.getByRole("heading")).toContainText("3");

  await first.getByRole("button", { name: "Delete" }).click();
  await expect(first).toHaveCount(0);
  expect((await detail(other.key)).comments.map((c) => c.body)).toEqual(["Second comment", "[ ] Buy string"]);
  await w.check();
});

test("watching, sub-tasks and links", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto(`/work/browse/${other.key}`);
  // whoever makes a ticket watches it
  const watching = page.getByRole("button", { name: "Watching" });
  await expect(watching).toBeVisible();
  await watching.click();
  await expect(page.getByRole("button", { name: "Watch", exact: true })).toBeVisible();
  expect((await detail(other.key)).watching).toBe(false);
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(watching).toBeVisible();

  // a sub-task from the one-line box
  const subs = section(page, /^Sub-tasks/);
  await subs.getByLabel("New ticket title").fill(`${TAG} sub one`);
  await subs.getByLabel("New ticket title").press("Enter");
  await expect(subs.getByRole("link", { name: `${TAG} sub one` })).toBeVisible();
  // and one from the dialog
  await page.getByRole("button", { name: "Sub-task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `New sub-task of ${other.key}` });
  await dialog.getByLabel("Title").fill(`${TAG} sub two`);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  const children = (await detail(other.key)).children;
  expect(children.map((c) => c.title).sort()).toEqual([`${TAG} sub one`, `${TAG} sub two`]);
  await page.reload();
  await expect(subs.getByRole("link", { name: `${TAG} sub two` })).toBeVisible();

  // the sub-task's own page points back at its parent and offers no sub-tasks of its own
  await subs.getByRole("link", { name: `${TAG} sub one` }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} sub one`);
  await expect(page.getByText("Sub-task of")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: other.key })).toBeVisible();
  // (the Type picker also reads "Sub-task"; the action button is the one that is not a picker)
  await expect(page.locator("main button:not([aria-haspopup])").filter({ hasText: /^s*Sub-tasks*$/ })).toHaveCount(0);

  // a link is added and removed
  await page.goto(`/work/browse/${other.key}`);
  const links = section(page, /^Links/);
  await expect(links.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await links.getByLabel("Link address").fill("https://example.com/evidence");
  await links.getByLabel("Link label").fill("Evidence");
  await links.getByRole("button", { name: "Add", exact: true }).click();
  await expect(links.getByRole("link", { name: "Evidence" })).toHaveAttribute("href", "https://example.com/evidence");
  await links.getByRole("button", { name: "Remove link" }).click();
  await expect(links.getByRole("link", { name: "Evidence" })).toHaveCount(0);
  await w.check();
});

test("an opened issue is listed under Recently viewed on Your work", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  const saved = page.waitForResponse((r) => r.url().includes("/api/settings/ui-prefs") && r.request().method() === "PATCH");
  await page.goto(`/work/browse/${epic.key}`);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`${TAG} epic`);
  expect((await saved).status()).toBe(200);
  await page.goto("/work");
  const recent = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Recently viewed/ }) });
  await expect(recent.getByRole("link", { name: new RegExp(epic.key) })).toBeVisible();
  await w.check();
});
