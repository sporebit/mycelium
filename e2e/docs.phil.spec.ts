/**
 * Docs, as Phil (MYC-174): doc spaces, the page tree, creating and editing
 * a page in the rich editor, versions with diff and restore, sibling
 * reorder, move, ticket links, restrictions, templates and search.
 *
 * One doc space is made through the dialog; at the end its pages are
 * hard-deleted and the doc space with them. Syncing the repository's page
 * templates leaves those four templates in Phil's space (they cannot be
 * deleted: the next sync would bring them back).
 */
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { apiAs, expect, get, keyFor, newRunId, patientHook, PHIL, send, tag, test, uuid, watch, writeBudget } from "./work-kit.ts";

const RUN = newRunId();
const TAG = tag(RUN);
const KEY = keyFor(RUN, "D");
/** The doc space the first check makes through the dialog. */
const KEY_UI = keyFor(RUN, "U");

type Node = { id: string; title: string; restricted: boolean; children: Node[] };
type SpacePayload = { space: { id: string; key: string; home_page_id: string | null }; tree: Node[] };
type DocPage = { id: string; title: string; version: number; body_text: string; parent_id: string | null; restricted: boolean; links: { tickets: Array<{ key: string; source: string }> } };
type Version = { version: number; title: string };

let api: APIRequestContext;
let ticket: { id: string; key: string };

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...lines: string[]) => ({ type: "doc", content: lines.map(para) });
const spacePayload = (archived = false) => get<SpacePayload>(api, `/api/work/docs/spaces/${KEY}${archived ? "?archived=1" : ""}`);
const pageOf = async (id: string) => (await get<{ page: DocPage }>(api, `/api/work/docs/pages/${id}`)).page;
async function newPage(body: Record<string, unknown>): Promise<DocPage> {
  return (await send<{ page: DocPage }>(api, "POST", "/api/work/docs/pages", { doc_space: KEY, ...body })).page;
}
const tree = (page: Page): Locator => page.getByRole("navigation", { name: "Pages" });
const treeTitles = (page: Page) => tree(page).getByRole("link").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
const article = (page: Page): Locator => page.locator("article");
/** The page's own title: the first heading of the article (a linked-tickets list below it has a heading too). */
const title = (page: Page): Locator => page.locator("article").getByRole("heading", { level: 2 }).first();
async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: "Page menu" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: item }).click();
}

test.beforeEach(async () => {
  // enough writes in hand for one check
  await writeBudget(PHIL, 40);
});

test.beforeAll(async () => {
  patientHook();
  await writeBudget(PHIL, 100);
  api = await apiAs(PHIL);
  ticket = (await send<{ ticket: { id: string; key: string } }>(api, "POST", "/api/work/tickets", { title: `${TAG} doc ticket` })).ticket;
  // the doc space the checks work in; making one through the dialog is the first check's own business
  await send(api, "POST", "/api/work/docs/spaces", { key: KEY, name: `${TAG} space` });
});

test.afterAll(async () => {
  patientHook();
  const templates = await get<{ templates: Array<{ slug: string; name: string }> }>(api, "/api/work/docs/templates");
  for (const t of templates.templates) if (t.name.startsWith(TAG)) await api.delete(`/api/work/docs/templates/${t.slug}`);
  for (const key of [KEY, KEY_UI]) {
    const res = await api.get(`/api/work/docs/spaces/${key}?archived=1`);
    if (!res.ok()) continue;
    const payload = (await res.json()) as SpacePayload;
    const all: Node[] = [];
    const walk = (nodes: Node[]) => nodes.forEach((n) => { walk(n.children); all.push(n); });
    walk(payload.tree);
    await api.patch(`/api/work/docs/spaces/${key}`, { data: { home_page_id: null } });
    for (const n of all) await api.delete(`/api/work/docs/pages/${n.id}?hard=1`);
    await api.delete(`/api/work/docs/spaces/${key}`);
  }
  await api.delete(`/api/work/tickets/${ticket.id}?hard=1`);
  await api.dispose();
});

