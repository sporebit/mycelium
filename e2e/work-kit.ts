/**
 * Shared by the Work and Docs specs (e2e/work*.spec.ts, e2e/docs*.spec.ts).
 * Not a spec: the name does not end in .spec.ts, so Playwright skips it.
 *
 * Everything a spec creates carries `E2E-work-<run id>` in its name, and the
 * helpers here only ever remove rows found by that name or by an id the
 * spec was handed back when it created the row.
 */
import { expect as baseExpect, request as playwrightRequest, test as baseTest, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { localSql } from "../lib/access/introspect.ts";
import { E2E_API_SECRET, E2E_ORIGIN } from "./support/env.ts";
import { PHIL, TESS, storageStateFor, type Person } from "./support/users.ts";

export { PHIL, TESS, E2E_ORIGIN };

/**
 * The dev server compiles a route the first time it is asked for, and it is
 * shared: with several suites running at once a first answer can take longer
 * than the config's 15 seconds. `E2E_PATIENCE_MS=60000` stretches every wait
 * in these specs (expectations, actions, responses) and the test timeout with
 * it. Unset, the config's own timeouts apply. It changes how long a check
 * waits, never what it checks.
 */
const PATIENCE = Number(process.env.E2E_PATIENCE_MS ?? 0) || 0;
export const expect = PATIENCE > 0 ? baseExpect.configure({ timeout: PATIENCE }) : baseExpect;
/** `test` whose page waits as long as E2E_PATIENCE_MS says. */
export const test = baseTest.extend({
  // the second argument is Playwright's "use"; named otherwise so the React hooks lint rule does not take it for a hook
  page: async ({ page }, provide, testInfo) => {
    patient(page, testInfo);
    await provide(page);
  },
});
/** Call first in a beforeAll / afterAll: gives the hook the same patience. */
export function patientHook(): void {
  if (PATIENCE > 0) baseTest.setTimeout(PATIENCE * 12);
}
const API_TIMEOUT = PATIENCE > 0 ? { timeout: PATIENCE * 2 } : {};

/** A short id unique to one run of one spec file. */
export function newRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** The name prefix of everything a run creates. */
export const tag = (run: string) => `E2E-work-${run}`;

/** A project key (two to five letters) that no earlier run used: E + four letters from the run id. */
export function keyFor(run: string, lead = "E"): string {
  let n = 0;
  for (const ch of run) n = (n * 31 + ch.charCodeAt(0)) % 456_976; // 26^4
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return `${lead}${out}`;
}

/** An API client carrying the person's own browser session. */
export async function apiAs(who: Person): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: E2E_ORIGIN, storageState: storageStateFor(who), ...API_TIMEOUT });
}

/** An API client on the server-to-server path (acts as Phil). */
export async function apiAsServer(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: E2E_ORIGIN, extraHTTPHeaders: { "x-api-secret": E2E_API_SECRET }, ...API_TIMEOUT });
}

/**
 * Ticket and doc writes are rate limited per person (120 at once, 60 more a minute: lib/system/rateLimit.ts),
 * and every suite that runs as Phil draws on the same allowance. This waits until `who` has at least `need`
 * writes in hand, reading the bucket the limiter keeps. It waits on that figure; it does not sleep blind.
 */
export async function writeBudget(who: Person, need = 100): Promise<void> {
  const inHand = () => {
    const row = localSql(`select least(120, tokens + extract(epoch from (clock_timestamp() - updated_at))) from public.rate_limits where key = 'tickets:user:${who.id}'`)[0];
    return row ? Number(row[0]) : 120;
  };
  if (inHand() >= need) return;
  // inside a hook or a test: room for the wait itself (a full allowance takes two minutes to come back)
  baseTest.setTimeout(Math.max(baseTest.info().timeout, 90_000) + 150_000);
  await baseExpect.poll(inHand, { timeout: 150_000, intervals: [2_000] }).toBeGreaterThanOrEqual(need);
}

