/**
 * The Field shell (docs/run/2026-11-28/field-guide-design.md §6, §7), as
 * Tess, on a desktop-sized window: the top menu bar with Guides under Work,
 * the calm palette on every page through the token layer, Home as a tile
 * grid with today the largest tile, Done through the plate's own handler,
 * a phone kept on the single next-thing card, the theme toggle, and the
 * three choices in Settings.
 *
 * The shell is a per-person setting. Every test here sets it to "field" and
 * the file puts it (and the theme) back at the end, because Tess is shared
 * with every other suite.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { TESS } from "./support/users.ts";

const RUN = `E2E-field-${Date.now().toString(36)}`;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const made: string[] = [];
let api: APIRequestContext;
let themeBefore = "dark";

test.use({ viewport: { width: 1440, height: 960 } });

async function prefs(data: Record<string, unknown>): Promise<void> {
  const res = await api.patch("/api/settings/ui-prefs", { data });
  expect(res.status(), await res.text()).toBe(200);
}

function clean(): void {
  localSql(`delete from public.day_plans where created_by = '${TESS.id}'`);
  if (made.length) localSql(`delete from public.tickets where id in (${made.map((i) => `'${i}'`).join(",")})`);
  made.length = 0;
}

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
  const now = (await (await api.get("/api/settings/ui-prefs")).json()) as { theme?: string };
  themeBefore = now.theme ?? "dark";
});

test.beforeEach(async () => {
  clean();
  await prefs({ shell: "field", theme: "dark", motion: "full" });
});

test.afterAll(async () => {
  await prefs({ shell: "classic", theme: themeBefore, motion: "full" });
  clean();
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

/** The page's background against the Field paper token, both resolved by the browser. */
async function paperMatches(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.background = "var(--fg-paper)";
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return getComputedStyle(document.body).backgroundColor === want;
  });
}

async function lineUpThree(): Promise<string> {
  const ids = [await ticket("reply about the boiler quote", { deadline_on: TODAY }), await ticket("order the hinges", { scheduled_on: TODAY }), await ticket("post the letter", { scheduled_on: TODAY })];
  // Short estimates so the three fit any day's budget (lib/daily/propose.ts), as home.tess.spec.ts does.
  localSql(`update public.tickets set time_estimate_min = 20 where id in (${ids.map((i) => `'${i}'`).join(",")})`);
  return ids[0];
}

test("the top menu bar is the frame, Guides is under Work, and an inner page takes the Field palette", async ({ page }) => {
  await page.goto("/work");
  await expect(page.locator("html")).toHaveAttribute("data-shell", "field");
  await expect(page.locator('div[data-shell="field"]')).toBeVisible();
  await expect(page.locator('div[data-shell="classic"]')).toHaveCount(0);
  const menu = page.getByTestId("top-menu");
  await expect(menu).toBeVisible();
  const work = menu.getByRole("button", { name: "Work", exact: true });
  await work.click();
  const guides = menu.getByRole("group", { name: "Work" }).getByRole("link", { name: "Guides", exact: true });
  await expect(guides).toBeVisible();
  await expect(guides).toHaveAttribute("href", "/guides");
  await page.keyboard.press("Escape");
  // Calm and flat with no per-page edit: the body is the Field paper, and the grain and network backdrop are not drawn.
  expect(await paperMatches(page)).toBe(true);
  expect(await page.locator("body > canvas").count()).toBe(0);
  // Headings take the Field body face through --font-display.
  const face = await page.evaluate(() => getComputedStyle(document.querySelector("h1, h2") ?? document.body).fontFamily);
  expect(face.toLowerCase()).toMatch(/plate|newsreader|georgia|serif/);
});

test("Home is a tile grid with today the largest tile; the plate is not drawn", async ({ page }) => {
  await lineUpThree();
  await page.goto("/");
  const tiles = page.getByTestId("home-tiles");
  await expect(tiles).toBeVisible();
  await expect(page.getByTestId("home-plate")).toHaveCount(0);
  await expect(page.getByTestId("home-network")).toHaveCount(0);
  const today = tiles.getByTestId("tile-today");
  await expect(today.getByTestId("tiles-greeting")).toHaveText(/^Good (morning|afternoon|evening)/);
  await expect(today.getByTestId("tiles-title")).toContainText("reply about the boiler quote");
  await expect(today.getByText(/^First step:/)).toBeVisible();
  await expect(today.getByText(/^About \d+ min/)).toBeVisible();
  await expect(today.getByTestId("tiles-rest").getByRole("listitem")).toHaveCount(2);
  await expect(tiles.getByTestId("tile-week")).toBeVisible();
  await expect(tiles.getByTestId("tile-captures")).toBeVisible();

  // Today is the largest tile on the page by area.
  const boxes = await tiles.locator('[data-testid^="tile-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid"), area: e.getBoundingClientRect().width * e.getBoundingClientRect().height })));
  expect(boxes.length).toBeGreaterThan(2);
  const largest = boxes.reduce((a, b) => (b.area > a.area ? b : a));
  expect(largest.id).toBe("tile-today");

  // Flat: no shadow on a tile. Nothing says a forbidden word.
  await expect(today).toHaveCSS("box-shadow", "none");
  await expect(tiles).not.toContainText(/overdue|missed|failed|you still haven|don't forget/i);
  // Nothing scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Done on the Today tile finishes the ticket through the plate's handler and the week's count moves", async ({ page }) => {
  const win = await lineUpThree();
  await page.goto("/");
  const tiles = page.getByTestId("home-tiles");
  const week = tiles.getByTestId("tile-week");
  const before = Number((await week.innerText()).match(/(\d+)\s+finished this week/)?.[1] ?? "0");
  await tiles.getByRole("button", { name: "Done", exact: true }).click();
  await expect(tiles.getByTestId("tiles-done")).toHaveText("Done. The day is won.");
  await expect(week).toContainText(`${before + 1} finished this week`);
  expect(category(win)).toBe("done");
});

test("with motion off the tiles have no entrance animation", async ({ page }) => {
  await prefs({ motion: "off" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.getByTestId("tile-today")).toHaveCSS("animation-name", "none");
});

test("on a phone, Home is the single next-thing card: no tiles and no menu bar", async ({ browser }, info) => {
  await ticket("on the phone", { deadline_on: TODAY });
  const phone = await browser.newContext({ storageState: info.project.use.storageState as string, viewport: { width: 390, height: 844 }, baseURL: info.project.use.baseURL });
  const page = await phone.newPage();
  await page.goto("/");
  await expect(page.getByTestId("focus-card")).toBeVisible();
  await expect(page.getByTestId("focus-card").getByRole("heading", { level: 1 })).toContainText("on the phone");
  await expect(page.getByTestId("home-tiles")).toBeHidden();
  await expect(page.getByTestId("top-menu")).toBeHidden();
  await phone.close();
});

test("the theme switch flips the Field palette between its two sides", async ({ page }) => {
  await page.goto("/");
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await prefs({ theme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await paperMatches(page)).toBe(true);
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).not.toBe(dark);
});

test("Settings offers three shells, Field chosen", async ({ page }) => {
  await page.goto("/other/settings?tab=appearance");
  const shell = page.getByRole("radiogroup", { name: "Shell" });
  await expect(shell).toBeVisible();
  await expect(shell.getByRole("radio")).toHaveText(["Classic", "New", "Field"]);
  await expect(shell.getByRole("radio", { name: "Field" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/^Field: the Field guide's calm look everywhere/)).toBeVisible();
});
