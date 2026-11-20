/**
 * Team lifecycle as the owner, the invite page in each of its states, a
 * brand-new person joining end to end, the role matrix, and the owner
 * leaving. Phil owns the team (signed in with his authenticator, as an owner
 * must be since 0160); the people who join are throwaway accounts.
 *
 * What the role matrix writes is a Work project in the team's space: the
 * one thing the app lets a caller create in a named space (`space`).
 */
import { test, type Page } from "@playwright/test";
import { localSql, localStackEnv } from "../lib/access/introspect.ts";
import { PHIL, TESS, storageStateFor } from "./support/users.ts";
import {
  MU_PASSWORD,
  MU_TEST_TIMEOUT,
  cleanUp,
  createInvite,
  createProject,
  emailFor,
  enrolTotp,
  expect,
  getJson,
  joinByInvite,
  keeperJoins,
  personFromPassword,
  personalSpaceOf,
  projectNames,
  retireStaleTeams,
  retireTeam,
  sqlValue,
  tessContext,
  teamName,
  KEEPER_EMAIL,
  type Person,
} from "./support/multiuser.ts";

test.describe.configure({ mode: "serial", timeout: MU_TEST_TIMEOUT });

const TEAM = teamName("Family");
const SIGNED_OUT = { cookies: [], origins: [] };
const viewerEmail = emailFor("viewer");
const viewerName = viewerEmail.split("@")[0];
const memberName = emailFor("member").split("@")[0];

let teamId = "";
let teamSpace = "";
let inviteLink = "";
let inviteToken = "";
let viewer: Person | undefined;
let member: Person | undefined;
let teamProjectId = "";
let philLeft = false;

async function openPeople(page: Page) {
  await page.goto("/other/settings/people");
  await expect(page.getByRole("heading", { name: "People & teams" })).toBeVisible();
}

async function openTeam(page: Page) {
  await openPeople(page);
  await expect(page.getByRole("button", { name: new RegExp(TEAM) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(TEAM) }).click();
  await expect(page.getByText(`TEAM · ${TEAM.toUpperCase()}`)).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  const phil = await browser.newContext({ storageState: storageStateFor(PHIL) });
  await retireStaleTeams(browser, phil.request);
  await phil.close();
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  const phil = await browser.newContext({ storageState: storageStateFor(PHIL) });
  try {
    // If a check failed before Phil left through the page, hand the team over here.
    if (teamId && !philLeft) {
      const problem = await retireTeam(browser, phil.request, teamId);
      if (problem) console.warn(`[multiuser-invite] Phil is still in ${TEAM}: ${problem}`);
    }
  } finally {
    await phil.close();
  }
  await cleanUp([viewer, member]);
});

test("Phil creates a team from People & teams and is its owner", async ({ page, request }) => {
  await openPeople(page);
  await page.getByRole("textbox", { name: "New team name" }).fill(TEAM);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Team created.")).toBeVisible();
  await expect(page.getByText(`TEAM · ${TEAM.toUpperCase()}`)).toBeVisible();

  const { teams } = (await (await request.get("/api/teams")).json()) as { teams: Array<{ id: string; name: string; my_role: string }> };
  const mine = teams.find((t) => t.name === TEAM);
  expect(mine?.my_role).toBe("owner");
  teamId = mine!.id;
  teamSpace = sqlValue(`select space_id from public.teams where id = '${teamId}'`)!;
  expect(teamSpace).toBeTruthy();
});

