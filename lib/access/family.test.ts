/**
 * 0171: the family space is a team's space, and its ten tables follow the
 * team. Runs against the local stack as each person, under the row rules:
 * someone outside the team sees and writes nothing; a viewer reads and
 * writes nothing; a member does both; and a vote or an acknowledgement
 * cannot be made in someone else's name by anyone.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql } from "./introspect";

const TAG = `e2e0171${Date.now().toString(36)}`;
const TEAM = randomUUID();
const SPACE = randomUUID();
const TABLES = ["family_profile", "family_acks", "family_entries", "family_names", "family_name_votes", "family_lists", "family_list_items", "baby_log", "household_items", "household_costs"] as const;
const who = (email: string) => localSql(`select id from auth.users where email = '${email}'`)[0][0];
const as = (uid: string, sql: string, aal = "aal2") => localSql(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated","aal":"${aal}"}', true); ${sql}`);
const last = (rows: string[][]) => rows.at(-1)?.[0] ?? "";
/** The id an "insert … returning id" gave back (psql prints its "INSERT 0 1" line after it). */
const idOf = (rows: string[][]) => rows.map((r) => r[0]).find((v) => /^[0-9a-f-]{36}$/.test(v ?? "")) ?? "";
const refused = (fn: () => unknown): string => {
  try {
    fn();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const seen = (uid: string, table: string, aal: string) => Number(last(as(uid, `select count(*) from public.${table} where space_id = '${SPACE}'`, aal)));
const role = (r: string | null) => {
  localSql(`delete from public.team_members where team_id = '${TEAM}' and user_id = '${tess}'`);
  if (r) localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${tess}', '${r}')`);
};

let phil = "";
let tess = "";
let nameId = "";
let listId = "";

beforeAll(() => {
  phil = who("phil@mycelium.local");
  tess = who("tess@mycelium.local");
  localSql(`insert into public.teams (id, name, slug, owner_user_id) values ('${TEAM}', '${TAG} team', '${TAG}', '${phil}')`);
  localSql(`insert into public.spaces (id, kind, team_id) values ('${SPACE}', 'team', '${TEAM}')`);
  localSql(`update public.teams set space_id = '${SPACE}' where id = '${TEAM}'`);
  localSql(`insert into public.team_members (team_id, user_id, role) values ('${TEAM}', '${phil}', 'owner')`);
  // one row in every table, written by Phil as himself
  as(phil, `insert into public.family_profile (space_id, due_on) values ('${SPACE}', '2027-06-01')`);
  as(phil, `insert into public.family_acks (space_id) values ('${SPACE}')`);
  as(phil, `insert into public.family_entries (space_id, kind, title) values ('${SPACE}', 'note', '${TAG} note')`);
  nameId = idOf(as(phil, `insert into public.family_names (space_id, name) values ('${SPACE}', '${TAG} Robin') returning id`));
  as(phil, `insert into public.family_name_votes (space_id, name_id, vote) values ('${SPACE}', '${nameId}', 2)`);
  listId = idOf(as(phil, `insert into public.family_lists (space_id, slug, title) values ('${SPACE}', 'nursery', 'Nursery') returning id`));
  as(phil, `insert into public.family_list_items (space_id, list_id, title) values ('${SPACE}', '${listId}', 'Cot')`);
  as(phil, `insert into public.baby_log (space_id, kind) values ('${SPACE}', 'feed')`);
  as(phil, `insert into public.household_items (space_id, kind, title) values ('${SPACE}', 'bin', 'Recycling')`);
  as(phil, `insert into public.household_costs (space_id, title, amount_pence, paid_by) values ('${SPACE}', 'Gas', 10000, '${phil}')`);
});

afterAll(() => {
  for (const t of [...TABLES].reverse()) localSql(`delete from public.${t} where space_id = '${SPACE}'`);
  localSql(`delete from public.team_members where team_id = '${TEAM}'`);
  localSql(`update public.teams set space_id = null where id = '${TEAM}'`);
  localSql(`delete from public.spaces where id = '${SPACE}'`);
  localSql(`delete from public.teams where id = '${TEAM}'`);
});

describe("the family space follows its team", () => {
  it("the owner wrote a row in every table, each stamped with who wrote it", () => {
    for (const t of TABLES) expect(seen(phil, t, "aal2"), t).toBe(1);
    expect(localSql(`select count(*) from public.family_entries where space_id = '${SPACE}' and created_by = '${phil}'`)[0][0]).toBe("1");
    expect(localSql(`select voter_id from public.family_name_votes where name_id = '${nameId}'`)[0][0]).toBe(phil);
  });

  it("someone outside the team sees nothing in any of the ten tables, and can add nothing", () => {
    role(null);
    for (const t of TABLES) expect(seen(tess, t, "aal1"), t).toBe(0);
    expect(refused(() => as(tess, `insert into public.family_entries (space_id, kind, title) values ('${SPACE}', 'note', '${TAG} intruder')`, "aal1"))).toMatch(/row-level security/);
    expect(refused(() => as(tess, `insert into public.baby_log (space_id, kind) values ('${SPACE}', 'feed')`, "aal1"))).toMatch(/row-level security/);
    as(tess, `update public.family_profile set due_on = '2030-01-01' where space_id = '${SPACE}'`, "aal1");
    as(tess, `delete from public.household_costs where space_id = '${SPACE}'`, "aal1");
    expect(localSql(`select due_on::text from public.family_profile where space_id = '${SPACE}'`)[0][0]).toBe("2027-06-01");
    expect(localSql(`select count(*) from public.household_costs where space_id = '${SPACE}'`)[0][0]).toBe("1");
  });

  it("a viewer reads everything and changes nothing", () => {
    role("viewer");
    for (const t of TABLES) expect(seen(tess, t, "aal1"), t).toBe(1);
    expect(refused(() => as(tess, `insert into public.family_names (space_id, name) values ('${SPACE}', '${TAG} Wren')`, "aal1"))).toMatch(/row-level security/);
    as(tess, `update public.family_list_items set bought = true where space_id = '${SPACE}'`, "aal1");
    expect(localSql(`select bought::text from public.family_list_items where list_id = '${listId}'`)[0][0]).toBe("false");
  });

  it("a member reads and writes, and what they write is stamped as theirs", () => {
    role("member");
    as(tess, `insert into public.family_entries (space_id, kind, title) values ('${SPACE}', 'milestone', '${TAG} hers')`, "aal1");
    as(tess, `update public.family_list_items set bought = true where space_id = '${SPACE}'`, "aal1");
    expect(localSql(`select created_by from public.family_entries where title = '${TAG} hers'`)[0][0]).toBe(tess);
    expect(localSql(`select bought::text from public.family_list_items where list_id = '${listId}'`)[0][0]).toBe("true");
    expect(seen(phil, "family_entries", "aal2"), "and he sees hers").toBe(2);
  });

  it("an appointment needs its time, at the database too", () => {
    expect(refused(() => as(tess, `insert into public.family_entries (space_id, kind, title) values ('${SPACE}', 'appointment', '${TAG} no time')`, "aal1"))).toMatch(/family_entries_appointment_has_time/);
  });

  it("a vote is its voter's: nobody casts, changes or removes another person's", () => {
    expect(refused(() => as(tess, `insert into public.family_name_votes (space_id, name_id, voter_id, vote) values ('${SPACE}', '${nameId}', '${phil}', -1)`, "aal1"))).toMatch(/row-level security|duplicate/);
    as(tess, `update public.family_name_votes set vote = -1 where name_id = '${nameId}' and voter_id = '${phil}'`, "aal1");
    as(tess, `delete from public.family_name_votes where name_id = '${nameId}' and voter_id = '${phil}'`, "aal1");
    expect(localSql(`select vote::text from public.family_name_votes where name_id = '${nameId}' and voter_id = '${phil}'`)[0][0]).toBe("2");
    // her own vote, cast without saying whose it is, is hers
    as(tess, `insert into public.family_name_votes (space_id, name_id, vote) values ('${SPACE}', '${nameId}', 1)`, "aal1");
    expect(localSql(`select count(*) from public.family_name_votes where name_id = '${nameId}' and voter_id = '${tess}' and vote = 1`)[0][0]).toBe("1");
    expect(refused(() => as(tess, `insert into public.family_name_votes (space_id, name_id, vote) values ('${SPACE}', '${nameId}', 2)`, "aal1")), "one vote each").toMatch(/duplicate/);
  });

  it("nobody confirms that it is shared on someone else's behalf", () => {
    localSql(`delete from public.family_acks where space_id = '${SPACE}' and member_id = '${phil}'`);
    expect(refused(() => as(tess, `insert into public.family_acks (space_id, member_id) values ('${SPACE}', '${phil}')`, "aal1"))).toMatch(/row-level security/);
    as(tess, `insert into public.family_acks (space_id) values ('${SPACE}')`, "aal1");
    expect(localSql(`select member_id from public.family_acks where space_id = '${SPACE}'`).map((r) => r[0])).toEqual([tess]);
  });

  it("one family profile to a space, and the household budget is not finance", () => {
    expect(refused(() => as(phil, `insert into public.family_profile (space_id) values ('${SPACE}')`))).toMatch(/duplicate/);
    expect(localSql(`select section || '.' || entity_group from public.entity_groups where table_name = 'household_costs'`)[0][0]).toBe("organisation.family");
  });

  it("the files rule reads the space from the path, for reading and for writing", () => {
    const rules = localSql(`select policyname, coalesce(qual, '') || coalesce(with_check, '') from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'family files%' order by 1`);
    expect(rules.map((r) => r[0])).toEqual(["family files delete", "family files read", "family files write"]);
    for (const [, rule] of rules) {
      expect(rule).toContain("bucket_id = 'family'");
      expect(rule).toContain("organisation.family");
      expect(rule).toContain("foldername");
    }
    expect(localSql(`select public::text from storage.buckets where id = 'family'`)[0][0]).toBe("false");
  });
});
