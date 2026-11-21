/**
 * A second person's first day, as it will be for real: invited as a member
 * of a family team, with a view-only share of the owner's Work and Fitness,
 * and linked to the owner's People row (which is what shares day-log scenes).
 *
 *   host    — stands in for the owner (Phil's own space is never shared here)
 *   partner — the new person
 *
 * Every page she is likely to open must load without a server error, show
 * her what was shared, and refuse her changes to it.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { TESS } from "./support/users.ts";
import {
  MU_TEST_TIMEOUT,
  RUN,
  cleanUp,
  createProject,
  createTeam,
  expect,
  getJson,
  joinByInvite,
  personalSpaceOf,
  projectNames,
  reauth,
  magicLinkPath,
  MU_PASSWORD,
  retireTeam,
  sqlValue,
  sweepLeftovers,
  type Person,
} from "./support/multiuser.ts";

test.describe.configure({ mode: "serial", timeout: MU_TEST_TIMEOUT });

const HOST_PLAN = `E2E-mu-${RUN} Host house move`;
const TEAM_PLAN = `E2E-mu-${RUN} Family holiday`;
const HOST_WEIGH_IN = `E2E-mu-${RUN} host weigh-in`;
const PARTNER_PERSON = `E2Emu${RUN}partner`;
const DAY = "2019-09-10";
const PAGES = ["/", "/work", "/work/issues", "/work/projects", "/docs", "/organisation/people", "/fitness", "/fitness/history", "/fitness/body", "/health/nutrition", "/journal", "/other/settings", "/other/settings/people", "/other/settings/security", "/other/export"];

let host: Person | undefined;
let partner: Person | undefined;
let team: { id: string; name: string; spaceId: string } | undefined;
let hostPlanId = "";
let personId = "";

/** Set MU_SHOTS to a directory to keep a screenshot of each page she opens. */
const shots = process.env.MU_SHOTS;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  await sweepLeftovers(browser);
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  if (host && team) {
    const problem = await retireTeam(browser, host.request, team.id);
    if (problem) console.warn(`[multiuser-firstday] ${team.name} not handed over: ${problem}`);
  }
  await cleanUp([partner, host]);
});

test("set up: a family team, a view-only share of Work and Fitness, and a linked People row", async ({ browser, request }) => {
  host = await joinByInvite(browser, request, "host", { enrol: true }); // an owner, so an authenticator first (0160)
  team = await createTeam(host.request, "Household");
  partner = await joinByInvite(browser, host.request, "partner", { teamId: team.id, role: "member" });

  const plan = await createProject(host.request, HOST_PLAN);
  expect(plan.status()).toBe(201);
  hostPlanId = ((await plan.json()) as { project: { id: string } }).project.id;
  expect((await createProject(host.request, TEAM_PLAN, team.spaceId)).status()).toBe(201);
  expect((await host.request.post("/api/body-metrics", { data: { date: DAY, weight: 82, notes: HOST_WEIGH_IN } })).status()).toBe(200);
  const person = await host.request.post("/api/people", { data: { first_name: PARTNER_PERSON } });
  expect(person.ok()).toBe(true);
  personId = sqlValue(`select id from public.people where first_name = '${PARTNER_PERSON}' and space_id = '${personalSpaceOf(host.id)}'`)!;

  await reauth(host); // sharing needs the code confirmed in the last ten minutes
  for (const data of [
    { grantee_id: partner.id, section: "organisation", entity_groups: ["tickets"], verbs: ["view"] },
    { grantee_id: partner.id, section: "fitness", verbs: ["view"] },
  ]) {
    expect((await host.request.post("/api/grants", { data })).status()).toBe(201);
  }

  // Linking is only possible to a teammate.
  expect((await host.request.post(`/api/people/${personId}/link`, { data: { user_id: TESS.id } })).status()).toBe(403);
  expect((await host.request.post(`/api/people/${personId}/link`, { data: { user_id: partner.id } })).status()).toBe(200);
});

