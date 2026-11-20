/**
 * 0172: the net-worth snapshot is finance data and lives in a finance
 * table, whatever writes it and wherever it is written. Runs against the
 * local stack as each person, under the row rules.
 *
 * The case that matters: someone given a view of another person's whole
 * Journal section reads their daily log and finds no figure in it, and
 * cannot read the finance table at all.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql } from "./introspect";
import { OWNER_ONLY_SECTIONS } from "./registry";

const TAG = `e2e0172${Date.now().toString(36)}`;
const DAY = "2018-02-03";
const who = (email: string) => {
  const row = localSql(`select u.id, p.personal_space_id from auth.users u join public.profiles p on p.id = u.id where u.email = '${email}'`)[0];
  return { id: row[0], space: row[1] };
};
const as = (uid: string, sql: string, aal = "aal2") => localSql(`set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated","aal":"${aal}"}', true); ${sql}`);
const last = (rows: string[][]) => rows.at(-1)?.[0] ?? "";
const notes = (worth: number, extra = "") =>
  JSON.stringify({ mood_note: `${TAG} kept`, finance: { snapshot: { net_worth: worth, currency: "GBP", as_of: DAY, categories: [], notes: "" }, last_refreshed_at: "2018-02-03T07:00:00.000Z", source: "cron" }, ...(extra ? { extra } : {}) }).replace(/'/g, "''");
const stored = (space: string, day = DAY) => localSql(`select coalesce(notes, '') from public.daily_logs where space_id = '${space}' and log_date = '${day}'`)[0]?.[0] ?? "";
const worth = (space: string, day = DAY) => localSql(`select snapshot->>'net_worth' from public.finance_snapshots where space_id = '${space}' and snapshot_date = '${day}'`)[0]?.[0] ?? null;

let phil: { id: string; space: string };
let tess: { id: string; space: string };

beforeAll(() => {
  phil = who("phil@mycelium.local");
  tess = who("tess@mycelium.local");
});

afterAll(() => {
  localSql(`delete from public.user_grants where reason = '${TAG}'`);
  localSql(`delete from public.finance_snapshots where snapshot_date between '2018-02-01' and '2018-02-28'`);
  localSql(`delete from public.daily_logs where log_date between '2018-02-01' and '2018-02-28'`);
});

describe("the net-worth snapshot is finance, wherever it is written", () => {
  it("the table is in the finance section, which nobody can be given", () => {
    expect(localSql(`select section from public.entity_groups where table_name = 'finance_snapshots'`)[0][0]).toBe("finance");
    expect(OWNER_ONLY_SECTIONS).toContain("finance");
    const rules = localSql(`select coalesce(qual, with_check) from pg_policies where schemaname = 'public' and tablename = 'finance_snapshots'`).map((r) => r[0]);
    expect(rules.length).toBe(4);
    for (const r of rules) expect(r).toBe("(space_id = app.personal_space())");
  });

  it("a snapshot written into a daily log the old way is moved out before the row is stored; the rest of the note stays", () => {
    as(phil.id, `insert into public.daily_logs (log_date, notes) values ('${DAY}', '${notes(250000)}')`);
    expect(JSON.parse(stored(phil.space))).toEqual({ mood_note: `${TAG} kept` });
    expect(worth(phil.space)).toBe("250000");
    expect(localSql(`select source, last_refreshed_at::text from public.finance_snapshots where space_id = '${phil.space}' and snapshot_date = '${DAY}'`)[0]).toEqual(["cron", "2018-02-03 07:00:00+00"]);
  });

  it("the same on an update, and the day's snapshot is replaced, not doubled", () => {
    as(phil.id, `update public.daily_logs set notes = '${notes(260000, "later")}' where log_date = '${DAY}'`);
    expect(JSON.parse(stored(phil.space))).toEqual({ mood_note: `${TAG} kept`, extra: "later" });
    expect(worth(phil.space)).toBe("260000");
    expect(localSql(`select count(*) from public.finance_snapshots where space_id = '${phil.space}' and snapshot_date = '${DAY}'`)[0][0]).toBe("1");
  });

  it("notes that are plain words, or JSON with no finance in it, are stored exactly as written", () => {
    as(phil.id, `insert into public.daily_logs (log_date, notes) values ('2018-02-04', 'a quiet day, {not json')`);
    as(phil.id, `insert into public.daily_logs (log_date, notes) values ('2018-02-05', '{"mood_note":"fine","n":1}')`);
    expect(stored(phil.space, "2018-02-04")).toBe("a quiet day, {not json");
    expect(stored(phil.space, "2018-02-05")).toBe('{"mood_note":"fine","n":1}');
    expect(worth(phil.space, "2018-02-04")).toBeNull();
  });

  it("someone given a view of his whole Journal reads his daily log and finds no figure, and reads nothing of the finance table", () => {
    localSql(
      `select set_config('request.jwt.claims', '{"sub":"${phil.id}","role":"authenticated","aal":"aal2"}', true); select public.create_user_grant_unchecked('${tess.id}', 'journal', array[]::text[], array['view', 'edit'], null, '${TAG}')`,
    );
    const seen = as(tess.id, `select notes from public.daily_logs where space_id = '${phil.space}' and log_date = '${DAY}'`, "aal1").map((r) => r[0]).filter((v) => v?.includes(TAG));
    expect(seen, "the share does reach his daily log").toHaveLength(1);
    expect(seen[0]).not.toContain("finance");
    expect(seen[0]).not.toContain("260000");
    expect(Number(last(as(tess.id, `select count(*) from public.finance_snapshots`, "aal1")))).toBe(0);
    expect(Number(last(as(tess.id, `select count(*) from public.finance_snapshots where space_id = '${phil.space}'`, "aal1")))).toBe(0);
  });

  it("with edit rights on his log she cannot plant a figure in his finance history: the key is dropped and nothing is stored", () => {
    as(tess.id, `update public.daily_logs set notes = '${notes(1)}' where space_id = '${phil.space}' and log_date = '${DAY}'`, "aal1");
    expect(worth(phil.space), "his figure is unchanged").toBe("260000");
    expect(stored(phil.space)).not.toContain("finance");
    expect(worth(tess.space)).toBeNull();
  });

  it("she cannot write a row into the finance table for his space either", () => {
    let message = "";
    try {
      as(tess.id, `insert into public.finance_snapshots (space_id, snapshot_date, snapshot) values ('${phil.space}', '2018-02-06', '{"net_worth":1}')`, "aal1");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/row-level security/);
  });

  it("nothing on this database still carries a figure in a daily log", () => {
    expect(localSql(`select count(*) from public.daily_logs l where jsonb_typeof(app.jsonb_or_null(l.notes)) = 'object' and app.jsonb_or_null(l.notes) ? 'finance'`)[0][0]).toBe("0");
  });
});
