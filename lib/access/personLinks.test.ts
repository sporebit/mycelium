/**
 * 0167: a link to a person stays inside the person's own space. Runs
 * against the local stack. Every table with a foreign key to people passes
 * through one trigger; a ticket's "waiting on" stands for all of them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql } from "./introspect";

const TAG = `E2E-0167-${Date.now().toString(36)}`;
const who = (email: string) => {
  const row = localSql(`select u.id, p.personal_space_id from auth.users u join public.profiles p on p.id = u.id where u.email = '${email}'`)[0];
  return { id: row[0], space: row[1] };
};

let phil: { id: string; space: string };
let tess: { id: string; space: string };
let philsPerson = "";
let tessPerson = "";
let ticket = "";

const person = (owner: { id: string; space: string }, name: string) =>
  localSql(`insert into public.people (first_name, space_id, created_by, tier) values ('${TAG} ${name}', '${owner.space}', '${owner.id}', 'contact') returning id`)[0][0];
const tier = (id: string) => localSql(`select tier from public.people where id = '${id}'`)[0][0];

beforeAll(() => {
  phil = who("phil@mycelium.local");
  tess = who("tess@mycelium.local");
  philsPerson = person(phil, "of Phil");
  tessPerson = person(tess, "of Tess");
  const status = localSql(`select id from public.ticket_statuses where space_id = '${tess.space}' and category = 'next' limit 1`)[0][0];
  ticket = localSql(`insert into public.tickets (title, space_id, created_by, status_id) values ('${TAG} waiting', '${tess.space}', '${tess.id}', '${status}') returning id`)[0][0];
});

afterAll(() => {
  localSql(`delete from public.tickets where title like '${TAG}%'`);
  localSql(`delete from public.people where first_name like '${TAG}%'`);
});

describe("links to a person", () => {
  it("a row cannot name a person in another space, and that person's record is not touched", () => {
    expect(() => localSql(`update public.tickets set waiting_on_person_id = '${philsPerson}' where id = '${ticket}'`)).toThrow(/That person is not in this space/);
    expect(localSql(`select coalesce(waiting_on_person_id::text, 'none') from public.tickets where id = '${ticket}'`)[0][0]).toBe("none");
    expect(tier(philsPerson), "before 0167 this link promoted the other person's contact").toBe("contact");
  });

  it("a row can name a person in its own space, and a contact so linked becomes a person as before", () => {
    localSql(`update public.tickets set waiting_on_person_id = '${tessPerson}' where id = '${ticket}'`);
    expect(tier(tessPerson)).toBe("person");
  });

  it("clearing the link is always allowed", () => {
    localSql(`update public.tickets set waiting_on_person_id = null where id = '${ticket}'`);
    expect(localSql(`select coalesce(waiting_on_person_id::text, 'none') from public.tickets where id = '${ticket}'`)[0][0]).toBe("none");
  });

  it("the rule is on every table that links to a person, not on this one alone", () => {
    const wired = localSql(
      `select count(*) from public.people_link_tables() l where not exists (
         select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
         where c.relname = l.table_name and p.proname = 'people_promote_on_link' and not t.tgisinternal)`,
    )[0][0];
    expect(wired, "link tables without the trigger").toBe("0");
    expect(Number(localSql(`select count(*) from public.people_link_tables()`)[0][0])).toBeGreaterThanOrEqual(6);
  });
});
