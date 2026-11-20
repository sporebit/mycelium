/**
 * The wall (master run §11; 0176), end to end. Phil sets a PIN and adds a
 * wall to a household team he shares with Tess; a fresh browser with no
 * session pairs as the wall, sees the family board, opens Phil's view with
 * his PIN and not without, is locked out again when left alone, shows a
 * guest nothing personal, is given nothing with a money key in it, and can
 * reach nothing but the wall's own routes. Every row is named by this run
 * and removed after it.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { FINANCE_WORDS } from "../lib/wall/contract.ts";
import { PHIL, TESS } from "./support/users.ts";

const RUN = `E2E-wall-${Date.now().toString(36)}`;
const TEAM = randomUUID();
const SPACE = randomUUID();
const PIN = "2468";

let wall: BrowserContext;
let page: Page;
let code = "";
let deviceId = "";

/** Every key in a JSON value, at any depth. */
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  }
  return out;
}

/** Finance never: no key in what the wall is given may name money. */
async function noMoneyKeys(url: string) {
  const res = await wall.request.get(url);
  expect(res.status(), url).toBe(200);
  const keys = keysOf(await res.json()).map((k) => k.toLowerCase());
  expect(keys.length, url).toBeGreaterThan(0);
  for (const k of keys) for (const w of FINANCE_WORDS) expect(k.includes(w), `${url}: ${k}`).toBe(false);
}

