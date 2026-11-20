/**
 * Direct grants: one person shares part of their personal space with
 * another. Two throwaway accounts, neither in any team:
 *
 *   ann — shares; has an authenticator and a fresh re-auth, as the app's
 *         own text says sharing requires
 *   bea — is shared with
 *
 * Tess is the bystander who must see none of it. Nothing of Phil's or
 * Tess's is ever shared here.
 */
import { test, type Page } from "@playwright/test";
import { localSql, localStackEnv } from "../lib/access/introspect.ts";
import { TESS, storageStateFor } from "./support/users.ts";
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
  sqlValue,
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
  await page.goto("/other/settings/people");
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
  // The app's text says sharing needs the authenticator code again; ann has just given it.
  await enrolTotp(ann!);
  await reauth(ann!);

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
  const tess = await browser.newContext({ storageState: storageStateFor(TESS) });
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

// SECURITY (reported, not fixed here). The spec (claude/spec-access.md), the
// onboarding guide and the plan all say creating a grant requires re-auth.
// Nothing enforces it: /api/grants is not a sensitive prefix and
// create_user_grant() checks only that the caller is signed in. bea has no
// authenticator at all and can open her personal space to anyone.
test("SECURITY: creating a grant without a fresh second factor is refused", async () => {
  expect(sqlValue(`select count(*) from auth.mfa_factors where user_id = '${bea!.id}'`)).toBe("0");
  const res = await bea!.request.post("/api/grants", { data: { grantee_id: ann!.id, section: "journal", verbs: ["view", "edit", "create_delete"] } });
  if (res.ok()) await bea!.request.delete(`/api/grants/${((await res.json()) as { id: string }).id}`);
  expect(res.status()).toBe(403); // answers 201
});

// ---------------------------------------------------------------------------
// Paths around the app. The anon key is public (it ships in the browser
// bundle), so anything PostgREST will run for `anon` or for any signed-in
// user is reachable without the Next routes that are supposed to stand in
// front of it. Each of these is reported, not fixed here.
// ---------------------------------------------------------------------------

const direct = (path: string, body: unknown, accessToken?: string) => {
  const env = localStackEnv();
  return fetch(`${env.apiUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

// SECURITY. ann has a verified authenticator. A password grant alone gives an
// aal1 token, and the database answers it exactly as it answers aal2: no
// policy and no access function looks at the assurance level.
test("SECURITY: a password-only token for someone with an authenticator reads nothing from the database", async () => {
  expect(sqlValue(`select status from auth.mfa_factors where user_id = '${ann!.id}'`)).toBe("verified");
  const signIn = await direct("/auth/v1/token?grant_type=password", { email: ann!.email, password: "e2e-mu-password-1" });
  const token = ((await signIn.json()) as { access_token: string }).access_token;
  expect((JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { aal: string }).aal).toBe("aal1");
  const rows = await direct("/rest/v1/projects?select=name", undefined, token);
  expect(rows.ok ? ((await rows.json()) as unknown[]) : []).toEqual([]); // returns ann's projects
});

// SECURITY. rate_limit_take() runs for anon and trusts the caller's capacity,
// refill and cost. Shown on a bucket of this spec's own: a stranger can empty
// it (locking that key out) or refill it (resetting the limiter). The real
// keys are login:email:<address>, login:ip:<ip>, totp:ip:<ip>, invite:user:<id>.
test("SECURITY: an anonymous caller cannot empty or refill a rate-limit bucket", async () => {
  const key = `e2e-mu-${RUN}:probe`;
  const take = (capacity: number, refill: number, cost: number) => direct("/rest/v1/rpc/rate_limit_take", { p_key: key, p_capacity: capacity, p_refill_per_minute: refill, p_cost: cost });
  const emptied = await take(0, 0, 0);
  expect(emptied.ok).toBe(false); // 200: the bucket now holds nothing
  expect(sqlValue(`select count(*) from public.rate_limits where key = '${key}'`)).toBe("0");
});

// SECURITY. The ten-failure second-factor lockout is cleared by the function
// the verify route calls on success, and any signed-in user can call it
// directly, so a password-only session can wipe its own failures between guesses.
test("SECURITY: a signed-in user cannot clear their own second-factor failures", async () => {
  await direct("/rest/v1/rpc/second_factor_failed", {}, bea!.session.access_token);
  expect(sqlValue(`select count(*) from public.second_factor_failures where user_id = '${bea!.id}'`)).toBe("1");
  const cleared = await direct("/rest/v1/rpc/second_factor_succeeded", {}, bea!.session.access_token);
  expect(sqlValue(`select count(*) from public.second_factor_failures where user_id = '${bea!.id}'`)).toBe("1"); // 0
  expect(cleared.ok).toBe(false);
});

// SECURITY. people_purge_deleted() is SECURITY DEFINER, open to every signed-in
// user, and deletes binned people in EVERY space. Reproduced without touching
// anyone else's bin: ann's binned person is aged to 1971 and the window asked
// for is 49 years, so nothing but that row can qualify.
test("SECURITY: one person cannot purge another person's binned people", async () => {
  const id = sqlValue(`select id from public.people where first_name = '${FRIEND}' and space_id = '${annSpace}'`)!;
  expect((await ann!.request.delete(`/api/people/${id}`)).status()).toBe(200);
  localSql(`update public.people set deleted_at = '1971-01-01' where id = '${id}'`);
  const purged = await direct("/rest/v1/rpc/people_purge_deleted", { p_days: 18000 }, bea!.session.access_token);
  const purgedCount = await purged.text();
  expect(purgedCount).toBe("0"); // 1: bea deleted ann's row for good
  expect(sqlValue(`select count(*) from public.people where id = '${id}'`)).toBe("1");
});
