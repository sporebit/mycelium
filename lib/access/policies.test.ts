import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "./introspect";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * Policy tests (P12 Part 3, VERIFY 3): personal, team-by-role,
 * team-by-toggle, direct grant, finance — one positive and one negative
 * each, and a few more where the shape demanded it. They run through
 * PostgREST on the LOCAL stack with JWTs minted the way lib/system/withUser
 * mints them, so the exact path system code and browsers take is what is
 * tested. Fails, not skips, when the stack is down.
 *
 * Fixtures: a second user "Tess" (fixed uid), a team owned by Phil with its
 * team space, and rows in public.tasks (organisation.tasks) and
 * public.bank_accounts (finance.banking). Everything the tests create is
 * removed in afterAll; Tess's auth user stays (idempotent create).
 */

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const TEAM = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const TEAM_SPACE = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

const env = localStackEnv();
const tokens = new Map<string, string>();

async function token(uid: string): Promise<string> {
  let t = tokens.get(uid);
  if (!t) {
    t = await mintUserJwt({ sub: uid, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
    tokens.set(uid, t);
  }
  return t;
}

type Rest = { status: number; body: unknown };

async function rest(
  uid: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Rest> {
  const res = await fetch(`${env.apiUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.anonKey,
      authorization: `Bearer ${await token(uid)}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { status: res.status, body: parsed };
}

function rows(r: Rest): Array<Record<string, unknown>> {
  return Array.isArray(r.body) ? (r.body as Array<Record<string, unknown>>) : [];
}

function sql(q: string): string[][] {
  return localSql(q);
}

function philSpace(): string {
  return sql(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`)[0][0];
}
function tessSpace(): string {
  return sql(`select personal_space_id from public.profiles where id = '${TESS}'`)[0][0];
}

function resetMembership() {
  sql(`delete from public.team_member_sections where user_id = '${TESS}'`);
  sql(`delete from public.team_members where user_id = '${TESS}'`);
  sql(`delete from public.user_grants where grantee_id = '${TESS}' or grantor_id = '${TESS}'`);
}

function setRole(role: "admin" | "member" | "viewer") {
  sql(`delete from public.team_member_sections where user_id = '${TESS}'`);
  sql(`delete from public.team_members where user_id = '${TESS}'`);
  sql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${TESS}', '${role}')`);
}

function setToggle(section: string, flags: Partial<Record<"can_view" | "can_edit" | "can_create_delete" | "can_share", boolean>>) {
  const cols = ["can_view", "can_edit", "can_create_delete", "can_share"] as const;
  const values = cols.map((c) => (flags[c] ?? true ? "true" : "false")).join(", ");
  sql(
    `insert into public.team_member_sections (team_id, user_id, section, ${cols.join(", ")}) ` +
      `values ('${TEAM}', '${TESS}', '${section}', ${values}) ` +
      `on conflict (team_id, user_id, section) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(", ")}`,
  );
}

let philTaskId = "";
let teamTaskId = "";
let tessTaskId = "";

beforeAll(async () => {
  // Tess: auth user + identity, exactly the seed's shape. Triggers create
  // her profile and personal space.
  sql(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
	    confirmation_token, recovery_token, email_change_token_new, email_change,
	    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
	    is_sso_user, is_anonymous)
	  values ('00000000-0000-0000-0000-000000000000', '${TESS}', 'authenticated', 'authenticated',
	    'tess@mycelium.local', extensions.crypt('mycelium-local', extensions.gen_salt('bf')), now(),
	    '{"provider":"email","providers":["email"]}', '{"display_name":"Tess"}', now(), now(),
	    '', '', '', '', '', '', '', '', false, false)
	  on conflict (id) do nothing`,
  );
  sql(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
	  values (gen_random_uuid(), '${TESS}', '${TESS}', jsonb_build_object('sub', '${TESS}', 'email', 'tess@mycelium.local', 'email_verified', true), 'email', now(), now(), now())
	  on conflict (provider_id, provider) do nothing`,
  );
  expect(tessSpace()).toMatch(/^[0-9a-f-]{36}$/);

  // Team owned by Phil, with its team space.
  sql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', 'Policy Test Team', 'policy-test-team', '${PHIL_AUTH_UID}') on conflict (id) do nothing`);
  sql(`insert into public.spaces (id, kind, team_id) values ('${TEAM_SPACE}', 'team', '${TEAM}') on conflict (id) do nothing`);
  sql(`update public.teams set space_id = '${TEAM_SPACE}' where id = '${TEAM}'`);
  sql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${PHIL_AUTH_UID}', 'owner') on conflict do nothing`);
  resetMembership();

  // Clean rows from a previous run.
  sql(`delete from public.tasks where space_id in ('${TEAM_SPACE}', '${tessSpace()}') or title like 'policy-test:%'`);
  sql(`delete from public.bank_accounts where space_id = '${tessSpace()}' or external_key like 'policy-test%'`);

  // Phil's own task and a team task, as Phil, through PostgREST.
  const own = await rest(PHIL_AUTH_UID, "POST", "tasks", { title: "policy-test: phil personal" });
  expect(own.status, JSON.stringify(own.body)).toBe(201);
  philTaskId = String(rows(own)[0].id);
  expect(rows(own)[0].space_id).toBe(philSpace());
  expect(rows(own)[0].created_by).toBe(PHIL_AUTH_UID);

  const team = await rest(PHIL_AUTH_UID, "POST", "tasks", { title: "policy-test: team task", space_id: TEAM_SPACE });
  expect(team.status, JSON.stringify(team.body)).toBe(201);
  teamTaskId = String(rows(team)[0].id);
});

afterAll(() => {
  resetMembership();
  sql(`delete from public.tasks where title like 'policy-test:%'`);
  sql(`delete from public.bank_accounts where external_key like 'policy-test%'`);
  sql(`delete from public.team_members where team_id = '${TEAM}'`);
  sql(`update public.teams set space_id = null where id = '${TEAM}'`);
  sql(`delete from public.spaces where id = '${TEAM_SPACE}'`);
  sql(`delete from public.teams where id = '${TEAM}'`);
});

describe("personal space", () => {
  it("a user's insert lands in their own space by default and only they see it", async () => {
    const ins = await rest(TESS, "POST", "tasks", { title: "policy-test: tess personal" });
    expect(ins.status, JSON.stringify(ins.body)).toBe(201);
    tessTaskId = String(rows(ins)[0].id);
    expect(rows(ins)[0].space_id).toBe(tessSpace());
    expect(rows(ins)[0].created_by).toBe(TESS);

    const mine = await rest(TESS, "GET", `tasks?select=id&id=eq.${tessTaskId}`);
    expect(rows(mine)).toHaveLength(1);
    const phils = await rest(PHIL_AUTH_UID, "GET", `tasks?select=id&id=eq.${tessTaskId}`);
    expect(rows(phils)).toHaveLength(0);
  });

  it("negative: nobody else's personal rows are visible or editable", async () => {
    const seen = await rest(TESS, "GET", `tasks?select=id&id=eq.${philTaskId}`);
    expect(rows(seen)).toHaveLength(0);
    const upd = await rest(TESS, "PATCH", `tasks?id=eq.${philTaskId}`, { title: "policy-test: hijacked" });
    expect(rows(upd)).toHaveLength(0);
    const still = sql(`select title from public.tasks where id = '${philTaskId}'`)[0][0];
    expect(still).toBe("policy-test: phil personal");
  });
});

describe("team by role", () => {
  it("a member sees and edits team rows", async () => {
    setRole("member");
    const seen = await rest(TESS, "GET", `tasks?select=id,space_id&id=eq.${teamTaskId}`);
    expect(rows(seen)).toHaveLength(1);
    const upd = await rest(TESS, "PATCH", `tasks?id=eq.${teamTaskId}`, { title: "policy-test: team task (edited)" });
    expect(upd.status, JSON.stringify(upd.body)).toBe(200);
    expect(rows(upd)).toHaveLength(1);
    const ins = await rest(TESS, "POST", "tasks", { title: "policy-test: by member", space_id: TEAM_SPACE });
    expect(ins.status, JSON.stringify(ins.body)).toBe(201);
  });

  it("negative: a viewer sees but cannot edit or create", async () => {
    setRole("viewer");
    const seen = await rest(TESS, "GET", `tasks?select=id&id=eq.${teamTaskId}`);
    expect(rows(seen)).toHaveLength(1);
    const upd = await rest(TESS, "PATCH", `tasks?id=eq.${teamTaskId}`, { title: "policy-test: viewer edit" });
    expect(rows(upd)).toHaveLength(0);
    const ins = await rest(TESS, "POST", "tasks", { title: "policy-test: by viewer", space_id: TEAM_SPACE });
    expect(ins.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(ins.body)).toContain("42501");
  });

  it("negative: no membership, no access", async () => {
    resetMembership();
    const seen = await rest(TESS, "GET", `tasks?select=id&id=eq.${teamTaskId}`);
    expect(rows(seen)).toHaveLength(0);
  });
});

describe("team by section toggle", () => {
  it("a toggle narrows a member: view off hides the section", async () => {
    setRole("member");
    setToggle("organisation", { can_view: false });
    const seen = await rest(TESS, "GET", `tasks?select=id&id=eq.${teamTaskId}`);
    expect(rows(seen)).toHaveLength(0);
  });

  it("view on, edit off: visible but read-only", async () => {
    setRole("member");
    setToggle("organisation", { can_view: true, can_edit: false });
    const seen = await rest(TESS, "GET", `tasks?select=id&id=eq.${teamTaskId}`);
    expect(rows(seen)).toHaveLength(1);
    const upd = await rest(TESS, "PATCH", `tasks?id=eq.${teamTaskId}`, { title: "policy-test: toggle edit" });
    expect(rows(upd)).toHaveLength(0);
  });

  it("negative: a toggle can never widen a viewer into editing", async () => {
    setRole("viewer");
    setToggle("organisation", { can_view: true, can_edit: true, can_create_delete: true });
    const upd = await rest(TESS, "PATCH", `tasks?id=eq.${teamTaskId}`, { title: "policy-test: widened?" });
    expect(rows(upd)).toHaveLength(0);
  });

  it("the owner ignores toggles", async () => {
    // Phil is owner; a toggle row for him must not narrow anything.
    sql(`insert into public.team_member_sections (team_id, user_id, section, can_view) values ('${TEAM}', '${PHIL_AUTH_UID}', 'organisation', false) on conflict (team_id, user_id, section) do update set can_view = false`);
    const seen = await rest(PHIL_AUTH_UID, "GET", `tasks?select=id&id=eq.${teamTaskId}`);
    expect(rows(seen)).toHaveLength(1);
    sql(`delete from public.team_member_sections where user_id = '${PHIL_AUTH_UID}'`);
  });
});

describe("direct grant", () => {
  function grant(verbs: string[], groups: string[] = ["tasks"], extra = "") {
    sql(`delete from public.user_grants where grantor_id = '${PHIL_AUTH_UID}' and grantee_id = '${TESS}'`);
    sql(
      `insert into public.user_grants (grantor_id, grantee_id, section, entity_groups, verbs${extra ? ", " + extra.split("=")[0] : ""}) ` +
        `values ('${PHIL_AUTH_UID}', '${TESS}', 'organisation', '{${groups.join(",")}}', '{${verbs.join(",")}}'${extra ? ", " + extra.split("=")[1] : ""})`,
    );
  }

  it("a view grant exposes the grantor's personal rows for that group", async () => {
    resetMembership();
    grant(["view"]);
    const seen = await rest(TESS, "GET", `tasks?select=id&id=eq.${philTaskId}`);
    expect(rows(seen)).toHaveLength(1);
  });

  it("negative: verbs not granted stay denied; other groups stay hidden", async () => {
    grant(["view"]);
    const upd = await rest(TESS, "PATCH", `tasks?id=eq.${philTaskId}`, { title: "policy-test: grant edit" });
    expect(rows(upd)).toHaveLength(0);
    grant(["view"], ["people"]);
    const seen = await rest(TESS, "GET", `tasks?select=id&id=eq.${philTaskId}`);
    expect(rows(seen)).toHaveLength(0);
  });

  it("negative: revoked and expired grants are dead", async () => {
    grant(["view"], ["tasks"], "revoked_at=now()");
    expect(rows(await rest(TESS, "GET", `tasks?select=id&id=eq.${philTaskId}`))).toHaveLength(0);
    grant(["view"], ["tasks"], "expires_at=now() - interval '1 minute'");
    expect(rows(await rest(TESS, "GET", `tasks?select=id&id=eq.${philTaskId}`))).toHaveLength(0);
    grant(["view"], ["tasks"], "expires_at=now() + interval '1 hour'");
    expect(rows(await rest(TESS, "GET", `tasks?select=id&id=eq.${philTaskId}`))).toHaveLength(1);
  });

  it("an empty group list means the whole section", async () => {
    grant(["view"], []);
    expect(rows(await rest(TESS, "GET", `tasks?select=id&id=eq.${philTaskId}`))).toHaveLength(1);
  });
});

describe("finance is never shared", () => {
  it("a user sees their own finance rows", async () => {
    const ins = await rest(TESS, "POST", "bank_accounts", {
      bank: "test",
      external_key: "policy-test-1",
    });
    expect(ins.status, JSON.stringify(ins.body)).toBe(201);
    expect(rows(ins)[0].space_id).toBe(tessSpace());
    const mine = await rest(TESS, "GET", "bank_accounts?select=id&external_key=like.policy-test*");
    expect(rows(mine)).toHaveLength(1);
  });

  it("negative: neither team admin nor a grant reaches another user's finance", async () => {
    setRole("admin");
    const viaTeam = await rest(TESS, "GET", `bank_accounts?select=id&space_id=eq.${philSpace()}`);
    expect(rows(viaTeam)).toHaveLength(0);
    // Finance cannot even be written into a team space by its owner.
    const teamIns = await rest(PHIL_AUTH_UID, "POST", "bank_accounts", {
      bank: "test",
      external_key: "policy-test-2",
      space_id: TEAM_SPACE,
    });
    expect(teamIns.status).toBeGreaterThanOrEqual(400);
    // And a finance grant is refused by the table itself.
    expect(() =>
      sql(
        `insert into public.user_grants (grantor_id, grantee_id, section, verbs) values ('${PHIL_AUTH_UID}', '${TESS}', 'finance', '{view}')`,
      ),
    ).toThrow(/user_grants_(section_shape|never_finance)/);
  });
});
