/**
 * Direct grants: one person shares part of their personal space with
 * another. Two throwaway accounts, neither in any team:
 *
 *   ann — shares; has an authenticator and a fresh re-auth, which sharing
 *         requires (enforced since 0160: the route wants both, the database
 *         function wants the second factor)
 *   bea — is shared with; has no authenticator, as a new member would not
 *
 * Tess is the bystander who must see none of it. Nothing of Phil's or
 * Tess's is ever shared here.
 */
import { test, type Page } from "@playwright/test";
import { localSql, localStackEnv } from "../lib/access/introspect.ts";
import {
  MU_TEST_TIMEOUT,
  RUN,
  cleanUp,
  createProject,
  enrolTotp,
  expect,
  getJson,
  joinByInvite,
  personalSpaceOf,
  projectNames,
  reauth,
  rest,
  roomForCodes,
  secondSession,
  accessTokenOf,
  codeFor,
  sqlValue,
  tessContext,
  sweepLeftovers,
  type Person,
} from "./support/multiuser.ts";

test.describe.configure({ mode: "serial", timeout: MU_TEST_TIMEOUT });

const PLAN = `E2E-mu-${RUN} Ann plan`;
const FRIEND = `E2Emu${RUN}friend`;
const WEIGH_IN = `E2E-mu-${RUN} Ann weigh-in`;

let ann: Person | undefined;
let bea: Person | undefined;
let annSpace = "";
let planId = "";
const annName = () => ann!.email.split("@")[0];
const beaName = () => bea!.email.split("@")[0];

async function openPeople(page: Page) {
  await page.goto("/other/settings/people?tab=sharing");
  await expect(page.getByRole("heading", { name: "People & teams" })).toBeVisible();
}
const bodyNotes = async (who: Person) =>
  (await getJson<{ entries: Array<{ notes: string | null }> }>(who.request, "/api/body-metrics?days=0")).body.entries.map((e) => e.notes);
const peopleText = async (who: Person) => (await who.request.get("/api/people?tier=all&archived=all")).text();
const activeGrants = () => localSql(`select section, array_to_string(verbs, '+') from public.user_grants where grantor_id = '${ann!.id}' and revoked_at is null order by created_at`);

test.beforeAll(async ({ browser }) => {
  test.setTimeout(MU_TEST_TIMEOUT);
  await sweepLeftovers(browser);
});

test.afterAll(async () => {
  test.setTimeout(MU_TEST_TIMEOUT);
  await cleanUp([bea, ann]);
});

test("before anything is shared, the other person sees none of it", async ({ browser, request }) => {
  ann = await joinByInvite(browser, request, "ann");
  bea = await joinByInvite(browser, request, "bea");
  annSpace = personalSpaceOf(ann.id);

  const made = await createProject(ann.request, PLAN);
  expect(made.status()).toBe(201);
  planId = ((await made.json()) as { project: { id: string } }).project.id;
  expect((await ann.request.post("/api/people", { data: { first_name: FRIEND, last_name: "Private" } })).ok()).toBe(true);
  expect((await ann.request.post("/api/body-metrics", { data: { date: "2019-05-06", weight: 61, notes: WEIGH_IN } })).status()).toBe(200);

  expect(await projectNames(bea.request)).not.toContain(PLAN);
  expect(await peopleText(bea)).not.toContain(FRIEND);
  expect(await bodyNotes(bea)).not.toContain(WEIGH_IN);
  expect((await bea.request.get(`/api/work/projects?space=${annSpace}`)).status()).toBe(404);
  expect((await bea.request.get(`/api/work/projects/${planId}`)).status()).toBe(404);

  const page = await bea.context.newPage();
  await openPeople(page);
  await expect(page.getByText("Nobody has shared anything with you.")).toBeVisible();
  await page.close();

  // ann is the one who shares: authenticator, signed in with it, code confirmed again just now.
  await enrolTotp(ann);
  await reauth(ann);
});

