/**
 * Every page that has no dynamic segment opens, as Phil and as Tess, without
 * a server error, a crash in the browser, or an API call answering 5xx.
 *
 * The routes come from the file system, so a new page is covered the day it
 * is added. Pages with a dynamic segment are exercised by the spec for
 * their own surface.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const APP_DIR = path.resolve(process.cwd(), "app");

function staticRoutes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api" && dir === APP_DIR) continue;
      staticRoutes(full, out);
    } else if (name === "page.tsx") {
      const rel = path.relative(APP_DIR, dir).split(path.sep).join("/");
      if (rel.includes("[")) continue;
      // Route groups, "(name)", do not appear in the URL.
      const url = "/" + rel.split("/").filter((seg) => seg && !/^\(.*\)$/.test(seg)).join("/");
      out.push(url === "/" ? "/" : url.replace(/\/$/, ""));
    }
  }
  return out;
}

// /login redirects a signed-in visitor; /offline is the service worker's page.
const SKIP = new Set(["/login", "/offline"]);
const ROUTES = [...new Set(staticRoutes(APP_DIR))].filter((r) => !SKIP.has(r)).sort();

for (const route of ROUTES) {
  test(`opens ${route}`, async ({ page }, testInfo) => {
    const crashes: string[] = [];
    const serverErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => crashes.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on("response", (res) => {
      const url = new URL(res.url());
      if (url.origin === new URL(testInfo.project.use.baseURL!).origin && res.status() >= 500) {
        serverErrors.push(`${res.status()} ${res.request().method()} ${url.pathname}`);
      }
    });

    const response = await page.goto(route, { waitUntil: "load" });
    // Long enough for the first round of client fetches to answer. Not
    // "network idle": pages with a live stream never reach it.
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);

    if (consoleErrors.length) {
      testInfo.annotations.push({ type: "console-errors", description: consoleErrors.slice(0, 5).join(" | ") });
    }
    // /admin answers 403 until a second factor is verified; that is the gate working.
    const allowed = route === "/admin" ? [200, 403] : [200];
    expect(response, `no response for ${route}`).not.toBeNull();
    expect(allowed, `${route} answered ${response!.status()}`).toContain(response!.status());
    await expect(page.locator("body")).not.toContainText("Application error");
    expect(crashes, `browser crash on ${route}`).toEqual([]);
    expect(serverErrors, `server errors on ${route}`).toEqual([]);
  });
}
