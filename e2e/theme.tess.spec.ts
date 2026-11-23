/**
 * Light and dark, as Tess, on a desktop window. The preference is
 * ui_prefs.theme, server-rendered as data-theme on <html>; the colours are
 * light-dark() pairs in globals.css, so one attribute moves the whole page.
 * The sun / moon in the classic sidebar flips it at once and saves it.
 *
 * Tess is shared with every other suite: the theme goes back to dark after.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

let api: APIRequestContext;

test.use({ viewport: { width: 1440, height: 960 } });

async function setTheme(theme: "dark" | "light" | "system"): Promise<void> {
  const res = await api.patch("/api/settings/ui-prefs", { data: { theme } });
  expect(res.status(), await res.text()).toBe(200);
}

test.beforeAll(async ({ playwright, baseURL }, info) => {
  api = await playwright.request.newContext({ baseURL, storageState: info.project.use.storageState as string });
  await api.patch("/api/settings/ui-prefs", { data: { shell: "classic" } });
  await setTheme("dark");
});

test.afterAll(async () => {
  await setTheme("dark");
  await api.dispose();
});

test("dark by default: the attribute, a dark page and a dark chrome colour on the first paint", async ({ page }) => {
  await page.goto("/other/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0e1410");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(11, 16, 13)");
});

test("light saved: the next load is light before any script runs, text is dark on paper", async ({ page }) => {
  await setTheme("light");
  await page.goto("/other/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ecebe2");
  const colours = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    fg: getComputedStyle(document.body).color,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  expect(colours.bg).toBe("rgb(244, 243, 236)");
  expect(colours.fg).toBe("rgb(27, 31, 26)");
  expect(colours.scheme).toBe("light");
});

test("Settings → Appearance → Theme shows the saved value and system follows the device", async ({ page }) => {
  await setTheme("light");
  await page.goto("/other/settings?tab=appearance");
  const control = page.getByRole("radiogroup", { name: "Theme" });
  await expect(control).toBeVisible();
  await expect(control.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  await control.getByRole("radio", { name: "System" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect.poll(async () => (await (await api.get("/api/settings/ui-prefs")).json()).theme).toBe("system");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(11, 16, 13)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(244, 243, 236)");
});

test("the sun in the sidebar flips to light at once and saves; the moon flips back", async ({ page }) => {
  await setTheme("dark");
  await page.goto("/other/settings");
  const toggle = page.getByTestId("theme-toggle").first();
  await expect(toggle).toHaveAttribute("data-showing", "dark");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("data-showing", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ecebe2");
  await expect.poll(async () => (await (await api.get("/api/settings/ui-prefs")).json()).theme).toBe("light");

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(async () => (await (await api.get("/api/settings/ui-prefs")).json()).theme).toBe("dark");
});
