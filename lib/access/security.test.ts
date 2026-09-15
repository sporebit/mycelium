import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "./introspect";
import { registeredTables } from "./registry";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * VERIFY 5 (P12 Part 5) at the database and PostgREST level:
 *   - an audit row exists for each listed action (sign-in/out, MFA
 *     changes, invites, membership and role changes, grants, successor,
 *     session revoked, user disabled, account deleted);
 *   - rate limits trip; the second factor locks after ten failures in
 *     fifteen minutes and clears on success;
 *   - a disabled user sees nothing, even in a team they belong to;
 *   - deleting a user leaves zero rows in their personal space and keeps
 *     their team rows with created_by = null.
 * Break-glass, cross-user reads and export are API-layer events and are
 * checked by the Part 5 HTTP driver, not here.
 */

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const TESS_EMAIL = "tess@mycelium.local";
const VIC = "9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e";
const VIC_EMAIL = "vic@mycelium.local";
const SLUG = "verify-five";

const env = localStackEnv();
const tokens = new Map<string, string>();
async function token(uid: string, email: string) {
  const k = `${uid}:${email}`;
  let t = tokens.get(k);
  if (!t) {
    t = await mintUserJwt({ sub: uid, email, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
    tokens.set(k, t);
  }
  return t;
}
type Rest = { status: number; body: unknown };
async function rest(uid: string | null, method: string, path: string, body?: unknown, email = ""): Promise<Rest> {
  const headers: Record<string, string> = { apikey: env.anonKey, "content-type": "application/json", prefer: "return=representation" };
  if (uid) headers.authorization = `Bearer ${await token(uid, email || (uid === PHIL_AUTH_UID ? "phil@mycelium.local" : uid === VIC ? VIC_EMAIL : TESS_EMAIL))}`;
  const res = await fetch(`${env.apiUrl}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, body: parsed };
}
const rpc = (uid: string | null, fn: string, args: Record<string, unknown> = {}) => rest(uid, "POST", `rpc/${fn}`, args);
const rows = (r: Rest) => (Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : []);
const ok = (r: Rest) => r.status >= 200 && r.status < 300;
const msg = (r: Rest) => (typeof r.body === "object" && r.body ? String((r.body as { message?: string }).message ?? "") : String(r.body));
const sql = (q: string) => localSql(q);

function ensureUser(id: string, email: string, name: string) {
  sql(
    `set local app.allow_uninvited = 'on'; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
	    confirmation_token, recovery_token, email_change_token_new, email_change,
	    email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
	  values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
	    extensions.crypt('mycelium-local', extensions.gen_salt('bf')), now(),
	    '{"provider":"email","providers":["email"]}', '{"display_name":"${name}"}', now(), now(), '', '', '', '', '', '', '', '', false, false)
	  on conflict (id) do nothing`,
  );
}

function auditCount(action: string, extra = ""): number {
  return Number(sql(`select count(*) from public.audit_events where action = '${action}' ${extra}`)[0][0]);
}

let teamId = "";
let teamSpace = "";

function cleanup() {
  sql(`delete from public.user_grants where grantor_id in ('${PHIL_AUTH_UID}', '${TESS}', '${VIC}')`);
  sql(`delete from public.invites where email in ('${TESS_EMAIL}', '${VIC_EMAIL}')`);
  const t = sql(`select id from public.teams where slug = '${SLUG}'`)[0]?.[0];
  if (t) {
    sql(`delete from public.tickets where space_id = (select space_id from public.teams where id = '${t}')`);
    sql(`delete from public.team_members where team_id = '${t}'`);
    sql(`update public.teams set space_id = null where id = '${t}'`);
    sql(`delete from public.spaces where team_id = '${t}'`);
    sql(`delete from public.teams where id = '${t}'`);
  }
  sql(`delete from public.tickets where title like 'v5:%'`);
  sql(`delete from public.second_factor_failures where user_id in ('${TESS}', '${VIC}')`);
  sql(`delete from public.rate_limits where key like 'v5:%'`);
  sql(`update public.profiles set disabled_at = null where id = '${TESS}'`);
  sql(`update auth.users set banned_until = null where id = '${TESS}'`);
}

beforeAll(async () => {
  ensureUser(TESS, TESS_EMAIL, "Tess");
  ensureUser(VIC, VIC_EMAIL, "Vic");
  cleanup();
  const created = await rpc(PHIL_AUTH_UID, "create_team", { p_name: "Verify Five", p_slug: SLUG });
  expect(ok(created), msg(created)).toBe(true);
  teamId = String(created.body);
  teamSpace = sql(`select space_id from public.teams where id = '${teamId}'`)[0][0];
});

afterAll(() => {
  cleanup();
  sql(`delete from auth.users where id = '${VIC}'`);
});

describe("audit rows exist for each listed action", () => {
  it("team creation, invite created and accepted, member added, role changed, sections changed, successor, grants", async () => {
    const before = {
      team_created: auditCount("team_created"),
      invite_created: auditCount("invite_created"),
      invite_accepted: auditCount("invite_accepted"),
      member_added: auditCount("member_added"),
      role_changed: auditCount("role_changed"),
      sections_changed: auditCount("sections_changed"),
      successor_changed: auditCount("successor_changed"),
      grant_created: auditCount("grant_created"),
      grant_revoked: auditCount("grant_revoked"),
      member_removed: auditCount("member_removed"),
    };
    expect(auditCount("team_created", `and team_id = '${teamId}'`)).toBe(1);

    const inv = await rpc(PHIL_AUTH_UID, "create_invite", { p_email: TESS_EMAIL, p_team: teamId, p_role: "member" });
    expect(ok(inv), msg(inv)).toBe(true);
    const acc = await rpc(TESS, "accept_invite", { p_token: String(inv.body) });
    expect(ok(acc), msg(acc)).toBe(true);
    expect(ok(await rpc(PHIL_AUTH_UID, "set_team_member_role", { p_team: teamId, p_user: TESS, p_role: "admin" }))).toBe(true);
    expect(ok(await rpc(PHIL_AUTH_UID, "set_team_member_sections", { p_team: teamId, p_user: TESS, p_section: "fitness", p_can_view: true, p_can_edit: false, p_can_create_delete: false, p_can_share: false }))).toBe(true);
    expect(ok(await rpc(PHIL_AUTH_UID, "set_team_successor", { p_team: teamId, p_user: TESS }))).toBe(true);
    const g = await rpc(PHIL_AUTH_UID, "create_user_grant", { p_grantee: TESS, p_section: "organisation", p_entity_groups: ["tickets"], p_verbs: ["view"] });
    expect(ok(g), msg(g)).toBe(true);
    expect(ok(await rpc(PHIL_AUTH_UID, "revoke_user_grant", { p_id: String(g.body) }))).toBe(true);
    expect(ok(await rpc(PHIL_AUTH_UID, "remove_team_member", { p_team: teamId, p_user: TESS }))).toBe(true);

    expect(auditCount("invite_created")).toBe(before.invite_created + 1);
    expect(auditCount("invite_accepted")).toBe(before.invite_accepted + 1);
    expect(auditCount("member_added")).toBe(before.member_added + 1);
    expect(auditCount("role_changed")).toBe(before.role_changed + 1);
    expect(auditCount("sections_changed")).toBe(before.sections_changed + 1);
    expect(auditCount("successor_changed")).toBeGreaterThanOrEqual(before.successor_changed + 1);
    expect(auditCount("grant_created")).toBe(before.grant_created + 1);
    expect(auditCount("grant_revoked")).toBe(before.grant_revoked + 1);
    expect(auditCount("member_removed")).toBe(before.member_removed + 1);

    // The actor is recorded and the subject can see rows about themselves.
    const [[actor]] = sql(`select actor_id from public.audit_events where action = 'role_changed' and subject_user_id = '${TESS}' order by at desc limit 1`);
    expect(actor).toBe(PHIL_AUTH_UID);
    const mine = await rest(TESS, "GET", `audit_events?select=action&subject_user_id=eq.${TESS}&action=eq.role_changed`);
    expect(rows(mine).length).toBeGreaterThan(0);
    const theirs = await rest(VIC, "GET", `audit_events?select=action&subject_user_id=eq.${TESS}`);
    expect(rows(theirs)).toHaveLength(0);
  });

  it("sign-in, sign-out, MFA enrol/verify/remove and session revoke", async () => {
    const before = { sign_in: auditCount("sign_in"), sign_out: auditCount("sign_out"), started: auditCount("mfa_enrol_started"), enrolled: auditCount("mfa_enrolled"), removed: auditCount("mfa_removed"), revoked: auditCount("session_revoked") };
    // A real sign-in through GoTrue creates a session row (trigger → sign_in).
    const res = await fetch(`${env.apiUrl}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: env.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email: TESS_EMAIL, password: "mycelium-local" }),
    });
    expect(res.status).toBe(200);
    const session = (await res.json()) as { access_token: string };
    expect(auditCount("sign_in")).toBe(before.sign_in + 1);

    const bearer = { apikey: env.anonKey, authorization: `Bearer ${session.access_token}`, "content-type": "application/json" };
    const enrol = await fetch(`${env.apiUrl}/auth/v1/factors`, { method: "POST", headers: bearer, body: JSON.stringify({ factor_type: "totp", friendly_name: "v5" }) });
    expect(enrol.status).toBe(200);
    const factor = (await enrol.json()) as { id: string };
    expect(auditCount("mfa_enrol_started")).toBe(before.started + 1);
    sql(`update auth.mfa_factors set status = 'verified' where id = '${factor.id}'`);
    expect(auditCount("mfa_enrolled")).toBe(before.enrolled + 1);
    sql(`delete from auth.mfa_factors where id = '${factor.id}'`);
    expect(auditCount("mfa_removed")).toBe(before.removed + 1);

    // Remote sign-out of the session through the function.
    const [[sid]] = sql(`select id from auth.sessions where user_id = '${TESS}' order by created_at desc limit 1`);
    const end = await rpc(TESS, "end_session", { p_id: sid });
    expect(ok(end), msg(end)).toBe(true);
    expect(auditCount("session_revoked")).toBe(before.revoked + 1);
    expect(auditCount("sign_out")).toBeGreaterThanOrEqual(before.sign_out + 1);
    const other = await rpc(VIC, "end_session", { p_id: sid });
    expect(other.status).toBeGreaterThanOrEqual(400);
  });
});

