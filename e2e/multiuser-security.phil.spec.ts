/**
 * Second factor, sensitive paths, sessions and the access log, on throwaway
 * accounts only: nothing here changes how Phil or Tess sign in.
 *
 *   lead — invited by Phil with no team; enrols, then creates a team (owner)
 *   adm  — invited into that team as admin; enrols on the Security page
 *   raw  — creates a team WITHOUT an authenticator, to show what that costs
 *
 * Since 0160 the second factor is enforced in the database as well as at the
 * gate: a session that owes a code, an owner or admin with no authenticator,
 * and a session that was signed out all read nothing.
 */
import { test, type BrowserContext, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL } from "./support/users.ts";
import {
  CRON_HEADERS,
  MU_PASSWORD,
  MU_TEST_TIMEOUT,
  accessTokenOf,
  cleanUp,
  codeFor,
  createInvite,
  createTeam,
  emailFor,
  enrolTotp,
  expect,
  getJson,
  joinByInvite,
  magicLinkPath,
  reauth,
  remember,
  rest,
  retireTeam,
  roomForCodes,
  sweepLeftovers,
  secondSession,
  signUpInvited,
  sqlValue,
  tessContext,
  type Person,
} from "./support/multiuser.ts";

test.describe.configure({ mode: "serial", timeout: MU_TEST_TIMEOUT });

const SIGNED_OUT = { cookies: [], origins: [] };
const SENSITIVE_APIS = ["/api/account/access-log", "/api/admin/users", "/api/admin/teams", "/api/admin/grants", "/api/admin/invites", "/api/admin/audit"];

let lead: Person | undefined;
let adm: Person | undefined;
let raw: Person | undefined;
let rawTeam: { id: string; name: string; spaceId: string } | undefined;
let team: { id: string; name: string; spaceId: string } | undefined;
/** adm, signed in through /login with the code: aal2, no re-auth yet. */
let signedIn: BrowserContext | undefined;

async function passwordSignIn(page: Page, email: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("radio", { name: "Password" }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(MU_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const sessionIdOf = (accessToken: string) =>
  (JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as { session_id: string }).session_id;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  await sweepLeftovers(browser);
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  for (const [owner, t] of [[lead, team], [raw, rawTeam]] as const) {
    if (!owner || !t) continue;
    const problem = await retireTeam(browser, owner.request, t.id);
    if (problem) console.warn(`[multiuser-security] ${t.name} not handed over: ${problem}`);
  }
  await cleanUp([adm, raw, lead]);
});

test("an invited admin is told to set up an authenticator, and enrols one on the Security page", async ({ browser, request }) => {
  lead = await joinByInvite(browser, request, "lead", { enrol: true });
  team = await createTeam(lead.request, "Security");
  const { link } = await createInvite(lead.request, { email: emailFor("adm"), teamId: team.id, role: "admin" });
  adm = await signUpInvited(browser, "adm");

  const page = await adm.context.newPage();
  await page.goto(link);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText(`You are in ${team.name} as admin.`)).toBeVisible();
  await expect(page.getByText("Your role requires an authenticator app.")).toBeVisible();
  await page.getByRole("button", { name: "Set up an authenticator" }).click();

  await page.waitForURL((u) => u.pathname === "/other/settings/security" && u.searchParams.get("enrol") === "totp");
  await expect(page.getByText("this account needs an authenticator app before it can be used")).toBeVisible();
  await expect(page.getByText("First factor only.")).toBeVisible();
  // An admin, and no authenticator yet: nothing is readable until there is one.
  expect((await adm.request.get("/api/work/projects?status=all")).status()).toBeGreaterThanOrEqual(400);
  await page.getByRole("button", { name: "Enrol an authenticator" }).click();
  await expect(page.getByAltText("TOTP enrolment QR code")).toBeVisible();
  await page.getByText("Can't scan? Show the secret").click();
  const secret = (await page.locator("details").getByText(/^[A-Z2-7]{16,}$/).textContent())!.trim();
  adm.totpSecret = secret;
  remember(adm);

  await page.getByPlaceholder("000000").fill(codeFor(adm));
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Authenticator enrolled. This session is now verified.")).toBeVisible();
  await expect(page.getByText("Verified with a second factor.")).toBeVisible();
  await expect(page.getByText("Authenticator app", { exact: true })).toBeVisible();
  expect(sqlValue(`select status from auth.mfa_factors where user_id = '${adm.id}'`)).toBe("verified");
  expect((await adm.request.get("/api/work/projects?status=all")).status()).toBe(200);
  await page.close();
});

