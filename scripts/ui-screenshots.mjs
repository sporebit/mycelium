/**
 * UI screenshots for a run's report (docs/run/2026-11-28/field-guide-design.md
 * §6): Playwright against a local e2e server, signed in as Phil (or as a
 * paired wall), in each theme, with a chosen shell. Data-driven: add a row to
 * SHOTS to capture another page.
 *
 *   E2E_PORT=3112 node scripts/ui-screenshots.mjs
 *   E2E_PORT=3112 node scripts/ui-screenshots.mjs --only home-desktop,work --themes light
 *   E2E_PORT=3112 node scripts/ui-screenshots.mjs --shell new --out docs/run/2026-11-28/screenshots
 *
 * Needs: the local Supabase stack, a dev or compiled server on E2E_PORT
 * (node e2e/support/serve.ts), and e2e/.auth/phil.json from a Playwright run's
 * global setup. Everything it makes (three tickets for Phil's day, a team
 * with a family space and a paired wall) is named UI-shot and removed at the
 * end; Phil's shell goes back to Classic and his theme to what it was.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, request as pwRequest } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_ORIGIN } from "../e2e/support/env.ts";
import { PHIL, TESS, storageStateFor } from "../e2e/support/users.ts";

const DESKTOP = { width: 1440, height: 960 };
const PHONE = { width: 390, height: 844 };
const WALL = { width: 1280, height: 800 };

/**
 * One row per picture. `as`: "phil" (his storage state) or "wall" (a paired
 * wall with no session). `themes`: which of Phil's themes to take it in (the
 * wall is a dark screen whatever the theme, so it is taken once). `focus`: a
 * selector scrolled into view before the picture. `full`: the whole page.
 */
export const SHOTS = [
  { name: "home-desktop", path: "/", viewport: DESKTOP, as: "phil", themes: ["dark", "light"] },
  { name: "home-phone", path: "/", viewport: PHONE, as: "phil", themes: ["dark", "light"] },
  { name: "work", path: "/work", viewport: DESKTOP, as: "phil", themes: ["dark", "light"] },
  { name: "tasks", path: "/organisation/tasks", viewport: DESKTOP, as: "phil", themes: ["dark", "light"] },
  { name: "finance", path: "/finance", viewport: DESKTOP, as: "phil", themes: ["dark", "light"] },
  { name: "settings-appearance", path: "/other/settings?tab=appearance", viewport: DESKTOP, as: "phil", themes: ["dark", "light"], focus: '[role="radiogroup"][aria-label="Shell"]' },
  { name: "wall-tiles", path: "/wall", viewport: WALL, as: "wall", themes: ["dark"] },
  { name: "wall-classic", path: "/wall?board=classic", viewport: WALL, as: "wall", themes: ["dark"] },
];

function args() {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : null;
  };
  return {
    only: get("--only")?.split(",") ?? null,
    themes: get("--themes")?.split(",") ?? null,
    shell: get("--shell") ?? "field",
    out: get("--out") ?? "docs/run/2026-11-28/screenshots",
  };
}

const RUN = `UI-shot-${Date.now().toString(36)}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const q = (s) => s.replace(/'/g, "''");

/** Three things on Phil's day so Home has something to draw; returns what to remove. */
async function seedDay(api) {
  // A proposal not yet accepted is redrawn on the next load anyway; clearing today's lets the three below into it.
  localSql(`delete from public.day_plans where created_by = '${PHIL.id}' and day = '${today()}' and status = 'proposed' and accepted_at is null`);
  const ids = [];
  for (const [title, when] of [
    ["reply about the boiler quote", { deadline_on: today() }],
    ["order the hinges for the shed", { scheduled_on: today() }],
    ["post the letter to the council", { scheduled_on: today() }],
  ]) {
    const res = await api.post("/api/tickets", { data: { title, category: "next", ...when } });
    if (res.status() >= 300) throw new Error(`ticket: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    ids.push((body.ticket ?? body.task).id);
  }
  localSql(`update public.tickets set time_estimate_min = 20 where id in (${ids.map((i) => `'${i}'`).join(",")})`);
  return ids;
}