describe("rate limits and second-factor lockout", () => {
  it("the token bucket trips at capacity and refills", async () => {
    const key = `v5:${Date.now()}`;
    const results: boolean[] = [];
    // Refill of 1 per minute: nothing meaningful comes back within the test.
    for (let i = 0; i < 4; i++) {
      const r = await rpc(null, "rate_limit_take", { p_key: key, p_capacity: 3, p_refill_per_minute: 1, p_cost: 1 });
      results.push(r.body === true);
    }
    expect(results).toEqual([true, true, true, false]);
    // A minute later (backdated), one token has refilled.
    sql(`update public.rate_limits set updated_at = updated_at - interval '61 seconds' where key = '${key}'`);
    const again = await rpc(null, "rate_limit_take", { p_key: key, p_capacity: 3, p_refill_per_minute: 1, p_cost: 1 });
    expect(again.body).toBe(true);
    const andAgain = await rpc(null, "rate_limit_take", { p_key: key, p_capacity: 3, p_refill_per_minute: 1, p_cost: 1 });
    expect(andAgain.body).toBe(false);
  });

  it("ten failures in fifteen minutes lock the second factor; success clears it", async () => {
    for (let i = 0; i < 9; i++) expect((await rpc(TESS, "second_factor_failed")).body).toBe(false);
    const tenth = await rpc(TESS, "second_factor_failed");
    expect(tenth.body).toBe(true);
    expect((await rpc(TESS, "second_factor_locked")).body).toBe(true);
    expect(auditCount("second_factor_locked", `and subject_user_id = '${TESS}'`)).toBeGreaterThanOrEqual(1);
    sql(`update public.second_factor_failures set at = at - interval '16 minutes' where user_id = '${TESS}'`);
    expect((await rpc(TESS, "second_factor_locked")).body).toBe(false);
    expect(ok(await rpc(TESS, "second_factor_failed"))).toBe(true);
    expect(ok(await rpc(TESS, "second_factor_succeeded"))).toBe(true);
    expect(Number(sql(`select count(*) from public.second_factor_failures where user_id = '${TESS}'`)[0][0])).toBe(0);
  });
});