test("Docs home lists the doc spaces, and a new one opens on its home page", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Docs", exact: true })).toBeVisible();
  // more than one when the person belongs to several spaces: each has a doc space called Home
  await expect(page.getByRole("link", { name: /^Home\s*HOME/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "New doc space" }).click();
  const dialog = page.getByRole("dialog", { name: "New doc space" });
  await expect(dialog.getByRole("button", { name: "Create", exact: true })).toBeDisabled();
  await dialog.getByLabel("Key").fill(KEY_UI.toLowerCase());
  await expect(dialog.getByLabel("Key")).toHaveValue(KEY_UI);
  await dialog.getByLabel("Name").fill(`${TAG} made here`);
  await dialog.getByLabel("Description").fill("Made by the end-to-end check.");
  const made = page.waitForResponse((r) => r.url().endsWith("/api/work/docs/spaces") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  expect((await made).status()).toBe(201);

  await expect(page).toHaveURL(new RegExp(`/docs/${KEY_UI}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`${TAG} made here`);
  await expect(page.getByText("Made by the end-to-end check.")).toBeVisible();
  // its home page is made with it, titled as the doc space is named
  await expect(title(page)).toContainText(`${TAG} made here`);
  await expect(article(page).getByText("Home", { exact: true })).toBeVisible();
  await expect(article(page).getByText("This page is empty.")).toBeVisible();
  expect(await treeTitles(page)).toEqual([`${TAG} made here`]);

  // listed on Docs home with its page count; a key already taken is refused
  await page.goto("/docs");
  await expect(page.getByRole("link", { name: new RegExp(`${TAG} made here`) })).toContainText("1 page");
  const clash = await api.post("/api/work/docs/spaces", { data: { key: KEY_UI, name: `${TAG} clash` } });
  expect(clash.status()).toBeGreaterThanOrEqual(400);
  expect(clash.status()).toBeLessThan(500);
  await w.check();
});

test("a page is made from the tree and edited in the rich editor; each save is a version", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  await page.goto(`/docs/${KEY}`);
  await tree(page).getByRole("button", { name: "Top-level page" }).click();
  const dialog = page.getByRole("dialog", { name: "New page" });
  await dialog.getByLabel("Title").fill(`${TAG} page one`);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/docs/${KEY}/[0-9a-f-]{36}$`));
  const pageOne = page.url().split("/").pop()!;
  await expect(title(page)).toHaveText(`${TAG} page one`);
  await expect(article(page).getByRole("link", { name: "v1" })).toBeVisible();
  await expect(tree(page).getByRole("link", { name: `${TAG} page one` })).toHaveAttribute("aria-current", "page");

  // first edit: title and body, with a heading, a ticket chip and a mention
  await article(page).getByRole("button", { name: "Edit", exact: true }).click();
  await article(page).getByLabel("Title").fill(`${TAG} page one, titled`);
  const editor = article(page).getByRole("textbox", { name: "Text" });
  await editor.click();
  await article(page).getByRole("button", { name: "Heading", exact: true }).click();
  await page.keyboard.type("Purpose");
  await page.keyboard.press("Enter");
  await page.keyboard.type(`First line ${RUN}. Tracked in ${ticket.key} `);
  await expect(editor.locator(".work-chip-ticket")).toHaveText(ticket.key);
  await page.keyboard.type("by @Phi");
  await expect(page.getByRole("listbox", { name: "People" }).getByRole("option", { name: /Phil/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator(".work-chip-user")).toHaveText("@Phil");
  let saved = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${pageOne}`) && r.request().method() === "PATCH");
  await article(page).getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(title(page)).toHaveText(`${TAG} page one, titled`);
  await expect(article(page).getByRole("link", { name: "v2", exact: true })).toBeVisible();
  const body = article(page).locator(".work-doc-static");
  await expect(body.locator("h3")).toHaveText("Purpose");
  await expect(body).toContainText(`First line ${RUN}.`);
  await expect(body.locator("a.work-chip-ticket")).toHaveAttribute("href", `/work/browse/${ticket.key}`);
  // the tree follows the new title
  await expect(tree(page).getByRole("link", { name: `${TAG} page one, titled` })).toBeVisible();

  // the key in the body became a link to the ticket, marked as coming from a mention
  const tickets = article(page).locator("section").filter({ has: page.getByRole("heading", { name: /^Tickets/ }) });
  await expect(tickets.getByRole("link", { name: `${TAG} doc ticket` })).toBeVisible();
  await expect(tickets).toContainText("mention");

  // second edit: one more line; Cancel on a third throws its text away
  await article(page).getByRole("button", { name: "Edit", exact: true }).click();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(`Second line ${RUN}.`);
  saved = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${pageOne}`) && r.request().method() === "PATCH");
  await page.keyboard.press("Control+Enter");
  expect((await saved).status()).toBe(200);
  await expect(article(page).getByRole("link", { name: "v3" })).toBeVisible();
  await expect(body).toContainText(`Second line ${RUN}.`);

  await article(page).getByRole("button", { name: "Edit", exact: true }).click();
  await editor.click();
  await page.keyboard.type(" THROWN AWAY");
  await article(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(body).not.toContainText("THROWN AWAY");
  const stored = await pageOf(pageOne);
  expect(stored.version).toBe(3);
  expect(stored.body_text).not.toContain("THROWN AWAY");
  expect(stored.body_text).toContain(`Second line ${RUN}.`);

  // the ticket's own page lists this page
  await page.goto(`/work/browse/${ticket.key}`);
  const pages = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Pages/ }) });
  await expect(pages.getByRole("link", { name: `${TAG} page one, titled` })).toHaveAttribute("href", `/docs/${KEY}/${pageOne}`);
  await w.check();
});

