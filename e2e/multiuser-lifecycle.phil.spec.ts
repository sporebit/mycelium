/**
 * Weekly rundowns, the personal-space export, and deleting an account.
 *
 *   own — invited by Phil with no team; creates the team (owner)
 *   mem — member; narrowed, exports, then deletes their account
 *   opt — member who opts out of the rundown
 *
 * Email, push and Telegram are off on this server, so the stored in-app copy
 * of a rundown is what is asserted.
 */
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { test, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import {
  CRON_HEADERS,
  MU_PASSWORD,
  MU_TEST_TIMEOUT,
  RUN,
  cleanUp,
  codeFor,
  createProject,
  createTeam,
  enrolTotp,
  expect,
  forget,
  getJson,
  joinByInvite,
  personalSpaceOf,
  reauth,
  rest,
  retireTeam,
  roomForCodes,
  sqlValue,
  tessContext,
  sweepLeftovers,
  type Person,
} from "./support/multiuser.ts";

test.describe.configure({ mode: "serial", timeout: MU_TEST_TIMEOUT });

const SIGNED_OUT = { cookies: [], origins: [] };
const TEAM_PROJECT = `E2E-mu-${RUN} Rundown team project`;
const MEM_TEAM_PROJECT = `E2E-mu-${RUN} Rundown project by mem`;
const MEM_PERSONAL = `E2E-mu-${RUN} mem personal project`;
const OWN_WEIGH_IN = `E2E-mu-${RUN} own weigh-in`;

let own: Person | undefined;
let mem: Person | undefined;
let opt: Person | undefined;
let team: { id: string; name: string; spaceId: string } | undefined;
let week = "";
let memDeleted = false;
let memSpace = "";

type Report = { week: string; teams: number; recipients: number; rendered: number; skipped: { optedOut: number; notNow: number; alreadySent: number }; delivered: Record<string, number>; errors: string[] };

async function openPeople(page: Page) {
  await page.goto("/other/settings/teams");
  await expect(page.getByRole("heading", { name: "People & teams" })).toBeVisible();
  await expect(page.getByText("Weekly rundown", { exact: true })).toBeVisible();
}
const inAppCopies = () => localSql(`select user_id from public.rundown_issues where team_id = '${team!.id}' and channel = 'in_app' order by user_id`).flat();

test.beforeAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  await sweepLeftovers(browser);
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  if (own && team) {
    const problem = await retireTeam(browser, own.request, team.id);
    if (problem) console.warn(`[multiuser-lifecycle] ${team.name} not handed over: ${problem}`);
  }
  await cleanUp([memDeleted ? undefined : mem, opt, own]);
});