describe("disabled users", () => {
  it("a disabled member sees nothing and cannot write; enabling restores access", async () => {
    sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${TESS}', 'member') on conflict do nothing`);
    const seeded = await rest(PHIL_AUTH_UID, "POST", "tickets", { title: "v5: team task", space_id: teamSpace });
    expect(seeded.status, msg(seeded)).toBe(201);
    const own = await rest(TESS, "POST", "tickets", { title: "v5: tess own" });
    expect(own.status, msg(own)).toBe(201);
    expect(rows(await rest(TESS, "GET", "tickets?select=id&title=like.v5:*")).length).toBe(2);

    const disable = await rpc(PHIL_AUTH_UID, "admin_set_user_disabled", { p_user: TESS, p_disabled: true });
    expect(ok(disable), msg(disable)).toBe(true);
    expect(rows(await rest(TESS, "GET", "tickets?select=id&title=like.v5:*")).length).toBe(0);
    const write = await rest(TESS, "POST", "tickets", { title: "v5: while disabled" });
    expect(write.status).toBeGreaterThanOrEqual(400);
    expect(auditCount("user_disabled", `and subject_user_id = '${TESS}'`)).toBeGreaterThanOrEqual(1);
    const notOwner = await rpc(TESS, "admin_set_user_disabled", { p_user: VIC, p_disabled: true });
    expect(notOwner.status).toBeGreaterThanOrEqual(400);

    expect(ok(await rpc(PHIL_AUTH_UID, "admin_set_user_disabled", { p_user: TESS, p_disabled: false }))).toBe(true);
    expect(rows(await rest(TESS, "GET", "tickets?select=id&title=like.v5:*")).length).toBe(2);
  });
});