test("inviting an address shows the link (email is off) and lists it as pending", async ({ page }) => {
  await openTeam(page);
  await page.getByRole("textbox", { name: "Invite by email" }).fill(viewerEmail);
  await page.getByRole("combobox", { name: "Invite role" }).selectOption("viewer");
  const answered = page.waitForResponse((r) => r.url().endsWith("/api/invites") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Send invite" }).click();
  const res = await answered;
  expect(res.status()).toBe(201);
  expect(((await res.json()) as { delivered: boolean }).delivered).toBe(false);

  await expect(page.getByText("Invite created.")).toBeVisible();
  const shown = page.getByText(/\/invite\/[0-9a-f]{64}/);
  await expect(shown).toBeVisible();
  inviteLink = (await shown.textContent())!.match(/http\S+\/invite\/[0-9a-f]{64}/)![0];
  inviteToken = inviteLink.split("/invite/")[1];
  expect(new URL(inviteLink).origin).toBe(new URL(page.url()).origin);
  await expect(page.getByText(`${viewerEmail} · viewer · expires`)).toBeVisible();
});

test("a signed-out visitor sees who invited them, to which team, as what", async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  const response = await page.goto(inviteLink);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(`/invite/${inviteToken}`);
  await expect(page.getByText(`Join ${TEAM}`)).toBeVisible();
  await expect(page.getByText(`Phil invited ${viewerEmail} as viewer.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  const preview = await getJson(context.request, `/api/invites/${inviteToken}`);
  expect(preview.body).toMatchObject({ invite: { email: viewerEmail, role: "viewer", status: "valid", team_name: TEAM }, signed_in_as: null });
  // Accepting needs a session.
  expect((await context.request.post(`/api/invites/${inviteToken}`)).status()).toBe(401);
  await context.close();
});

test("a token that was never issued says the invitation does not exist", async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto(`/invite/${"0".repeat(64)}`);
  await expect(page.getByText("This invitation does not exist.")).toBeVisible();
  expect((await context.request.get(`/api/invites/${"0".repeat(64)}`)).status()).toBe(404);
  expect((await context.request.get("/api/invites/not-a-token")).status()).toBe(404);
  await context.close();
});

test("a different signed-in account is refused, on the page and by the API", async ({ browser }) => {
  const tess = await tessContext(browser);
  const page = await tess.newPage();
  await page.goto(inviteLink);
  await expect(page.getByText(`You are signed in as ${TESS.email}, but this invitation is for ${viewerEmail}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

  const forced = await tess.request.post(`/api/invites/${inviteToken}`);
  expect(forced.status()).toBe(409);
  expect(((await forced.json()) as { error: string }).error).toMatch(/different email address/);
  expect((await tess.request.get(`/api/teams/${teamId}`)).status()).toBe(404);
  expect((await getJson(tess.request, `/api/invites/${inviteToken}`)).body).toMatchObject({ invite: { status: "valid" }, signed_in_as: TESS.email });
  await tess.close();
});

test("an address with no invite cannot create an account", async () => {
  const env = localStackEnv();
  const stranger = emailFor("uninvited");
  const res = await fetch(`${env.apiUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: stranger, password: MU_PASSWORD }),
  });
  expect(res.ok).toBe(false);
  expect(localSql(`select 1 from auth.users where email = '${stranger}'`)).toEqual([]);
});

test("the invited person creates an account with a password, accepts, and is in the team as viewer", async ({ browser, page: philPage }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  const crashes: string[] = [];
  // The service-worker registration failing for a signed-out visitor is its own reported bug (the fixme below).
  page.on("pageerror", (e) => {
    if (!/Failed to register a ServiceWorker/.test(e.message)) crashes.push(e.message);
  });

  await page.goto(inviteLink);
  await page.getByRole("radio", { name: "Password" }).click();
  await page.locator('input[type="password"]').fill(MU_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Email confirmation is off locally: the account is signed in and the page comes back to accept.
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await expect(page.getByText(`Phil invited ${viewerEmail} as viewer.`)).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText(`You are in ${TEAM} as viewer.`)).toBeVisible();
  // A viewer is not asked for an authenticator.
  await expect(page.getByRole("button", { name: "Set up an authenticator" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open Mycelium" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.locator("body")).not.toContainText("Application error");
  expect(crashes).toEqual([]);

  // First screen: the sections the welcome names are there, Finance is not.
  const nav = page.getByRole("navigation", { name: "Sections" });
  await expect(nav.getByRole("link", { name: /^fitness$/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^health$/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^finance$/i })).toHaveCount(0);

  // The new person sees the team and their role under People & teams, with nothing to manage.
  await openPeople(page);
  await expect(page.getByRole("button", { name: new RegExp(`${TEAM}\\s*viewer`) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave team" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invite" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /^Role for/ })).toHaveCount(0);
  await context.close();

  // The owner sees them too, and the invite is no longer pending.
  await openTeam(philPage);
  await expect(philPage.getByRole("combobox", { name: `Role for ${viewerName}` })).toHaveValue("viewer");
  await expect(philPage.getByText(`${viewerEmail} · viewer · expires`)).toHaveCount(0);

  viewer = await personFromPassword(browser, "viewer");
  expect(sqlValue(`select role from public.team_members where team_id = '${teamId}' and user_id = '${viewer.id}'`)).toBe("viewer");
});

// BUG (reported, not fixed: the gate is not this spec's to change). In a
// production build the app registers /sw.js on every page, but /sw.js is not
// a public path, so for a signed-out visitor (the sign-in page, the invite
// page) it answers with a redirect to /login and the registration throws an
// uncaught error in the browser.
test.fixme("a signed-out visitor's page throws nothing: /sw.js is reachable without a session", async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const res = await context.request.get("/sw.js", { maxRedirects: 0 });
  expect(res.status()).toBe(200); // 307 to /login?next=%2Fsw.js
  const page = await context.newPage();
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  expect(crashes).toEqual([]);
  await context.close();
});

test("a used link says so and cannot be accepted again", async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto(inviteLink);
  await expect(page.getByText("This invitation has already been used.")).toBeVisible();
  await context.close();

  const again = await viewer!.request.post(`/api/invites/${inviteToken}`);
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: string }).error).toMatch(/already been used/);
});

test("an expired link says so, and no account can be made from it", async ({ browser, request }) => {
  const late = emailFor("late");
  const { link, token } = await createInvite(request, { email: late, teamId, role: "member" });
  // Seven days cannot pass in a check: age this one invite, which this spec created.
  localSql(`update public.invites set expires_at = now() - interval '1 minute' where email = '${late}' and team_id = '${teamId}'`);

  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByText("This invitation has expired. Ask for a new one.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  expect((await getJson(context.request, `/api/invites/${token}`)).body).toMatchObject({ invite: { status: "expired" } });
  await context.close();

  const env = localStackEnv();
  const res = await fetch(`${env.apiUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: late, password: MU_PASSWORD }),
  });
  expect(res.ok).toBe(false);
  expect(localSql(`select 1 from auth.users where email = '${late}'`)).toEqual([]);
});

