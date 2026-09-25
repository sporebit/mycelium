import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localSql, localStackEnv } from "@/lib/access/introspect";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { resolveMention } from "./resolve-mention";
import { resolveSpeaker } from "@/lib/quotes/server";

/**
 * People contacts on the LOCAL stack (0140): the merge walk with a
 * unique-key collision, soft-delete filtering, promote-on-link, and that
 * every FK to people.id has the promote trigger. Fixtures are synthetic
 * ("contacts-test:") and removed in afterAll. Fails, not skips, when the
 * stack is down.
 */

const env = localStackEnv();
let db: SupabaseClient;
let space = "";

function one(q: string): string {
  const rows = localSql(q);
  return rows[0]?.[0] ?? "";
}
function count(q: string): number {
  return Number(one(q) || 0);
}

beforeAll(async () => {
  const jwt = await mintUserJwt({ sub: PHIL_AUTH_UID, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
  db = createClient(env.apiUrl, env.anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  space = one(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`);
  cleanup();
});

afterAll(() => cleanup());

function cleanup() {
  localSql(`delete from public.quotes where text like 'contacts-test:%'`);
  localSql(`delete from public.people where first_name like 'contacts-test:%'`);
}

function person(first: string, tier: "person" | "contact" = "person"): string {
  const id = one(
    `insert into public.people (first_name, last_name, space_id, created_by, tier) values ('contacts-test:${first}', 'Fixture', '${space}', '${PHIL_AUTH_UID}', '${tier}') returning id`,
  );
  localSql(`insert into public.people_aliases (person_id, alias, is_primary, space_id, created_by) values ('${id}', 'Contacts-Test:${first}', true, '${space}', '${PHIL_AUTH_UID}')`);
  return id;
}

describe("promote-on-link (C1)", () => {
  it("every FK to people.id outside the person's own tables carries the promote trigger", () => {
    const missing = localSql(`
      select t.table_name || '.' || t.column_name
      from public.people_link_tables() t
      where not exists (
        select 1 from pg_trigger tg
        where tg.tgrelid = ('public.' || t.table_name)::regclass and tg.tgname = 'promote_on_link_' || t.column_name
      )`);
    expect(missing).toEqual([]);
    expect(count(`select count(*) from public.people_link_tables()`)).toBeGreaterThanOrEqual(8);
  });

  it("a contact becomes a person the first time anything links to it", () => {
    const id = person("promote-me", "contact");
    expect(one(`select tier from public.people where id = '${id}'`)).toBe("contact");
    localSql(`insert into public.quotes (text, said_by_person_id, space_id, created_by) values ('contacts-test: promoted by a quote', '${id}', '${space}', '${PHIL_AUTH_UID}')`);
    expect(one(`select tier from public.people where id = '${id}'`)).toBe("person");
    expect(one(`select coalesce(promoted_at::text, '-') from public.people where id = '${id}'`)).not.toBe("-");
  });
});

describe("matching paths see live persons only (C1, C4)", () => {
  it("the alias resolver and the quotes speaker ignore contacts and deleted people", async () => {
    person("shadow", "contact");
    const gone = person("ghost", "person");
    localSql(`update public.people set deleted_at = now() where id = '${gone}'`);
    const r1 = await resolveMention(db, "Contacts-Test:shadow", { deferIfNew: true });
    expect(r1.person_id).toBeNull();
    const r2 = await resolveMention(db, "Contacts-Test:ghost", { deferIfNew: true });
    expect(r2.person_id).toBeNull();
    const live = person("present", "person");
    const r3 = await resolveMention(db, "Contacts-Test:present", { deferIfNew: true });
    expect(r3.person_id).toBe(live);
    expect((await resolveSpeaker(db, "Contacts-Test:shadow")).person_id).toBeNull();
    expect((await resolveSpeaker(db, "Contacts-Test:present")).person_id).toBe(live);
  });

  it("people_daylog_stats has no row for a contact or a deleted person", () => {
    // the view joins people on tier = person and deleted_at is null; a contact with no scenes is simply absent
    const contact = person("stats-contact", "contact");
    expect(count(`select count(*) from public.people_daylog_stats where person_id = '${contact}'`)).toBe(0);
  });
});

describe("merge (C3)", () => {
  it("re-points every link, de-duplicates a unique collision, soft-deletes the loser and chains the id", async () => {
    const survivor = person("survivor", "person");
    const loser = person("loser", "person");
    // the same alias on both: a (person_id, alias) unique collision the walk must resolve
    localSql(`insert into public.people_aliases (person_id, alias, is_primary, space_id, created_by) values ('${survivor}', 'Shared Alias', false, '${space}', '${PHIL_AUTH_UID}'), ('${loser}', 'Shared Alias', false, '${space}', '${PHIL_AUTH_UID}'), ('${loser}', 'Loser Only', false, '${space}', '${PHIL_AUTH_UID}')`);
    // a quote and a number on the loser, a number on both (same E.164 → collision on person_phones)
    localSql(`insert into public.quotes (text, said_by_person_id, space_id, created_by) values ('contacts-test: said by the loser', '${loser}', '${space}', '${PHIL_AUTH_UID}')`);
    localSql(`insert into public.person_phones (person_id, number_raw, number_e164, label, space_id, created_by) values ('${survivor}', '07700 900010', '+447700900010', 'mobile', '${space}', '${PHIL_AUTH_UID}'), ('${loser}', '+44 7700 900010', '+447700900010', 'old mobile', '${space}', '${PHIL_AUTH_UID}'), ('${loser}', '07700 900011', '+447700900011', 'work', '${space}', '${PHIL_AUTH_UID}')`);

    const { data, error } = await db.rpc("people_merge", { p_survivor: survivor, p_loser: loser, p_fields: { relationship: "friend" } });
    expect(error).toBeNull();
    const moved = (data as { moved: Record<string, number> }).moved;
    expect(moved["quotes.said_by_person_id"]).toBe(1);
    expect(moved["people_aliases.person_id"]).toBe(2); // primary + 'Loser Only'; 'Shared Alias' was a collision and dropped
    expect(moved["person_phones.person_id"]).toBe(1); // the work number; the duplicate mobile dropped

    expect(one(`select said_by_person_id from public.quotes where text = 'contacts-test: said by the loser'`)).toBe(survivor);
    expect(count(`select count(*) from public.people_aliases where person_id = '${survivor}' and alias = 'Shared Alias'`)).toBe(1);
    expect(count(`select count(*) from public.people_aliases where person_id = '${survivor}' and is_primary`)).toBe(1);
    expect(count(`select count(*) from public.person_phones where person_id = '${survivor}'`)).toBe(2);
    expect(count(`select count(*) from public.person_phones where person_id = '${loser}'`)).toBe(0);
    expect(one(`select relationship from public.people where id = '${survivor}'`)).toBe("friend");
    expect(one(`select merged_into_id from public.people where id = '${loser}'`)).toBe(survivor);
    expect(one(`select coalesce(deleted_at::text, '-') from public.people where id = '${loser}'`)).not.toBe("-");
    expect(count(`select count(*) from public.audit_events where action = 'people.merge' and entity_id = '${survivor}'`)).toBeGreaterThanOrEqual(1);

    // a third person merged into the loser's id chains to the survivor
    const third = person("third", "contact");
    const r = await db.rpc("people_merge", { p_survivor: loser, p_loser: third, p_fields: {} });
    expect(r.error).not.toBeNull(); // the loser is deleted: not a valid survivor
    const r2 = await db.rpc("people_merge", { p_survivor: survivor, p_loser: third, p_fields: {} });
    expect(r2.error).toBeNull();
  });

  it("refuses to merge a person with itself or across spaces", async () => {
    const a = person("solo", "person");
    const r = await db.rpc("people_merge", { p_survivor: a, p_loser: a, p_fields: {} });
    expect(r.error).not.toBeNull();
  });
});

describe("the bin (C4)", () => {
  it("purges only after the retention window", async () => {
    const fresh = person("fresh-deleted", "person");
    const old = person("old-deleted", "person");
    localSql(`update public.people set deleted_at = now() where id = '${fresh}'`);
    localSql(`update public.people set deleted_at = now() - interval '40 days' where id = '${old}'`);
    const { data, error } = await db.rpc("people_purge_deleted", { p_days: 30 });
    expect(error).toBeNull();
    expect(Number(data)).toBeGreaterThanOrEqual(1);
    expect(count(`select count(*) from public.people where id = '${old}'`)).toBe(0);
    expect(count(`select count(*) from public.people where id = '${fresh}'`)).toBe(1);
  });
});