test("history lists the versions, diffs any two and restores an old one as a new version", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  page.on("dialog", (d) => void d.accept());
  // three versions: made, then titled and written, then one more line
  const heading = { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Purpose" }] };
  const pageOne = (await newPage({ title: `${TAG} history page` })).id;
  await send(api, "PATCH", `/api/work/docs/pages/${pageOne}`, { title: `${TAG} history page, titled`, body: { type: "doc", content: [heading, para(`First line ${RUN}.`)] } });
  await send(api, "PATCH", `/api/work/docs/pages/${pageOne}`, { body: { type: "doc", content: [heading, para(`First line ${RUN}.`), para(`Second line ${RUN}.`)] } });
  await page.goto(`/docs/${KEY}/${pageOne}`);
  await article(page).getByRole("link", { name: /^v\d+$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/docs/${KEY}/${pageOne}/history$`));
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByText("3 versions · current v3")).toBeVisible();
  const versions = page.locator("main aside li");
  await expect(versions).toHaveCount(3);
  const version = (n: number) => versions.filter({ has: page.locator("span", { hasText: new RegExp(`^v${n}$`) }) });
  await expect(versions.first()).toContainText("v3");
  await expect(versions.first()).toContainText("Phil");
  // the current version has no Restore
  await expect(versions.first().getByRole("button", { name: "Restore" })).toHaveCount(0);

  // by default the last change: v2 → v3 added the second line
  await expect(page.getByRole("heading", { name: "v2 → v3" })).toBeVisible();
  const diff = page.locator("pre");
  const added = diff.locator("div").filter({ hasText: `Second line ${RUN}.` });
  await expect(added).toContainText("+");
  await expect(diff.locator("div").filter({ hasText: `First line ${RUN}.` })).not.toContainText("+");

  // any two: v1 → v3 also shows the title change
  await version(1).getByRole("button", { name: "from" }).click();
  await expect(page.getByRole("heading", { name: "v1 → v3" })).toBeVisible();
  await expect(page.getByText(/^Title:/)).toContainText(`${TAG} history page, titled`);
  await expect(diff.locator("div").filter({ hasText: "Purpose" })).toContainText("+");
  // the same version on both sides is not a diff
  await version(1).getByRole("button", { name: "to", exact: true }).click();
  await expect(page.getByText("Choose a different “from” and “to”.")).toBeVisible();

  // restore v2: the page reads as it did, as version 4; nothing is rewritten
  const restored = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${pageOne}/versions`) && r.request().method() === "POST");
  await version(2).getByRole("button", { name: "Restore" }).click();
  expect((await restored).status()).toBeLessThan(300);
  await expect(page).toHaveURL(new RegExp(`/docs/${KEY}/${pageOne}$`));
  await expect(article(page).getByRole("link", { name: "v4" })).toBeVisible();
  await expect(article(page).locator(".work-doc-static")).toContainText(`First line ${RUN}.`);
  await expect(article(page).locator(".work-doc-static")).not.toContainText(`Second line ${RUN}.`);
  const list = await get<{ versions: Version[]; current: number }>(api, `/api/work/docs/pages/${pageOne}/versions`);
  expect(list.current).toBe(4);
  expect(list.versions.map((v) => v.version)).toEqual([4, 3, 2, 1]);
  const v3 = await get<{ version: { body_text: string } }>(api, `/api/work/docs/pages/${pageOne}/versions?version=3`);
  expect(JSON.stringify(v3)).toContain(`Second line ${RUN}.`);
  await w.check();
});