test("a viewer reads the team space and can change nothing in it", async ({ request }) => {
  const made = await createProject(request, `E2E-mu ${TEAM} plan`, teamSpace);
  expect(made.status()).toBe(201);
  teamProjectId = ((await made.json()) as { project: { id: string } }).project.id;

  expect(await projectNames(viewer!.request, teamSpace)).toContain(`E2E-mu ${TEAM} plan`);

  expect((await createProject(viewer!.request, `E2E-mu ${TEAM} viewer write`, teamSpace)).status()).toBe(403);
  expect((await viewer!.request.patch(`/api/work/projects/${teamProjectId}`, { data: { name: "E2E-mu renamed by viewer" } })).status()).toBe(403);
  expect((await viewer!.request.delete(`/api/work/projects/${teamProjectId}`)).status()).toBe(403);
  expect(await projectNames(request, teamSpace)).toEqual(expect.arrayContaining([`E2E-mu ${TEAM} plan`]));
  expect(await projectNames(request, teamSpace)).not.toContain(`E2E-mu ${TEAM} viewer write`);

  // Nor the team itself: no invites, no roles, no toggles, no rename, no removing people.
  expect((await viewer!.request.post("/api/invites", { data: { email: emailFor("by-viewer"), team_id: teamId, role: "viewer" } })).status()).toBe(403);
  expect((await viewer!.request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, { data: { role: "admin" } })).status()).toBe(403);
  expect((await viewer!.request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, { data: { sections: [{ section: "organisation" }] } })).status()).toBe(403);
  expect((await viewer!.request.patch(`/api/teams/${teamId}`, { data: { name: "E2E-mu taken over" } })).status()).toBe(403);
  expect((await viewer!.request.delete(`/api/teams/${teamId}/members/${PHIL.id}`)).status()).toBe(403);
  expect((await viewer!.request.patch("/api/rundowns", { data: { team_id: teamId, settings: { enabled: true } } })).status()).toBe(403);
  expect(sqlValue(`select name from public.teams where id = '${teamId}'`)).toBe(TEAM);
  // A viewer never sees pending invites.
  const detail = (await (await viewer!.request.get(`/api/teams/${teamId}`)).json()) as { team: { invites: unknown[]; my_role: string } };
  expect(detail.team.my_role).toBe("viewer");
  expect(detail.team.invites).toEqual([]);
});

