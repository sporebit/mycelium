import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "./introspect";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { totp } from "../../scripts/lib/totp.mjs";

/**
 * 0160 — an enrolled second factor is required, in the database.
 *
 * Found by the second-user test pass on 2026-11-20: a password alone gave a
 * session at assurance level aal1, and nothing below /admin looked at the
 * level, so a user who HAD an authenticator could be read in full with just
 * their password, through the app or straight through the REST API.
 *
 * These checks use real sign-ins against the LOCAL stack (password, then a
 * real TOTP enrol and verify), so the tokens are GoTrue's own, not minted.
 *   Fay  — has an authenticator. Password only = nothing. With the code = everything.
 *   Tess — has none. Password only works as before.
 * Also here: the other functions 0160 closed (people bin purge, account
 * deletion, sharing) and the rule that the anon key can run nothing but the
 * invite preview. Fails, not skips, when the stack is down.
 */

const FAY = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d";
const FAY_EMAIL = "fay@mycelium.local";
const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const TESS_EMAIL = "tess@mycelium.local";
const PASSWORD = "mycelium-local";
const RUN = `sf${Date.now().toString(36)}`;

const env = localStackEnv();
const sql = (q: string) => localSql(q);

type Rest = { status: number; body: unknown };
async function call(token: string | null, method: string, url: string, body?: unknown): Promise<Rest> {
  const headers: Record<string, string> = { apikey: env.anonKey, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${env.apiUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, body: parsed };
}
const rows = (r: Rest) => (Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : []);
const ok = (r: Rest) => r.status >= 200 && r.status < 300;

function ensureUser(id: string, email: string, name: string) {
  sql(
    `set local app.allow_uninvited = 'on'; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
      extensions.crypt('${PASSWORD}', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"display_name":"${name}"}', now(), now(), '', '', '', '', '', '', '', '', false, false)
    on conflict (id) do nothing`,
  );
  sql(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), '${id}', '${id}', jsonb_build_object('sub', '${id}', 'email', '${email}', 'email_verified', true), 'email', now(), now(), now())
    on conflict (provider_id, provider) do nothing`,
  );
}

async function passwordToken(email: string): Promise<string> {
  const r = await call(null, "POST", "/auth/v1/token?grant_type=password", { email, password: PASSWORD });
  const token = (r.body as { access_token?: string }).access_token;
  if (!token) throw new Error(`password sign-in failed for ${email}: ${r.status}`);
  return token;
}
const claim = (token: string, key: string): unknown => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))[key];
const spaceOf = (uid: string) => sql(`select personal_space_id from public.profiles where id = '${uid}'`)[0][0];

/** What app.personal_space() and app.accessible_spaces() answer for a session with these claims. */
function accessFor(claims: Record<string, unknown>): { personal: string; spaces: number } {
  const json = JSON.stringify({ role: "authenticated", ...claims }).replace(/'/g, "''");
  // One psql -c call is one transaction, so the role and the claims last exactly as long as the question.
  const out = sql(
    `set local role authenticated; select set_config('request.jwt.claims', '${json}', true);
     select 'answer=' || coalesce(app.personal_space()::text, 'none') || '|' || (select count(*) from app.accessible_spaces('organisation.tickets', 'view'))`,
  );
  const answer = out.map((r) => r[0]).find((v) => v.startsWith("answer=")) ?? "answer=none|0";
  const [personal, spaces] = answer.slice("answer=".length).split("|");
  return { personal, spaces: Number(spaces) };
}

let fayPasswordOnly = "";
let fayWithCode = "";
let tessPasswordOnly = "";
let fayTicket = "";

beforeAll(async () => {
  ensureUser(FAY, FAY_EMAIL, "Fay");
  ensureUser(TESS, TESS_EMAIL, "Tess");
  sql(`delete from auth.mfa_factors where user_id = '${FAY}'`);
  fayTicket = sql(`insert into public.tickets (title, space_id, created_by) values ('${RUN} fay ticket', '${spaceOf(FAY)}', '${FAY}') returning id`)[0][0];

  // Fay enrols an authenticator for real, and verifies it.
  const first = await passwordToken(FAY_EMAIL);
  const enrol = await call(first, "POST", "/auth/v1/factors", { factor_type: "totp", friendly_name: RUN });
  const factor = enrol.body as { id?: string; totp?: { secret?: string } };
  if (!factor.id || !factor.totp?.secret) throw new Error(`enrol failed: ${enrol.status}`);
  const challenge = await call(first, "POST", `/auth/v1/factors/${factor.id}/challenge`, {});
  const verify = await call(first, "POST", `/auth/v1/factors/${factor.id}/verify`, {
    challenge_id: (challenge.body as { id: string }).id,
    code: totp(factor.totp.secret),
  });
  fayWithCode = (verify.body as { access_token?: string }).access_token ?? "";
  if (!fayWithCode) throw new Error(`verify failed: ${verify.status}`);

  // A fresh sign-in with the password alone: the session an attacker with her password would hold.
  fayPasswordOnly = await passwordToken(FAY_EMAIL);
  tessPasswordOnly = await passwordToken(TESS_EMAIL);
}, 60_000);

afterAll(() => {
  sql(`delete from public.tickets where title like '${RUN}%'`);
  sql(`delete from public.people where first_name like '${RUN}%'`);
  sql(`delete from auth.mfa_factors where user_id = '${FAY}'`);
});

describe("an enrolled second factor is required", () => {
  it("the two sessions are what they claim to be", () => {
    expect(claim(fayPasswordOnly, "aal")).toBe("aal1");
    expect(claim(fayWithCode, "aal")).toBe("aal2");
    expect(claim(tessPasswordOnly, "aal")).toBe("aal1");
  });

  it("password only, with an authenticator enrolled: no table, no function, no file", async () => {
    const tickets = await call(fayPasswordOnly, "GET", "/rest/v1/tickets?select=id,title");
    expect(rows(tickets)).toEqual([]);
    expect(tickets.status).toBe(403);

    const settings = await call(fayPasswordOnly, "GET", "/rest/v1/user_settings?select=*");
    expect(rows(settings)).toEqual([]);
    const profile = await call(fayPasswordOnly, "GET", "/rest/v1/profiles?select=id");
    expect(rows(profile)).toEqual([]);

    expect(ok(await call(fayPasswordOnly, "POST", "/rest/v1/rpc/my_personal_space", {}))).toBe(false);
    expect(ok(await call(fayPasswordOnly, "POST", "/rest/v1/rpc/my_sessions", {}))).toBe(false);
    expect(ok(await call(fayPasswordOnly, "POST", "/rest/v1/rpc/find_user_by_email", { p_email: TESS_EMAIL }))).toBe(false);
    expect(ok(await call(fayPasswordOnly, "POST", "/rest/v1/tickets", { title: `${RUN} written at aal1` }))).toBe(false);

    const listed = await call(fayPasswordOnly, "POST", "/storage/v1/object/list/tickets", { prefix: `${fayTicket}/`, limit: 10 });
    expect(Array.isArray(listed.body) ? listed.body : []).toEqual([]);
    const upload = await fetch(`${env.apiUrl}/storage/v1/object/tickets/${fayTicket}/${RUN}.txt`, {
      method: "POST",
      headers: { apikey: env.anonKey, authorization: `Bearer ${fayPasswordOnly}`, "content-type": "text/plain" },
      body: "x",
    });
    expect(upload.status).not.toBe(200);
  });

  it("the one call the sign-in page needs still answers", async () => {
    const r = await call(fayPasswordOnly, "POST", "/rest/v1/rpc/requires_totp", {});
    expect(r.status).toBe(200);
    expect(typeof r.body).toBe("boolean");
  });

  it("with the code: everything of hers, as before", async () => {
    const tickets = await call(fayWithCode, "GET", `/rest/v1/tickets?select=id,title&id=eq.${fayTicket}`);
    expect(rows(tickets).map((t) => t.id)).toEqual([fayTicket]);
    const space = await call(fayWithCode, "POST", "/rest/v1/rpc/my_personal_space", {});
    expect(space.body).toBe(spaceOf(FAY));
  });

  it("the app's own system work for her still runs (crons, webhooks, API tokens)", async () => {
    const minted = await mintUserJwt({ sub: FAY, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
    const tickets = await call(minted, "GET", `/rest/v1/tickets?select=id&id=eq.${fayTicket}`);
    expect(rows(tickets).map((t) => t.id)).toEqual([fayTicket]);
  });

  it("someone with no authenticator signs in with a password as before", async () => {
    const space = await call(tessPasswordOnly, "POST", "/rest/v1/rpc/my_personal_space", {});
    expect(space.body).toBe(spaceOf(TESS));
    expect((await call(tessPasswordOnly, "GET", "/rest/v1/tickets?select=id&limit=1")).status).toBe(200);
  });

  it("the access functions themselves refuse, not only the request gate", () => {
    const password = [{ method: "password", timestamp: 1 }];
    expect(accessFor({ sub: FAY, aal: "aal1", amr: password })).toEqual({ personal: "none", spaces: 0 });
    expect(accessFor({ sub: FAY, aal: "aal2", amr: [...password, { method: "totp", timestamp: 2 }] }).personal).toBe(spaceOf(FAY));
    expect(accessFor({ sub: FAY, aal: "aal1", amr: [{ method: "system", timestamp: 1 }] }).personal).toBe(spaceOf(FAY));
    expect(accessFor({ sub: TESS, aal: "aal1", amr: password }).personal).toBe(spaceOf(TESS));
    // A claim the client could set in user metadata is not the system mark.
    expect(accessFor({ sub: FAY, aal: "aal1", amr: password, user_metadata: { amr: [{ method: "system" }] } }).personal).toBe("none");
  });
});

describe("a session that was signed out is over at once", () => {
  it("refuses a token whose session row is gone, long before the token expires", async () => {
    const token = await passwordToken(TESS_EMAIL);
    expect((await call(token, "POST", "/rest/v1/rpc/my_personal_space", {})).body).toBe(spaceOf(TESS));

    // "Sign out there" on another device: the session row is deleted.
    const session = String(claim(token, "session_id"));
    sql(`delete from auth.sessions where id = '${session}'`);

    const after = await call(token, "POST", "/rest/v1/rpc/my_personal_space", {});
    expect(ok(after)).toBe(false);
    expect(rows(await call(token, "GET", "/rest/v1/tickets?select=id&limit=1"))).toEqual([]);
    // Her other session carries on.
    expect((await call(tessPasswordOnly, "POST", "/rest/v1/rpc/my_personal_space", {})).body).toBe(spaceOf(TESS));
  });

  it("the access functions refuse it too, not only the request gate", () => {
    const gone = "00000000-0000-4000-8000-00000000dead";
    expect(accessFor({ sub: TESS, aal: "aal1", amr: [{ method: "password", timestamp: 1 }], session_id: gone })).toEqual({ personal: "none", spaces: 0 });
  });
});

describe("functions that used to trust their caller", () => {
  it("emptying the people bin removes only what the caller may delete", async () => {
    const philSpace = spaceOf(PHIL_AUTH_UID);
    const binned = sql(
      `insert into public.people (first_name, space_id, created_by, deleted_at) values ('${RUN} binned', '${philSpace}', '${PHIL_AUTH_UID}', now() - interval '40 days') returning id`,
    )[0][0];
    const asTess = await call(tessPasswordOnly, "POST", "/rest/v1/rpc/people_purge_deleted", { p_days: 1 });
    expect(asTess.body).toBe(0);
    expect(sql(`select count(*) from public.people where id = '${binned}'`)[0][0]).toBe("1");

    const phil = await mintUserJwt({ sub: PHIL_AUTH_UID, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
    const asPhil = await call(phil, "POST", "/rest/v1/rpc/people_purge_deleted", { p_days: 30 });
    expect(Number(asPhil.body)).toBeGreaterThanOrEqual(1);
    expect(sql(`select count(*) from public.people where id = '${binned}'`)[0][0]).toBe("0");
  });

  it("deleting an account and sharing a space need a second factor in the session, whichever door is used", async () => {
    const del = await call(tessPasswordOnly, "POST", "/rest/v1/rpc/delete_my_account", {});
    expect(ok(del)).toBe(false);
    expect(sql(`select count(*) from public.profiles where id = '${TESS}'`)[0][0]).toBe("1");

    const share = await call(tessPasswordOnly, "POST", "/rest/v1/rpc/create_user_grant", {
      p_grantee: FAY,
      p_section: "organisation",
      p_entity_groups: [],
      p_verbs: ["view"],
      p_expires_at: null,
      p_reason: RUN,
    });
    expect(ok(share)).toBe(false);
    expect(sql(`select count(*) from public.user_grants where grantor_id = '${TESS}' and reason = '${RUN}'`)[0][0]).toBe("0");
    // The inner function is not a way round the guard.
    const inner = await call(tessPasswordOnly, "POST", "/rest/v1/rpc/create_user_grant_unchecked", {
      p_grantee: FAY,
      p_section: "organisation",
      p_entity_groups: [],
      p_verbs: ["view"],
      p_expires_at: null,
      p_reason: RUN,
    });
    expect(ok(inner)).toBe(false);
  });

  it("the scheduled maintenance functions are not a client's to run", async () => {
    for (const token of [null, tessPasswordOnly]) {
      expect(ok(await call(token, "POST", "/rest/v1/rpc/pc_metrics_prune", {}))).toBe(false);
      expect(ok(await call(token, "POST", "/rest/v1/rpc/pc_metrics_rollup", { hours_back: 1 }))).toBe(false);
    }
  });

  it("the anon key can run nothing in public or app but the invite preview and the request gate", () => {
    const open = sql(
      `select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'app') and p.prokind = 'f'
         and has_function_privilege('anon', p.oid, 'execute')
         and not exists (select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid where d.objid = p.oid and d.deptype = 'e')
       order by 1`,
    ).map((r) => r[0].replace(/^public\./, ""));
    expect(open).toEqual(["invite_preview(text)", "request_gate()"]);
  });
});
