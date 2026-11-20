/**
 * The new shell and Specimen plate (claude/ui-direction.md), as Tess, on a
 * desktop-sized window: the switch in Settings, the top menu bar and its
 * dropdowns, Home as the plate fed by her real day, Done colouring a
 * specimen in, and the phone keeping the single next-thing card.
 *
 * The shell is a per-person setting. Every test here sets it to "new" and
 * the file puts it back to "classic" at the end, because Tess is shared
 * with every other suite.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { MENU_GROUPS } from "../lib/home/menu.ts";
import { TESS } from "./support/users.ts";

const RUN = `E2E-home-${Date.now().toString(36)}`;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const made: string[] = [];
let api: APIRequestContext;

test.use({ viewport: { width: 1440, height: 960 } });

async function setShell(kind: "classic" | "new"): Promise<void> {
  const res = await api.patch("/api/settings/ui-prefs", { data: { shell: kind } });
  expect(res.status(), await res.text()).toBe(200);
}

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
});

test.beforeEach(async () => {
  localSql(`delete from public.day_plans where created_by = '${TESS.id}'`);
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")})`);
  made.length = 0;
  await setShell("new");
});

test.afterAll(async () => {
  await setShell("classic");
  localSql(`delete from public.day_plans where created_by = '${TESS.id}'`);
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")})`);
  await api.dispose();
});

async function ticket(title: string, fields: Record<string, unknown> = {}): Promise<string> {
  const res = await api.post("/api/tickets", { data: { title: `${RUN} ${title}`, category: "next", ...fields } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  const body = (await res.json()) as { ticket?: { id: string }; task?: { id: string } };
  const id = (body.ticket ?? body.task!).id;
  made.push(id);
  return id;
}

const category = (id: string) => localSql(`select s.category from public.tickets t join public.ticket_statuses s on s.id = t.status_id where t.id = '${id}'`)[0]?.[0] ?? null;

test("the top menu bar: every group, dropdowns that open and close, and no sidebar", async ({ page }) => {
  await page.goto("/work");
  const menu = page.getByTestId("top-menu");
  await expect(menu).toBeVisible();
  await expect(page.locator('div[data-shell="new"]')).toBeVisible();
  await expect(page.locator('div[data-shell="classic"]')).toHaveCount(0);
  for (const g of MENU_GROUPS) await expect(menu.getByRole(g.items.length === 1 ? "link" : "button", { name: g.label, exact: true })).toBeVisible();

  // A group with several places opens a dropdown listing them.
  const life = menu.getByRole("button", { name: "Life", exact: true });
  await life.click();
  await expect(life).toHaveAttribute("aria-expanded", "true");
  const dropdown = menu.getByRole("group", { name: "Life" });
  for (const name of ["Organisation", "Journal", "Places"]) await expect(dropdown.getByRole("link", { name, exact: true })).toBeVisible();

  // Escape closes it and gives focus back; a click outside closes it too.
  await page.keyboard.press("Escape");
  await expect(life).toHaveAttribute("aria-expanded", "false");
  await expect(life).toBeFocused();
  await life.click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(life).toHaveAttribute("aria-expanded", "false");

  // Choosing a place goes there, marks its group, and the dropdown is gone on arrival.
  await life.click();
  await dropdown.getByRole("link", { name: "Journal", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/journal");
  await expect(menu.getByRole("button", { name: "Life", exact: true })).toHaveAttribute("aria-expanded", "false");
  // Inner pages keep their sub-pages, as chips, now that there is no sidebar to hold them.
  await page.goto("/organisation/people");
  await expect(page.getByRole("navigation", { name: /pages$/ }).getByRole("link", { name: "People", exact: true })).toBeVisible();
});

test("Home is the Specimen plate: the win in the centre with its four notes, the rest as figures", async ({ page }) => {
  await ticket("reply about the boiler quote", { deadline_on: TODAY });
  await ticket("order the hinges", { scheduled_on: TODAY });
  await ticket("post the letter", { scheduled_on: TODAY });
  await page.goto("/");
  const plate = page.getByTestId("home-plate");
  await expect(plate).toBeVisible();
  await expect(plate.getByTestId("plate-title")).toContainText("reply about the boiler quote");
  await expect(plate.getByText("a. The day's win")).toBeVisible();
  await expect(plate.getByText(/^b\. First step:/)).toBeVisible();
  await expect(plate.getByText(/^c\. About \d+ min/)).toBeVisible();
  await expect(plate.getByText(/^d\. Grows under/)).toBeVisible();
  await expect(plate.getByTestId("specimen-main")).toHaveAttribute("data-done", "false");
  await expect(plate.getByTestId("plate-figure")).toHaveCount(2);
  await expect(plate.getByTestId("home-network")).toBeAttached();
  await expect(plate.getByTestId("plate-print")).toContainText("collected this week");
  // Nothing on the page counts what is undone or says a forbidden word.
  await expect(plate).not.toContainText(/overdue|missed|you still haven|don't forget/i);
});

test("Done colours the specimen in, finishes the ticket, and the spore print grows", async ({ page }) => {
  const win = await ticket("ring the plumber", { deadline_on: TODAY });
  await ticket("then this", { scheduled_on: TODAY });
  await page.goto("/");
  const plate = page.getByTestId("home-plate");
  const before = Number((await plate.getByTestId("plate-print").innerText()).match(/(\d+)\s+collected/)?.[1] ?? "0");
  await plate.getByRole("button", { name: "Done — colour it in" }).click();
  await expect(plate.getByTestId("plate-collected")).toContainText("The day is won.");
  await expect(plate.getByTestId("specimen-main")).toHaveAttribute("data-done", "true");
  await expect(plate.getByTestId("plate-print")).toContainText(`${before + 1} collected this week`);
  expect(category(win)).toBe("done");

  // Bring a figure to the centre: it becomes the annotated specimen, with its own buttons.
  await plate.getByTestId("plate-figure").filter({ hasText: "then this" }).click();
  await expect(plate.getByTestId("plate-title")).toContainText("then this");
  await expect(plate.getByText("a. If there is time")).toBeVisible();
  await plate.getByRole("button", { name: "Not now" }).click();
  // Saved (not merely hidden): the centre goes back to the finished win, and the set-aside one is nowhere.
  await expect(plate.getByTestId("plate-title")).toContainText("ring the plumber");
  await expect(plate.getByTestId("plate-figure").filter({ hasText: "then this" })).toHaveCount(0);

  // A reload draws the same day: the finished one is still coloured in.
  await page.reload();
  await expect(page.getByTestId("home-plate").getByTestId("specimen-main")).toHaveAttribute("data-done", "true");
});

test("a day with nothing lined up is a blank plate, not an error; forty items do not break it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("plate-empty")).toContainText("A blank plate.");

  // Today holds five at most however much is lined up, so the plate never has forty figures to draw.
  for (let n = 0; n < 12; n++) await ticket(`lined up ${n} with a really rather long title that goes on and on past any sensible width`, { scheduled_on: TODAY });
  localSql(`delete from public.day_plans where created_by = '${TESS.id}'`);
  await page.goto("/");
  const plate = page.getByTestId("home-plate");
  await expect(plate.getByTestId("plate-title")).toBeVisible();
  expect(await plate.getByTestId("plate-figure").count()).toBeLessThanOrEqual(8);
  // Long titles wrap inside the page: nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("on a phone, Home is the single next-thing card and the menu bar is not shown", async ({ browser }, info) => {
  await ticket("on the phone", { deadline_on: TODAY });
  const phone = await browser.newContext({ storageState: info.project.use.storageState as string, viewport: { width: 390, height: 844 }, baseURL: info.project.use.baseURL });
  const page = await phone.newPage();
  await page.goto("/");
  await expect(page.getByTestId("focus-card")).toBeVisible();
  await expect(page.getByTestId("focus-card").getByRole("heading", { level: 1 })).toContainText("on the phone");
  await expect(page.getByTestId("home-plate")).toBeHidden();
  await expect(page.getByTestId("top-menu")).toBeHidden();
  await phone.close();
});

test("with motion off the plate is drawn at once and holds still", async ({ page }) => {
  await ticket("still", { deadline_on: TODAY });
  expect((await api.patch("/api/settings/ui-prefs", { data: { motion: "off" } })).status()).toBe(200);
  try {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    const ink = page.getByTestId("specimen-main").locator(".plate-ink").first();
    await expect(ink).toHaveCSS("animation-name", "none");
    await expect(ink).toHaveCSS("stroke-dashoffset", "0px");
  } finally {
    await api.patch("/api/settings/ui-prefs", { data: { motion: "full" } });
  }
});

test("the switch: Classic brings the sidebar and the dashboard back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("top-menu")).toBeVisible();
  await setShell("classic");
  await page.goto("/");
  await expect(page.locator('div[data-shell="classic"]')).toBeVisible();
  await expect(page.getByTestId("top-menu")).toHaveCount(0);
  await expect(page.getByTestId("home-plate")).toHaveCount(0);
  await expect(page.getByTestId("loop-links")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-shell", "classic");
});
