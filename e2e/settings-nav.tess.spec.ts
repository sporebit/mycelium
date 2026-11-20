/**
 * Settings navigation (MYC-190, Stream H harvest), as Tess, on a desktop
 * window: the sidebar's group auto-expands for the current route and lights
 * only the sub-page the path is on; landing on Security, People & teams or
 * Teams opens the first sub-section, and the rest are tabs in the URL that
 * survive a reload. The same in the new shell: the Settings dropdown of
 * the top menu bar and the chip row.
 *
 * The shell is a per-person setting; the one test that needs the new shell
 * puts it back, because Tess is shared with every other suite.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

let api: APIRequestContext;

/** React has attached itself to the page (a fiber on a nav element): clicks are handled, not native. The dev server, compiling several routes at once, can take a while. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const el = document.querySelector("nav");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  }, undefined, { timeout: 120_000 });
}

/**
 * A click on a tab before React has hydrated navigates natively and is
 * undone when hydration restores the first URL (the dev server hydrates
 * late). Click until the URL holds; a tab change is a soft navigation with
 * no load event, so the URL is polled rather than waited for.
 */
async function go(page: Page, click: () => Promise<void>, url: RegExp): Promise<void> {
  await hydrated(page);
  await expect(async () => {
    await click();
    await expect(page).toHaveURL(url, { timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
}

test.use({ viewport: { width: 1440, height: 960 } });

async function setShell(kind: "classic" | "new"): Promise<void> {
  const res = await api.patch("/api/settings/ui-prefs", { data: { shell: kind } });
  expect(res.status(), await res.text()).toBe(200);
}

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
  await setShell("classic");
});

test.afterAll(async () => {
  await setShell("classic");
  await api.dispose();
});

test("Security: the sidebar expands Other and lights Security alone; landing opens Sign-in; a tab is in the URL and survives a reload", async ({ page }) => {
  await page.goto("/other/settings/security");
  await hydrated(page);
  const sidebar = page.getByRole("navigation", { name: "Sections", exact: true });
  await expect(sidebar.getByRole("link", { name: "Security", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "Settings", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "Teams", exact: true })).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Security sections" });
  await expect(tabs.getByRole("link", { name: "Sign-in" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("PASSWORD", { exact: true })).toBeVisible();
  await expect(page.getByText("WHO HAS SEEN MY DATA", { exact: true })).toHaveCount(0);

  await go(page, () => tabs.getByRole("link", { name: "Access log" }).click(), /\/other\/settings\/security\?tab=access$/);
  await expect(page.getByText("WHO HAS SEEN MY DATA", { exact: true })).toBeVisible();
  await expect(page.getByText("PASSWORD", { exact: true })).toHaveCount(0);

  await page.reload();

  await hydrated(page);
  await expect(page.getByText("WHO HAS SEEN MY DATA", { exact: true })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Access log" })).toHaveAttribute("aria-current", "page");

  await go(page, () => tabs.getByRole("link", { name: "Sessions & tokens" }).click(), /\/other\/settings\/security\?tab=sessions$/);
  await expect(page.getByText("SESSIONS", { exact: true })).toBeVisible();
  await expect(page.getByText("this device", { exact: true })).toBeVisible();
});

test("Teams is its own route: it lights Teams in the sidebar and opens the Teams sub-section of People & teams", async ({ page }) => {
  await page.goto("/other/settings/teams");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: "People & teams" })).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Sections", exact: true });
  await expect(sidebar.getByRole("link", { name: "Teams", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "People & teams", exact: true })).not.toHaveAttribute("aria-current", "page");
  const tabs = page.getByRole("navigation", { name: "People & teams sections" });
  await expect(tabs.getByRole("link", { name: "Teams", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("textbox", { name: "New team name" })).toBeVisible();
  await expect(page.getByText("BIN — DELETED PEOPLE")).toHaveCount(0);

  // People & teams lands on People; Sharing is a tab.
  await go(page, () => tabs.getByRole("link", { name: "People", exact: true }).click(), /\/other\/settings\/people$/);
  await expect(page.getByText("BIN — DELETED PEOPLE")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "New team name" })).toHaveCount(0);
  await go(page, () => tabs.getByRole("link", { name: "Sharing" }).click(), /\/other\/settings\/people\?tab=sharing$/);
  await expect(page.getByRole("textbox", { name: "Their email" })).toBeVisible();
});

test("Settings: the open panel is ?tab=, and landing with none opens Profile", async ({ page }) => {
  await page.goto("/other/settings?tab=ai");
  await hydrated(page);
  await expect(page.getByText("AI CONFIG", { exact: true })).toBeVisible();
  await go(page, () => page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Journal" }).click(), /\/other\/settings\?tab=journal$/);
  await page.reload();
  await hydrated(page);
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Journal" })).toHaveAttribute("aria-current", "true");
  await go(page, () => page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Profile" }).click(), /\/other\/settings$/);
});

test("the new shell: the Settings dropdown holds Security, People & teams and Teams, and the chip row lights the page", async ({ page }) => {
  await setShell("new");
  try {
    await page.goto("/other/settings/people?tab=sharing");
    await hydrated(page);
      const menu = page.getByTestId("top-menu");
    const settings = menu.getByRole("button", { name: "Settings" });
    await expect(settings).toBeVisible();
    await settings.click();
    const group = menu.getByRole("group", { name: "Settings" });
    await expect(group.getByRole("link", { name: "Security" })).toBeVisible();
    await expect(group.getByRole("link", { name: "Teams", exact: true })).toBeVisible();
    await expect(group.getByRole("link", { name: "People & teams" })).toHaveAttribute("aria-current", "page");
    await expect(group.getByRole("link", { name: "Settings", exact: true })).not.toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");

    const chips = page.getByRole("navigation", { name: "OTHER pages" });
    await expect(chips.getByRole("link", { name: "People & teams" })).toHaveAttribute("aria-current", "page");
    await expect(chips.getByRole("link", { name: "Settings", exact: true })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "People & teams sections" }).getByRole("link", { name: "Sharing" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("textbox", { name: "Their email" })).toBeVisible();
  } finally {
    await setShell("classic");
  }
});