test("the tree: children open their branch, siblings reorder one place at a time, a page moves under another", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  const parent = await newPage({ title: `${TAG} parent` });
  const a = await newPage({ title: `${TAG} child A`, parent_id: parent.id });
  const b = await newPage({ title: `${TAG} child B`, parent_id: parent.id });
  const c = await newPage({ title: `${TAG} child C`, parent_id: parent.id });
  const kids = async () => {
    const find = (nodes: Node[]): Node | null => nodes.reduce<Node | null>((hit, n) => hit ?? (n.id === parent.id ? n : find(n.children)), null);
    return (find((await spacePayload()).tree)?.children ?? []).map((n) => n.title.replace(`${TAG} child `, ""));
  };
  expect(await kids()).toEqual(["A", "B", "C"]);

  // opening a child opens the branch that holds it
  await page.goto(`/docs/${KEY}/${a.id}`);
  const nav = tree(page);
  await expect(nav.getByRole("link", { name: `${TAG} child A` })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: `${TAG} child C` })).toBeVisible();
  await expect(article(page).getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: `${TAG} parent` })).toBeVisible();

  // leaving a page in the middle of an edit drops the draft: the next page opens to read, under its own title
  await article(page).getByRole("button", { name: "Edit", exact: true }).click();
  await article(page).getByLabel("Title").fill(`${TAG} abandoned title`);
  await nav.getByRole("link", { name: `${TAG} child B` }).click();
  await expect(page).toHaveURL(new RegExp(`/docs/${KEY}/${b.id}$`));
  await expect(title(page)).toHaveText(`${TAG} child B`);
  await expect(article(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect((await pageOf(a.id)).title).toBe(`${TAG} child A`);
  expect((await pageOf(b.id)).title).toBe(`${TAG} child B`);
  await nav.getByRole("link", { name: `${TAG} child A` }).click();
  await expect(title(page)).toHaveText(`${TAG} child A`);

  // A is first: it cannot go up; down one place puts it between B and C
  await expect(nav.getByRole("button", { name: "Move up" })).toBeDisabled();
  let moved = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${a.id}`) && r.request().method() === "PATCH");
  await nav.getByRole("button", { name: "Move down" }).click();
  expect((await moved).status()).toBe(200);
  await expect.poll(kids).toEqual(["B", "A", "C"]);
  await expect.poll(async () => (await treeTitles(page)).filter((t) => t.includes("child")).map((t) => t.slice(-1))).toEqual(["B", "A", "C"]);
  moved = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${a.id}`) && r.request().method() === "PATCH");
  await nav.getByRole("button", { name: "Move down" }).click();
  expect((await moved).status()).toBe(200);
  await expect.poll(kids).toEqual(["B", "C", "A"]);
  await expect(nav.getByRole("button", { name: "Move down" })).toBeDisabled();

  // collapse hides the children, expand shows them
  await nav.getByRole("button", { name: "Collapse" }).click();
  await expect(nav.getByRole("link", { name: `${TAG} child B` })).toHaveCount(0);
  await nav.getByRole("button", { name: "Expand" }).click();
  await expect(nav.getByRole("link", { name: `${TAG} child B` })).toBeVisible();

  // "New page under this" from the page's menu
  await menu(page, "New page under this");
  const dialog = page.getByRole("dialog", { name: "New page under this one" });
  await dialog.getByLabel("Title").fill(`${TAG} grandchild`);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(title(page)).toHaveText(`${TAG} grandchild`);
  const crumbs = article(page).getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: `${TAG} parent` })).toBeVisible();
  await expect(crumbs.getByRole("link", { name: `${TAG} child A` })).toBeVisible();

  // move C under B from C's own page
  await page.goto(`/docs/${KEY}/${c.id}`);
  await menu(page, "Move…");
  const move = page.getByRole("dialog", { name: "Move page" });
  await move.getByRole("button").filter({ hasText: `${TAG} parent` }).click();
  await move.getByRole("listbox", { name: "Parent" }).getByRole("option", { name: new RegExp(`${TAG} child B`) }).click();
  const patched = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${c.id}`) && r.request().method() === "PATCH");
  await move.getByRole("button", { name: "Move", exact: true }).click();
  expect((await patched).status()).toBe(200);
  await expect(move).toBeHidden();
  expect((await pageOf(c.id)).parent_id).toBe(b.id);
  await expect(article(page).getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: `${TAG} child B` })).toBeVisible();
  // a page cannot be moved under its own descendant
  const loop = await api.patch(`/api/work/docs/pages/${b.id}`, { data: { parent_id: c.id } });
  expect(loop.status()).toBeGreaterThanOrEqual(400);
  expect(loop.status()).toBeLessThan(500);
  await w.check();
});

test("the page menu links a ticket by hand, makes a page the home page and archives one", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  page.on("dialog", (d) => void d.accept());
  const p = await newPage({ title: `${TAG} menu page`, body: doc(`Menu body ${RUN}`) });
  await page.goto(`/docs/${KEY}/${p.id}`);

  // link a ticket: unknown keys are refused, a real one is listed as manual
  await menu(page, "Link a ticket…");
  const link = page.getByRole("dialog", { name: "Link a ticket" });
  await link.getByLabel("Ticket key").fill("zzqqx-99999");
  await expect(link.getByLabel("Ticket key")).toHaveValue("ZZQQX-99999");
  const refused = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${p.id}/links`) && r.request().method() === "POST");
  await link.getByRole("button", { name: "Link", exact: true }).click();
  expect((await refused).status()).toBe(404);
  await expect(link).toBeVisible();
  await link.getByLabel("Ticket key").fill(ticket.key);
  await link.getByRole("button", { name: "Link", exact: true }).click();
  await expect(link).toBeHidden();
  const tickets = article(page).locator("section").filter({ has: page.getByRole("heading", { name: /^Tickets/ }) });
  await expect(tickets.getByRole("link", { name: `${TAG} doc ticket` })).toBeVisible();
  await expect(tickets).toContainText("manual");
  await tickets.getByRole("button", { name: "Unlink" }).click();
  await expect(tickets).toHaveCount(0);
  expect((await pageOf(p.id)).links.tickets).toEqual([]);

  // home page
  await menu(page, "Make this the home page");
  await expect(article(page).getByText("Home", { exact: true })).toBeVisible();
  await page.goto(`/docs/${KEY}`);
  await expect(title(page)).toContainText(`${TAG} menu page`);
  // the menu no longer offers it for this page
  await page.getByRole("button", { name: "Page menu" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "Make this the home page" })).toHaveCount(0);
  // Escape closes the menu, and so does a click anywhere else
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Page menu" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await article(page).locator(".work-doc-static").click();
  await expect(page.getByRole("menu")).toHaveCount(0);

  // archive another page: it leaves the tree and the doc space opens on its home
  const gone = await newPage({ title: `${TAG} to archive` });
  await page.goto(`/docs/${KEY}/${gone.id}`);
  await expect(tree(page).getByRole("link", { name: `${TAG} to archive` })).toBeVisible();
  const archived = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${gone.id}`) && r.request().method() === "DELETE");
  await menu(page, "Archive");
  expect((await archived).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/docs/${KEY}$`));
  await expect(tree(page).getByRole("link", { name: `${TAG} to archive` })).toHaveCount(0);
  const flat = JSON.stringify((await spacePayload()).tree);
  expect(flat).not.toContain(gone.id);
  expect(JSON.stringify((await spacePayload(true)).tree)).toContain(gone.id);
  await w.check();
});