test("someone who creates a team with no authenticator is sent to enrol when they sign in", async ({ browser, request }) => {
  raw = await joinByInvite(browser, request, "raw");
  // No role yet, no authenticator needed: an ordinary account works.
  expect((await raw.request.get("/api/work/projects?status=all")).status()).toBe(200);
  rawTeam = await createTeam(raw.request, "Unenrolled");

  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await passwordSignIn(page, raw.email);
  await page.waitForURL((u) => u.pathname === "/other/settings/security" && u.searchParams.get("enrol") === "totp");
  await expect(page.getByText("this account needs an authenticator app before it can be used")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enrol an authenticator" })).toBeVisible();
  await context.close();
});

// S2, closed by 0160: "mandatory" is enforced in the database. Owning a team
// with no authenticator leaves the account able to sign in and enrol, and
// nothing else, through the app or straight at the database.
test("SECURITY: an owner or admin with no authenticator cannot use the app until they enrol", async () => {
  expect(sqlValue(`select count(*) from auth.mfa_factors where user_id = '${raw!.id}'`)).toBe("0");
  for (const path of ["/api/work/projects?status=all", "/api/teams", "/api/grants", "/api/body-metrics", "/api/settings", "/api/export/space"]) {
    expect((await raw!.request.get(path)).status(), path).toBeGreaterThanOrEqual(400);
  }
  const invite = await raw!.request.post("/api/invites", { data: { email: emailFor("unenrolled-owner-invite"), team_id: rawTeam!.id, role: "admin" } });
  expect(invite.status()).toBe(403);
  expect(sqlValue(`select count(*) from public.invites where email = '${emailFor("unenrolled-owner-invite")}'`)).toBe("0");

  const direct = await rest("/rest/v1/projects?select=name", { token: raw!.session.access_token });
  expect(direct.status).toBe(403);
  expect(((await direct.json()) as { hint: string }).hint).toBe("enrol_required");
  expect((await rest("/rest/v1/teams?select=name", { token: raw!.session.access_token })).status).toBe(403);
  expect((await rest("/rest/v1/rpc/my_personal_space", { token: raw!.session.access_token, body: {} })).status).toBe(403);
  // The one question such a session may ask: must I enrol?
  const must = await rest("/rest/v1/rpc/requires_totp", { token: raw!.session.access_token, body: {} });
  expect(must.status).toBe(200);
  expect(await must.json()).toBe(true);

  await enrolTotp(raw!);
  expect((await raw!.request.get("/api/work/projects?status=all")).status()).toBe(200);
  const teams = (await getJson<{ teams: Array<{ id: string; my_role: string }> }>(raw!.request, "/api/teams")).body.teams;
  expect(teams).toEqual([expect.objectContaining({ id: rawTeam!.id, my_role: "owner" })]);
});

// INCOMPLETE in the hardening (reported). The database refuses such an
// account, but nothing tells the person: pages still open, empty, the API
// answers 500 rather than 403, and the one message that does surface says
// "Enter your authenticator code" to someone who has no authenticator.
test("an owner with no authenticator who opens a page is taken to enrol, and the API says 403 with a reason", async ({ browser, request }) => {
  const stuck = await joinByInvite(browser, request, "stuck");
  const t = await createTeam(stuck.request, "Stuck");
  try {
    const res = await stuck.request.get("/api/teams");
    expect(res.status()).toBe(403); // 500
    expect(((await res.json()) as { error: string }).error).not.toMatch(/Enter your authenticator code/); // says exactly that
    const page = await stuck.context.newPage();
    await page.goto("/work/projects");
    await page.waitForURL((u) => u.pathname === "/other/settings/security" && u.searchParams.get("enrol") === "totp"); // stays, empty
  } finally {
    await enrolTotp(stuck);
    await retireTeam(browser, stuck.request, t.id);
    await cleanUp([stuck]);
  }
});

test("sign-in asks for the code: a wrong one is refused, the right one lets them in", async ({ browser }) => {
  await roomForCodes(3);
  signedIn = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await signedIn.newPage();
  await passwordSignIn(page, adm!.email);
  await expect(page.getByText("Enter the six-digit code from your authenticator app.")).toBeVisible();

  const right = codeFor(adm!);
  const wrong = right === "000000" ? "000001" : "000000";
  await page.locator('input[name="code"]').fill(wrong);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code was not accepted")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");

  await page.locator('input[name="code"]').fill(codeFor(adm!));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
  await page.close();

  // From here on adm is this browser: signed in with the code (aal2), no re-auth yet.
  await adm!.context.close();
  adm!.context = signedIn;
  adm!.request = signedIn.request;
});