test("a member writes in the team space, and section toggles only narrow", async ({ browser, page, request }) => {
  member = await joinByInvite(browser, request, "member", { teamId, role: "member" });
  const mine = `E2E-mu ${TEAM} member project`;
  const made = await createProject(member.request, mine, teamSpace);
  expect(made.status()).toBe(201);
  const mineId = ((await made.json()) as { project: { id: string } }).project.id;
  expect((await member.request.patch(`/api/work/projects/${teamProjectId}`, { data: { description: "edited by the member" } })).status()).toBe(200);
  // The viewer sees what the member made; that is what a team space is for.
  expect(await projectNames(viewer!.request, teamSpace)).toContain(mine);
  // A member manages nobody.
  expect((await member.request.post("/api/invites", { data: { email: emailFor("by-member"), team_id: teamId, role: "viewer" } })).status()).toBe(403);
  expect((await member.request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, { data: { role: "member" } })).status()).toBe(403);
  expect((await member.request.delete(`/api/teams/${teamId}/members/${viewer!.id}`)).status()).toBe(403);

  // The owner takes create/delete in Organisation away from the member, on the page.
  await openTeam(page);
  await page.getByRole("button", { name: `Sections for ${memberName}` }).click();
  // A box follows the server: it changes once the save has come back and the team has been re-read.
  const setBox = async (name: string, on: boolean) => {
    const box = page.getByRole("checkbox", { name });
    const saved = page.waitForResponse((r) => r.url().includes(`/members/${member!.id}`) && r.request().method() === "PATCH");
    await box.click();
    expect((await saved).status()).toBe(200);
    await (on ? expect(box).toBeChecked() : expect(box).not.toBeChecked());
  };
  await setBox("organisation create/delete", false);

  expect((await createProject(member.request, `E2E-mu ${TEAM} refused`, teamSpace)).status()).toBe(403);
  expect((await member.request.patch(`/api/work/projects/${mineId}`, { data: { description: "still editable" } })).status()).toBe(200);
  expect(await projectNames(member.request, teamSpace)).toContain(mine);

  // …then edit, then view.
  await setBox("organisation edit", false);
  expect((await member.request.patch(`/api/work/projects/${mineId}`, { data: { description: "no longer" } })).status()).toBe(403);
  await setBox("organisation view", false);
  expect(await projectNames(member.request, teamSpace)).toEqual([]);
  expect(await projectNames(member.request)).not.toContain(mine);
  // Another section of the same team is untouched.
  await expect(page.getByRole("checkbox", { name: "fitness view" })).toBeChecked();

  // Toggles never widen: the viewer's are all on, and the viewer still cannot write.
  const widen = await request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, {
    data: { sections: [{ section: "organisation", can_view: true, can_edit: true, can_create_delete: true, can_share: true }] },
  });
  expect(widen.status()).toBe(200);
  expect((await createProject(viewer!.request, `E2E-mu ${TEAM} widened`, teamSpace)).status()).toBe(403);
  expect((await viewer!.request.patch(`/api/work/projects/${mineId}`, { data: { description: "widened" } })).status()).toBe(403);
  // Finance and platform are not sections a team can be given at all.
  for (const section of ["finance", "platform"]) {
    expect((await request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, { data: { sections: [{ section }] } })).status()).toBe(400);
  }

  // Put the member's Organisation access back for the checks that follow.
  await setBox("organisation view", true);
  await setBox("organisation edit", true);
  await setBox("organisation create/delete", true);
  expect(await projectNames(member.request, teamSpace)).toContain(mine);
});

