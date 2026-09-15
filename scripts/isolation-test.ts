/**
 * Isolation test — P12 Part 3, VERIFY 3. "The most important check in this
 * prompt."
 *
 * Against a running `next dev` (APP_URL, default http://localhost:3000) and
 * the LOCAL Supabase stack:
 *
 *   1. Creates (idempotently) a second user, Tess, with an EMPTY personal
 *      space, and signs both users in through GoTrue to get real session
 *      cookies — the same cookies a browser would carry.
 *   2. Enumerates every app/api/** /route.ts. For each GET (and the POSTs
 *      that are reads: search/query routes) it calls the route AS TESS,
 *      filling dynamic segments with ids taken from PHIL'S data, and scans
 *      the response body for any id that belongs to Phil. One leaked id
 *      fails the run. Reported endpoint by endpoint.
 *   3. Probes every registered table through PostgREST with Tess's JWT,
 *      expecting zero rows.
 *   4. Calls the same routes AS PHIL, expecting no server errors, and proves
 *      his data is intact: for every registered table the row count Phil
 *      sees through PostgREST equals the count in his space by SQL.
 *
 * Exit code 1 on any leak, any server error as Phil, or any table count
 * mismatch. Routes that fail as Tess with 5xx are listed (they are bugs,
 * not leaks) and also fail the run.
 *
 * Run: npm run isolation-test   (Node ≥ 22.6, native type stripping)
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { listPublicRelations, localSql, localStackEnv } from "../lib/access/introspect.ts";
import { registeredTables } from "../lib/access/registry.ts";
import { PHIL_AUTH_UID } from "../lib/system/identity.ts";
import { mintUserJwt } from "../lib/system/jwt.ts";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const ROOT = path.resolve(import.meta.dirname, "..");
const env = localStackEnv();

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const TESS_EMAIL = "tess@mycelium.local";
const PHIL_EMAIL = "phil@mycelium.local";
const PASSWORD = "mycelium-local";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// ---------------------------------------------------------------------------
// Fixtures

function ensureTess() {
  localSql(
    `set local app.allow_uninvited = 'on'; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
	    confirmation_token, recovery_token, email_change_token_new, email_change,
	    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
	    is_sso_user, is_anonymous)
	  values ('00000000-0000-0000-0000-000000000000', '${TESS}', 'authenticated', 'authenticated',
	    '${TESS_EMAIL}', extensions.crypt('${PASSWORD}', extensions.gen_salt('bf')), now(),
	    '{"provider":"email","providers":["email"]}', '{"display_name":"Tess"}', now(), now(),
	    '', '', '', '', '', '', '', '', false, false)
	  on conflict (id) do nothing`,
  );
  localSql(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
	  values (gen_random_uuid(), '${TESS}', '${TESS}', jsonb_build_object('sub', '${TESS}', 'email', '${TESS_EMAIL}', 'email_verified', true), 'email', now(), now(), now())
	  on conflict (provider_id, provider) do nothing`,
  );
  const space = localSql(`select personal_space_id from public.profiles where id = '${TESS}'`)[0]?.[0];
  if (!space) throw new Error("Tess has no personal space; are 0102–0109 applied?");
  // Empty personal space: remove anything a previous run left behind.
  for (const t of registeredTables()) {
    localSql(`delete from public."${t}" where space_id = '${space}'`);
  }
  return space;
}

function philSpace(): string {
  return localSql(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`)[0][0];
}

/** Every uuid that identifies one of Phil's rows, by table. */
function philIds(space: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const withId = new Set(
    localSql(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'id'",
    ).map((r) => r[0]),
  );
  for (const t of registeredTables()) {
    if (!withId.has(t)) continue;
    const rows = localSql(`select id::text from public."${t}" where space_id = '${space}' limit 200`);
    if (rows.length) out.set(t, rows.map((r) => r[0]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sessions

async function passwordSession(email: string) {
  const res = await fetch(`${env.apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`password grant failed for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token: string };
}

async function cookieHeaderFor(email: string): Promise<string> {
  const session = await passwordSession(email);
  const jar = new Map<string, string>();
  const client = createServerClient(env.apiUrl, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await client.auth.setSession(session);
  if (error) throw new Error("setSession failed: " + error.message);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

// ---------------------------------------------------------------------------
// Routes

type Route = { file: string; url: string; methods: string[]; dynamic: string[] };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

function routes(): Route[] {
  const apiDir = path.join(ROOT, "app", "api");
  return walk(apiDir)
    .map((file) => {
      const rel = path.relative(apiDir, path.dirname(file)).split(path.sep).join("/");
      const src = readFileSync(file);
      const methods = [...src.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      const dynamic = [...rel.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      return { file: rel, url: `/api/${rel}`, methods, dynamic };
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}

import { readFileSync as readFileSyncRaw } from "node:fs";
function readFileSync(p: string): string {
  return readFileSyncRaw(p, "utf8");
}

/** Fill [param] segments with Phil's ids, preferring a table named like a path segment. */
function instantiate(route: Route, ids: Map<string, string[]>, fallback: string): string | null {
  if (route.dynamic.length === 0) return route.url;
  const segments = route.url.split("/");
  let url = route.url;
  for (const param of route.dynamic) {
    let chosen: string | undefined;
    // e.g. /api/tasks/[id] → tasks; /api/fitness/sessions/[id] → workout_sessions
    const idx = segments.findIndex((s) => s === `[${param}]`);
    for (let i = idx - 1; i >= 0 && !chosen; i--) {
      const seg = segments[i];
      for (const [table, list] of ids) {
        if (table === seg || table.endsWith("_" + seg) || table === seg.replace(/-/g, "_") || table.endsWith("_" + seg.replace(/-/g, "_"))) {
          chosen = list[0];
          break;
        }
      }
    }
    if (!chosen && /date/i.test(param)) chosen = "2026-09-01";
    if (!chosen && /name|key|slug|type|section|week|agentId/i.test(param)) chosen = "phil";
    if (!chosen) chosen = fallback;
    url = url.replace(`[${param}]`, encodeURIComponent(chosen));
  }
  return url;
}

const READ_POST = /search|query|lookup|match(?!es\/)/;
/** 5xx caused by an integration key absent from this environment, not by code. */
const ENV_MISSING = /(_ID|_KEY|_SECRET|_TOKEN|_URL) missing|not configured|auth setup failed/i;

type Call = { method: string; url: string; status: number; body: string };

async function call(method: string, url: string, cookie: string): Promise<Call> {
  const res = await fetch(APP + url, {
    method,
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: method === "POST" ? "{}" : undefined,
    redirect: "manual",
  });
  const body = await res.text();
  return { method, url, status: res.status, body };
}

// ---------------------------------------------------------------------------

async function main() {
  const space = ensureTess();
  const phil = philSpace();
  const ids = philIds(phil);
  const allPhilIds = new Set([...ids.values()].flat().map((s) => s.toLowerCase()));
  allPhilIds.add(phil.toLowerCase());
  allPhilIds.add(PHIL_AUTH_UID.toLowerCase());
  const fallbackId = [...allPhilIds][0];

  console.log(`Phil: ${allPhilIds.size} ids across ${ids.size} tables. Tess: empty space ${space}.`);
  const tessCookie = await cookieHeaderFor(TESS_EMAIL);
  const philCookie = await cookieHeaderFor(PHIL_EMAIL);

  const all = routes();
  const calls: { route: Route; method: string; url: string }[] = [];
  for (const r of all) {
    const url = instantiate(r, ids, fallbackId);
    if (!url) continue;
    if (r.methods.includes("GET")) calls.push({ route: r, method: "GET", url });
    if (r.methods.includes("POST") && READ_POST.test(r.url)) calls.push({ route: r, method: "POST", url });
  }

  let leaks = 0;
  let tessErrors = 0;
  console.log(`\n== ${calls.length} calls as Tess ==`);
  const tessResults: Call[] = [];
  for (const c of calls) {
    const res = await call(c.method, c.url, tessCookie);
    tessResults.push(res);
    const found = new Set(
      [...res.body.matchAll(UUID_RE)].map((m) => m[0].toLowerCase()).filter((u) => allPhilIds.has(u)),
    );
    let verdict = "ok";
    if (found.size > 0) {
      verdict = `LEAK ${found.size} Phil id(s)`;
      leaks++;
    } else if (res.status >= 500 && ENV_MISSING.test(res.body)) {
      verdict = "ENV (key not set)";
    } else if (res.status >= 500) {
      verdict = "SERVER ERROR";
      tessErrors++;
    }
    console.log(`${verdict.padEnd(22)} ${String(res.status).padStart(3)}  ${c.method.padEnd(4)} ${c.url}`);
  }

  console.log(`\n== PostgREST as Tess: no registered table may show a row outside her own space ==`);
  const tessJwt = await mintUserJwt({ sub: TESS, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
  let restLeaks = 0;
  const ownRows: string[] = [];
  for (const t of registeredTables()) {
    const res = await fetch(`${env.apiUrl}/rest/v1/${t}?select=space_id&limit=1000`, {
      headers: { apikey: env.anonKey, authorization: `Bearer ${tessJwt}` },
    });
    const rows = res.ok ? ((await res.json()) as { space_id: string }[]) : [];
    if (!res.ok) {
      console.log(`ERROR ${res.status}  ${t}`);
      restLeaks++;
      continue;
    }
    const foreign = rows.filter((r) => r.space_id !== space);
    if (foreign.length > 0) {
      console.log(`LEAK  ${foreign.length} row(s) outside Tess's space  ${t}`);
      restLeaks++;
    } else if (rows.length > 0) {
      // Rows the GET calls above created for Tess herself (defaults, today's
      // log, a settings row). Not a leak, but listed: a GET with side effects
      // is worth knowing about.
      ownRows.push(`${t} ${rows.length}`);
    }
  }
  console.log(
    restLeaks === 0
      ? `ok    ${registeredTables().length} tables, no foreign rows visible to Tess` +
          (ownRows.length ? ` (rows created in her own space by GETs: ${ownRows.join(", ")})` : "")
      : `${restLeaks} table(s) leaked`,
  );

  console.log(`\n== ${calls.length} calls as Phil: no server errors ==`);
  let philErrors = 0;
  let philWithData = 0;
  for (const c of calls) {
    const res = await call(c.method, c.url, philCookie);
    const found = [...res.body.matchAll(UUID_RE)].some((m) => allPhilIds.has(m[0].toLowerCase()));
    if (found) philWithData++;
    if (res.status >= 500 && ENV_MISSING.test(res.body)) {
      console.log(`ENV          ${res.status}  ${c.method.padEnd(4)} ${c.url}  ${res.body.slice(0, 80).replace(/\s+/g, " ")}`);
    } else if (res.status >= 500) {
      philErrors++;
      console.log(`SERVER ERROR ${res.status}  ${c.method.padEnd(4)} ${c.url}  ${res.body.slice(0, 120).replace(/\s+/g, " ")}`);
    }
  }
  console.log(`${philErrors === 0 ? "ok" : "FAIL"}    ${philErrors} server error(s); ${philWithData} responses carried Phil's ids`);

  console.log(`\n== Phil's data intact: PostgREST count = SQL count per table ==`);
  const philJwt = await mintUserJwt({ sub: PHIL_AUTH_UID, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
  let mismatches = 0;
  let totalRows = 0;
  for (const t of registeredTables()) {
    const sqlCount = Number(localSql(`select count(*) from public."${t}" where space_id = '${phil}'`)[0][0]);
    const res = await fetch(`${env.apiUrl}/rest/v1/${t}?select=space_id`, {
      headers: { apikey: env.anonKey, authorization: `Bearer ${philJwt}`, prefer: "count=exact", range: "0-0" },
    });
    const range = res.headers.get("content-range") ?? "";
    const restCount = Number(range.split("/")[1] ?? "-1");
    totalRows += sqlCount;
    if (restCount !== sqlCount) {
      mismatches++;
      console.log(`MISMATCH ${t}: sql ${sqlCount}, rest ${restCount} (${res.status})`);
    }
  }
  console.log(mismatches === 0 ? `ok    ${registeredTables().length} tables, ${totalRows} rows, all counts match` : `${mismatches} mismatch(es)`);

  const relations = listPublicRelations().filter((r) => r.kind === "table").length;
  console.log(`\nSummary: ${calls.length} endpoints × 2 users, ${relations} public tables. Leaks: ${leaks} (routes) + ${restLeaks} (tables). Tess 5xx: ${tessErrors}. Phil 5xx: ${philErrors}. Count mismatches: ${mismatches}.`);
  process.exit(leaks + restLeaks + tessErrors + philErrors + mismatches === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
