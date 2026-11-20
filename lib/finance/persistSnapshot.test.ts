/**
 * The snapshot functions against the local stack, as a real person (the
 * same client the app gives a request). They write and read the finance
 * table (0172) and never the daily log.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "@/lib/access/introspect";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { localDateKey } from "@/lib/util/date";
import type { FinanceSnapshot } from "./types";

const env = localStackEnv();
process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
process.env.SUPABASE_JWT_SECRET = env.jwtSecret;

const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const today = localDateKey();
const space = (uid: string) => localSql(`select personal_space_id from public.profiles where id = '${uid}'`)[0][0];
const snap = (net_worth: number): FinanceSnapshot => ({ net_worth, currency: "GBP", as_of: today, categories: [], notes: "persistSnapshot.test" });
const mine = `snapshot->>'notes' = 'persistSnapshot.test'`;
const logsToday = () => localSql(`select count(*) from public.daily_logs where log_date = '${today}'`)[0][0];

let before = "";

beforeAll(() => {
  localSql(`delete from public.finance_snapshots where ${mine}`);
  before = logsToday();
});

afterAll(() => {
  localSql(`delete from public.finance_snapshots where ${mine}`);
});

describe("the net-worth snapshot, as the app reads and writes it", () => {
  it("is written to the finance table for today, once, and read back", async () => {
    const { withUser } = await import("@/lib/system/withUser");
    const { persistSnapshot, getLatestSnapshot, getSnapshotHistory } = await import("./persistSnapshot");
    await withUser(PHIL_AUTH_UID, async (db) => {
      const first = await persistSnapshot(db, snap(100_000), "cron");
      expect(first).toMatchObject({ source: "cron", snapshot: { net_worth: 100_000 } });
      // a second refresh the same day replaces it
      await persistSnapshot(db, snap(101_500), "manual");
      const latest = await getLatestSnapshot(db);
      expect(latest).toMatchObject({ date: today, source: "manual", snapshot: { net_worth: 101_500 } });
      const history = await getSnapshotHistory(db, 1);
      expect(history.filter((h) => h.date === today)).toHaveLength(1);
      expect(history[0]).toMatchObject({ date: today, snapshot: { net_worth: 101_500 } });
    });
    expect(localSql(`select count(*), max(space_id::text) from public.finance_snapshots where ${mine}`)[0]).toEqual(["1", space(PHIL_AUTH_UID)]);
  });

  it("touches no daily log", () => {
    expect(logsToday()).toBe(before);
    expect(localSql(`select count(*) from public.daily_logs where notes like '%persistSnapshot.test%'`)[0][0]).toBe("0");
  });

  it("is nobody else's to read", async () => {
    const { withUser } = await import("@/lib/system/withUser");
    const { getLatestSnapshot, getSnapshotHistory } = await import("./persistSnapshot");
    await withUser(TESS, async (db) => {
      const latest = await getLatestSnapshot(db);
      expect(latest?.snapshot.notes ?? "").not.toBe("persistSnapshot.test");
      expect((await getSnapshotHistory(db, 1)).filter((h) => h.snapshot.notes === "persistSnapshot.test")).toEqual([]);
    });
  });
});
