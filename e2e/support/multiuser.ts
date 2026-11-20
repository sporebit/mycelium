/**
 * Helpers for the multi-user checks (e2e/multiuser-*.phil.spec.ts).
 *
 * Every extra person is a real account on the local stack, created the way
 * the app creates one: somebody with the right to invite creates an invite,
 * the invited address signs up (GoTrue admits it because a live invite
 * exists) and accepts. Nobody here touches the shared Phil or Tess accounts'
 * security state: second factors are enrolled on these throwaway people only.
 *
 * Naming: addresses are `e2e-mu-<runid>-<label>@mycelium.local`, teams are
 * `E2E-mu-<runid> <label>`.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { expect as baseExpect, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test";
import { localSql, localStackEnv } from "../../lib/access/introspect.ts";
import { passwordSession, secondFactorSession } from "../../lib/access/testSessions.ts";
import { totp } from "../../scripts/lib/totp.mjs";
import { E2E_ORIGIN } from "./env.ts";
import { PASSWORD, PHIL, TESS, storageStateFor, writeStorageState } from "./users.ts";

/**
 * These checks open several people's pages against one dev server that the
 * other suites are using at the same time; a first load can take longer than
 * the project's default expect timeout. Same assertions, more patience.
 */
export const expect = baseExpect.configure({ timeout: 90_000 });
/** Per-test budget for the multi-person journeys. */
export const MU_TEST_TIMEOUT = 600_000;

export const RUN = randomBytes(3).toString("hex");
export const MU_PASSWORD = "e2e-mu-password-1";
export const emailFor = (label: string) => `e2e-mu-${RUN}-${label}@mycelium.local`;
export const teamName = (label: string) => `E2E-mu-${RUN} ${label}`;
export const CRON_HEADERS = { authorization: "Bearer e2e-cron-secret" };

type Session = { access_token: string; refresh_token: string; user: { id: string; email: string } };

export type Person = {
  label: string;
  email: string;
  id: string;
  context: BrowserContext;
  /** Carries the same cookies as the context's pages. */
  request: APIRequestContext;
  session: Session;
  /** Set once a second factor is enrolled. */
  totpSecret?: string;
  factorId?: string;
};

