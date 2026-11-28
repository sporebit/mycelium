#!/usr/bin/env node
/**
 * UI screenshots for the run's design review (docs/run/2026-11-28/
 * field-guide-design.md §6): Playwright against the end-to-end server, as
 * Phil, in both themes. Data-driven: add a row to SHOTS (and, when a shot
 * needs a fixture or an action, one entry to FIXTURES or ACTIONS) rather
 * than a new script.
 *
 *   E2E_PORT=3111 node scripts/ui-screenshots.mjs [--only name,name] [--themes dark,light]
 *
 * Needs: the e2e server up on E2E_PORT (node e2e/support/serve.ts) and the
 * sessions Playwright's global setup writes to e2e/.auth (run any spec once).
 * Writes docs/run/2026-11-28/screenshots/<name>-<theme>.png (OUT_DIR to
 * change). Every row a fixture makes is deleted at the end, and the theme
 * is put back as it was.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium, request } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve(process.env.OUT_DIR ?? "docs/run/2026-11-28/screenshots");
const STATE = path.resolve("e2e/.auth/phil.json");

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

/**
 * One row per picture. `path` may name a fixture as {fixture}. `selector`
 * screenshots one element instead of the page; `fullPage` the whole page;
 * `action` runs a named step from ACTIONS first.
 */
const SHOTS = [
  { name: "guide-ticket", path: "/work/browse/{guide}", viewport: DESKTOP, selector: "[data-testid=field-guide]" },
  { name: "guide-page", path: "/guides/{guide}", viewport: DESKTOP, fullPage: true, action: "top" },
  { name: "guide-flight-plan", path: "/guides/{guide}", viewport: DESKTOP, action: "flight" },
  { name: "guides-list", path: "/guides", viewport: DESKTOP, fullPage: true },
  { name: "guide-phone", path: "/guides/{guide}", viewport: PHONE },
];

/** Named steps a shot can take before the picture. */
const ACTIONS = {
  /** The standalone guide opens at the next step; a full-page picture wants the sticky thread back at the top. */
  async top(page) {
    await page.evaluate(() => window.scrollTo(0, 0));
  },
  async flight(page) {
    await page.keyboard.press("f");
    await page.getByTestId("flight-plan").waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
  },
};

/** Fixtures: each makes what its {name} placeholder needs and returns { value, cleanup }. */
const FIXTURES = {
  /** A Field guide ticket from the repo's example, part done: sitting 1 finished, sitting 2 open. */
  async guide(api) {
    const def = JSON.parse(readFileSync(path.resolve("docs/guides/example-field-guide.json"), "utf8"));
    const res = await api.post("/api/tickets", { data: { title: "Screenshots: Field guide demo", kind: "guide", category: "next" } });
    if (!res.ok()) throw new Error(`create guide: ${res.status()} ${await res.text()}`);
    const { key } = await res.json();
    const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
    const patch = async (data) => {
      const r = await api.patch(`/api/tickets/${key}/steps`, { data });
      if (!r.ok()) throw new Error(`patch guide: ${r.status()} ${await r.text()}`);
    };
    await patch({ definition: def });
    await patch({
      steps: {
        "1.1": { done: true, at: ago(52) },
        "1.2": { done: true, at: ago(46) },
        "1.3": { done: true, at: ago(43) },
        "1.4": { done: true, at: ago(39) },
        "2.1": { done: true, at: ago(6) },
      },
      answers: { port: "3111" },
    });
    return { value: key, cleanup: async () => void (await api.delete(`/api/tickets/${key}?hard=1`)) };
  },
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const only = args.only ? new Set(args.only.split(",")) : null;
const themes = (args.themes ?? "dark,light").split(",");
const shots = SHOTS.filter((s) => !only || only.has(s.name));

mkdirSync(OUT, { recursive: true });
const api = await request.newContext({ baseURL: BASE, storageState: STATE });
const prefs = await (await api.get("/api/settings/ui-prefs")).json();
const fixtures = {};
const cleanups = [];
const browser = await chromium.launch();
try {
  for (const name of new Set(shots.flatMap((s) => [...s.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))) {
    const f = await FIXTURES[name](api);
    fixtures[name] = f.value;
    cleanups.push(f.cleanup);
  }
  for (const theme of themes) {
    const r = await api.patch("/api/settings/ui-prefs", { data: { theme } });
    if (!r.ok()) throw new Error(`theme ${theme}: ${r.status()}`);
    for (const shot of shots) {
      const ctx = await browser.newContext({ storageState: STATE, viewport: shot.viewport, timezoneId: "Europe/London", locale: "en-GB", deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const url = shot.path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(fixtures[k]));
      await page.goto(`${BASE}${url}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
      if (shot.action) await ACTIONS[shot.action](page);
      await page.waitForTimeout(700); // let the thread and the numbers settle
      const file = path.join(OUT, `${shot.name}-${theme}.png`);
      if (shot.selector) await page.locator(shot.selector).first().screenshot({ path: file });
      else await page.screenshot({ path: file, fullPage: !!shot.fullPage });
      console.log(path.relative(process.cwd(), file));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await api.patch("/api/settings/ui-prefs", { data: { theme: prefs.theme ?? "dark" } });
  for (const c of cleanups) await c().catch((e) => console.error("cleanup:", e));
  await api.dispose();
}
