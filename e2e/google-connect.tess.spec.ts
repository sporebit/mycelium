/**
 * Settings → Integrations → Google, as Tess, in a real browser: the
 * reconnect that came back as bad_state on 2026-11-23.
 *
 * The e2e server has a client id and no client secret, so a sign-in whose
 * state cookie comes all the way round ends at config_error (the step after
 * the state check) and never at bad_state. Google itself is not reached:
 * the navigation to /api/google/auth is answered here with the server's
 * own response (its cookie included) and a stub consent page in place of
 * the redirect, because Playwright cannot stub a redirect hop.
 */
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 960 } });

const INTEGRATIONS = "/other/settings?tab=integrations";
const STATE_COOKIE = "mycelium_google_state";

/**
 * A person pressing CONNECT: the auth route runs for real (one navigation,
 * its Set-Cookie passed through), and the browser lands on a stub of
 * Google's consent page whose one link is the way back with the state.
 */
async function stubConsent(page: Page): Promise<void> {
  await page.route("**/api/google/auth", async (route) => {
    const res = await route.fetch({ maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const to = new URL(res.headers()["location"]);
    const back = new URL("/api/google/callback", new URL(to.searchParams.get("redirect_uri")!).origin);
    back.searchParams.set("code", "e2e-code");
    back.searchParams.set("state", to.searchParams.get("state") ?? "");
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/html", "set-cookie": res.headers()["set-cookie"] },
      body: `<html><body><h1>Google</h1><a id="allow" href="${back.pathname}${back.search}">Allow</a></body></html>`,
    });
  });
}

const jar = async (page: Page) => (await page.context().cookies()).filter((c) => c.name === STATE_COOKIE);

test("opening Integrations and hovering CONNECT starts no sign-in: the links are plain anchors, not prefetched", async ({ page }) => {
  const seen: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/google/auth" || u.pathname === "/api/spotify/authorize") seen.push(u.pathname);
  });
  await page.goto(INTEGRATIONS);
  const connect = page.getByRole("link", { name: "CONNECT", exact: true }).first();
  await expect(connect).toBeVisible();
  await page.waitForTimeout(1500);
  await connect.hover();
  await page.waitForTimeout(1000);
  expect(seen).toEqual([]);
  expect(await jar(page)).toEqual([]);
});

test("CONNECT, consent, back: the state cookie survives the round trip and the person lands on Integrations with the reason", async ({ page }) => {
  await stubConsent(page);
  const hits: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/google/auth") hits.push(`nav=${r.isNavigationRequest()} rsc=${r.headers()["rsc"] ?? "-"}`);
  });
  await page.goto(INTEGRATIONS);
  await page.getByRole("link", { name: "CONNECT", exact: true }).first().click();
  await expect(page.locator("#allow")).toBeVisible();
  expect(hits, "one plain navigation, no router fetch first").toEqual(["nav=true rsc=-"]);

  const state = new URL((await page.locator("#allow").getAttribute("href")) ?? "", "http://x").searchParams.get("state")!;
  expect(state.length).toBeGreaterThanOrEqual(32);
  const cookies = await jar(page);
  expect(cookies).toHaveLength(1);
  expect(cookies[0].value.split(".")).toContain(state);
  expect(cookies[0].path).toBe("/api/google");
  expect(cookies[0].httpOnly).toBe(true);
  expect(cookies[0].sameSite).toBe("Lax");

  await page.locator("#allow").click();
  await page.waitForURL(/\/other\/settings\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("google"), "the state was accepted; the e2e server has no client secret").toBe("config_error");
  expect(url.searchParams.get("tab")).toBe("integrations");
  await expect(page.getByRole("button", { name: "Integrations" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("google-notice")).toContainText("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing");
  expect(await jar(page), "the cookie is cleared on the way back").toEqual([]);
});

test("a second start in another tab does not break the first sign-in", async ({ page, context }) => {
  await stubConsent(page);
  await page.goto(INTEGRATIONS);
  await page.getByRole("link", { name: "CONNECT", exact: true }).first().click();
  await expect(page.locator("#allow")).toBeVisible();
  const first = new URL(await page.locator("#allow").getAttribute("href") ?? "", "http://x").searchParams.get("state")!;

  const other = await context.newPage();
  await stubConsent(other);
  await other.goto("/api/google/auth");
  await expect(other.locator("#allow")).toBeVisible();
  const second = new URL(await other.locator("#allow").getAttribute("href") ?? "", "http://x").searchParams.get("state")!;
  expect(second).not.toBe(first);
  const cookies = await jar(page);
  expect(cookies[0].value.split(".")).toEqual([second, first]);
  await other.close();

  // The first tab finishes with its own state.
  await page.locator("#allow").click();
  await page.waitForURL(/\/other\/settings\?/);
  expect(new URL(page.url()).searchParams.get("google")).toBe("config_error");
});

test("?google=<flag> with no tab opens Integrations and says what happened", async ({ page }) => {
  await page.goto("/other/settings?google=bad_state");
  await expect(page.getByRole("button", { name: "Integrations" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("google-notice")).toContainText("Sign-in expired, try again.");
  await page.goto("/other/settings?google=not_allowed");
  await expect(page.getByTestId("google-notice")).toContainText("That Google account isn't allowed here.");
  // the callback names the address it turned away (2026-11-24)
  await page.goto("/other/settings?google=not_allowed&account=kirsty%40example.com");
  await expect(page.getByTestId("google-notice")).toContainText("kirsty@example.com was turned away and nothing was stored");
  await page.goto("/other/settings?google=connected");
  await expect(page.getByTestId("google-notice")).toContainText("Google connected.");
  // the row's subtitle says what is true: the e2e server's Phil has no Google tokens
  await expect(page.getByTestId("google-subtitle")).toContainText("Not connected. Connect to show your Personal calendar and UK holidays");
});
