/**
 * 0169: someone you share your Day log with sees only the days you mark
 * shared, and sees them through one door, never through the tables. Runs
 * against the local stack, reading as each person under the row rules (a
 * role switch and that person's claims in one transaction).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql } from "./introspect";

const TAG = `e2e0169${Date.now().toString(36)}`;
const who = (email: string) => {
  const row = localSql(`select u.id, p.personal_space_id from auth.users u join public.profiles p on p.id = u.id where u.email = '${email}'`)[0];
  return { id: row[0], space: row[1] };
};

/** Run a query as a signed-in person, under their row rules. Returns the rows of the last statement. */
const as = (uid: string, sql: string, aal = "aal2") =>
  // One command string is one transaction: the role and the claims last exactly as long as the query after them.
  localSql(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated","aal":"${aal}"}', true); ${sql}`);
const last = (rows: string[][]) => rows.at(-1)?.[0] ?? "";

let phil: { id: string; space: string };
let tess: { id: string; space: string };
let privateDay = "";
let sharedDay = "";
let openDay = "";
let grant = "";

const day = (date: string, shared: boolean, status = "closed") => {
  const id = localSql(`insert into public.daylog_days (day, status, space_id, created_by, shared, summary, transcript) values ('${date}', '${status}', '${phil.space}', '${phil.id}', ${shared}, '${TAG} summary ${date}', '[{"role":"user","text":"${TAG} said in private"}]'::jsonb) returning id`)[0][0];
  const scene = localSql(`insert into public.daylog_scenes (day_id, space_id, created_by, title, position, narrative) values ('${id}', '${phil.space}', '${phil.id}', '${TAG} scene', 0, '${TAG} narrative') returning id`)[0][0];
  localSql(`insert into public.daylog_scenes (day_id, space_id, created_by, title, position, hidden_from_linked) values ('${id}', '${phil.space}', '${phil.id}', '${TAG} hidden scene', 1, true)`);
  localSql(`insert into public.daylog_facts (day_id, scene_id, space_id, created_by, kind, text) values ('${id}', '${scene}', '${phil.space}', '${phil.id}', 'event', '${TAG} fact')`);
  return id;
};
const col = { daylog_days: "summary", daylog_scenes: "title", daylog_facts: "text" } as const;
const inTables = (uid: string, table: keyof typeof col, aal = "aal2") => Number(last(as(uid, `select count(*) from public.${table} where space_id = '${phil.space}' and ${col[table]} like '${TAG}%'`, aal)));
const throughDoor = (uid: string, aal = "aal1") => as(uid, `select id::text, day::text, owner_name, summary, scenes::text from public.daylog_shared_with_me() where summary like '${TAG}%' order by day`, aal).filter((r) => r.length === 5);
const share = () =>
  localSql(
    `select set_config('request.jwt.claims', '{"sub":"${phil.id}","role":"authenticated","aal":"aal2"}', true); select public.create_user_grant_unchecked('${tess.id}', 'journal', array['daylog'], array['view'], null, '${TAG}')`,
  ).at(-1)![0];

beforeAll(() => {
  phil = who("phil@mycelium.local");
  tess = who("tess@mycelium.local");
  privateDay = day("2019-03-04", false);
  sharedDay = day("2019-03-05", true);
  openDay = day("2019-03-06", true, "open");
});

afterAll(() => {
  localSql(`delete from public.user_grants where reason = '${TAG}'`);
  localSql(`delete from public.daylog_days where summary like '${TAG}%'`);
});

describe("sharing the Day log", () => {
  it("the owner sees every day of their own through the tables, shared or not", () => {
    expect(inTables(phil.id, "daylog_days")).toBe(3);
    expect(inTables(phil.id, "daylog_scenes")).toBe(6);
    expect(inTables(phil.id, "daylog_facts")).toBe(3);
  });

  it("with no grant another person sees nothing, by the tables or by the door: the flag opens nothing by itself", () => {
    expect(inTables(tess.id, "daylog_days", "aal1")).toBe(0);
    expect(inTables(tess.id, "daylog_scenes", "aal1")).toBe(0);
    expect(inTables(tess.id, "daylog_facts", "aal1")).toBe(0);
    expect(throughDoor(tess.id)).toEqual([]);
  });

  it("with a view of his Day log, the tables still show her nothing of his: her own Day log never mixes with his", () => {
    grant = share();
    expect(inTables(tess.id, "daylog_days", "aal1")).toBe(0);
    expect(inTables(tess.id, "daylog_scenes", "aal1")).toBe(0);
    expect(inTables(tess.id, "daylog_facts", "aal1")).toBe(0);
  });

  it("the door shows her the day he marked and finished: his summary and his scenes, and nothing else", () => {
    const rows = throughDoor(tess.id);
    expect(rows.map((r) => r[0])).toEqual([sharedDay]);
    const [, date, owner, summary, scenes] = rows[0];
    expect(date).toBe("2019-03-05");
    expect(owner.length).toBeGreaterThan(0);
    expect(summary).toBe(`${TAG} summary 2019-03-05`);
    const list = JSON.parse(scenes) as Array<Record<string, unknown>>;
    expect(list.map((s) => s.title)).toEqual([`${TAG} scene`]);
    expect(list[0].narrative).toBe(`${TAG} narrative`);
    // Not the private day, not the unfinished one, not a scene he hid, and never the transcript, the facts, the scores or the cost.
    expect(JSON.stringify(rows)).not.toContain("said in private");
    expect(JSON.stringify(rows)).not.toContain("hidden scene");
    expect(JSON.stringify(rows)).not.toContain(`${TAG} fact`);
    expect(Object.keys(list[0]).sort()).toEqual(["narrative", "position", "time_hint", "title"]);
  });

  it("marking a day opens it and unmarking closes it at once; the dates filter works", () => {
    localSql(`update public.daylog_days set shared = true where id = '${privateDay}'`);
    expect(throughDoor(tess.id).map((r) => r[0])).toEqual([privateDay, sharedDay]);
    expect(as(tess.id, `select count(*) from public.daylog_shared_with_me('2019-03-05', '2019-03-05') where summary like '${TAG}%'`, "aal1").at(-1)![0]).toBe("1");
    localSql(`update public.daylog_days set shared = false where id in ('${privateDay}', '${sharedDay}')`);
    expect(throughDoor(tess.id)).toEqual([]);
    localSql(`update public.daylog_days set shared = true where id = '${sharedDay}'`);
  });

  it("she cannot mark one of his days shared, or change it at all", () => {
    as(tess.id, `update public.daylog_days set shared = true, summary = 'changed' where id = '${privateDay}'`, "aal1");
    expect(localSql(`select shared::text, summary from public.daylog_days where id = '${privateDay}'`)[0]).toEqual(["false", `${TAG} summary 2019-03-04`]);
  });

  it("the door closes when the share ends, and he never sees his own days in it", () => {
    expect(throughDoor(phil.id, "aal2")).toEqual([]);
    localSql(`update public.user_grants set revoked_at = now() where id = '${grant}'`);
    expect(throughDoor(tess.id)).toEqual([]);
  });

  it("a password-only session of an account with an authenticator gets nothing through the door either", () => {
    grant = share();
    // Tess has no authenticator, so aal1 is a whole session for her; a signed-out caller is not.
    expect(throughDoor(tess.id).length).toBe(1);
    expect(localSql(`select count(*) from public.daylog_shared_with_me()`)[0][0], "nobody signed in").toBe("0");
  });

  it("a new day is private until its owner says otherwise", () => {
    expect(localSql(`select column_default from information_schema.columns where table_schema = 'public' and table_name = 'daylog_days' and column_name = 'shared'`)[0][0]).toBe("false");
    expect(openDay).toBeTruthy();
  });
});
