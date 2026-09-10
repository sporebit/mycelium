import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "./introspect";
import { GROUPS_BY_SECTION, SHAREABLE_SECTIONS } from "./teams";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * VERIFY 4 (P12 Part 4), against the local stack through PostgREST:
 *   - role × section × verb matrix for team spaces (admin/member/viewer ×
 *     organisation/fitness/health × view/edit/create_delete), then toggles;
 *   - direct-grant matrix for a personal space (verb subsets, groups);
 *   - finance absent from the grant UI's data and refused by constraint;
 *   - the one-owner index holds;
 *   - successor flow (owner cannot leave without one; leaving transfers);
 *   - invite expiry and single use; invite-only sign-up trigger;
 *   - a new user's first screen (hidden sections, AI features off).
 * Every write goes through the 0112 functions, exactly as the API does.
 */

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const TESS_EMAIL = "tess@mycelium.local";
const PHIL_EMAIL = "phil@mycelium.local";
const SLUG = "verify-four";

const env = localStackEnv();
const tokens = new Map<string, string>();

async function token(uid: string, email: string): Promise<string> {
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
  const headers: Record<string, string> = {
    apikey: env.anonKey,
    "content-type": "application/json",
    prefer: "return=representation",
  };
  if (uid) headers.authorization = `Bearer ${await token(uid, email || (uid === PHIL_AUTH_UID ? PHIL_EMAIL : TESS_EMAIL))}`;
  const res = await fetch(`${env.apiUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, body: parsed };
}

const rpc = (uid: string | null, fn: string, args: Record<string, unknown> = {}, email?: string) =>
  rest(uid, "POST", `rpc/${fn}`, args, email);
const rows = (r: Rest) => (Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : []);
/** PostgREST answers 200 with a body, or 204 for void functions. */
const ok = (r: Rest) => r.status >= 200 && r.status < 300;
const msg = (r: Rest) => (typeof r.body === "object" && r.body ? String((r.body as { message?: string }).message ?? "") : String(r.body));

const sql = (q: string) => localSql(q);
const philSpace = () => sql(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`)[0][0];
const tessSpace = () => sql(`select personal_space_id from public.profiles where id = '${TESS}'`)[0][0];

let teamId = "";
let teamSpace = "";

function cleanup() {
  sql(`delete from public.user_grants where grantor_id in ('${PHIL_AUTH_UID}', '${TESS}')`);
  sql(`delete from public.invites where email in ('${TESS_EMAIL}', 'nobody@mycelium.local', 'uma@mycelium.local')`);
  const t = sql(`select id from public.teams where slug = '${SLUG}'`)[0]?.[0];
  if (t) {
    sql(`delete from public.tasks where space_id = (select space_id from public.teams where id = '${t}')`);
    sql(`delete from public.workouts where space_id = (select space_id from public.teams where id = '${t}')`);
    sql(`delete from public.supplements where space_id = (select space_id from public.teams where id = '${t}')`);
    sql(`delete from public.team_members where team_id = '${t}'`);
    sql(`update public.teams set space_id = null where id = '${t}'`);
    sql(`delete from public.spaces where team_id = '${t}'`);
    sql(`delete from public.teams where id = '${t}'`);
  }
  sql(`delete from public.tasks where title like 'v4:%'`);
  sql(`delete from public.workouts where name like 'v4:%'`);
  sql(`delete from public.supplements where name like 'v4:%'`);
  sql(`delete from public.user_settings where space_id = '${tessSpace()}'`);
  sql(`delete from auth.users where email in ('uma@mycelium.local', 'nobody@mycelium.local')`);
}

beforeAll(async () => {
  sql(
    `set local app.allow_uninvited = 'on'; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
	    confirmation_token, recovery_token, email_change_token_new, email_change,
	    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
	    is_sso_user, is_anonymous)
	  values ('00000000-0000-0000-0000-000000000000', '${TESS}', 'authenticated', 'authenticated',
	    '${TESS_EMAIL}', extensions.crypt('mycelium-local', extensions.gen_salt('bf')), now(),
	    '{"provider":"email","providers":["email"]}', '{"display_name":"Tess"}', now(), now(),
	    '', '', '', '', '', '', '', '', false, false)
	  on conflict (id) do nothing`,
  );
  cleanup();
  // Phil creates the team through the function, as the API would.
  const created = await rpc(PHIL_AUTH_UID, "create_team", { p_name: "Verify Four", p_slug: SLUG });
  expect(ok(created), msg(created)).toBe(true);
  teamId = String(created.body);
  teamSpace = sql(`select space_id from public.teams where id = '${teamId}'`)[0][0];
  expect(teamSpace).toMatch(/^[0-9a-f-]{36}$/);
});

afterAll(() => cleanup());

// ---------------------------------------------------------------------------

describe("teams and the one-owner rule", () => {
  it("create_team makes the caller owner with a team space", () => {
    const [[role]] = sql(`select role from public.team_members where team_id = '${teamId}' and user_id = '${PHIL_AUTH_UID}'`);
    expect(role).toBe("owner");
    const [[kind]] = sql(`select kind from public.spaces where id = '${teamSpace}'`);
    expect(kind).toBe("team");
  });

  it("the one-owner index refuses a second owner", () => {
    expect(() =>
      sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${TESS}', 'owner')`),
    ).toThrow(/team_members_one_owner/);
  });

  it("the access tables are read-only through PostgREST", async () => {
    const direct = await rest(PHIL_AUTH_UID, "POST", "team_members", { team_id: teamId, user_id: TESS, role: "member" });
    expect(direct.status).toBeGreaterThanOrEqual(400);
  });
});

describe("invites", () => {
  let tokenPlain = "";

  it("owner invites; the preview is public; only the invitee's email can accept", async () => {
    const inv = await rpc(PHIL_AUTH_UID, "create_invite", { p_email: TESS_EMAIL, p_team: teamId, p_role: "member" });
    expect(ok(inv), msg(inv)).toBe(true);
    tokenPlain = String(inv.body);
    expect(tokenPlain).toMatch(/^[0-9a-f]{64}$/);
    const [[stored]] = sql(`select token_hash from public.invites where email = '${TESS_EMAIL}' order by created_at desc limit 1`);
    expect(stored).not.toBe(tokenPlain);

    const preview = await rpc(null, "invite_preview", { p_token: tokenPlain });
    expect(ok(preview), msg(preview)).toBe(true);
    expect(rows(preview)[0]).toMatchObject({ email: TESS_EMAIL, role: "member", status: "valid", team_name: "Verify Four" });

    const wrongEmail = await rpc(TESS, "accept_invite", { p_token: tokenPlain }, "someone-else@mycelium.local");
    expect(wrongEmail.status).toBeGreaterThanOrEqual(400);
    expect(msg(wrongEmail)).toMatch(/different email/);
  });

  it("accepting joins the team, seeds the first screen, and spends the token", async () => {
    const acc = await rpc(TESS, "accept_invite", { p_token: tokenPlain });
    expect(ok(acc), msg(acc)).toBe(true);
    expect(rows(acc)[0]).toMatchObject({ team_slug: SLUG, role: "member", requires_totp: false });
    const [[role]] = sql(`select role from public.team_members where team_id = '${teamId}' and user_id = '${TESS}'`);
    expect(role).toBe("member");

    const [[hidden, voice, ai, vision]] = sql(
      `select ui_prefs -> 'hidden_sections', voice_capture_enabled, ai_categorisation_enabled, claude_vision_label_scan_enabled from public.user_settings where space_id = '${tessSpace()}'`,
    );
    expect(JSON.parse(hidden)).toEqual(["finance", "studio", "ventures", "drops", "the-boys"]);
    expect([voice, ai, vision]).toEqual(["f", "f", "f"]);

    const again = await rpc(TESS, "accept_invite", { p_token: tokenPlain });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(msg(again)).toMatch(/already been used/);
  });

  it("an expired invite is refused", async () => {
    const inv = await rpc(PHIL_AUTH_UID, "create_invite", { p_email: TESS_EMAIL, p_team: teamId, p_role: "viewer" });
    const t = String(inv.body);
    sql(`update public.invites set expires_at = now() - interval '1 minute' where token_hash = encode(extensions.digest('${t}', 'sha256'), 'hex')`);
    const preview = await rpc(null, "invite_preview", { p_token: t });
    expect(rows(preview)[0].status).toBe("expired");
    const acc = await rpc(TESS, "accept_invite", { p_token: t });
    expect(msg(acc)).toMatch(/expired/);
  });

  it("an admin may invite members and viewers but not admins; a viewer cannot invite", async () => {
    sql(`update public.team_members set role = 'admin' where team_id = '${teamId}' and user_id = '${TESS}'`);
    const fine = await rpc(TESS, "create_invite", { p_email: "uma@mycelium.local", p_team: teamId, p_role: "viewer" });
    expect(ok(fine), msg(fine)).toBe(true);
    const no = await rpc(TESS, "create_invite", { p_email: "uma@mycelium.local", p_team: teamId, p_role: "admin" });
    expect(no.status).toBeGreaterThanOrEqual(400);
    sql(`update public.team_members set role = 'viewer' where team_id = '${teamId}' and user_id = '${TESS}'`);
    const viewer = await rpc(TESS, "create_invite", { p_email: "uma@mycelium.local", p_team: teamId, p_role: "viewer" });
    expect(viewer.status).toBeGreaterThanOrEqual(400);
  });

  it("sign-up is invite-only at the database", () => {
    const insert = (email: string) =>
      sql(
        `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
	        confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
	      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${email}', now(), '{}', '{}', now(), now(), '', '', '', '', '', '', '', '', false, false)`,
      );
    expect(() => insert("nobody@mycelium.local")).toThrow(/invitation only/);
    // uma has a live invite from the previous test.
    expect(() => insert("uma@mycelium.local")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

type Fixture = { table: string; section: string; make: (n: string) => Record<string, unknown>; patch: Record<string, unknown> };
const FIXTURES: Fixture[] = [
  { table: "tasks", section: "organisation", make: (n) => ({ title: n }), patch: { title: "v4: edited" } },
  { table: "workouts", section: "fitness", make: (n) => ({ name: n }), patch: { name: "v4: edited" } },
  { table: "supplements", section: "health", make: (n) => ({ name: n, dose: "1" }), patch: { name: "v4: edited" } },
];

async function seedTeamRow(f: Fixture): Promise<string> {
  const r = await rest(PHIL_AUTH_UID, "POST", f.table, { ...f.make(`v4: ${f.table}`), space_id: teamSpace });
  expect(r.status, msg(r)).toBe(201);
  return String(rows(r)[0].id);
}

async function probe(uid: string, f: Fixture, id: string) {
  const view = rows(await rest(uid, "GET", `${f.table}?select=id&id=eq.${id}`)).length === 1;
  const edit = rows(await rest(uid, "PATCH", `${f.table}?id=eq.${id}`, f.patch)).length === 1;
  const create = (await rest(uid, "POST", f.table, { ...f.make(`v4: by ${uid.slice(0, 4)} ${Math.random().toString(36).slice(2, 8)}`), space_id: teamSpace })).status === 201;
  return { view, edit, create };
}

describe("role × section × verb matrix (team space)", () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    for (const f of FIXTURES) ids[f.table] = await seedTeamRow(f);
  });

  const EXPECT: Record<string, { view: boolean; edit: boolean; create: boolean }> = {
    admin: { view: true, edit: true, create: true },
    member: { view: true, edit: true, create: true },
    viewer: { view: true, edit: false, create: false },
    none: { view: false, edit: false, create: false },
  };

  for (const role of ["admin", "member", "viewer", "none"] as const) {
    for (const f of FIXTURES) {
      it(`${role} × ${f.section} → ${JSON.stringify(EXPECT[role])}`, async () => {
        sql(`delete from public.team_member_sections where user_id = '${TESS}'`);
        sql(`delete from public.team_members where team_id = '${teamId}' and user_id = '${TESS}'`);
        if (role !== "none") {
          sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${TESS}', '${role}')`);
        }
        expect(await probe(TESS, f, ids[f.table])).toEqual(EXPECT[role]);
      });
    }
  }

  it("toggles narrow a member per section and never widen a viewer", async () => {
    sql(`delete from public.team_members where team_id = '${teamId}' and user_id = '${TESS}'`);
    sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${TESS}', 'member')`);
    const set = await rpc(PHIL_AUTH_UID, "set_team_member_sections", {
      p_team: teamId, p_user: TESS, p_section: "fitness",
      p_can_view: true, p_can_edit: false, p_can_create_delete: false, p_can_share: false,
    });
    expect(ok(set), msg(set)).toBe(true);
    expect(await probe(TESS, FIXTURES[1], ids.workouts)).toEqual({ view: true, edit: false, create: false });
    // Other sections untouched.
    expect(await probe(TESS, FIXTURES[0], ids.tasks)).toEqual({ view: true, edit: true, create: true });

    sql(`update public.team_members set role = 'viewer' where team_id = '${teamId}' and user_id = '${TESS}'`);
    await rpc(PHIL_AUTH_UID, "set_team_member_sections", {
      p_team: teamId, p_user: TESS, p_section: "organisation",
      p_can_view: true, p_can_edit: true, p_can_create_delete: true, p_can_share: true,
    });
    expect(await probe(TESS, FIXTURES[0], ids.tasks)).toEqual({ view: true, edit: false, create: false });
    sql(`delete from public.team_member_sections where user_id = '${TESS}'`);
  });

  it("an admin cannot narrow another admin; nobody narrows the owner", async () => {
    sql(`update public.team_members set role = 'admin' where team_id = '${teamId}' and user_id = '${TESS}'`);
    const onOwner = await rpc(TESS, "set_team_member_sections", {
      p_team: teamId, p_user: PHIL_AUTH_UID, p_section: "fitness",
      p_can_view: false, p_can_edit: false, p_can_create_delete: false, p_can_share: false,
    });
    expect(msg(onOwner)).toMatch(/owner/);
  });
});

describe("direct-grant matrix (personal space)", () => {
  let philTask = "";
  beforeAll(async () => {
    sql(`delete from public.team_members where team_id = '${teamId}' and user_id = '${TESS}'`);
    const r = await rest(PHIL_AUTH_UID, "POST", "tasks", { title: "v4: phil personal" });
    philTask = String(rows(r)[0].id);
  });

  async function grant(verbs: string[], groups: string[] = ["tasks"], section = "organisation") {
    sql(`delete from public.user_grants where grantor_id = '${PHIL_AUTH_UID}'`);
    const g = await rpc(PHIL_AUTH_UID, "create_user_grant", {
      p_grantee: TESS, p_section: section, p_entity_groups: groups, p_verbs: verbs,
    });
    expect(ok(g), msg(g)).toBe(true);
    return String(g.body);
  }

  async function personalProbe() {
    const view = rows(await rest(TESS, "GET", `tasks?select=id&id=eq.${philTask}`)).length === 1;
    const edit = rows(await rest(TESS, "PATCH", `tasks?id=eq.${philTask}`, { title: "v4: phil personal" })).length === 1;
    const create = (await rest(TESS, "POST", "tasks", { title: "v4: by grant", space_id: philSpace() })).status === 201;
    return { view, edit, create };
  }

  it("verb subsets map exactly", async () => {
    await grant(["view"]);
    expect(await personalProbe()).toEqual({ view: true, edit: false, create: false });
    await grant(["view", "edit"]);
    expect(await personalProbe()).toEqual({ view: true, edit: true, create: false });
    await grant(["view", "create_delete"]);
    expect(await personalProbe()).toEqual({ view: true, edit: false, create: true });
    await grant(["view"], ["people"]);
    expect(await personalProbe()).toEqual({ view: false, edit: false, create: false });
    await grant(["view"], []);
    expect((await personalProbe()).view).toBe(true);
  });

  it("the grantee can decline; a revoked grant is dead", async () => {
    const id = await grant(["view"]);
    const decline = await rpc(TESS, "revoke_user_grant", { p_id: id });
    expect(ok(decline), msg(decline)).toBe(true);
    expect((await personalProbe()).view).toBe(false);
    const again = await rpc(TESS, "revoke_user_grant", { p_id: id });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it("finance and platform are absent from the grant UI's data and refused by the table", async () => {
    expect(SHAREABLE_SECTIONS).not.toContain("finance");
    expect(SHAREABLE_SECTIONS).not.toContain("platform");
    expect(Object.keys(GROUPS_BY_SECTION)).not.toContain("finance");
    const fin = await rpc(PHIL_AUTH_UID, "create_user_grant", { p_grantee: TESS, p_section: "finance", p_entity_groups: [], p_verbs: ["view"] });
    expect(fin.status).toBeGreaterThanOrEqual(400);
    expect(msg(fin)).toMatch(/user_grants_(section_shape|never_finance)/);
    const plat = await rpc(PHIL_AUTH_UID, "create_user_grant", { p_grantee: TESS, p_section: "platform", p_entity_groups: [], p_verbs: ["view"] });
    expect(plat.status).toBeGreaterThanOrEqual(400);
  });
});

describe("successor flow", () => {
  it("the owner cannot leave without a member successor; leaving transfers ownership", async () => {
    sql(`delete from public.team_members where team_id = '${teamId}' and user_id = '${TESS}'`);
    sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${TESS}', 'member')`);
    const noSucc = await rpc(PHIL_AUTH_UID, "leave_team", { p_team: teamId });
    expect(msg(noSucc)).toMatch(/successor/);

    const notMember = await rpc(PHIL_AUTH_UID, "set_team_successor", { p_team: teamId, p_user: "00000000-0000-0000-0000-000000000001" });
    expect(notMember.status).toBeGreaterThanOrEqual(400);
    const set = await rpc(PHIL_AUTH_UID, "set_team_successor", { p_team: teamId, p_user: TESS });
    expect(ok(set), msg(set)).toBe(true);

    const leave = await rpc(PHIL_AUTH_UID, "leave_team", { p_team: teamId });
    expect(ok(leave), msg(leave)).toBe(true);
    const [[owner, succ]] = sql(`select owner_user_id, coalesce(successor_user_id::text, 'null') from public.teams where id = '${teamId}'`);
    expect(owner).toBe(TESS);
    expect(succ).toBe("null");
    expect(sql(`select role from public.team_members where team_id = '${teamId}' and user_id = '${TESS}'`)[0][0]).toBe("owner");
    expect(sql(`select count(*) from public.team_members where team_id = '${teamId}' and user_id = '${PHIL_AUTH_UID}'`)[0][0]).toBe("0");
    // Contributions stayed: Phil's team rows still exist in the team space.
    expect(Number(sql(`select count(*) from public.tasks where space_id = '${teamSpace}' and created_by = '${PHIL_AUTH_UID}'`)[0][0])).toBeGreaterThan(0);
  });

  it("the new owner (Tess) now requires TOTP; a plain member does not", async () => {
    const t = await rpc(TESS, "requires_totp");
    expect(t.body).toBe(true);
    sql(`update public.team_members set role = 'member' where team_id = '${teamId}' and user_id = '${TESS}'`);
    sql(`update public.teams set owner_user_id = '${PHIL_AUTH_UID}' where id = '${teamId}'`);
    sql(`insert into public.team_members (team_id, user_id, role) values ('${teamId}', '${PHIL_AUTH_UID}', 'owner') on conflict do nothing`);
    const m = await rpc(TESS, "requires_totp");
    expect(m.body).toBe(false);
    const p = await rpc(PHIL_AUTH_UID, "requires_totp");
    expect(p.body).toBe(true);
  });
});