test("a wrong password is refused, and the page says so", async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("radio", { name: "Password" }).click();
  await page.locator('input[name="email"]').fill(adm!.email);
  await page.locator('input[name="password"]').fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  expect((await context.request.get("/api/teams")).status()).toBe(401);
  // A signed-out visitor to a page is sent to /login and brought back afterwards.
  await page.goto("/other/settings/people");
  await page.waitForURL((u) => u.pathname === "/login" && u.searchParams.get("next") === "/other/settings/people");
  await context.close();
});

test("a sign-in link for someone with an authenticator stops at the code prompt and reads nothing before it", async ({ browser }) => {
  await roomForCodes(2);
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  // The link in the email opens the callback route, which signs the first factor in.
  await page.goto(await magicLinkPath(adm!.email, "/other/settings/people"));
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("step")).toBe("mfa");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/other/settings/people");
  await expect(page.getByText("Enter the six-digit code from your authenticator app.")).toBeVisible();

  // Signed in by the link alone: nothing yet.
  for (const path of ["/api/work/projects?status=all", "/api/teams", "/api/settings"]) {
    const res = await context.request.get(path);
    expect(res.status(), path).toBe(403);
    expect(((await res.json()) as { reason: string }).reason, path).toBe("mfa_required");
  }
  expect((await rest("/rest/v1/projects?select=name", { token: await accessTokenOf(context) })).status).toBe(403);

  // The code finishes the sign-in and goes where the link was going.
  await page.locator('input[name="code"]').fill(codeFor(adm!));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname === "/other/settings/people");
  await expect(page.getByRole("heading", { name: "People & teams" })).toBeVisible();
  expect((await context.request.get("/api/teams")).status()).toBe(200);
  // A link is good once.
  await context.close();
});

test("an invite never changes the role of someone already in the team", async () => {
  // The admin invites the OWNER's address as a viewer. Before 0160, accepting it left the team with no owner.
  const asViewer = await createInvite(adm!.request, { email: lead!.email, teamId: team!.id, role: "viewer" });
  const page = await lead!.context.newPage();
  await page.goto(asViewer.link);
  await expect(page.getByText(`invited ${lead!.email} as viewer.`)).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByText(`You are in ${team!.name} as owner.`)).toBeVisible();
  await page.close();
  expect(sqlValue(`select role from public.team_members where team_id = '${team!.id}' and user_id = '${lead!.id}'`)).toBe("owner");
  expect(sqlValue(`select owner_user_id from public.teams where id = '${team!.id}'`)).toBe(lead!.id);
  // The invite is spent all the same.
  expect((await lead!.request.post(`/api/invites/${asViewer.token}`)).status()).toBe(409);

  // The owner invites the ADMIN's address as a viewer: accepting is not a demotion either…
  const down = await createInvite(lead!.request, { email: adm!.email, teamId: team!.id, role: "viewer" });
  const accepted = await adm!.request.post(`/api/invites/${down.token}`);
  expect(accepted.status()).toBe(200);
  expect(((await accepted.json()) as { role: string }).role).toBe("admin");
  expect(sqlValue(`select role from public.team_members where team_id = '${team!.id}' and user_id = '${adm!.id}'`)).toBe("admin");
  // …and a member is not promoted by an admin invite they were sent by mistake. (Roles change only under Members.)
  expect(localSql(`select role, count(*) from public.team_members where team_id = '${team!.id}' group by role order by role`)).toEqual([
    ["admin", "1"],
    ["owner", "1"],
  ]);
});