test("who can see a page: the dialog for a space of one, and the lock once a page is restricted", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  const p = await newPage({ title: `${TAG} private page`, body: doc(`Private body ${RUN}`) });
  await page.goto(`/docs/${KEY}/${p.id}`);
  await menu(page, "Who can see this…");
  const dialog = page.getByRole("dialog", { name: "Who can see this page" });
  await expect(dialog.getByText("Nobody listed means everyone in the space can see it.")).toBeVisible();
  // Who the dialog lists is whoever Work calls "people" for Phil. On his own that is nobody; once another
  // suite has put him on a team, it is that team's members (see the finding on loadPeople in the report).
  const others = (await get<{ me: { id: string }; people: Array<{ id: string; name: string }> }>(api, "/api/work/meta")).people.filter((x) => x.id !== PHIL.id);
  if (others.length === 0) {
    await expect(dialog.getByText("You are the only member of this space.")).toBeVisible();
    const put = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${p.id}/restrictions`) && r.request().method() === "PUT");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await put).status()).toBe(200);
    await expect(dialog).toBeHidden();
    expect((await pageOf(p.id)).restricted).toBe(false);
  } else {
    testInfo.annotations.push({ type: "note", description: `the dialog listed ${others.length} other people, so the listed-person path was driven` });
    // tick one person, let them edit, save: the page is restricted to its creator and that person
    const row = dialog.locator("li").filter({ hasText: others[0].name });
    await row.getByRole("checkbox").first().check();
    await row.getByLabel("edit", { exact: true }).check();
    let put = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${p.id}/restrictions`) && r.request().method() === "PUT");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await put).status()).toBe(200);
    await expect(dialog).toBeHidden();
    await expect(title(page).getByLabel("Restricted")).toBeVisible();
    const kept = await get<{ restricted: boolean; people: Array<{ id: string; can_edit: boolean }> }>(api, `/api/work/docs/pages/${p.id}/restrictions`);
    expect(kept.restricted).toBe(true);
    expect(kept.people).toEqual([expect.objectContaining({ id: others[0].id, can_edit: true })]);
    // untick them: nobody listed, so the page opens up again
    await menu(page, "Who can see this…");
    await expect(row.getByRole("checkbox").first()).toBeChecked();
    await row.getByRole("checkbox").first().uncheck();
    put = page.waitForResponse((r) => r.url().endsWith(`/api/work/docs/pages/${p.id}/restrictions`) && r.request().method() === "PUT");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await put).status()).toBe(200);
    await expect(dialog).toBeHidden();
    expect((await pageOf(p.id)).restricted).toBe(false);
  }

  // restricted (set over the API: with nobody else in the space the dialog has no one to list),
  // the page carries its lock in the tree and the title, and its creator still reads and edits it
  await send(api, "PUT", `/api/work/docs/pages/${p.id}/restrictions`, { restricted: true, people: [] });
  await page.reload();
  await expect(title(page).getByLabel("Restricted")).toBeVisible();
  await expect(tree(page).getByRole("link", { name: new RegExp(`${TAG} private page`) }).getByLabel("Restricted")).toBeVisible();
  await expect(article(page).locator(".work-doc-static")).toContainText(`Private body ${RUN}`);
  await expect(article(page).getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  // somebody who is not in the space cannot be listed
  const stranger = await api.put(`/api/work/docs/pages/${p.id}/restrictions`, { data: { restricted: true, people: [{ id: uuid(), can_edit: false }] } });
  expect(stranger.status()).toBe(400);
  await send(api, "PUT", `/api/work/docs/pages/${p.id}/restrictions`, { restricted: false, people: [] });
  await page.reload();
  await expect(title(page).getByLabel("Restricted")).toHaveCount(0);
  await w.check();
});

