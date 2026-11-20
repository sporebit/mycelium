/**
 * Second factor, sensitive paths, sessions and the access log, on throwaway
 * accounts only: nothing here changes how Phil or Tess sign in.
 *
 *   lead — invited by Phil with no team, then creates a team (so: an owner)
 *   adm  — invited into that team as admin
 */
import { test, type BrowserContext, type Page } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { PHIL } from "./support/users.ts";
import {
  CRON_HEADERS,
  MU_PASSWORD,
  MU_TEST_TIMEOUT,
  cleanUp,
  codeFor,
  createInvite,
  createTeam,
  emailFor,
  enrolTotp,
  expect,
  getJson,
  joinByInvite,
  reauth,
  remember,
  retireTeam,
  roomForCodes,
  sweepLeftovers,
  secondSession,
  signUpInvited,
  sqlValue,
  type Person,
} from "./support/multiuser.ts";

test.describe.configure({ mode: "serial", timeout: MU_TEST_TIMEOUT });

const SIGNED_OUT = { cookies: [], origins: [] };
const SENSITIVE_APIS = ["/api/account/access-log", "/api/admin/users", "/api/admin/teams", "/api/admin/grants", "/api/admin/invites", "/api/admin/audit"];

let lead: Person | undefined;
let adm: Person | undefined;
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
  if (lead && team) {
    const problem = await retireTeam(browser, lead.request, team.id);
    if (problem) console.warn(`[multiuser-security] ${team.name} not handed over: ${problem}`);
  }
  await cleanUp([adm, lead]);
});

test("an invited admin is told to set up an authenticator, and enrols one on the Security page", async ({ browser, request }) => {
  lead = await joinByInvite(browser, request, "lead");
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
  await expect(page.getByText("Your role requires an authenticator app. Enrol one below")).toBeVisible();
  await expect(page.getByText("First factor only.")).toBeVisible();
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
  await page.close();
});

test("a team owner with no authenticator is sent to enrol when they sign in", async ({ browser }) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await passwordSignIn(page, lead!.email);
  await page.waitForURL((u) => u.pathname === "/other/settings/security" && u.searchParams.get("enrol") === "totp");
  await expect(page.getByText("Your role requires an authenticator app. Enrol one below")).toBeVisible();
  await context.close();
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

// SECURITY (reported, not fixed here: the gate is not this spec's to change).
// A person who HAS an authenticator can stop after the password: the session
// stays at aal1, and everything except /admin, /api/admin and /api/account
// answers as if the code had been given. The second factor therefore does
// not protect the data, only those three prefixes.
test.fixme("SECURITY: a session that stopped before the code cannot read the person's data", async ({ browser }) => {
  const passwordOnly = await secondSession(browser, adm!); // password grant, no code: aal1
  const res = await passwordOnly.request.get("/api/work/projects?status=all");
  expect([401, 403]).toContain(res.status()); // answers 200 with the projects
  const page = await passwordOnly.newPage();
  await page.goto("/");
  expect(new URL(page.url()).pathname).toBe("/login"); // stays on / as a signed-in user
  await passwordOnly.close();
});

// SECURITY (reported, not fixed here). "Mandatory" second factor for owners
// and admins is a redirect on the sign-in page, nothing more: the owner
// below has no authenticator and the whole app answers.
test.fixme("SECURITY: an owner or admin with no authenticator cannot use the app until they enrol", async () => {
  expect(sqlValue(`select count(*) from auth.mfa_factors where user_id = '${lead!.id}'`)).toBe("0");
  const res = await lead!.request.get("/api/work/projects?status=all");
  expect(res.status()).toBe(403); // answers 200
  const invite = await lead!.request.post("/api/invites", { data: { email: emailFor("unenrolled-owner-invite"), team_id: team!.id, role: "admin" } });
  expect(invite.status()).toBe(403); // answers 201: an owner with no second factor mints admin invites
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
  const admin = await page.goto("/admin");
  expect(admin?.status()).toBe(403);
  await expect(page.locator("body")).toContainText("requires a second factor");
  // Re-auth itself needs the second factor first.
  expect((await passwordOnly.request.post("/api/auth/reauth", { data: { code: codeFor(adm!) } })).status()).toBe(403);
  await passwordOnly.close();

  // Phil's ordinary session (instance owner, no code given) is held to the same rule.
  for (const path of SENSITIVE_APIS) expect((await request.get(path)).status(), `Phil ${path}`).toBe(403);
  expect(sqlValue(`select count(*) from auth.users where id = '${adm!.id}'`)).toBe("1");
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
  await enrolTotp(lead!); // lead: aal2, no re-auth
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
      expect(r.status(), `${Object.keys(headers)[0]} ${path}`).toBeGreaterThanOrEqual(400);
    }
    const del = await bare.post("/api/account/delete", { headers, data: { confirm: PHIL.email } });
    expect(del.status()).toBeGreaterThanOrEqual(400);
  }
  // No principal at all: 401 for the API, the sign-in page for /admin.
  expect((await bare.get("/api/account/access-log")).status()).toBe(401);
  expect((await bare.get("/api/admin/users")).status()).toBe(401);
  await bare.dispose();
  expect(sqlValue(`select count(*) from auth.users where id = '${PHIL.id}'`)).toBe("1");
});

// SECURITY (reported, not fixed here; low, because it needs a server secret).
// The gate lets a system principal through before it reaches the
// sensitive-path check, and the route then finds the browser's session
// cookies. So a request that carries the cron secret AND an ordinary
// password-only session reads /api/account and /api/admin with no second
// factor and no re-auth. Shown with Phil's ordinary session, read-only.
test.fixme("SECURITY: the cron secret does not carry a browser session past the sensitive-path gate", async ({ request }) => {
  expect((await request.get("/api/account/access-log")).status()).toBe(403);
  const res = await request.get("/api/account/access-log", { headers: CRON_HEADERS });
  expect(res.status()).toBeGreaterThanOrEqual(400); // answers 200 with Phil's access log
});

test("the Security page lists every session and signs the others out", async ({ browser }) => {
  const elsewhere = await secondSession(browser, adm!);
  expect((await elsewhere.request.get("/api/teams")).status()).toBe(200);
  const elsewhereId = sessionIdOf(await currentAccessToken(elsewhere));

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

// SECURITY (reported, not fixed here). "Sign out there" deletes the session
// row, but the access token that device already holds keeps working until
// it expires (an hour by default): the gate checks the token's signature,
// not whether its session still exists.
test.fixme("SECURITY: a device signed out remotely is refused on its next request", async ({ browser }) => {
  const elsewhere = await secondSession(browser, adm!);
  const id = sessionIdOf(await currentAccessToken(elsewhere));
  expect((await signedIn!.request.delete(`/api/auth/sessions/${id}`)).status()).toBe(200);
  const after = (await elsewhere.request.get("/api/teams")).status();
  expect(after).toBe(401); // answers 200
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

async function currentAccessToken(context: BrowserContext): Promise<string> {
  const cookies = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  const raw = cookies.map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : decodeURIComponent(raw);
  return (JSON.parse(json) as { access_token: string }).access_token;
}