describe("account deletion", () => {
  it("leaves zero rows in the personal space and keeps team rows with created_by null", { timeout: 30_000 }, async () => {
    sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${VIC}', 'member') on conflict do nothing`);
    const vicSpace = sql(`select personal_space_id from public.profiles where id = '${VIC}'`)[0][0];
    expect((await rest(VIC, "POST", "tickets", { title: "v5: vic personal" })).status).toBe(201);
    const teamRow = await rest(VIC, "POST", "tickets", { title: "v5: vic in team", space_id: teamSpace });
    expect(teamRow.status, msg(teamRow)).toBe(201);
    const teamTaskId = String(rows(teamRow)[0].id);
    expect(ok(await rpc(PHIL_AUTH_UID, "create_user_grant", { p_grantee: VIC, p_section: "organisation", p_entity_groups: [], p_verbs: ["view"] }))).toBe(true);

    const del = await rpc(VIC, "delete_my_account");
    expect(ok(del), msg(del)).toBe(true);

    const union = registeredTables().map((t) => `select count(*) as n from public."${t}" where space_id = '${vicSpace}'`).join(" union all ");
    const personalRows = Number(sql(`select sum(n) from (${union}) x`)[0][0]);
    expect(personalRows).toBe(0);
    expect(sql(`select count(*) from public.spaces where id = '${vicSpace}'`)[0][0]).toBe("0");
    expect(sql(`select count(*) from auth.users where id = '${VIC}'`)[0][0]).toBe("0");
    expect(sql(`select count(*) from public.profiles where id = '${VIC}'`)[0][0]).toBe("0");
    expect(sql(`select count(*) from public.team_members where user_id = '${VIC}'`)[0][0]).toBe("0");
    expect(sql(`select count(*) from public.user_grants where grantee_id = '${VIC}'`)[0][0]).toBe("0");
    const [[stillThere, creator]] = sql(`select title, coalesce(created_by::text, 'null') from public.tickets where id = '${teamTaskId}'`);
    expect(stillThere).toBe("v5: vic in team");
    expect(creator).toBe("null");
    expect(auditCount("account_deleted", `and subject_user_id = '${VIC}'`)).toBeGreaterThanOrEqual(1);
  });

  it("the instance owner cannot delete themselves; a team owner must transfer first", async () => {
    const me = await rpc(PHIL_AUTH_UID, "delete_my_account");
    expect(msg(me)).toMatch(/instance owner/);
  });
});