test("team membership never opens a member's personal space, not even to the owner", async ({ request }) => {
  const secret = `E2E-mu ${TEAM} member private`;
  expect((await createProject(member!.request, secret)).status()).toBe(201);
  const memberSpace = personalSpaceOf(member!.id);

  for (const other of [viewer!.request, request]) {
    expect(await projectNames(other)).not.toContain(secret);
    expect((await other.get(`/api/work/projects?space=${memberSpace}`)).status()).toBe(404);
  }
  // And the member does not see into Phil's or the viewer's.
  expect((await member!.request.get(`/api/work/projects?space=${personalSpaceOf(PHIL.id)}`)).status()).toBe(404);
  expect((await member!.request.get(`/api/work/projects?space=${personalSpaceOf(viewer!.id)}`)).status()).toBe(404);
  const visible = (await getJson<{ projects: Array<{ space_id: string }> }>(member!.request, "/api/work/projects?status=all")).body;
  expect(new Set(visible.projects.map((p) => p.space_id))).toEqual(new Set([memberSpace, teamSpace]));
});

test("a new admin must enrol before acting; then invites members and viewers but not admins, and cannot touch the owner", async ({ page }) => {
  await openTeam(page);
  await page.getByRole("combobox", { name: `Role for ${memberName}` }).selectOption("admin");
  await expect(page.getByText("Role updated.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: `Role for ${memberName}` })).toHaveValue("admin");
  const admin = member!;

  // An admin must have an authenticator (0160). The promotion takes effect at once: until the new admin
  // enrols, their whole account answers nothing, their own personal space included.
  expect((await admin.request.get("/api/work/projects?status=all")).status()).toBeGreaterThanOrEqual(400);
  expect((await admin.request.post("/api/invites", { data: { email: emailFor("guest0"), team_id: teamId, role: "viewer" } })).status()).toBe(403);
  await enrolTotp(admin);
  expect(await projectNames(admin.request)).toEqual(expect.arrayContaining([`E2E-mu ${TEAM} member private`, `E2E-mu ${TEAM} member project`]));

  const asViewer = await admin.request.post("/api/invites", { data: { email: emailFor("guest"), team_id: teamId, role: "viewer" } });
  expect(asViewer.status()).toBe(201);
  expect((await admin.request.post("/api/invites", { data: { email: emailFor("guest2"), team_id: teamId, role: "member" } })).status()).toBe(201);
  const asAdmin = await admin.request.post("/api/invites", { data: { email: emailFor("guest3"), team_id: teamId, role: "admin" } });
  expect(asAdmin.status()).toBe(403);
  expect((await admin.request.post("/api/invites", { data: { email: emailFor("guest4"), team_id: teamId, role: "owner" } })).status()).toBe(400);
  // Nobody but the instance owner invites to no team at all.
  expect((await admin.request.post("/api/invites", { data: { email: emailFor("guest5"), role: "member" } })).status()).toBe(403);
  expect(localSql(`select email from public.invites where team_id = '${teamId}' and email like '%guest%' order by email`).flat()).toEqual([emailFor("guest"), emailFor("guest2")]);

  // Roles: an admin moves people between member and viewer, never to admin, never the owner.
  expect((await admin.request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, { data: { role: "member" } })).status()).toBe(200);
  expect((await admin.request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, { data: { role: "viewer" } })).status()).toBe(200);
  expect((await admin.request.patch(`/api/teams/${teamId}/members/${viewer!.id}`, { data: { role: "admin" } })).status()).toBe(403);
  expect((await admin.request.patch(`/api/teams/${teamId}/members/${PHIL.id}`, { data: { role: "viewer" } })).status()).toBe(403);
  expect((await admin.request.patch(`/api/teams/${teamId}/members/${PHIL.id}`, { data: { sections: [{ section: "organisation", can_view: false }] } })).status()).toBe(403);
  expect((await admin.request.delete(`/api/teams/${teamId}/members/${PHIL.id}`)).status()).toBe(403);
  expect((await admin.request.patch(`/api/teams/${teamId}`, { data: { transfer_to: admin.id } })).status()).toBe(403);
  expect((await admin.request.patch(`/api/teams/${teamId}`, { data: { successor_user_id: admin.id } })).status()).toBe(403);
  expect(sqlValue(`select role from public.team_members where team_id = '${teamId}' and user_id = '${PHIL.id}'`)).toBe("owner");
  expect(sqlValue(`select role from public.team_members where team_id = '${teamId}' and user_id = '${viewer!.id}'`)).toBe("viewer");

  // On the admin's own page: an invite form with no admin option, and no control over the owner.
  const adminPage = await admin.context.newPage();
  await openPeople(adminPage);
  await expect(adminPage.getByRole("button", { name: "Send invite" })).toBeVisible();
  await expect(adminPage.getByRole("combobox", { name: "Invite role" }).locator("option")).toHaveText(["member", "viewer"]);
  await expect(adminPage.getByRole("combobox", { name: "Role for Phil" })).toHaveCount(0);
  await expect(adminPage.getByRole("combobox", { name: `Role for ${viewerName}` }).locator("option")).toHaveText(["member", "viewer"]);
  await expect(adminPage.getByRole("combobox", { name: "Successor" })).toHaveCount(0);
  await adminPage.close();
});