async function type(digits: string) {
  for (const d of digits) await page.getByRole("button", { name: `Digit ${d}`, exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${RUN} household', '${RUN.toLowerCase()}', '${PHIL.id}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${SPACE}', 'team', '${TEAM}')`);
  localSql(`update public.teams set space_id = '${SPACE}' where id = '${TEAM}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL.id}', 'owner'), ('${TEAM}', '${TESS.id}', 'member')`);
  // every run on this machine is the same address: the pairing and unlock buckets start full
  localSql(`delete from public.rate_limits where key like 'wall-%'`);
  wall = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  page = await wall.newPage();
});

test.afterAll(async ({ request }) => {
  await request.delete("/api/settings/quick-unlock");
  if (deviceId) await request.delete(`/api/settings/walls?id=${deviceId}`);
  for (const t of ["wall_pairings", "wall_devices", "family_list_items", "family_lists", "family_profile", "baby_log", "family_entries"]) {
    localSql(`delete from public.${t} where space_id = '${SPACE}'`);
  }
  // the device account and everything that hangs off it (its space, token, membership) go with the user row
  localSql(`delete from auth.users where email like 'wall+${SPACE.slice(0, 8)}-%@wall.mycelium.local'`);
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`update public.teams set space_id = null where id = '${TEAM}'`);
  localSql(`delete from public.spaces where id = '${SPACE}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
  await wall.close();
});

test("Phil sets a quick unlock and adds a wall to the household; the code is eight digits, shown once", async ({ request }) => {
  const pinned = await request.post("/api/settings/quick-unlock", { data: { pin: PIN } });
  expect(pinned.status(), await pinned.text()).toBe(200);
  expect((await request.post("/api/settings/quick-unlock", { data: { pin: "12" } })).status()).toBe(400);

  const fam = await request.post("/api/family", { data: { action: "setup", space: SPACE } });
  expect(fam.status(), await fam.text()).toBe(201);

  const made = await request.post("/api/settings/walls", { data: { space_id: SPACE, label: "Kitchen" } });
  expect(made.status(), await made.text()).toBe(201);
  const j = (await made.json()) as { code: string; device_id: string };
  expect(j.code).toMatch(/^\d{8}$/);
  code = j.code;
  deviceId = j.device_id;

  const list = (await (await request.get("/api/settings/walls")).json()) as { walls: Array<{ id: string; label: string; pairing_open: boolean; paired_at: string | null }> };
  const mine = list.walls.find((w) => w.id === deviceId);
  expect(mine).toMatchObject({ label: "Kitchen", pairing_open: true, paired_at: null });
});

test("a wall with no session is offered the pairing keypad; a wrong code is refused, the right one shows the family board", async () => {
  await page.goto("/wall?lock_after=6&idle_after=600");
  await expect(page.getByText("Pair this wall")).toBeVisible();
  // before pairing, the wall's own routes answer 401 and say only that it is unpaired
  expect((await wall.request.get("/api/wall/glance")).status()).toBe(401);

  await type("00000000");
  await expect(page.getByRole("status")).toContainText("did not work");

  await type(code);
  await expect(page.getByTestId("wall")).toHaveAttribute("data-view", "board");
  await expect(page.getByRole("navigation", { name: "Who" })).toBeVisible();
  await expect(page.getByText("Phil", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Tess", { exact: true }).first()).toBeVisible();
  // the switcher: Family, Phil (has a PIN); Tess has none so her card is not a door and she is not in the switcher
  const who = page.getByRole("navigation", { name: "Who" });
  await expect(who.getByRole("button", { name: "Family" })).toBeVisible();
  await expect(who.getByRole("button", { name: "Phil" })).toBeVisible();
  await expect(who.getByRole("button", { name: "Tess" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open this person's view" })).toHaveCount(1);
  // the code is spent and the token is no longer kept anywhere but the wall's cookie
  const spent = localSql(`select (used_at is not null)::text, (token is null)::text from public.wall_pairings where device_id = '${deviceId}'`);
  expect(spent).toEqual([["true", "true"]]);
});

test("no accessible label on the board carries a person's name", async () => {
  expect(await page.locator('[aria-label*="Phil"], [aria-label*="Tess"]').count()).toBe(0);
});

test("Phil's own view needs his PIN: a wrong PIN is refused, the right one opens his day", async () => {
  // not unlocked: the person route says so (and the first call compiles the route, before the keypad's short clock starts)
  expect((await wall.request.get("/api/wall/person")).status()).toBe(401);
  await page.getByRole("navigation", { name: "Who" }).getByRole("button", { name: "Phil" }).click();
  await expect(page.getByText("Your PIN")).toBeVisible();
  await type("1111");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("status")).toContainText("did not work");
  expect((await wall.request.get("/api/wall/person")).status()).toBe(401);

  await type(PIN);
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByTestId("wall")).toHaveAttribute("data-view", "person");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Phil");
  await expect(page.getByRole("button", { name: "Tap to talk" })).toBeVisible();
  expect(await page.locator('[aria-label*="Phil"], [aria-label*="Tess"]').count()).toBe(0);
  // under Phil, while unlocked: nothing with a money key
  await noMoneyKeys("/api/wall/person");
  expect(await page.locator("body").innerText()).not.toContain("£");
  // Tess's PIN cannot open anything from this wall even if guessed: she has none, and the answer is the same as a wrong one
  expect((await wall.request.post("/api/wall/unlock", { data: { user_id: TESS.id, pin: PIN } })).status()).toBe(403);
});

test("finance never: nothing the wall is given under the family has a money key", async () => {
  for (const url of ["/api/wall/glance", "/api/wall/say", "/api/wall/photos"]) await noMoneyKeys(url);
  expect(await page.locator("body").innerText()).not.toContain("£");
});

test("left alone, the unlocked view locks itself and the wall is back on the family board", async () => {
  // lock_after=6 on the URL shortened the two quiet minutes to six seconds
  await expect(page.getByTestId("wall")).toHaveAttribute("data-view", "board", { timeout: 15_000 });
  expect((await wall.request.get("/api/wall/person")).status()).toBe(401);
});

test("guest mode shows the clock, the weather and pictures only, and takes a long press to leave", async () => {
  await page.getByRole("button", { name: "Guest" }).click();
  await expect(page.getByTestId("wall")).toHaveAttribute("data-view", "guest");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Phil");
  expect(text).not.toContain("Tess");
  await expect(page.getByRole("navigation", { name: "Who" })).toHaveCount(0);
  await expect(page.getByLabel("Clock")).toBeVisible();

  const leave = page.getByTestId("leave-guest");
  const box = (await leave.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(page.getByTestId("wall")).toHaveAttribute("data-view", "guest");
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await expect(page.getByTestId("wall")).toHaveAttribute("data-view", "board");
});

test("the device holds no session: its cookie opens nothing outside the wall's routes", async () => {
  for (const url of ["/api/family", "/api/tickets", "/api/settings/walls", "/api/settings/quick-unlock", "/api/finance/accounts"]) {
    const res = await wall.request.get(url, { maxRedirects: 0 });
    expect([401, 403, 302, 307, 404].includes(res.status()), `${url} answered ${res.status()}`).toBe(true);
    expect(res.status(), url).not.toBe(200);
  }
});

test("revoking the wall in Settings darkens it at its next request", async ({ request }) => {
  const gone = await request.delete(`/api/settings/walls?id=${deviceId}`);
  expect(gone.status()).toBe(200);
  expect((await wall.request.get("/api/wall/glance")).status()).toBe(401);
  deviceId = "";
});