test("every page she is likely to open loads without a server error or a crash", async ({ baseURL }) => {
  const page = await partner!.context.newPage();
  const crashes: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (err) => crashes.push(`${new URL(page.url()).pathname}: ${err.message}`));
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (url.origin === new URL(baseURL!).origin && res.status() >= 500) serverErrors.push(`${res.status()} ${res.request().method()} ${url.pathname}`);
  });
  if (shots) mkdirSync(shots, { recursive: true });

  for (const route of PAGES) {
    const response = await page.goto(route, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    expect(response?.status(), route).toBe(200);
    expect(new URL(page.url()).pathname, route).not.toBe("/login");
    await expect(page.locator("body")).not.toContainText("Application error");
    if (shots) await page.screenshot({ path: path.join(shots, `${route.replace(/\W+/g, "_") || "home"}.png`), fullPage: true });
  }
  await page.close();
  expect(crashes).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("she sees the team's work and what was shared, and People & teams says where it comes from", async () => {
  expect(await projectNames(partner!.request)).toEqual(expect.arrayContaining([HOST_PLAN, TEAM_PLAN]));
  expect(await (await partner!.request.get("/api/body-metrics?days=0")).text()).toContain(HOST_WEIGH_IN);
  // Shared scenes: the route answers for a linked teammate (scenes need the AI day log, which is off here).
  const shared = await partner!.request.get(`/api/journal/shared?from=${DAY}&to=${DAY}`);
  expect(shared.status()).toBe(200);
  expect(((await shared.json()) as { scenes: unknown[] }).scenes).toEqual([]);

  const page = await partner!.context.newPage();
  await page.goto("/other/settings/teams");
  await expect(page.getByRole("heading", { name: "People & teams" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`${team!.name}\\s*member`) })).toBeVisible();
  await page.goto("/other/settings/people?tab=sharing");
  const hostName = host!.email.split("@")[0];
  await expect(page.getByRole("listitem").filter({ hasText: hostName }).filter({ hasText: "organisation · tickets · view" })).toHaveCount(1);
  await expect(page.getByRole("listitem").filter({ hasText: hostName }).filter({ hasText: "fitness · whole section · view" })).toHaveCount(1);
  await page.close();
});

test("what was shared view-only stays the owner's: she cannot change it, and her own entries do not overwrite it", async () => {
  expect((await partner!.request.patch(`/api/work/projects/${hostPlanId}`, { data: { name: "E2E-mu renamed by partner" } })).status()).toBe(403);
  expect((await partner!.request.delete(`/api/work/projects/${hostPlanId}`)).status()).toBe(403);
  expect((await createProject(partner!.request, `E2E-mu-${RUN} planted`, personalSpaceOf(host!.id))).status()).toBe(403);
  expect(sqlValue(`select name from public.projects where id = '${hostPlanId}'`)).toBe(HOST_PLAN);

  // Her own weigh-in on the same date is hers; his is untouched.
  const mine = await partner!.request.post("/api/body-metrics", { data: { date: DAY, weight: 60, notes: `E2E-mu-${RUN} partner weigh-in` } });
  expect(mine.status()).toBe(200);
  expect(sqlValue(`select weight::int from public.body_metrics where space_id = '${personalSpaceOf(host!.id)}' and date = '${DAY}'`)).toBe("82");
  expect(sqlValue(`select weight::int from public.body_metrics where space_id = '${personalSpaceOf(partner!.id)}' and date = '${DAY}'`)).toBe("60");
  expect((await partner!.request.delete(`/api/body-metrics/${DAY}`)).status()).toBeLessThan(500);
  expect(sqlValue(`select count(*) from public.body_metrics where space_id = '${personalSpaceOf(host!.id)}' and date = '${DAY}'`)).toBe("1");

  // In the team she is a member: she can add to it.
  expect((await createProject(partner!.request, `E2E-mu-${RUN} Family shopping`, team!.spaceId)).status()).toBe(201);
  // The link gives her nothing of the People row itself (that group was not shared).
  expect(await (await partner!.request.get("/api/people?tier=all&archived=all")).text()).not.toContain(PARTNER_PERSON);
});