test("templates: the repository's are synced, one fills a new page, and one saved from a page's menu is listed and deleted", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  // the template's name is asked for in a prompt; the delete is confirmed
  page.on("dialog", (d) => void d.accept(d.type() === "prompt" ? `${TAG} template` : undefined));
  await page.goto("/docs/templates");
  await expect(page.getByRole("heading", { name: "Page templates" })).toBeVisible();
  const synced = page.waitForResponse((r) => r.url().includes("/api/work/docs/templates?sync=1"));
  await page.getByRole("button", { name: "Sync from the repo" }).click();
  expect((await synced).status()).toBe(200);
  for (const name of ["Decision record", "How-to", "Meeting notes", "Project brief"]) {
    await expect(page.locator("li").filter({ hasText: name }).filter({ hasText: "repository" }).first()).toBeVisible();
  }
  // a repository template is changed in the repository: no delete here
  const meeting = page.locator("li").filter({ hasText: "meeting-notes" });
  await expect(meeting.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  // opening one shows what it would put on a page
  await meeting.getByRole("button").first().click();
  await expect(meeting.locator(".work-doc-static")).not.toBeEmpty();

  // a new page from a template takes the template's title and body
  await page.goto(`/docs/${KEY}`);
  await tree(page).getByRole("button", { name: "Top-level page" }).click();
  const dialog = page.getByRole("dialog", { name: "New page" });
  await dialog.getByRole("button", { name: "Blank page" }).click();
  await dialog.getByRole("listbox", { name: "Template" }).getByRole("option", { name: /^Meeting notes/ }).click();
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/docs/${KEY}/[0-9a-f-]{36}$`));
  const made = await pageOf(page.url().split("/").pop()!);
  const template = (await get<{ templates: Array<{ slug: string; title: string | null; name: string }> }>(api, "/api/work/docs/templates")).templates.find((t) => t.slug === "meeting-notes")!;
  expect(made.title).toBe(template.title ?? template.name);
  expect(made.body_text.trim().length).toBeGreaterThan(0);
  await expect(article(page).locator(".work-doc-static")).not.toBeEmpty();

  // "Save as a template…" in a page's menu: listed as made here, offered for new pages, and can be deleted
  const source = await newPage({ title: `${TAG} template source`, body: doc(`Template body ${RUN}`) });
  await page.goto(`/docs/${KEY}/${source.id}`);
  const savedAs = page.waitForResponse((r) => r.url().endsWith("/api/work/docs/templates") && r.request().method() === "POST");
  await menu(page, "Save as a template…");
  expect((await savedAs).status()).toBe(201);
  await page.goto("/docs/templates");
  const mine = page.locator("li").filter({ hasText: `${TAG} template` });
  await expect(mine).toContainText("made here");
  await mine.getByRole("button").first().click();
  await expect(mine.locator(".work-doc-static")).toContainText(`Template body ${RUN}`);
  await mine.getByRole("button", { name: `Delete ${TAG} template` }).click();
  await expect(mine).toHaveCount(0);
  await w.check();
});

test("search finds a page by its text and says when nothing matches", async ({ page }, testInfo) => {
  const w = watch(page, testInfo);
  const p = await newPage({ title: `${TAG} searchable`, body: doc(`needle-${RUN} in a haystack`) });
  await page.goto("/docs");
  await page.getByLabel("Search pages").fill(`needle-${RUN}`);
  const results = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Results/ }) });
  const hit = results.getByRole("link", { name: new RegExp(`${TAG} searchable`) });
  await expect(hit).toBeVisible();
  await expect(hit).toContainText(`needle-${RUN}`);
  await expect(hit).toContainText(KEY);
  await hit.click();
  await expect(page).toHaveURL(new RegExp(`/docs/${KEY}/${p.id}$`));

  await page.goto("/docs");
  await page.getByLabel("Search pages").fill(`nothing-${RUN}-has-this`);
  await expect(page.getByText(`No page mentions “nothing-${RUN}-has-this”.`)).toBeVisible();
  await w.check();
});

test("a doc space or page that does not exist says so", async ({ page }) => {
  await page.goto("/docs/ZZQQX");
  await expect(page.getByRole("alert").filter({ hasText: 'No doc space "ZZQQX".' })).toBeVisible();
  await page.goto(`/docs/${KEY}/${uuid()}`);
  await expect(page.getByRole("alert").filter({ hasText: "No such page, or it is restricted." })).toBeVisible();
});