async function gotrue<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const env = localStackEnv();
  const res = await fetch(`${env.apiUrl}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`auth${path} answered ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** The cookies @supabase/ssr would set for this session, as Playwright cookies. */
async function sessionCookies(session: Session) {
  const env = localStackEnv();
  const jar = new Map<string, string>();
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await client.auth.setSession(session);
  if (error) throw new Error(`setSession failed: ${error.message}`);
  const host = new URL(E2E_ORIGIN).hostname;
  return [...jar].map(([name, value]) => ({
    name,
    value,
    domain: host,
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));
}

/**
 * Phil's and Tess's saved sign-ins are shared by every suite and reused for
 * twenty minutes. Since 0160 a session whose row has been deleted is dead at
 * once, so anything else on this machine that clears their sessions (the
 * access suites rebuild their fixtures) leaves a saved sign-in that reads
 * nothing. Before a file starts, make sure both still exist, and sign in
 * again (the harness's own function) if one does not.
 */
export async function ensureSharedSessions(): Promise<void> {
  for (const who of [PHIL, TESS]) {
    let live = false;
    try {
      const state = JSON.parse(readFileSync(storageStateFor(who), "utf8")) as { cookies: Array<{ name: string; value: string }> };
      const raw = state.cookies.filter((c) => /^sb-.*-auth-token/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
      const token = (JSON.parse(Buffer.from(raw.slice(7), "base64url").toString("utf8")) as { access_token: string }).access_token;
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { session_id: string; exp: number };
      live = claims.exp * 1000 > Date.now() + 10 * 60_000 && sqlValue(`select 1 from auth.sessions where id = '${claims.session_id}'`) === "1";
    } catch {
      live = false;
    }
    if (!live) {
      console.warn(`[multiuser] ${who.name}'s saved sign-in is no longer a live session; signing in again`);
      await writeStorageState(who);
    }
  }
}

/**
 * Tess, the bystander, in a browser of her own with a sign-in made this
 * moment. Her saved sign-in is shared with every other suite, and any of
 * them signing her out ends it for all (0160); a check that only needs "a
 * second, unrelated person" should not fail for that.
 */
export async function tessContext(browser: Browser): Promise<BrowserContext> {
  const session = await passwordSession(TESS.email, PASSWORD);
  const cookies = await sessionCookies({ ...session, user: { id: TESS.id, email: TESS.email } });
  return browser.newContext({ storageState: { cookies, origins: [] } });
}

/** POST /api/invites as the inviter; email is off on this server, so the link comes back. */
export async function createInvite(
  inviter: APIRequestContext,
  input: { email: string; teamId?: string | null; role?: "admin" | "member" | "viewer" },
): Promise<{ link: string; token: string }> {
  const res = await inviter.post("/api/invites", {
    data: { email: input.email, team_id: input.teamId ?? null, role: input.role ?? "member" },
  });
  const body = (await res.json()) as { link?: string; error?: string; delivered?: boolean };
  if (res.status() !== 201 || !body.link) throw new Error(`invite for ${input.email} answered ${res.status()}: ${body.error ?? "no link"}`);
  return { link: body.link, token: body.link.split("/invite/")[1] };
}

/**
 * A new account for an invited address, signed in, in its own browser
 * context. The invite is NOT accepted here.
 */
export async function signUpInvited(browser: Browser, label: string): Promise<Person> {
  const email = emailFor(label);
  const session = await gotrue<Session>("/signup", { email, password: MU_PASSWORD });
  if (!session.access_token) throw new Error(`sign-up for ${email} returned no session (is email confirmation on?)`);
  const context = await browser.newContext({ storageState: { cookies: await sessionCookies(session), origins: [] } });
  return { label, email, id: session.user.id, context, request: context.request, session };
}

/**
 * Invite, sign up and accept in one step: the common fixture.
 *
 * Since 0160 a team owner or admin can do nothing until they have an
 * authenticator. `enrol` gives the new person one before they accept (it is
 * on by default for an admin invite); pass it for anyone who will go on to
 * create a team. A plain member needs none.
 */
export async function joinByInvite(
  browser: Browser,
  inviter: APIRequestContext,
  label: string,
  opts: { teamId?: string | null; role?: "admin" | "member" | "viewer"; enrol?: boolean } = {},
): Promise<Person> {
  const { token } = await createInvite(inviter, { email: emailFor(label), teamId: opts.teamId, role: opts.role });
  const person = await signUpInvited(browser, label);
  if (opts.enrol ?? opts.role === "admin") await enrolTotp(person);
  const res = await person.request.post(`/api/invites/${token}`);
  if (!res.ok()) throw new Error(`accepting as ${person.email} answered ${res.status()}: ${await res.text()}`);
  return person;
}

/** A Person for an account that already exists (created in the browser by a check), signed in afresh. */
export async function personFromPassword(browser: Browser, label: string, password = MU_PASSWORD): Promise<Person> {
  const email = emailFor(label);
  const session = await gotrue<Session>("/token?grant_type=password", { email, password });
  const context = await browser.newContext({ storageState: { cookies: await sessionCookies(session), origins: [] } });
  return { label, email, id: session.user.id, context, request: context.request, session };
}

/**
 * The app has no way to delete a team, and an owner cannot delete their
 * account. So one long-lived account, the keeper, takes over every team a
 * check has finished with; the people who made it can then be removed.
 */
export const KEEPER_EMAIL = "e2e-mu-keeper@mycelium.local";

/**
 * The keeper, signed in. It owns teams, so (0160) it must present an
 * authenticator: the harness's own helper enrols one on first use and keeps
 * the secret in e2e/.auth, as it does for Phil.
 */
export async function keeperContext(browser: Browser): Promise<{ id: string; context: BrowserContext }> {
  let id = sqlValue(`select id from auth.users where email = '${KEEPER_EMAIL}'`);
  // A first sign-up needs a live invite for the address; keeperJoins() has just made one.
  if (!id) id = (await gotrue<Session>("/signup", { email: KEEPER_EMAIL, password: MU_PASSWORD })).user.id;
  const session = await secondFactorSession(KEEPER_EMAIL, MU_PASSWORD, id);
  const cookies = await sessionCookies({ ...session, user: { id, email: KEEPER_EMAIL } });
  return { id, context: await browser.newContext({ storageState: { cookies, origins: [] } }) };
}

/** The keeper joins the team as a member (invited by its owner). Returns the keeper's user id. */
export async function keeperJoins(browser: Browser, owner: APIRequestContext, teamId: string): Promise<string> {
  const { token } = await createInvite(owner, { email: KEEPER_EMAIL, teamId, role: "member" });
  const keeper = await keeperContext(browser);
  try {
    const res = await keeper.context.request.post(`/api/invites/${token}`);
    if (!res.ok()) throw new Error(`keeper could not join ${teamId}: ${res.status()} ${await res.text()}`);
  } finally {
    await keeper.context.close();
  }
  return keeper.id;
}

/** Hand a finished team to the keeper and leave it. Best effort: returns what went wrong, if anything. */
export async function retireTeam(browser: Browser, owner: APIRequestContext, teamId: string): Promise<string | null> {
  try {
    const keeper = await keeperJoins(browser, owner, teamId);
    const named = await owner.patch(`/api/teams/${teamId}`, { data: { successor_user_id: keeper } });
    if (!named.ok()) return `naming the keeper answered ${named.status()}`;
    const left = await owner.post(`/api/teams/${teamId}/leave`);
    return left.ok() ? null : `leaving answered ${left.status()} ${await left.text()}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * A run that was cut short can leave Phil owning one of this suite's teams.
 * Hand any such team (by name prefix, never anything else) to the keeper.
 */
export async function retireStaleTeams(browser: Browser, phil: APIRequestContext): Promise<void> {
  await sweepLeftovers(browser);
  const res = await phil.get("/api/teams");
  if (!res.ok()) return;
  const { teams } = (await res.json()) as { teams: Array<{ id: string; name: string; my_role: string | null }> };
  for (const t of teams) {
    if (!t.name.startsWith("E2E-mu-") || t.name.startsWith(`E2E-mu-${RUN} `) || t.my_role !== "owner") continue;
    const problem = await retireTeam(browser, phil, t.id);
    if (problem) console.warn(`[multiuser] stale team ${t.name} not handed over: ${problem}`);
  }
}

/**
 * A second, independent session for the same person (another "device").
 * By default it is the password alone (aal1): for someone with an
 * authenticator that is a session that still owes its code. `withCode`
 * answers the challenge too, as a second device signed in properly would.
 */
export async function secondSession(browser: Browser, person: Person, opts: { withCode?: boolean } = {}): Promise<BrowserContext> {
  let session = await gotrue<Session>("/token?grant_type=password", { email: person.email, password: MU_PASSWORD });
  if (opts.withCode) {
    const factorId = sqlValue(`select id from auth.mfa_factors where user_id = '${person.id}' and status = 'verified' limit 1`);
    if (!factorId) throw new Error(`${person.email} has no authenticator`);
    const challenge = await gotrue<{ id: string }>(`/factors/${factorId}/challenge`, {}, session.access_token);
    const upgraded = await gotrue<Session>(`/factors/${factorId}/verify`, { challenge_id: challenge.id, code: codeFor(person) }, session.access_token);
    session = { ...upgraded, user: session.user };
  }
  return browser.newContext({ storageState: { cookies: await sessionCookies(session), origins: [] } });
}

/** The access token a context's session cookie carries. */
export async function accessTokenOf(context: BrowserContext): Promise<string> {
  const cookies = (await context.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  const raw = cookies.map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : decodeURIComponent(raw);
  return (JSON.parse(json) as { access_token: string }).access_token;
}

/** Straight at the database's REST door with the public key and, optionally, someone's token. */
export function rest(pathname: string, opts: { token?: string; body?: unknown } = {}): Promise<Response> {
  const env = localStackEnv();
  return fetch(`${env.apiUrl}${pathname}`, {
    method: opts.body === undefined ? "GET" : "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/**
 * The path a sign-in email's link opens, for an existing account: the
 * callback route with a one-time token hash, the shape the hosted email
 * templates use. The token comes from the local auth server's admin API, so
 * no email is sent (the local stack allows two an hour).
 */
export async function magicLinkPath(email: string, next: string): Promise<string> {
  const env = localStackEnv();
  const res = await fetch(`${env.apiUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: env.serviceRoleKey, authorization: `Bearer ${env.serviceRoleKey}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const body = (await res.json()) as { hashed_token?: string };
  if (!res.ok || !body.hashed_token) throw new Error(`no sign-in link for ${email}: ${res.status}`);
  return `/api/auth/callback?token_hash=${body.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`;
}

/**
 * Once an account has an authenticator, only someone holding its secret can
 * delete it. If a run dies between enrolling and deleting (the server going
 * away is enough), the secret would die with the process and the account
 * could never be removed through the app. So every secret is written to a
 * git-ignored ledger the moment it exists, and struck off when the account
 * is gone; the next run starts by finishing what the last one could not.
 */
const LEDGER = path.resolve(process.cwd(), "e2e/.auth/multiuser-leftovers.json");
type Leftover = { email: string; secret: string };
const readLedger = (): Leftover[] => (existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, "utf8")) as Leftover[]) : []);
function writeLedger(rows: Leftover[]) {
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(rows, null, 2));
}
/** Record a person's authenticator secret (call as soon as it is known). */
export function remember(person: Person) {
  if (!person.totpSecret) return;
  writeLedger([...readLedger().filter((r) => r.email !== person.email), { email: person.email, secret: person.totpSecret }]);
}
/** Strike an account off the ledger (it has been deleted, here or through the page). */
export const forget = (email: string) => writeLedger(readLedger().filter((r) => r.email !== email));

/**
 * Remove this suite's accounts that an earlier, interrupted run left behind
 * (never the keeper, never the run in progress). One with an authenticator
 * needs its secret from the ledger; one without is enrolled here, since the
 * app deletes nobody who has no second factor.
 */
export async function sweepLeftovers(browser: Browser): Promise<void> {
  await ensureSharedSessions();
  const secrets = new Map(readLedger().map((r) => [r.email, r.secret]));
  const stale = localSql(`select email from auth.users where email like 'e2e-mu-%' and email <> '${KEEPER_EMAIL}' and email not like 'e2e-mu-${RUN}-%'`).flat();
  for (const email of secrets.keys()) if (!stale.includes(email) && !email.startsWith(`e2e-mu-${RUN}-`)) forget(email);
  for (const email of stale) {
    try {
      const first = await gotrue<Session>("/token?grant_type=password", { email, password: MU_PASSWORD });
      const context = await browser.newContext({ storageState: { cookies: await sessionCookies(first), origins: [] } });
      const person: Person = { label: "leftover", email, id: first.user.id, context, request: context.request, session: first };
      const factorId = sqlValue(`select id from auth.mfa_factors where user_id = '${person.id}' and status = 'verified' limit 1`);
      if (factorId) {
        const secret = secrets.get(email);
        if (!secret) {
          console.warn(`[multiuser] leftover ${email} has an authenticator whose secret is not on record; the app cannot remove it`);
          await context.close();
          continue;
        }
        const challenge = await gotrue<{ id: string }>(`/factors/${factorId}/challenge`, {}, first.access_token);
        const upgraded = await gotrue<Session>(`/factors/${factorId}/verify`, { challenge_id: challenge.id, code: totp(secret) }, first.access_token);
        person.totpSecret = secret;
        person.session = { ...upgraded, user: first.user };
        await context.clearCookies({ name: /^sb-.*-auth-token/ });
        await context.addCookies(await sessionCookies(person.session));
      } else {
        // An owner or admin with no authenticator can do nothing, not even hand a team over, until they enrol.
        await enrolTotp(person);
      }
      for (const [teamId] of localSql(`select id from public.teams where owner_user_id = '${person.id}'`)) await retireTeam(browser, person.request, teamId);
      const gone = await deleteAccount(person);
      if (!gone.ok) console.warn(`[multiuser] leftover ${email} still not removed: ${gone.reason}`);
    } catch (err) {
      console.warn(`[multiuser] leftover ${email}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
    }
  }
}

/** A code the authenticator would show now. */
export const codeFor = (person: Person, atMs = Date.now()) => {
  if (!person.totpSecret) throw new Error(`${person.email} has no authenticator`);
  return totp(person.totpSecret, atMs);
};

/**
 * Enrol an authenticator for the person straight against the auth server
 * (the browser journey is checked once, in the security spec) and upgrade
 * their context's session to aal2.
 */
export async function enrolTotp(person: Person): Promise<void> {
  const factor = await gotrue<{ id: string; totp: { secret: string } }>(
    "/factors",
    { factor_type: "totp", friendly_name: "Authenticator app" },
    person.session.access_token,
  );
  person.totpSecret = factor.totp.secret;
  remember(person);
  const challenge = await gotrue<{ id: string }>(`/factors/${factor.id}/challenge`, {}, person.session.access_token);
  const upgraded = await gotrue<Session>(
    `/factors/${factor.id}/verify`,
    { challenge_id: challenge.id, code: totp(factor.totp.secret) },
    person.session.access_token,
  );
  person.totpSecret = factor.totp.secret;
  person.factorId = factor.id;
  remember(person);
  person.session = { ...upgraded, user: person.session.user };
  await person.context.clearCookies({ name: /^sb-.*-auth-token/ });
  await person.context.addCookies(await sessionCookies(person.session));
}

/**
 * Code checks are rate limited per client address (ten, refilled five a
 * minute), and every browser in a local run is the same address. Before a
 * step that types codes into a page, wait until the bucket has room for
 * them; otherwise the page would show "Too many attempts" for a reason that
 * has nothing to do with what is being checked.
 */
export async function roomForCodes(n: number): Promise<void> {
  const available = () =>
    Number(
      sqlValue(
        // The key carries the address the server saw: ::1 or 127.0.0.1 from a compiled server, "local" from a dev one.
        "select coalesce(min(least(10, tokens + extract(epoch from (clock_timestamp() - updated_at)) / 60.0 * 5)), 10) " +
          "from public.rate_limits where key in ('totp:ip:local', 'totp:ip:::1', 'totp:ip:127.0.0.1', 'totp:ip:::ffff:127.0.0.1')",
      ),
    );
  await baseExpect.poll(available, { timeout: 150_000, intervals: [2_000, 5_000, 10_000] }).toBeGreaterThanOrEqual(n);
}

/** Present the second factor again: sets the ten-minute re-auth cookie. */
export async function reauth(person: Person): Promise<void> {
  // Code checks share one per-address bucket (ten, refilled five a minute). Several
  // files run back to back can empty it; a 429 is waited out, anything else is an error.
  let status = 0;
  let text = "";
  await baseExpect
    .poll(
      async () => {
        const res = await person.request.post("/api/auth/reauth", { data: { code: codeFor(person) } });
        status = res.status();
        text = await res.text();
        return status;
      },
      { timeout: 90_000, intervals: [4_000, 8_000, 13_000] },
    )
    .not.toBe(429);
  if (status !== 200) throw new Error(`re-auth as ${person.email} answered ${status}: ${text}`);
}

/**
 * Remove a throwaway account the way the app offers: second factor, fresh
 * re-auth, typed email. Returns false (with the reason) when the app
 * refuses, e.g. the person still owns a team.
 */
export async function deleteAccount(person: Person): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!person.totpSecret) await enrolTotp(person);
    await reauth(person);
    const res = await person.request.post("/api/account/delete", { data: { confirm: person.email } });
    if (!res.ok()) return { ok: false, reason: `${res.status()} ${(await res.text()).slice(0, 200)}` };
    forget(person.email);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await person.context.close().catch(() => undefined);
  }
}

/** Delete each person; returns the addresses the app would not remove. */
export async function cleanUp(people: Array<Person | undefined>): Promise<string[]> {
  const left: string[] = [];
  for (const p of people) {
    if (!p) continue;
    const r = await deleteAccount(p);
    if (!r.ok) left.push(`${p.email} (${r.reason})`);
  }
  if (left.length) console.warn(`[multiuser] not removed: ${left.join("; ")}`);
  return left;
}

export async function createTeam(owner: APIRequestContext, label: string): Promise<{ id: string; name: string; spaceId: string }> {
  const name = teamName(label);
  const res = await owner.post("/api/teams", { data: { name } });
  if (res.status() !== 201) throw new Error(`create team answered ${res.status()}: ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  return { id, name, spaceId: sqlValue(`select space_id from public.teams where id = '${id}'`)! };
}

/** First column of the first row, or null. Read-only assertions. */
export function sqlValue(query: string): string | null {
  return localSql(query)[0]?.[0] ?? null;
}

export function personalSpaceOf(userId: string): string {
  const id = sqlValue(`select personal_space_id from public.profiles where id = '${userId}'`);
  if (!id) throw new Error(`${userId} has no personal space`);
  return id;
}

/**
 * GET and parse JSON. Every API route here answers JSON, errors included; an
 * HTML 5xx is the dev server itself (out of memory, mid-recompile), which the
 * suites sharing it do cause. That one case is retried, loudly; a route's own
 * JSON error is returned as it is.
 */
export async function getJson<T = unknown>(as: APIRequestContext, path: string): Promise<{ status: number; body: T }> {
  for (let attempt = 1; ; attempt++) {
    const res = await as.get(path);
    const type = res.headers()["content-type"] ?? "";
    if (type.includes("application/json")) return { status: res.status(), body: (await res.json()) as T };
    if (res.status() < 500 || attempt === 3) throw new Error(`GET ${path} answered ${res.status()} ${type}: ${(await res.text()).slice(0, 200)}`);
    console.warn(`[multiuser] GET ${path} answered ${res.status()} ${type} (dev server); trying again`);
  }
}

/** A project in the given space (the caller's own when omitted), through the Work API. */
export async function createProject(as: APIRequestContext, name: string, spaceId?: string) {
  return as.post("/api/work/projects", { data: { name, ...(spaceId ? { space: spaceId } : {}) } });
}

/** Names of every project the caller can list, optionally in one space. */
export async function projectNames(as: APIRequestContext, spaceId?: string): Promise<string[]> {
  const { status, body } = await getJson<{ projects: Array<{ name: string }> }>(as, `/api/work/projects?status=all${spaceId ? `&space=${spaceId}` : ""}`);
  if (status !== 200) throw new Error(`projects list answered ${status}`);
  return body.projects.map((p) => p.name);
}