test("a member needs no authenticator: she signs in with a password or a link and is never asked for a code", async ({ browser }) => {
  expect(sqlValue(`select count(*) from auth.mfa_factors where user_id = '${partner!.id}'`)).toBe("0");
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login?next=%2Fwork%2Fprojects");
  await page.locator('input[name="email"]').fill(partner!.email);
  await page.locator('input[name="password"]').fill(MU_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // No code prompt, no "enrol first": straight to where she was going, with her data and what was shared.
  await page.waitForURL((u) => u.pathname === "/work/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  expect(await projectNames(context.request)).toEqual(expect.arrayContaining([HOST_PLAN, TEAM_PLAN]));
  expect((await createProject(context.request, `E2E-mu-${RUN} Partner own list`)).status()).toBe(201);
  await context.close();

  const byLink = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const linkPage = await byLink.newPage();
  await linkPage.goto(await magicLinkPath(partner!.email, "/fitness/body"));
  expect(new URL(linkPage.url()).pathname).toBe("/fitness/body");
  expect((await byLink.request.get("/api/body-metrics?days=0")).status()).toBe(200);
  await byLink.close();
});

test("without an authenticator she cannot share, and the page tells her what to do about it", async () => {
  const res = await partner!.request.post("/api/grants", { data: { grantee_id: host!.id, section: "fitness", verbs: ["view"] } });
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { reason: string }).reason).toBe("mfa_required");

  const page = await partner!.context.newPage();
  await page.goto("/other/settings/people?tab=sharing");
  await page.getByRole("textbox", { name: "Their email" }).fill(host!.email);
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("combobox", { name: "Section" }).selectOption("fitness");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const told = page.getByText("Sharing needs an authenticator. Set one up under Settings → Security, sign in with it, then share.");
  await expect(told).toBeVisible();
  // The Share button is at the foot of a long page and the message is at its head: it must come into view.
  await expect(told).toBeInViewport();
  // She stays where she is (no trip to a code prompt she could not answer), and nothing was shared.
  expect(new URL(page.url()).pathname).toBe("/other/settings/people");
  await page.close();
  expect(sqlValue(`select count(*) from public.user_grants where grantor_id = '${partner!.id}'`)).toBe("0");
  // She can still decline what was shared WITH her; that needs no authenticator. (Not done here: the shares are used below.)
  expect((await partner!.request.get("/api/account/access-log")).status()).toBe(403);
});

test("with no authenticator, the Security page says what is needed instead of asking her to confirm a code she does not have", async () => {
  const page = await partner!.context.newPage();
  await page.goto("/other/settings/security");
  await expect(page.getByText("First factor only.")).toBeVisible();
  // The access log and the delete card are sub-sections of Security now.
  await page.goto("/other/settings/security?tab=access");
  await expect(page.getByText("This needs an authenticator app. Enrol one under Sign-in, then come back.")).toBeVisible();
  await expect(page.getByText("Confirm your authenticator to view this.")).toHaveCount(0);

  await page.goto("/other/settings/security?tab=account");
  await page.getByPlaceholder(partner!.email).fill(partner!.email);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Deleting an account needs an authenticator app. Enrol one under Sign-in first.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/other/settings/security");
  expect(sqlValue(`select count(*) from auth.users where id = '${partner!.id}'`)).toBe("1");
  await page.close();
});

// BUG (reported, not fixed: /api/settings is outside this surface). The
// onboarding guide says the display name set in Settings is what the team
// sees. Settings writes user_settings.display_name; teams, shares and the
// rundown read profiles.display_name, which nothing ever updates, so she
// stays the first half of her email address everywhere.
test("the name she sets in Settings is the name her team sees", async () => {
  const chosen = `E2E Partner ${RUN}`;
  expect((await partner!.request.patch("/api/settings", { data: { display_name: chosen } })).status()).toBe(200);
  const seen = (await getJson<{ team: { members: Array<{ user_id: string; display_name: string | null }> } }>(host!.request, `/api/teams/${team!.id}`)).body;
  expect(seen.team.members.find((m) => m.user_id === partner!.id)?.display_name).toBe(chosen); // still the email prefix
});

// BUG (reported, not fixed: the Work routes are outside this surface). "Who
// has seen my data" is fed by the list routes that call auditListRead();
// none of /api/work/** does. She has just read the owner's shared project
// through /api/work/projects and the owner's log has no trace of it.
test("reading the owner's shared Work leaves a line in the owner's access log", async () => {
  expect(await projectNames(partner!.request)).toContain(HOST_PLAN);
  expect((await partner!.request.get(`/api/work/projects/${hostPlanId}`)).status()).toBe(200);
  const logged = () => sqlValue(`select count(*) from public.audit_events where action = 'cross_user_read' and actor_id = '${partner!.id}' and subject_user_id = '${host!.id}' and section = 'organisation'`);
  await expect.poll(logged, { timeout: 10_000 }).not.toBe("0"); // stays 0
});