// S1, closed by 0160 and the gate. A person who HAS an authenticator and
// stops after the password holds a session at aal1: it used to read
// everything outside /admin and /api/account. Now it reads nothing.
test("SECURITY: a session that stopped before the code cannot read the person's data", async ({ browser }) => {
  const passwordOnly = await secondSession(browser, adm!); // password grant, no code: aal1
  const res = await passwordOnly.request.get("/api/work/projects?status=all");
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { reason: string }).reason).toBe("mfa_required");
  for (const path of ["/api/teams", "/api/grants", "/api/body-metrics", "/api/settings", "/api/export/space", "/api/rundowns"]) {
    expect((await passwordOnly.request.get(path)).status(), path).toBe(403);
  }
  // Nor can it write.
  expect((await passwordOnly.request.post("/api/invites", { data: { email: emailFor("by-half-session"), team_id: team!.id, role: "viewer" } })).status()).toBe(403);
  // Past the gate, straight at the database with the same token: refused there too.
  const token = await accessTokenOf(passwordOnly);
  const direct = await rest("/rest/v1/projects?select=name", { token });
  expect(direct.status).toBe(403);
  expect(((await direct.json()) as { hint: string }).hint).toBe("mfa_required");
  expect((await rest("/rest/v1/team_members?select=role", { token })).status).toBe(403);

  // A page takes them to the code prompt and remembers where they were going.
  const page = await passwordOnly.newPage();
  await page.goto("/work/projects");
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("step")).toBe("mfa");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/work/projects");
  await expect(page.getByText("Enter the six-digit code from your authenticator app.")).toBeVisible();
  await passwordOnly.close();
});

test("sensitive paths need the second factor: a password-only session is refused", async ({ browser, request }) => {
  const passwordOnly = await secondSession(browser, adm!);
  for (const path of SENSITIVE_APIS) {
    const res = await passwordOnly.request.get(path);
    expect(res.status(), path).toBe(403);
    expect(((await res.json()) as { reason: string }).reason, path).toBe("mfa_required");
  }
  const del = await passwordOnly.request.post("/api/account/delete", { data: { confirm: adm!.email } });
  expect(del.status()).toBe(403);
  expect(((await del.json()) as { reason: string }).reason).toBe("mfa_required");
  const page = await passwordOnly.newPage();
  await page.goto("/admin");
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
  // Re-auth itself needs the second factor first.
  expect((await passwordOnly.request.post("/api/auth/reauth", { data: { code: codeFor(adm!) } })).status()).toBe(403);
  await passwordOnly.close();
  expect(sqlValue(`select count(*) from auth.users where id = '${adm!.id}'`)).toBe("1");

  // Someone with no authenticator at all (Tess, an ordinary member of nothing): the same refusal, in words.
  const tess = await tessContext(browser);
  for (const path of SENSITIVE_APIS) {
    const res = await tess.request.get(path);
    expect(res.status(), `Tess ${path}`).toBe(403);
    expect(((await res.json()) as { reason: string }).reason).toBe("mfa_required");
  }
  const tessPage = await tess.newPage();
  expect((await tessPage.goto("/admin"))?.status()).toBe(403);
  await expect(tessPage.locator("body")).toContainText("requires a second factor");
  await tess.close();

  // Phil, the instance owner, signed in with his code but with no fresh re-auth: still not enough.
  for (const path of SENSITIVE_APIS) {
    const res = await request.get(path);
    expect(res.status(), `Phil ${path}`).toBe(403);
    expect(((await res.json()) as { reason: string }).reason, `Phil ${path}`).toBe("reauth_required");
  }
});

test("sensitive paths need a fresh re-auth on top: verified at sign-in is not enough", async () => {
  for (const path of SENSITIVE_APIS) {
    const res = await signedIn!.request.get(path);
    expect(res.status(), path).toBe(403);
    expect(((await res.json()) as { reason: string }).reason, path).toBe("reauth_required");
  }
  const del = await signedIn!.request.post("/api/account/delete", { data: { confirm: adm!.email } });
  expect(del.status()).toBe(403);
  expect(((await del.json()) as { reason: string }).reason).toBe("reauth_required");
  expect(sqlValue(`select count(*) from auth.users where id = '${adm!.id}'`)).toBe("1");

  const page = await signedIn!.newPage();
  const admin = await page.goto("/admin");
  expect(admin?.status()).toBe(403);
  await expect(page.locator("body")).toContainText("/other/settings/security?reauth=1&next=%2Fadmin");
  await page.close();
});