/** POST / PATCH / PUT and hand back the JSON, failing loudly with the API's own words. */
export async function send<T = Record<string, unknown>>(api: APIRequestContext, method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, data?: unknown): Promise<T> {
  let res = await api.fetch(path, { method, data });
  // rate limited: another suite spent the allowance; wait for some of it to come back and ask once more
  if (res.status() === 429) {
    await Promise.all([writeBudget(PHIL, 20), writeBudget(TESS, 20)]);
    res = await api.fetch(path, { method, data });
  }
  const text = await res.text();
  expect(res.ok(), `${method} ${path} answered ${res.status()}: ${text.slice(0, 400)}`).toBe(true);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function get<T = Record<string, unknown>>(api: APIRequestContext, path: string): Promise<T> {
  const res = await api.get(path);
  const text = await res.text();
  expect(res.ok(), `GET ${path} answered ${res.status()}: ${text.slice(0, 400)}`).toBe(true);
  return JSON.parse(text) as T;
}

/**
 * Watch a page for the three things no journey should produce: a crash in
 * the browser, a 5xx from this app, an "Application error" screen. Call
 * `check()` at the end of the test.
 */
export function watch(page: Page, testInfo: TestInfo) {
  const crashes: string[] = [];
  const serverErrors: string[] = [];
  const origin = new URL(testInfo.project.use.baseURL ?? E2E_ORIGIN).origin;
  page.on("pageerror", (err) => {
    // The compiled local server answers /sw.js with a 400, so the service worker cannot register
    // and the browser reports it as an unhandled rejection on every page, followed by the shell's
    // own registration code reading `.waiting` of the registration it did not get. That belongs to the
    // shell (reported to the lead), not to Work or Docs: it is noted, not counted as a crash here.
    if (/Failed to register a ServiceWorker/.test(err.message) || err.message === "Cannot read properties of undefined (reading 'waiting')") {
      if (!testInfo.annotations.some((a) => a.type === "service-worker")) testInfo.annotations.push({ type: "service-worker", description: err.message.slice(0, 200) });
      return;
    }
    crashes.push(err.message);
  });
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (url.origin === origin && res.status() >= 500) serverErrors.push(`${res.status()} ${res.request().method()} ${url.pathname}`);
  });
  return {
    async check() {
      await expect(page.locator("body")).not.toContainText("Application error");
      expect(crashes, "browser crash").toEqual([]);
      expect(serverErrors, "server errors").toEqual([]);
    },
  };
}

/** Apply E2E_PATIENCE_MS to a page and its test (see `expect` above). */
export function patient(page: Page, testInfo: TestInfo): void {
  if (PATIENCE <= 0) return;
  page.setDefaultTimeout(PATIENCE);
  page.setDefaultNavigationTimeout(PATIENCE * 2);
  testInfo.setTimeout(Math.max(testInfo.timeout, PATIENCE * 12));
}

/** One notification for a person, written straight to the table: a space of one cannot be notified through the app (the actor is never told). */
export function seedNotification(who: Person, o: { id: string; event: "mention" | "assignment" | "status_change" | "comment"; title: string; body?: string; url?: string | null; ticketId?: string | null; minutesAgo?: number }): void {
  const q = (s: string | null | undefined) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
  localSql(
    `insert into public.notifications (id, space_id, recipient_id, actor_id, event, ticket_id, title, body, url, created_at)
     select ${q(o.id)}, p.personal_space_id, p.id, null, ${q(o.event)}, ${q(o.ticketId ?? null)}, ${q(o.title)}, ${q(o.body ?? null)}, ${q(o.url ?? null)}, now() - interval '${Number(o.minutesAgo ?? 0)} minutes'
     from public.profiles p where p.id = ${q(who.id)}`,
  );
}

/** Remove the notifications a run seeded (by the run's tag in the title). */
export function dropSeededNotifications(run: string): void {
  localSql(`delete from public.notifications where title like '${tag(run)}%'`);
}

export function uuid(): string {
  return crypto.randomUUID();
}