test("finance and platform cannot be shared: not offered, refused by the API, refused by the database", async () => {
  const page = await ann!.context.newPage();
  await openPeople(page);
  await page.getByRole("textbox", { name: "Their email" }).fill(bea!.email);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText(beaName(), { exact: true })).toBeVisible();
  const offered = await page.getByRole("combobox", { name: "Section" }).locator("option").allTextContents();
  expect(offered).toEqual(["organisation", "fitness", "health", "studio", "drops", "ventures", "journal", "places", "reminders", "media"]);
  await page.close();

  for (const section of ["finance", "platform"]) {
    const res = await ann!.request.post("/api/grants", { data: { grantee_id: bea!.id, section, verbs: ["view"] } });
    expect(res.status(), section).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("section cannot be shared");
  }

  // Past the route, straight at the database with ann's own token: the function and the table both refuse.
  const env = localStackEnv();
  const direct = (path: string, body: unknown) =>
    fetch(`${env.apiUrl}/rest/v1/${path}`, {
      method: "POST",
      headers: { apikey: env.anonKey, authorization: `Bearer ${ann!.session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  for (const section of ["finance", "platform"]) {
    const rpc = await direct("rpc/create_user_grant", { p_grantee: bea!.id, p_section: section, p_entity_groups: [], p_verbs: ["view"] });
    expect(rpc.ok, `rpc ${section}`).toBe(false);
    const insert = await direct("user_grants", { grantor_id: ann!.id, grantee_id: bea!.id, section, verbs: ["view"] });
    expect(insert.ok, `insert ${section}`).toBe(false);
  }
  // Nor can a grant be written for someone else's space, or a shareable one inserted around the function.
  expect((await direct("user_grants", { grantor_id: bea!.id, grantee_id: ann!.id, section: "fitness", verbs: ["view"] })).ok).toBe(false);
  expect((await direct("user_grants", { grantor_id: ann!.id, grantee_id: bea!.id, section: "fitness", verbs: ["view"] })).ok).toBe(false);

  // Malformed requests.
  const bad = [
    { grantee_id: bea!.id, section: "organisation", verbs: [] },
    { grantee_id: bea!.id, section: "organisation", verbs: ["own"] },
    { grantee_id: bea!.id, section: "organisation", entity_groups: ["body"], verbs: ["view"] },
    { grantee_id: ann!.id, section: "organisation", verbs: ["view"] },
    { grantee_id: "00000000-0000-4000-8000-000000000000", section: "organisation", verbs: ["view"] },
    { section: "organisation", verbs: ["view"] },
  ];
  for (const data of bad) expect((await ann!.request.post("/api/grants", { data })).status(), JSON.stringify(data)).toBe(400);
  expect(activeGrants()).toEqual([]);
});

test("ann shares the Work part of Organisation, view only, from the page", async () => {
  // Sharing needs the authenticator code confirmed in the last ten minutes; ann gave it a moment ago.

  const page = await ann!.context.newPage();
  await openPeople(page);
  await page.getByRole("textbox", { name: "Their email" }).fill(bea!.email);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText(beaName(), { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Section" }).selectOption("organisation");
  await page.getByRole("checkbox", { name: "tickets", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: "view", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText("Shared.", { exact: true })).toBeVisible();
  await expect(page.getByText("organisation · tickets · view", { exact: true })).toBeVisible();
  await page.close();
  expect(activeGrants()).toEqual([["organisation", "view"]]);
});

test("the other person sees exactly that: listed under Shared with me, readable, nothing else, nothing writable", async ({ browser }) => {
  expect(await projectNames(bea!.request)).toContain(PLAN);
  expect((await bea!.request.get(`/api/work/projects/${planId}`)).status()).toBe(200);
  // Same section, a group that was not ticked.
  expect(await peopleText(bea!)).not.toContain(FRIEND);
  // Another section.
  expect(await bodyNotes(bea!)).not.toContain(WEIGH_IN);

  // View only.
  expect((await bea!.request.patch(`/api/work/projects/${planId}`, { data: { description: "edited by bea" } })).status()).toBe(403);
  expect((await bea!.request.delete(`/api/work/projects/${planId}`)).status()).toBe(403);
  expect((await createProject(bea!.request, `E2E-mu-${RUN} planted`, annSpace)).status()).toBe(403);
  expect(sqlValue(`select description from public.projects where id = '${planId}'`)).toBeNull();
  // Being shared with is not being able to share onward.
  expect((await bea!.request.delete(`/api/grants/00000000-0000-4000-8000-000000000000`)).status()).toBe(404);

  const page = await bea!.context.newPage();
  await openPeople(page);
  const row = page.getByRole("listitem").filter({ hasText: annName() });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("organisation · tickets · view", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Decline" })).toBeVisible();
  await page.close();

  // A bystander sees nothing and cannot remove a grant they are not party to.
  const tess = await tessContext(browser);
  expect(await projectNames(tess.request)).not.toContain(PLAN);
  expect((await tess.request.get(`/api/work/projects?space=${annSpace}`)).status()).toBe(404);
  const grantId = sqlValue(`select id from public.user_grants where grantor_id = '${ann!.id}' and revoked_at is null`)!;
  expect((await tess.request.delete(`/api/grants/${grantId}`)).status()).toBe(404);
  await tess.close();
  expect(activeGrants()).toEqual([["organisation", "view"]]);
  // And the grant gives ann nothing of bea's.
  expect((await ann!.request.get(`/api/work/projects?space=${personalSpaceOf(bea!.id)}`)).status()).toBe(404);
});

test("with edit added, the other person can change a row but still not create one", async () => {
  const page = await ann!.context.newPage();
  await openPeople(page);
  await page.getByRole("textbox", { name: "Their email" }).fill(bea!.email);
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("combobox", { name: "Section" }).selectOption("organisation");
  await page.getByRole("checkbox", { name: "tickets", exact: true }).check();
  await page.getByRole("checkbox", { name: "edit", exact: true }).check();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText("organisation · tickets · view, edit", { exact: true })).toBeVisible();
  await page.close();

  const edited = await bea!.request.patch(`/api/work/projects/${planId}`, { data: { description: "edited by bea" } });
  expect(edited.status()).toBe(200);
  expect(sqlValue(`select description from public.projects where id = '${planId}'`)).toBe("edited by bea");
  // Creating is a different verb. (Archiving a project is an update, so it rides on edit; it is not tried here.)
  expect((await createProject(bea!.request, `E2E-mu-${RUN} planted`, annSpace)).status()).toBe(403);
  expect(sqlValue(`select count(*) from public.projects where space_id = '${annSpace}' and name like '%planted'`)).toBe("0");
});

test("the other person declines: first the edit share, then the view share, and it is gone", async () => {
  const page = await bea!.context.newPage();
  await openPeople(page);
  const editRow = page.getByRole("listitem").filter({ hasText: "organisation · tickets · view, edit" });
  await editRow.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Declined.", { exact: true })).toBeVisible();
  await expect(editRow).toHaveCount(0);
  expect((await bea!.request.patch(`/api/work/projects/${planId}`, { data: { description: "after declining" } })).status()).toBe(403);
  expect(await projectNames(bea!.request)).toContain(PLAN);

  await page.getByRole("listitem").filter({ hasText: annName() }).getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Nobody has shared anything with you.")).toBeVisible();
  await page.close();
  expect(await projectNames(bea!.request)).not.toContain(PLAN);
  expect((await bea!.request.get(`/api/work/projects/${planId}`)).status()).toBe(404);
  expect(activeGrants()).toEqual([]);

  // ann no longer lists either as given.
  const annPage = await ann!.context.newPage();
  await openPeople(annPage);
  await expect(annPage.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await annPage.close();
});

test("ann revokes a share from the page and the other person loses it at once", async () => {
  const shared = await ann!.request.post("/api/grants", { data: { grantee_id: bea!.id, section: "fitness", verbs: ["view"] } });
  expect(shared.status()).toBe(201);
  expect(await bodyNotes(bea!)).toContain(WEIGH_IN);
  // Fitness was shared, Organisation was not.
  expect(await projectNames(bea!.request)).not.toContain(PLAN);

  const page = await ann!.context.newPage();
  await openPeople(page);
  const row = page.getByRole("listitem").filter({ hasText: "fitness · whole section · view" });
  await expect(row).toContainText(beaName());
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Revoked.", { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.close();

  expect(await bodyNotes(bea!)).not.toContain(WEIGH_IN);
  // A revoked grant cannot be revoked again, and nothing brings it back.
  const id = (await shared.json() as { id: string }).id;
  expect((await ann!.request.delete(`/api/grants/${id}`)).status()).toBe(404);
  expect((await bea!.request.delete(`/api/grants/${id}`)).status()).toBe(404);
});

test("a share with an expiry stops by itself", async () => {
  // Already past: never opens anything.
  const past = await ann!.request.post("/api/grants", { data: { grantee_id: bea!.id, section: "fitness", verbs: ["view"], expires_at: new Date(Date.now() - 60_000).toISOString() } });
  expect(past.status()).toBe(201);
  expect(await bodyNotes(bea!)).not.toContain(WEIGH_IN);

  // A few seconds ahead: open now, shut shortly after, with nobody doing anything.
  const soon = new Date(Date.now() + 8_000).toISOString();
  const brief = await ann!.request.post("/api/grants", { data: { grantee_id: bea!.id, section: "fitness", verbs: ["view"], expires_at: soon } });
  expect(brief.status()).toBe(201);
  expect(await bodyNotes(bea!)).toContain(WEIGH_IN);

  const page = await bea!.context.newPage();
  await openPeople(page);
  await expect(page.getByRole("listitem").filter({ hasText: annName() }).first()).toContainText("until");
  await page.close();

  await expect.poll(() => bodyNotes(bea!), { timeout: 60_000 }).not.toContain(WEIGH_IN);
  expect(sqlValue(`select count(*) from public.user_grants where grantor_id = '${ann!.id}' and revoked_at is null and expires_at > now()`)).toBe("0");

  for (const res of [past, brief]) await ann!.request.delete(`/api/grants/${((await res.json()) as { id: string }).id}`);
  expect(activeGrants()).toEqual([]);
});

// S3, closed by 0160 and the route. Sharing opens a personal space to
// someone else: it now needs a session with the second factor (checked by
// the route AND by the database function) and that factor confirmed again in
// the last ten minutes (checked by the route).
test("SECURITY: creating a grant without a fresh second factor is refused", async ({ browser }) => {
  const wanted = { grantee_id: ann!.id, section: "journal", verbs: ["view", "edit", "create_delete"] };

  // No authenticator at all: refused, in words a person can act on.
  expect(sqlValue(`select count(*) from auth.mfa_factors where user_id = '${bea!.id}'`)).toBe("0");
  const none = await bea!.request.post("/api/grants", { data: wanted });
  expect(none.status()).toBe(403);
  expect(await none.json()).toMatchObject({ reason: "mfa_required", error: expect.stringContaining("Sharing needs an authenticator") });
  // …and at the database, past the route.
  const noneDirect = await rest("/rest/v1/rpc/create_user_grant", { token: bea!.session.access_token, body: { p_grantee: ann!.id, p_section: "journal", p_entity_groups: [], p_verbs: ["view"] } });
  expect(noneDirect.status).toBe(403);
  expect(((await noneDirect.json()) as { hint: string }).hint).toBe("mfa_required");
  expect((await rest("/rest/v1/rpc/create_user_grant_unchecked", { token: bea!.session.access_token, body: { p_grantee: ann!.id, p_section: "journal", p_entity_groups: [], p_verbs: ["view"] } })).ok).toBe(false);

  // An authenticator, but only the password given this time: refused at the gate.
  const half = await secondSession(browser, ann!);
  expect((await half.request.post("/api/grants", { data: { ...wanted, grantee_id: bea!.id } })).status()).toBe(403);
  await half.close();

  // Signed in with the code, but no confirmation in the last ten minutes: refused, and nothing is created.
  await ann!.context.clearCookies({ name: "reauth" });
  const stale = await ann!.request.post("/api/grants", { data: { grantee_id: bea!.id, section: "journal", verbs: ["view"] } });
  expect(stale.status()).toBe(403);
  expect(((await stale.json()) as { reason: string }).reason).toBe("reauth_required");
  expect(localSql(`select 1 from public.user_grants where grantor_id in ('${ann!.id}', '${bea!.id}') and revoked_at is null and (expires_at is null or expires_at > now())`)).toEqual([]);

  // On the page: Share sends her to confirm the code and brings her back; only then does a share go through.
  await roomForCodes(2);
  const page = await ann!.context.newPage();
  await openPeople(page);
  await page.getByRole("textbox", { name: "Their email" }).fill(bea!.email);
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("combobox", { name: "Section" }).selectOption("journal");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/other/settings/security" && u.searchParams.get("reauth") === "1" && u.searchParams.get("next") === "/other/settings/people?tab=sharing");
  const form = page.locator("form", { has: page.getByRole("button", { name: "Confirm" }) });
  await form.getByPlaceholder("000000").fill(codeFor(ann!));
  await form.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL((u) => u.pathname === "/other/settings/people");
  await expect(page.getByRole("heading", { name: "People & teams" })).toBeVisible();
  // Nothing was shared behind her back while she was away confirming.
  expect(activeGrants()).toEqual([]);
  await page.getByRole("textbox", { name: "Their email" }).fill(bea!.email);
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("combobox", { name: "Section" }).selectOption("journal");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText("Shared.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Revoked.", { exact: true })).toBeVisible();
  await page.close();
  expect(activeGrants()).toEqual([]);
});

// ---------------------------------------------------------------------------
// Paths around the app. The anon key is public (it ships in the browser
// bundle), so anything PostgREST will run for `anon` or for any signed-in
// user is reachable without the Next routes that stand in front of it.
// Each of these was open on 2026-11-20 and is closed by 0160.
// ---------------------------------------------------------------------------

const direct = (path: string, body: unknown, accessToken?: string) => {
  const env = localStackEnv();
  return fetch(`${env.apiUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

// S1 at the database. ann has a verified authenticator. A password grant
// alone gives an aal1 token; the database used to answer it exactly as it
// answers aal2.
test("SECURITY: a password-only token for someone with an authenticator reads nothing from the database", async () => {
  expect(sqlValue(`select status from auth.mfa_factors where user_id = '${ann!.id}'`)).toBe("verified");
  const signIn = await direct("/auth/v1/token?grant_type=password", { email: ann!.email, password: "e2e-mu-password-1" });
  const token = ((await signIn.json()) as { access_token: string }).access_token;
  expect((JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { aal: string }).aal).toBe("aal1");
  for (const path of ["/rest/v1/projects?select=name", "/rest/v1/user_settings?select=display_name", "/rest/v1/user_grants?select=id", "/rest/v1/profiles?select=id"]) {
    const res = await direct(path, undefined, token);
    expect(res.status, path).toBe(403);
    expect(((await res.json()) as { hint: string }).hint, path).toBe("mfa_required");
  }
  expect((await direct("/rest/v1/rpc/my_personal_space", {}, token)).status).toBe(403);
  // The same token with the code given reads as before.
  const whole = await direct("/rest/v1/projects?select=name", undefined, ann!.session.access_token);
  expect(whole.status).toBe(200);
  expect(((await whole.json()) as Array<{ name: string }>).map((r) => r.name)).toContain(PLAN);
});

// S4. rate_limit_take() ran for anon and trusted the caller's capacity,
// refill and cost: a stranger could empty a sign-in bucket (locking that
// address out) or refill it before each guess. Now only the server calls it.
test("SECURITY: an anonymous caller cannot empty or refill a rate-limit bucket", async () => {
  const key = `e2e-mu-${RUN}:probe`;
  const take = (capacity: number, refill: number, cost: number) => direct("/rest/v1/rpc/rate_limit_take", { p_key: key, p_capacity: capacity, p_refill_per_minute: refill, p_cost: cost });
  const emptied = await take(0, 0, 0);
  expect(emptied.ok).toBe(false);
  expect((await take(1_000_000, 1e12, 0)).ok).toBe(false);
  // Signed in is no better than anonymous here.
  for (const token of [bea!.session.access_token, ann!.session.access_token]) {
    expect((await direct("/rest/v1/rpc/rate_limit_take", { p_key: key, p_capacity: 0, p_refill_per_minute: 0, p_cost: 0 }, token)).ok).toBe(false);
  }
  expect(sqlValue(`select count(*) from public.rate_limits where key = '${key}'`)).toBe("0");
  // The other maintenance functions the anon key could run are closed too.
  expect((await direct("/rest/v1/rpc/pc_metrics_rollup", { hours_back: 0 })).ok).toBe(false);
  expect((await direct("/rest/v1/rpc/pc_metrics_prune", {})).ok).toBe(false);
});

// S5. The ten-failure lockout on code entry was cleared by a function any
// signed-in user could call for themselves, so the password-only session it
// exists to stop could wipe its failures between guesses. The counters are
// now written by the server alone, for a user the server names.
test("SECURITY: a signed-in user cannot clear their own second-factor failures", async ({ browser }) => {
  await roomForCodes(2);
  const failures = () => sqlValue(`select count(*) from public.second_factor_failures where user_id = '${ann!.id}'`);
  const half = await secondSession(browser, ann!); // password only: this is the session an attacker would hold
  const right = codeFor(ann!);
  const wrong = await half.request.post("/api/auth/mfa/verify", { data: { code: right === "000000" ? "000001" : "000000" } });
  expect(wrong.status()).toBe(401);
  expect(failures()).toBe("1");

  const halfToken = await accessTokenOf(half);
  for (const token of [halfToken, ann!.session.access_token, bea!.session.access_token, undefined]) {
    for (const fn of ["second_factor_succeeded", "second_factor_failed", "second_factor_locked"]) {
      for (const body of [{}, { p_user: ann!.id }]) {
        expect((await direct(`/rest/v1/rpc/${fn}`, body, token)).ok, `${fn} ${JSON.stringify(body)}`).toBe(false);
      }
    }
  }
  expect(failures()).toBe("1");

  // The honest way to clear it still works: the right code.
  const ok = await half.request.post("/api/auth/mfa/verify", { data: { code: codeFor(ann!) } });
  expect(ok.status()).toBe(200);
  expect(failures()).toBe("0");
  await half.close();
});

// S6. people_purge_deleted() ran with the owner's rights and no space filter:
// any signed-in user could empty every user's bin for good. It now runs as
// the caller. Checked without touching anyone else's bin: ann's binned person
// is aged to 1971 and the window asked for is 49 years, so nothing but that
// row can qualify.
test("SECURITY: one person cannot purge another person's binned people", async () => {
  const id = sqlValue(`select id from public.people where first_name = '${FRIEND}' and space_id = '${annSpace}'`)!;
  expect((await ann!.request.delete(`/api/people/${id}`)).status()).toBe(200);
  localSql(`update public.people set deleted_at = '1971-01-01' where id = '${id}'`);
  const purged = await direct("/rest/v1/rpc/people_purge_deleted", { p_days: 18000 }, bea!.session.access_token);
  expect(await purged.text()).toBe("0");
  expect(sqlValue(`select count(*) from public.people where id = '${id}'`)).toBe("1");
  expect((await direct("/rest/v1/rpc/people_purge_deleted", { p_days: 18000 })).ok).toBe(false);
  // The bin's owner can still empty it.
  const own = await direct("/rest/v1/rpc/people_purge_deleted", { p_days: 18000 }, ann!.session.access_token);
  expect(await own.text()).toBe("1");
  expect(sqlValue(`select count(*) from public.people where id = '${id}'`)).toBe("0");
});