test("the Security page asks for the code again, refuses a wrong one, and then opens the access log", async () => {
  await roomForCodes(3);
  const page = await signedIn!.newPage();
  await page.goto("/other/settings/security");
  await expect(page.getByText("Verified with a second factor.")).toBeVisible();
  await expect(page.getByText("Confirm your authenticator to view this.")).toBeVisible();
  await page.getByRole("link", { name: "Confirm" }).click();
  await expect(page.getByText("That page needs your authenticator code again.")).toBeVisible();

  const right = codeFor(adm!);
  const form = page.locator("form", { has: page.getByRole("button", { name: "Confirm" }) });
  await form.getByPlaceholder("000000").fill(right === "000000" ? "000001" : "000000");
  await form.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("That code was not accepted")).toBeVisible();
  expect((await signedIn!.request.get("/api/account/access-log")).status()).toBe(403);

  await form.getByPlaceholder("000000").fill(codeFor(adm!));
  const confirmed = page.waitForResponse((r) => r.url().endsWith("/api/auth/reauth") && r.status() === 200);
  await form.getByRole("button", { name: "Confirm" }).click();
  await confirmed;
  await page.waitForURL((u) => u.pathname === "/other/settings/security" && !u.searchParams.has("reauth"));
  await expect(page.getByText("Confirm your authenticator to view this.")).toHaveCount(0);
  await expect(page.getByText("WHO HAS SEEN MY DATA")).toBeVisible();
  expect((await signedIn!.request.get("/api/account/access-log")).status()).toBe(200);
  await page.close();
});

test("with both, a person who is not the instance owner still gets nothing from /admin", async () => {
  await reauth(adm!); // the ten minutes may have run out on a slow server
  const page = await signedIn!.newPage();
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Only the instance owner can open this page.")).toBeVisible();
  await page.close();

  for (const path of SENSITIVE_APIS.filter((p) => p.startsWith("/api/admin"))) {
    const r = await signedIn!.request.get(path);
    if (r.status() === 200) {
      const body = (await r.json()) as Record<string, unknown[]>;
      for (const [key, rows] of Object.entries(body)) expect(rows, `${path} ${key}`).toEqual([]);
    } else {
      expect(r.status(), path).toBe(403);
    }
  }
  expect((await signedIn!.request.patch(`/api/admin/users/${lead!.id}`, { data: { disabled: true } })).status()).toBe(403);
  expect((await signedIn!.request.delete(`/api/admin/users/${lead!.id}`)).status()).toBeGreaterThanOrEqual(400);
  expect((await signedIn!.request.post(`/api/admin/teams/${team!.id}/successor`, { data: { user_id: adm!.id } })).status()).toBeGreaterThanOrEqual(400);
  expect((await signedIn!.request.patch(`/api/admin/users/${adm!.id}/features`, { data: { voice_capture_enabled: true } })).status()).toBeGreaterThanOrEqual(400);
  expect(localSql(`select disabled_at is null from public.profiles where id = '${lead!.id}'`)).toEqual([["t"]]);
  expect(sqlValue(`select owner_user_id from public.teams where id = '${team!.id}'`)).toBe(lead!.id);
});

test("a re-auth belongs to the person who gave it, and no shared secret opens a sensitive path", async ({ playwright, baseURL }) => {
  // lead is signed in with a code (aal2) and has given no re-auth of their own.
  const stolen = (await signedIn!.cookies()).find((c) => c.name === "reauth");
  expect(stolen).toBeTruthy();
  await lead!.context.addCookies([stolen!]);
  const res = await lead!.request.get("/api/account/access-log");
  expect(res.status()).toBe(403);
  expect(((await res.json()) as { reason: string }).reason).toBe("reauth_required");
  await lead!.context.clearCookies({ name: "reauth" });

  // The server-to-server secrets act without a second factor; they must not reach the admin or account routes.
  // Explicitly no cookies: a request context made inside a test otherwise inherits the project's signed-in state.
  const bare = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  for (const headers of [{ "x-api-secret": "e2e-api-secret" }, CRON_HEADERS]) {
    for (const path of SENSITIVE_APIS) {
      const r = await bare.get(path, { headers });
      expect(r.status(), `${Object.keys(headers)[0]} ${path}`).toBe(403);
    }
    const del = await bare.post("/api/account/delete", { headers, data: { confirm: PHIL.email } });
    expect(del.status()).toBe(403);
  }
  // No principal at all: 401 for the API, the sign-in page for /admin.
  expect((await bare.get("/api/account/access-log")).status()).toBe(401);
  expect((await bare.get("/api/admin/users")).status()).toBe(401);
  await bare.dispose();
  expect(sqlValue(`select count(*) from auth.users where id = '${PHIL.id}'`)).toBe("1");
});