/** A household team for Phil and Tess with a family space, a due date, two appointments and a paired wall. */
async function seedWall(api, browser) {
  const team = randomUUID();
  const space = randomUUID();
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${team}', '${RUN} household', '${RUN.toLowerCase()}', '${PHIL.id}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${space}', 'team', '${team}')`);
  localSql(`update public.teams set space_id = '${space}' where id = '${team}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${team}', '${PHIL.id}', 'owner'), ('${team}', '${TESS.id}', 'member')`);
  localSql(`delete from public.rate_limits where key like 'wall-%'`);
  const fam = await api.post("/api/family", { data: { action: "setup", space } });
  if (fam.status() >= 300) throw new Error(`family: ${fam.status()} ${await fam.text()}`);
  localSql(`update public.family_profile set due_on = ((now() at time zone 'Europe/London')::date + 42) where space_id = '${space}'`);
  const soon = new Date(Date.now() + 90 * 60_000).toISOString();
  const tomorrow = new Date(Date.now() + 26 * 3_600_000).toISOString();
  localSql(
    `insert into public.family_entries (kind, title, starts_at, place, space_id, created_by) values ` +
      `('appointment', '${q("Midwife check")}', '${soon}', '${q("Health centre")}', '${space}', '${PHIL.id}'), ` +
      `('appointment', '${q("Bins out, then the big shop")}', '${tomorrow}', null, '${space}', '${PHIL.id}')`,
  );
  const made = await api.post("/api/settings/walls", { data: { space_id: space, label: "Kitchen" } });
  if (made.status() >= 300) throw new Error(`wall: ${made.status()} ${await made.text()}`);
  const { code, device_id } = await made.json();
  const wall = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: WALL, baseURL: E2E_ORIGIN, timezoneId: "Europe/London", locale: "en-GB" });
  const page = await wall.newPage();
  await page.goto("/wall");
  await page.getByText("Pair this wall").waitFor();
  for (const d of code) await page.getByRole("button", { name: `Digit ${d}`, exact: true }).click();
  // data-view is "board" before pairing too; the switcher appears only once the wall is paired.
  await page.getByRole("navigation", { name: "Who" }).waitFor();
  await page.close();
  return { team, space, device_id, wall };
}

async function dropWall(api, w) {
  if (!w) return;
  await api.delete(`/api/settings/walls?id=${w.device_id}`).catch(() => undefined);
  for (const t of ["wall_pairings", "wall_devices", "family_list_items", "family_lists", "family_profile", "baby_log", "family_entries"]) localSql(`delete from public.${t} where space_id = '${w.space}'`);
  localSql(`delete from auth.users where email like 'wall+${w.space.slice(0, 8)}-%@wall.mycelium.local'`);
  localSql(`delete from public.team_members where team_id = '${w.team}'`);
  localSql(`update public.teams set space_id = null where id = '${w.team}'`);
  localSql(`delete from public.spaces where id = '${w.space}'`);
  localSql(`delete from public.teams where id = '${w.team}'`);
  await w.wall.close();
}

async function main() {
  const opt = args();
  const shots = SHOTS.filter((s) => !opt.only || opt.only.includes(s.name));
  const outDir = path.resolve(process.cwd(), opt.out);
  mkdirSync(outDir, { recursive: true });
  const started = new Date().toISOString();
  const state = storageStateFor(PHIL);
  const api = await pwRequest.newContext({ baseURL: E2E_ORIGIN, storageState: state });
  const before = await (await api.get("/api/settings/ui-prefs")).json();
  const browser = await chromium.launch();
  let ticketIds = [];
  let wall = null;
  const taken = [];
  try {
    if (shots.some((s) => s.as === "phil" && s.path === "/")) ticketIds = await seedDay(api);
    if (shots.some((s) => s.as === "wall")) wall = await seedWall(api, browser);
    for (const shot of shots) {
      for (const theme of shot.themes.filter((t) => !opt.themes || opt.themes.includes(t))) {
        await api.patch("/api/settings/ui-prefs", { data: { shell: opt.shell, theme, motion: "off" } });
        const ctx = shot.as === "wall" ? wall.wall : await browser.newContext({ storageState: state, viewport: shot.viewport, baseURL: E2E_ORIGIN, timezoneId: "Europe/London", locale: "en-GB" });
        const page = await ctx.newPage();
        await page.setViewportSize(shot.viewport);
        await page.goto(shot.path, { waitUntil: "load" });
        await page.waitForTimeout(2500);
        if (shot.focus) await page.locator(shot.focus).first().scrollIntoViewIfNeeded().catch(() => undefined);
        const file = path.join(outDir, `${shot.name}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: !!shot.full });
        taken.push(path.relative(process.cwd(), file));
        await page.close();
        if (shot.as !== "wall") await ctx.close();
      }
    }
  } finally {
    await api.patch("/api/settings/ui-prefs", { data: { shell: "classic", theme: before.theme ?? "dark", motion: before.motion ?? "full" } });
    if (ticketIds.length) localSql(`delete from public.tickets where id in (${ticketIds.map((i) => `'${i}'`).join(",")})`);
    localSql(`delete from public.day_plans where created_by = '${PHIL.id}' and created_at >= '${started}'`);
    await dropWall(api, wall).catch((e) => console.error("[wall cleanup]", e));
    await browser.close();
    await api.dispose();
  }
  for (const t of taken) console.log(t);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