test("the owner switches the weekly rundown on from the team's card; a member cannot", async ({ browser, request }) => {
  own = await joinByInvite(browser, request, "own", { enrol: true }); // an owner needs an authenticator before anything else (0160)
  team = await createTeam(own.request, "Rundown");
  mem = await joinByInvite(browser, own.request, "mem", { teamId: team.id, role: "member" });
  opt = await joinByInvite(browser, own.request, "opt", { teamId: team.id, role: "member" });
  memSpace = personalSpaceOf(mem.id);
  expect((await createProject(own.request, TEAM_PROJECT, team.spaceId)).status()).toBe(201);
  expect((await createProject(mem.request, MEM_TEAM_PROJECT, team.spaceId)).status()).toBe(201);

  const memPage = await mem.context.newPage();
  await openPeople(memPage);
  await expect(memPage.getByText("The owner has not switched the rundown on.")).toBeVisible();
  expect((await mem.request.patch("/api/rundowns", { data: { team_id: team.id, settings: { enabled: true } } })).status()).toBe(403);
  expect(sqlValue(`select count(*) from public.rundown_settings where team_id = '${team.id}'`)).toBe("0");

  const page = await own.context.newPage();
  await openPeople(page);
  // These boxes follow the server: they change once the save has come back, so click, then wait.
  await page.getByRole("checkbox", { name: /Send a weekly rundown to every member/ }).click();
  await expect(page.getByText("Rundown settings saved.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Send a weekly rundown to every member/ })).toBeChecked();
  await page.close();
  expect(localSql(`select enabled, day, hour from public.rundown_settings where team_id = '${team.id}'`)).toEqual([["t", "1", "8"]]);

  await memPage.reload();
  await expect(memPage.getByText("The owner sends a rundown every Mon at 08:00 UTC.")).toBeVisible();
  await memPage.close();
});

test("each member chooses their own channels, or opts out", async () => {
  const memPage = await mem!.context.newPage();
  await openPeople(memPage);
  for (const channel of ["email", "push"]) {
    await memPage.getByRole("checkbox", { name: channel, exact: true }).click();
    await expect(memPage.getByRole("checkbox", { name: channel, exact: true })).not.toBeChecked();
    await expect(memPage.getByText("Your rundown preferences are saved.")).toBeVisible();
  }
  await memPage.close();
  expect(sqlValue(`select array_to_string(channels, ',') from public.rundown_subscriptions where team_id = '${team!.id}' and user_id = '${mem!.id}'`)).toBe("in_app");

  const optPage = await opt!.context.newPage();
  await openPeople(optPage);
  await optPage.getByRole("checkbox", { name: "Send me this team's rundown" }).click();
  await expect(optPage.getByRole("checkbox", { name: "Send me this team's rundown" })).not.toBeChecked();
  await expect(optPage.getByText("Your rundown preferences are saved.")).toBeVisible();
  await optPage.close();
  expect(sqlValue(`select opted_out from public.rundown_subscriptions where team_id = '${team!.id}' and user_id = '${opt!.id}'`)).toBe("t");

  // Nobody sets a subscription for a team they are not in.
  const outsider = await mem!.request.patch("/api/rundowns", { data: { team_id: "00000000-0000-4000-8000-000000000000", subscription: { channels: ["in_app"] } } });
  expect(outsider.status()).toBe(403);
});

test("the cron sends once per recipient, skips who opted out, and does not fall over with email off", async ({ playwright, baseURL }) => {
  // mem loses sight of Organisation in the team, so mem's copy must differ from the owner's.
  const narrowed = await own!.request.patch(`/api/teams/${team!.id}/members/${mem!.id}`, { data: { sections: [{ section: "organisation", can_view: false }] } });
  expect(narrowed.status()).toBe(200);

  // Explicitly no cookies: a request context made inside a test otherwise inherits the project's signed-in state.
  const bare = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  // Only the cron secret or the instance owner may trigger it.
  expect((await bare.get(`/api/cron/rundowns?team=${team!.id}`)).status()).toBe(401);
  expect((await bare.get(`/api/cron/rundowns?team=${team!.id}`, { headers: { authorization: "Bearer not-the-secret" } })).status()).toBe(401);
  expect((await own!.request.get(`/api/cron/rundowns?team=${team!.id}&force=1`)).status()).toBe(401);
  expect(inAppCopies()).toEqual([]);

  const res = await bare.get(`/api/cron/rundowns?team=${team!.id}`, { headers: CRON_HEADERS });
  expect(res.status()).toBe(200);
  const report = (await res.json()) as Report;
  week = report.week;
  expect(week).toMatch(/^\d{4}-W\d{2}$/);
  expect(report).toMatchObject({ teams: 1, recipients: 3, rendered: 2, skipped: { optedOut: 1, notNow: 0, alreadySent: 0 }, delivered: { in_app: 2 } });
  // The owner kept the default channels: email and push fail quietly (both are off here), in-app is stored.
  expect(report.errors.sort()).toEqual([`${own!.id.slice(0, 8)} email: RESEND_API_KEY not set`, `${own!.id.slice(0, 8)} push: no push subscriptions`]);
  expect(inAppCopies()).toEqual([mem!.id, own!.id].sort());

  // Idempotent: a second run in the same week sends nothing more.
  const again = (await (await bare.get(`/api/cron/rundowns?team=${team!.id}`, { headers: CRON_HEADERS })).json()) as Report;
  expect(again).toMatchObject({ rendered: 0, skipped: { optedOut: 1, alreadySent: 2 }, delivered: {} });
  expect(inAppCopies()).toEqual([mem!.id, own!.id].sort());
  await bare.dispose();
});

test("each recipient reads their own copy, rendered with what they may see; nobody else can open it", async ({ browser }) => {
  const url = `/rundowns/${team!.id}/${week}`;

  const ownPage = await own!.context.newPage();
  expect((await ownPage.goto(url))?.status()).toBe(200);
  await expect(ownPage.getByRole("heading", { name: `${team!.name} rundown` })).toBeVisible();
  await expect(ownPage.getByText(`For ${own!.email.split("@")[0]}.`)).toBeVisible();
  await expect(ownPage.getByText(`projects: ${TEAM_PROJECT}`)).toBeVisible();
  await expect(ownPage.getByText(`projects: ${MEM_TEAM_PROJECT}`)).toBeVisible();
  await ownPage.close();

  const memPage = await mem!.context.newPage();
  expect((await memPage.goto(url))?.status()).toBe(200);
  await expect(memPage.getByText(`For ${mem!.email.split("@")[0]}.`)).toBeVisible();
  await expect(memPage.locator("article")).toContainText("Nothing to report this week.");
  await expect(memPage.locator("article")).not.toContainText(TEAM_PROJECT);
  await expect(memPage.locator("article")).not.toContainText(MEM_TEAM_PROJECT);
  await memPage.close();
  // The API lists it for its recipient.
  const mine = (await (await mem!.request.get("/api/rundowns")).json()) as { issues: Array<{ team_id: string; week: string; channel: string }> };
  expect(mine.issues).toEqual([expect.objectContaining({ team_id: team!.id, week, channel: "in_app" })]);

  // Opted out: no copy. Not in the team: no copy. A week that never ran, or a malformed one: nothing.
  const optPage = await opt!.context.newPage();
  expect((await optPage.goto(url))?.status()).toBe(404);
  await optPage.close();
  expect((await getJson<{ issues: unknown[] }>(opt!.request, "/api/rundowns")).body.issues).toEqual([]);

  const tess = await tessContext(browser);
  const tessPage = await tess.newPage();
  expect((await tessPage.goto(url))?.status()).toBe(404);
  await expect(tessPage.locator("body")).not.toContainText(TEAM_PROJECT);
  await tess.close();

  const check = await own!.context.newPage();
  expect((await check.goto(`/rundowns/${team!.id}/1999-W01`))?.status()).toBe(404);
  expect((await check.goto(`/rundowns/${team!.id}/this-week`))?.status()).toBe(404);
  await check.close();

  const out = await browser.newContext({ storageState: SIGNED_OUT });
  const outPage = await out.newPage();
  await outPage.goto(url);
  expect(new URL(outPage.url()).pathname).toBe("/login");
  await out.close();
});

test("the export zip holds the caller's personal space and nothing from a team or a share", async ({ browser }) => {
  // mem can see three spaces at this point: their own, the team's, and (Fitness, by grant) the owner's.
  expect((await own!.request.patch(`/api/teams/${team!.id}/members/${mem!.id}`, { data: { sections: [{ section: "organisation", can_view: true }] } })).status()).toBe(200);
  expect((await createProject(mem!.request, MEM_PERSONAL)).status()).toBe(201);
  expect((await own!.request.post("/api/body-metrics", { data: { date: "2019-07-08", weight: 80, notes: OWN_WEIGH_IN } })).status()).toBe(200);
  await reauth(own!);
  const grant = await own!.request.post("/api/grants", { data: { grantee_id: mem!.id, section: "fitness", verbs: ["view"] } });
  expect(grant.status()).toBe(201);
  const visible = (await getJson<{ projects: Array<{ name: string }> }>(mem!.request, "/api/work/projects?status=all")).body;
  expect(visible.projects.map((p) => p.name)).toEqual(expect.arrayContaining([MEM_PERSONAL, TEAM_PROJECT]));
  expect(await (await mem!.request.get("/api/body-metrics?days=0")).text()).toContain(OWN_WEIGH_IN);

  const page = await mem!.context.newPage();
  await page.goto("/other/export");
  await expect(page.getByText("Everything in your personal space")).toBeVisible();
  const downloading = page.waitForEvent("download", { timeout: MU_TEST_TIMEOUT / 2 });
  await page.getByRole("link", { name: "Download zip" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^mycelium-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  await page.close();

  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as { user_id: string; space_id: string; tables: Record<string, Record<string, number>> };
  expect(manifest.user_id).toBe(mem!.id);
  expect(manifest.space_id).toBe(memSpace);
  // No table failed to read.
  const failed = Object.entries(manifest.tables).flatMap(([group, tables]) => Object.entries(tables).filter(([, n]) => n < 0).map(([t]) => `${group}/${t}`));
  expect(failed).toEqual([]);

  let everything = "";
  let rows = 0;
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir || name === "manifest.json") continue;
    const text = await file.async("string");
    everything += text;
    if (!name.endsWith(".json")) continue;
    for (const row of JSON.parse(text) as Array<{ space_id?: string }>) {
      rows++;
      expect(row.space_id, name).toBe(memSpace);
    }
  }
  expect(rows).toBeGreaterThan(0);
  expect(everything).toContain(MEM_PERSONAL);
  expect(everything).not.toContain(TEAM_PROJECT);
  expect(everything).not.toContain(MEM_TEAM_PROJECT);
  expect(everything).not.toContain(OWN_WEIGH_IN);
  expect(everything).not.toContain(team!.spaceId);
  expect(everything).not.toContain(personalSpaceOf(own!.id));
  expect(zip.file("organisation/tickets/projects.json")).toBeTruthy();
  expect(zip.file("organisation/tickets/projects.csv")).toBeTruthy();
  expect(Object.keys(zip.files).some((n) => n.startsWith("finance/"))).toBe(false);

  await expect.poll(() => sqlValue(`select count(*) from public.audit_events where action = 'export' and actor_id = '${mem!.id}'`)).toBe("1");

  const out = await browser.newContext({ storageState: SIGNED_OUT });
  expect((await out.request.get("/api/export/space")).status()).toBe(401);
  await out.close();
  expect((await own!.request.delete(`/api/grants/${((await grant.json()) as { id: string }).id}`)).status()).toBe(200);
});

test("deleting an account takes the second factor, a fresh re-auth and the typed email; the personal space goes, team work stays unsigned", async ({ browser }) => {
  // With the password alone the database refuses outright, whichever door the call comes through.
  const early = await rest("/rest/v1/rpc/delete_my_account", { token: mem!.session.access_token, body: {} });
  expect(early.status).toBe(403);
  expect(((await early.json()) as { hint: string }).hint).toBe("mfa_required");
  expect((await mem!.request.post("/api/account/delete", { data: { confirm: mem!.email } })).status()).toBe(403);
  expect(sqlValue(`select count(*) from auth.users where id = '${mem!.id}'`)).toBe("1");

  await enrolTotp(mem!);
  await roomForCodes(2);
  const teamRow = () => localSql(`select created_by is null from public.projects where space_id = '${team!.spaceId}' and name = '${MEM_TEAM_PROJECT}'`);
  expect(teamRow()).toEqual([["f"]]);

  const page = await mem!.context.newPage();
  await page.goto("/other/settings/security?tab=account");
  const remove = page.getByRole("button", { name: "Delete my account" });
  await expect(remove).toBeDisabled();
  await page.getByPlaceholder(mem!.email).fill("someone-else@mycelium.local");
  await expect(remove).toBeDisabled();
  await page.getByPlaceholder(mem!.email).fill(mem!.email);
  await expect(remove).toBeEnabled();

  // No fresh re-auth yet: the page sends the person to confirm, and nothing is deleted.
  await remove.click();
  await page.waitForURL((u) => u.searchParams.get("reauth") === "1");
  await expect(page.getByText("That page needs your authenticator code again.")).toBeVisible();
  expect(sqlValue(`select count(*) from auth.users where id = '${mem!.id}'`)).toBe("1");

  const form = page.locator("form", { has: page.getByRole("button", { name: "Confirm" }) });
  await form.getByPlaceholder("000000").fill(codeFor(mem!));
  await form.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL((u) => u.pathname === "/other/settings/security" && !u.searchParams.has("reauth"));

  // The API holds the same line if the page is bypassed: re-auth given, wrong email typed.
  const wrong = await mem!.request.post("/api/account/delete", { data: { confirm: "someone-else@mycelium.local" } });
  expect(wrong.status()).toBe(400);
  expect(sqlValue(`select count(*) from auth.users where id = '${mem!.id}'`)).toBe("1");

  await page.getByPlaceholder(mem!.email).fill(mem!.email);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL((u) => u.pathname === "/login");
  memDeleted = true;
  forget(mem!.email);

  expect(sqlValue(`select count(*) from auth.users where id = '${mem!.id}'`)).toBe("0");
  expect(sqlValue(`select count(*) from public.profiles where id = '${mem!.id}'`)).toBe("0");
  expect(sqlValue(`select count(*) from public.spaces where id = '${memSpace}'`)).toBe("0");
  expect(sqlValue(`select count(*) from public.projects where space_id = '${memSpace}'`)).toBe("0");
  expect(sqlValue(`select count(*) from public.team_members where user_id = '${mem!.id}'`)).toBe("0");
  expect(sqlValue(`select count(*) from public.rundown_issues where user_id = '${mem!.id}'`)).toBe("0");
  // What they made in the team is still there, with the author cleared.
  expect(teamRow()).toEqual([["t"]]);
  expect((await getJson<{ projects: Array<{ name: string }> }>(own!.request, `/api/work/projects?status=all&space=${team!.spaceId}`)).body.projects.map((p) => p.name)).toContain(MEM_TEAM_PROJECT);
  expect(sqlValue(`select count(*) from public.audit_events where action = 'account_deleted' and subject_user_id = '${mem!.id}'`)).toBe("1");

  // The old browser is signed out, and the account cannot sign in again.
  await page.goto("/other/settings/security");
  await page.waitForURL((u) => u.pathname === "/login");
  await page.close();
  const fresh = await browser.newContext({ storageState: SIGNED_OUT });
  const signIn = await fresh.request.post("/api/auth/password", { data: { email: mem!.email, password: MU_PASSWORD } });
  expect(signIn.status()).toBe(401);
  await fresh.close();
  await mem!.context.close();
});

test("an owner cannot delete their account while they own a team", async () => {
  await reauth(own!);
  const page = await own!.context.newPage();
  await page.goto("/other/settings/security?tab=account");
  await page.getByPlaceholder(own!.email).fill(own!.email);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("This user still owns 1 team(s); transfer ownership first")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/other/settings/security");
  await page.close();
  expect(sqlValue(`select count(*) from auth.users where id = '${own!.id}'`)).toBe("1");
  expect(sqlValue(`select owner_user_id from public.teams where id = '${team!.id}'`)).toBe(own!.id);
});