// S7, closed in the gate and the user client. A server secret used to be
// waved through before the sensitive-path check, and a secret that names no
// user (the cron bearer) then fell back to whatever session cookies the
// request carried. Shown with adm's browser, which holds everything a person
// can hold: a session with the code and a fresh re-auth.
test("SECURITY: the cron secret does not carry a browser session past the sensitive-path gate", async () => {
  await reauth(adm!);
  expect((await signedIn!.request.get("/api/account/access-log")).status()).toBe(200);
  expect((await signedIn!.request.get("/api/teams")).status()).toBe(200);
  for (const headers of [CRON_HEADERS, { "x-api-secret": "e2e-api-secret" }]) {
    const name = Object.keys(headers)[0];
    // A secret is not a person with a second factor: no admin, no account routes, whatever cookies ride along.
    for (const path of SENSITIVE_APIS) expect((await signedIn!.request.get(path, { headers })).status(), `${name} ${path}`).toBe(403);
    expect((await signedIn!.request.post("/api/account/delete", { headers, data: { confirm: adm!.email } })).status(), name).toBe(403);
    // Elsewhere the secret acts as itself, never as the browser it arrived with.
    const teams = await signedIn!.request.get("/api/teams", { headers });
    expect(teams.status(), `${name} /api/teams`).toBe(401);
    expect(await teams.text()).not.toContain(team!.id);
  }
  expect(sqlValue(`select count(*) from auth.users where id = '${adm!.id}'`)).toBe("1");
});

test("the Security page lists every session and signs the others out", async ({ browser }) => {
  const elsewhere = await secondSession(browser, adm!, { withCode: true });
  expect((await elsewhere.request.get("/api/teams")).status()).toBe(200);
  const elsewhereId = sessionIdOf(await accessTokenOf(elsewhere));

  const page = await signedIn!.newPage();
  await page.goto("/other/settings/security");
  await expect(page.getByText("this device", { exact: true })).toHaveCount(1);
  const others = page.getByRole("button", { name: "Sign out there" });
  await expect(others.first()).toBeVisible();
  const before = await others.count();
  expect(before).toBeGreaterThanOrEqual(1);
  expect(Number(sqlValue(`select count(*) from auth.sessions where user_id = '${adm!.id}'`))).toBe(before + 1);

  // Nobody ends someone else's session.
  expect((await lead!.request.delete(`/api/auth/sessions/${elsewhereId}`)).status()).toBe(404);
  expect(sqlValue(`select count(*) from auth.sessions where id = '${elsewhereId}'`)).toBe("1");

  for (let left = before; left > 0; left--) {
    const ended = page.waitForResponse((r) => r.url().includes("/api/auth/sessions/") && r.request().method() === "DELETE");
    await others.first().click();
    expect((await ended).status()).toBe(200);
    await expect(others).toHaveCount(left - 1);
  }
  await expect(page.getByText("this device", { exact: true })).toHaveCount(1);
  expect(sqlValue(`select count(*) from auth.sessions where user_id = '${adm!.id}'`)).toBe("1");
  expect(sqlValue(`select count(*) from public.audit_events where action = 'session_revoked' and actor_id = '${adm!.id}'`)).toBe(String(before));
  // This device is untouched.
  expect((await signedIn!.request.get("/api/teams")).status()).toBe(200);
  await page.close();
  await elsewhere.close();
});

