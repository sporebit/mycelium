/**
 * 0170: an invite can be cancelled by whoever could have sent it, and a
 * team's owner or admin can see which members have no authenticator.
 * Runs against the local stack as each person, under the row rules.
 *
 * Tess is shared by every suite and an owner or admin must have an
 * authenticator (0160), so she is never left as an admin: where the admin
 * rule is checked, the promotion, the call and the demotion are one
 * transaction that nobody else ever sees half of.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql } from "./introspect";

const TAG = `e2e0170${Date.now().toString(36)}`;
const TEAM = randomUUID();
const who = (email: string) => localSql(`select id from auth.users where email = '${email}'`)[0][0];
const claims = (uid: string, aal: string) => `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated","aal":"${aal}"}', true);`;
const as = (uid: string, sql: string, aal = "aal2") => localSql(`${claims(uid, aal)} ${sql}`);
const refused = (fn: () => unknown): string => {
  try {
    fn();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const exists = (id: string) => localSql(`select count(*) from public.invites where id = '${id}'`)[0][0] === "1";

let phil = "";
let tess = "";
const invite = (role: string, accepted = false) =>
  localSql(
    `insert into public.invites (email, team_id, role, token_hash, expires_at, invited_by, accepted_at, accepted_by) values ('${TAG}-${randomUUID().slice(0, 8)}@mycelium.local', '${TEAM}', '${role}', encode(extensions.digest('${randomUUID()}', 'sha256'), 'hex'), now() + interval '7 days', '${phil}', ${accepted ? "now()" : "null"}, ${accepted ? `'${tess}'` : "null"}) returning id`,
  )[0][0];

beforeAll(() => {
  phil = who("phil@mycelium.local");
  tess = who("tess@mycelium.local");
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${TAG} team', '${TAG}', '${phil}')`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${phil}', 'owner'), ('${TEAM}', '${tess}', 'member')`);
});

afterAll(() => {
  localSql(`delete from public.invites where team_id = '${TEAM}'`);
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
});

describe("cancelling an invite", () => {
  it("a member cannot cancel one, and is told only that there is no such invite", () => {
    const id = invite("member");
    expect(refused(() => as(tess, `select public.cancel_invite('${id}')`, "aal1"))).toContain("No such invite");
    expect(exists(id)).toBe(true);
  });

  it("the owner cancels any invite that has not been accepted, and it is gone", () => {
    const member = invite("member");
    const admin = invite("admin");
    as(phil, `select public.cancel_invite('${member}')`);
    as(phil, `select public.cancel_invite('${admin}')`);
    expect(exists(member)).toBe(false);
    expect(exists(admin)).toBe(false);
  });

  it("an accepted invite is history and stays", () => {
    const id = invite("member", true);
    expect(refused(() => as(phil, `select public.cancel_invite('${id}')`))).toContain("already been accepted");
    expect(exists(id)).toBe(true);
  });

  it("an admin cancels a member's invite but not an admin's, as with sending one", () => {
    const member = invite("member");
    const admin = invite("admin");
    // promoted, asked and demoted inside one transaction: see the note at the top
    const asAdmin = (id: string) =>
      localSql(
        `update public.team_members set role = 'admin' where team_id = '${TEAM}' and user_id = '${tess}'; ${claims(tess, "aal2")} select public.cancel_invite('${id}'); reset role; update public.team_members set role = 'member' where team_id = '${TEAM}' and user_id = '${tess}';`,
      );
    asAdmin(member);
    expect(exists(member)).toBe(false);
    expect(refused(() => asAdmin(admin))).toContain("No such invite");
    expect(exists(admin)).toBe(true);
    expect(localSql(`select role from public.team_members where team_id = '${TEAM}' and user_id = '${tess}'`)[0][0]).toBe("member");
  });

  it("nobody signed in, and someone outside the team, get nothing", () => {
    const id = invite("member");
    expect(refused(() => localSql(`set local role authenticated; select public.cancel_invite('${id}')`))).toContain("Not signed in");
    localSql(`delete from public.team_members where team_id = '${TEAM}' and user_id = '${tess}'`);
    expect(refused(() => as(tess, `select public.cancel_invite('${id}')`, "aal1"))).toContain("No such invite");
    localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${tess}', 'member')`);
    expect(exists(id)).toBe(true);
  });
});

describe("who has no authenticator", () => {
  it("the owner is told which members have none; a member is told nothing", () => {
    const hasFactor = (uid: string) => localSql(`select count(*) from auth.mfa_factors where user_id = '${uid}' and status = 'verified'`)[0][0] !== "0";
    const seenByOwner = as(phil, `select public.team_members_without_totp('${TEAM}')::text`)
      .map((r) => r[0])
      .filter((v) => /^[0-9a-f-]{36}$/.test(v ?? ""));
    expect(seenByOwner.includes(tess)).toBe(!hasFactor(tess));
    expect(seenByOwner.includes(phil)).toBe(!hasFactor(phil));
    const seenByMember = as(tess, `select count(*) from public.team_members_without_totp('${TEAM}')`, "aal1").at(-1)![0];
    expect(seenByMember).toBe("0");
  });
});