test("someone who leaves is out, and what they made stays with the team", async ({ request }) => {
  const admin = member!;
  const page = await admin.context.newPage();
  await openPeople(page);
  await page.getByRole("button", { name: "Leave team" }).click();
  await expect(page.getByText("You left the team. Your contributions stay with it.")).toBeVisible();
  await expect(page.getByText("You are not in a team yet.")).toBeVisible();
  await page.close();

  expect((await admin.request.get(`/api/teams/${teamId}`)).status()).toBe(404);
  expect((await admin.request.get(`/api/work/projects?space=${teamSpace}`)).status()).toBe(404);
  expect((await createProject(admin.request, `E2E-mu ${TEAM} after leaving`, teamSpace)).status()).toBe(404);
  // The project they created is still the team's, still credited to them.
  expect(await projectNames(request, teamSpace)).toContain(`E2E-mu ${TEAM} member project`);
  expect(sqlValue(`select created_by from public.projects where space_id = '${teamSpace}' and name = 'E2E-mu ${TEAM} member project'`)).toBe(admin.id);
});

test("the owner cannot leave until a successor is named; then the successor owns the team", async ({ browser, page, request }) => {
  const keeperId = await keeperJoins(browser, request, teamId);
  const keeperName = KEEPER_EMAIL.split("@")[0];

  await openTeam(page);
  await page.getByRole("button", { name: "Leave team" }).click();
  await expect(page.getByText("Name a successor who is a member before leaving")).toBeVisible();
  expect(sqlValue(`select role from public.team_members where team_id = '${teamId}' and user_id = '${PHIL.id}'`)).toBe("owner");

  // Only a member can be named, and not oneself.
  expect((await request.patch(`/api/teams/${teamId}`, { data: { successor_user_id: TESS.id } })).status()).toBe(403);
  expect((await request.patch(`/api/teams/${teamId}`, { data: { successor_user_id: PHIL.id } })).status()).toBe(403);

  await page.getByRole("combobox", { name: "Successor" }).selectOption(keeperId);
  await expect(page.getByText("Successor updated.")).toBeVisible();
  await expect(page.getByText(keeperName, { exact: true }).locator("xpath=..").getByText("successor", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Leave team" }).click();
  await expect(page.getByText("You left the team. Your contributions stay with it.")).toBeVisible();
  philLeft = true;
  await expect(page.getByRole("button", { name: new RegExp(TEAM) })).toHaveCount(0);

  expect((await request.get(`/api/teams/${teamId}`)).status()).toBe(404);
  expect(localSql(`select user_id, role from public.team_members where team_id = '${teamId}' order by role`)).toEqual([
    [keeperId, "owner"],
    [viewer!.id, "viewer"],
  ]);
  expect(sqlValue(`select owner_user_id from public.teams where id = '${teamId}'`)).toBe(keeperId);
  expect(sqlValue(`select created_by from public.projects where id = '${teamProjectId}'`)).toBe(PHIL.id);
});