// S8, closed by 0160: every token names its session, and the database looks
// it up. A device signed out from elsewhere used to keep working until its
// token expired (an hour); now its very next read is refused.
test("SECURITY: a device signed out remotely is refused on its next request", async ({ browser }) => {
  const elsewhere = await secondSession(browser, adm!, { withCode: true });
  const token = await accessTokenOf(elsewhere);
  expect((await elsewhere.request.get("/api/work/projects?status=all")).status()).toBe(200);
  expect((await rest("/rest/v1/projects?select=name", { token })).status).toBe(200);

  expect((await signedIn!.request.delete(`/api/auth/sessions/${sessionIdOf(token)}`)).status()).toBe(200);

  for (const path of ["/api/teams", "/api/work/projects?status=all", "/api/body-metrics", "/api/settings", "/api/grants", "/api/export/space"]) {
    const res = await elsewhere.request.get(path);
    expect(res.status(), path).toBeGreaterThanOrEqual(400);
  }
  const direct = await rest("/rest/v1/projects?select=name", { token });
  expect(direct.status).toBe(403);
  expect(((await direct.json()) as { hint: string }).hint).toBe("session_ended");
  expect((await rest("/rest/v1/rpc/my_personal_space", { token, body: {} })).status).toBe(403);
  // It cannot write either, nor sign the surviving device out in return.
  expect((await elsewhere.request.post("/api/invites", { data: { email: emailFor("by-ended-session"), team_id: team!.id, role: "viewer" } })).status()).toBeGreaterThanOrEqual(400);
  expect((await elsewhere.request.delete(`/api/auth/sessions/${sessionIdOf(await accessTokenOf(signedIn!))}`)).status()).toBeGreaterThanOrEqual(400);
  expect((await signedIn!.request.get("/api/teams")).status()).toBe(200);

  // Its pages show none of the person's data.
  const page = await elsewhere.newPage();
  await page.goto("/work/projects");
  await expect(page.getByRole("heading", { name: "Projects" }).or(page.getByRole("button", { name: "Sign in" })).or(page.getByRole("button", { name: "Email me a link" })).first()).toBeVisible();
  await expect(page.getByText("General", { exact: true })).toHaveCount(0);
  await elsewhere.close();
});

// INCOMPLETE in the hardening (reported). The signed-out device is refused
// by the database, but the gate does not know: the page still opens and
// says "Could not load projects.", the dashboard shows grey placeholders,
// and the API answers 500. It should land on the sign-in page, and the API
// should say 401.
test("a device signed out remotely is taken to the sign-in page, and the API says 401", async ({ browser }) => {
  const elsewhere = await secondSession(browser, adm!, { withCode: true });
  expect((await signedIn!.request.delete(`/api/auth/sessions/${sessionIdOf(await accessTokenOf(elsewhere))}`)).status()).toBe(200);
  expect((await elsewhere.request.get("/api/teams")).status()).toBe(401); // 500
  const page = await elsewhere.newPage();
  await page.goto("/work/projects");
  expect(new URL(page.url()).pathname).toBe("/login"); // stays on /work/projects with an error banner
  await elsewhere.close();
});

test("after someone reads what was shared with them, the owner sees it under Who has seen my data", async () => {
  // lead shares Fitness with adm, with the second factor freshly confirmed.
  await reauth(lead!);
  const note = `E2E-mu ${team!.name} weigh-in`;
  expect((await lead!.request.post("/api/body-metrics", { data: { date: "2019-03-04", weight: 70, notes: note } })).status()).toBe(200);
  const grant = await lead!.request.post("/api/grants", { data: { grantee_id: adm!.id, section: "fitness", verbs: ["view"] } });
  expect(grant.status()).toBe(201);

  const read = await signedIn!.request.get("/api/body-metrics?days=0");
  expect(((await read.json()) as { entries: Array<{ notes: string | null }> }).entries.map((e) => e.notes)).toContain(note);

  // The audit row is written after the response; wait for it to be readable.
  await expect
    .poll(async () => {
      const log = (await (await lead!.request.get("/api/account/access-log")).json()) as { events: Array<{ action: string; actor_id: string; section: string | null }> };
      return log.events.filter((e) => e.action === "cross_user_read" && e.actor_id === adm!.id && e.section === "fitness").length;
    })
    .toBeGreaterThan(0);

  const page = await lead!.context.newPage();
  await page.goto("/other/settings/security");
  const admName = adm!.email.split("@")[0];
  await expect(page.getByText(`${admName} · cross user read · fitness.body`).first()).toBeVisible();
  await expect(page.getByText("/api/body-metrics").first()).toBeVisible();
  await page.close();

  await reauth(adm!);
  // The reader's own log does not show the owner's events, and the reader's own reads of their own data log nothing.
  const mine = (await getJson<{ events: Array<{ action: string }> }>(signedIn!.request, "/api/account/access-log")).body;
  expect(mine.events.filter((e) => e.action === "cross_user_read")).toEqual([]);
});
