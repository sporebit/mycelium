/**
 * The Family calendar sync against a fake Google and a fake database (family
 * calendar spec §4.2–§4.4). Google answers with whatever the test puts on
 * `google`; the database is a few arrays with just enough of the query
 * builder to serve this module. The point is the rules: what a pull does
 * with a new, changed, cancelled or lapsed event; what a push does with a
 * 412 and a 404; that a failed push is queued rather than lost; what the
 * health check writes down and when it nudges.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { family_entries: [], family_calendar_sync: [], family_calendar_sync_log: [], jobs: [], user_settings: [], tickets: [], profiles: [] };
let nextId = 1;

/** Just enough of the Supabase query builder for sync.ts. */
function fakeDb() {
  function query(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | null = null;
    let head = false;
    let count = false;
    const apply = () => {
      const matched = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "select") return matched;
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        return matched;
      }
      if (op === "delete") {
        for (const r of matched) rows().splice(rows().indexOf(r), 1);
        return matched;
      }
      // insert
      // the real jobs table defaults status to queued (0159)
      const row: Row = { id: `id${nextId++}`, created_at: new Date().toISOString(), ...(table === "jobs" ? { status: "queued" } : {}), ...payload };
      if (table === "family_entries" && row.ext_id && rows().some((r) => r.ext_id === row.ext_id && r.space_id === row.space_id)) return { error: { code: "23505", message: "dup" } };
      if (table === "jobs" && row.dedupe_key && rows().some((r) => r.dedupe_key === row.dedupe_key)) return { error: { code: "23505", message: "dup" } };
      rows().push(row);
      return [row];
    };
    const b: Record<string, unknown> = {};
    const chain = (fn: () => void) => () => {
      fn();
      return b;
    };
    b.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (op === "insert" || op === "update" || op === "delete") return b; // .insert().select()
      head = !!opts?.head;
      count = !!opts?.count;
      return b;
    };
    b.insert = (p: Row) => {
      op = "insert";
      payload = p;
      return b;
    };
    b.update = (p: Row) => {
      op = "update";
      payload = p;
      return b;
    };
    b.delete = () => {
      op = "delete";
      return b;
    };
    b.eq = (col: string, v: unknown) => {
      filters.push((r) => (col.includes("->>") ? ((r.payload as Row | undefined)?.[col.split("->>")[1]] ?? null) === v : r[col] === v));
      return b;
    };
    b.in = (col: string, vs: unknown[]) => {
      filters.push((r) => vs.includes(r[col]));
      return b;
    };
    b.not = (col: string, _op: string, v: unknown) => {
      filters.push((r) => r[col] !== v);
      return b;
    };
    b.is = (col: string, v: unknown) => {
      filters.push((r) => (r[col] ?? null) === v);
      return b;
    };
    b.contains = (col: string, v: Row) => {
      filters.push((r) => Object.entries(v).every(([k, val]) => ((r[col] as Row | undefined) ?? {})[k] === val));
      return b;
    };
    b.limit = chain(() => undefined);
    b.order = chain(() => undefined);
    const result = () => {
      const out = apply();
      if ("error" in (out as Row)) return { data: null, error: (out as { error: Row }).error, count: null };
      const list = out as Row[];
      return { data: head ? null : list, error: null, count: count ? list.length : null };
    };
    b.maybeSingle = async () => {
      const r = result();
      return { ...r, data: r.data ? (r.data as Row[])[0] ?? null : null };
    };
    b.single = async () => {
      const r = result();
      const data = r.data ? (r.data as Row[])[0] : null;
      return { ...r, data, error: r.error ?? (data ? null : { message: "no row" }) };
    };
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return b;
  }
  return { from: query } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// ---- the fake Google -------------------------------------------------------
type Resp<T> = { status: number; body: T | null; etag: string | null };
const ok = <T>(body: T, etag: string | null = null): Resp<T> => ({ status: 200, body, etag });
const google = {
  pages: [] as Array<Resp<{ items?: Row[]; nextPageToken?: string; nextSyncToken?: string }>>,
  insert: ok<Row>({ id: "g-new", etag: '"n1"', updated: "2026-11-21T12:00:00.000Z" }) as Resp<Row>,
  patch: [] as Array<Resp<Row>>,
  get: ok<Row>({}) as Resp<Row>,
  remove: { status: 204, body: null, etag: null } as Resp<null>,
  watch: { status: 403, body: null, etag: null } as Resp<Row>,
  calendars: [] as Row[],
  token: "tok" as string | null,
  calls: [] as string[],
};
vi.mock("@/lib/google/calendar", () => ({
  getAccessToken: async () => google.token,
  listEventsPage: async (_db: unknown, _cal: string, opts: Row) => {
    google.calls.push(`list ${opts.syncToken ? "sync" : "full"}${opts.pageToken ? " page" : ""}`);
    return google.pages.shift() ?? ok({ items: [], nextSyncToken: "st-end" });
  },
  insertEvent: async (_db: unknown, _cal: string, body: Row) => {
    google.calls.push(`insert ${body.summary}`);
    return google.token ? google.insert : { status: 401, body: null, etag: null };
  },
  patchEvent: async (_db: unknown, _cal: string, id: string, _body: Row, etag: string | null) => {
    google.calls.push(`patch ${id} ${etag ?? "no-etag"}`);
    return google.patch.shift() ?? ok({ id, etag: '"p1"', updated: "2026-11-21T12:30:00.000Z" });
  },
  getEvent: async (_db: unknown, _cal: string, id: string) => {
    google.calls.push(`get ${id}`);
    return google.get;
  },
  removeEvent: async (_db: unknown, _cal: string, id: string) => {
    google.calls.push(`remove ${id}`);
    return google.remove;
  },
  watchEvents: async () => {
    google.calls.push("watch");
    return google.watch;
  },
  stopChannel: async () => ({ status: 204, body: null, etag: null }),
  listCalendars: async () => ok(google.calendars),
  createCalendar: async () => ok({ id: "new-cal", summary: "Family" }),
  getCalendar: async (_db: unknown, id: string) => {
    google.calls.push(`getCalendar ${id}`);
    return ok({ id, summary: "Family" });
  },
  listAcl: async () => ok([]),
  insertAcl: async () => ok({}),
}));
const nudges: Row[] = [];
vi.mock("@/lib/nudges/interrupt", () => ({ interrupt: async (_db: unknown, uid: string, input: Row) => (nudges.push({ uid, ...input }), { sent: true }) }));
vi.mock("@/lib/system/withUser", () => ({ withUser: async (_uid: string, fn: (db: unknown) => unknown) => fn(fakeDb()) }));
vi.mock("@/lib/tickets/server", () => ({ statusIdFor: async () => "status-next" }));
vi.mock("@/lib/jobs/handlers", () => ({ registerJobHandler: () => undefined }));

const { afterEntryWrite, calendarsForPicker, chooseCalendar, healthCheck, pullFamilyCalendar, pushEntry, queuedPushes, PUSH_JOB } = await import("./sync");

const SPACE = "space-1";
const OWNER = "phil";
const now = new Date("2026-11-21T12:00:00Z");
const syncRow = () =>
  ({
    id: "sync-1",
    space_id: SPACE,
    calendar_id: "cal-1",
    calendar_summary: "Family",
    owner_user_id: OWNER,
    sync_token: "st-1",
    last_synced_at: null,
    last_sync_error: null,
    last_sync_error_at: null,
    channel_id: null,
    channel_resource_id: null,
    channel_token: null,
    channel_expires_at: null,
    channel_error: null,
    google_reminders: false,
    health_checked_at: null,
    health_ok: null,
    health_error: null,
    health_nudged_on: null,
    updated_at: now.toISOString(),
  }) as Row;

beforeEach(() => {
  for (const k of Object.keys(tables)) tables[k] = [];
  tables.family_calendar_sync.push(syncRow());
  tables.user_settings.push({ google_refresh_token: "r", google_sync_error: null });
  tables.profiles.push({ id: OWNER, personal_space_id: "phil-space" });
  google.pages = [];
  google.patch = [];
  google.calls = [];
  google.token = "tok";
  google.insert = ok({ id: "g-new", etag: '"n1"', updated: "2026-11-21T12:00:00.000Z" });
  google.get = ok({});
  google.remove = { status: 204, body: null, etag: null };
  google.calendars = [];
  nudges.length = 0;
});

const GROUP_CAL = "family0876abcdef0123456789abcdef0123456789abcdef0123456789abcdef01@group.calendar.google.com";
const PHIRSTY = "c68f629139fcaf595bb3f9c529fae1bf7d5b0a2965a311e5639dfffbc6f6e209@group.calendar.google.com";

describe("Google's family-group calendar is never touched (decision D7, 2026-11-23)", () => {
  it("the picker leaves it out and offers the rest", async () => {
    google.calendars = [
      { id: "phil@example.test", summary: "Personal", primary: true },
      { id: GROUP_CAL, summary: "Premium Calendar" },
      { id: PHIRSTY, summary: "Phirsty Life" },
    ];
    const r = await calendarsForPicker(fakeDb());
    expect(r.ok && r.calendars.map((c) => c.summary)).toEqual(["Personal", "Phirsty Life"]);
  });

  it("choosing it is refused before Google is even asked", async () => {
    const r = await chooseCalendar(fakeDb(), OWNER, SPACE, GROUP_CAL, now);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.status).toBe(403);
    expect(google.calls).toEqual([]);
    expect(sync().calendar_id).toBe("cal-1");
  });

  it("a row that somehow names it is neither pulled nor pushed, and the push is not queued for retry", async () => {
    sync().calendar_id = GROUP_CAL;
    const pulled = await pullFamilyCalendar(fakeDb(), sync(), now);
    expect(pulled.ok).toBe(false);
    expect(pulled.error).toMatch(/never reads or writes/);
    tables.family_entries.push({ id: "e1", space_id: SPACE, kind: "appointment", title: "Scan", starts_at: "2026-12-01T10:00:00.000Z", updated_at: now.toISOString() });
    const pushed = await pushEntry(fakeDb(), sync(), "e1", "create");
    expect(pushed.done).toBe(true);
    expect(pushed.error).toMatch(/never reads or writes/);
    expect(google.calls).toEqual([]);
  });

  it("Phirsty Life itself passes the guard", async () => {
    const r = await chooseCalendar(fakeDb(), OWNER, SPACE, PHIRSTY, now);
    expect(r.ok).toBe(true);
    expect(sync().calendar_id).toBe(PHIRSTY);
    expect(google.calls[0]).toBe(`getCalendar ${PHIRSTY}`);
  });
});

const sync = () => tables.family_calendar_sync[0] as ReturnType<typeof syncRow> & import("./sync").SyncRow;
const logActions = () => tables.family_calendar_sync_log.map((l) => `${l.direction}:${l.action}`);

describe("pull: Google → family_entries (spec §4.2)", () => {
  it("a new event makes a row, a changed one updates it, a cancelled one deletes it; the sync token moves on", async () => {
    tables.family_entries.push({ id: "e-old", space_id: SPACE, kind: "appointment", title: "Old", ext_provider: "google", ext_id: "g-old", ext_updated_at: "2026-11-20T10:00:00.000Z", updated_at: "2026-11-20T10:00:00.000Z", starts_at: "2026-12-01T10:00:00.000Z", ends_at: null, all_day: false, body: null, place: null });
    tables.family_entries.push({ id: "e-gone", space_id: SPACE, kind: "appointment", title: "Gone", ext_provider: "google", ext_id: "g-gone", ext_updated_at: "2026-11-20T10:00:00.000Z", updated_at: "2026-11-20T10:00:00.000Z" });
    google.pages = [
      ok({
        items: [
          { id: "g-new", status: "confirmed", summary: "Midwife", start: { dateTime: "2026-12-02T09:30:00Z" }, end: { dateTime: "2026-12-02T10:00:00Z" }, updated: "2026-11-21T11:00:00.000Z", etag: '"a"' },
          { id: "g-old", status: "confirmed", summary: "Old, moved", start: { dateTime: "2026-12-01T11:00:00Z" }, updated: "2026-11-21T11:00:00.000Z", etag: '"b"' },
          { id: "g-gone", status: "cancelled" },
        ],
        nextSyncToken: "st-2",
      }),
    ];
    const r = await pullFamilyCalendar(fakeDb(), sync(), now);
    expect(r).toMatchObject({ ok: true, created: 1, updated: 1, deleted: 1, full: false });
    expect(tables.family_entries.map((e) => e.title).sort()).toEqual(["Midwife", "Old, moved"]);
    const made = tables.family_entries.find((e) => e.ext_id === "g-new")!;
    expect(made).toMatchObject({ space_id: SPACE, source: "google", created_by: OWNER, kind: "appointment", happened_on: "2026-12-02" });
    expect(sync().sync_token).toBe("st-2");
    expect(sync().last_synced_at).toBe(now.toISOString());
    expect(logActions()).toEqual(["in:created", "in:updated", "in:deleted"]);
  });

  it("a 410 (the token has lapsed) starts a full read of the window, once, and keeps going", async () => {
    google.pages = [{ status: 410, body: null, etag: null }, ok({ items: [{ id: "g1", summary: "A", start: { dateTime: "2026-12-02T09:30:00Z" }, updated: "2026-11-21T11:00:00.000Z" }], nextPageToken: "p2" }), ok({ items: [{ id: "g2", summary: "B", start: { dateTime: "2026-12-03T09:30:00Z" }, updated: "2026-11-21T11:00:00.000Z" }], nextSyncToken: "st-fresh" })];
    const r = await pullFamilyCalendar(fakeDb(), sync(), now);
    expect(r).toMatchObject({ ok: true, created: 2, full: true });
    expect(google.calls).toEqual(["list sync", "list full", "list full page"]);
    expect(sync().sync_token).toBe("st-fresh");
    expect(logActions()[0]).toBe("in:full_sync");
  });

  it("both sides changed: Google later wins and the local edit is written down; ours later is kept and pushed", async () => {
    tables.family_entries.push({ id: "e1", space_id: SPACE, kind: "appointment", title: "Ours", ext_provider: "google", ext_id: "g1", ext_etag: '"old"', ext_updated_at: "2026-11-21T10:00:00.000Z", updated_at: "2026-11-21T10:30:00.000Z", starts_at: "2026-12-01T10:00:00.000Z", ends_at: null, all_day: false, body: null, place: null });
    tables.family_entries.push({ id: "e2", space_id: SPACE, kind: "appointment", title: "Ours, newer", ext_provider: "google", ext_id: "g2", ext_etag: '"old2"', ext_updated_at: "2026-11-21T10:00:00.000Z", updated_at: "2026-11-21T11:30:00.000Z", starts_at: "2026-12-01T10:00:00.000Z", ends_at: null, all_day: false, body: null, place: null });
    google.pages = [
      ok({
        items: [
          { id: "g1", summary: "Theirs", start: { dateTime: "2026-12-01T10:00:00Z" }, updated: "2026-11-21T11:00:00.000Z" },
          { id: "g2", summary: "Theirs, older", start: { dateTime: "2026-12-01T10:00:00Z" }, updated: "2026-11-21T11:00:00.000Z" },
        ],
        nextSyncToken: "st-2",
      }),
    ];
    const r = await pullFamilyCalendar(fakeDb(), sync(), now);
    expect(r.ok).toBe(true);
    expect(tables.family_entries.find((e) => e.id === "e1")!.title).toBe("Theirs");
    expect(tables.family_entries.find((e) => e.id === "e2")!.title).toBe("Ours, newer");
    expect(google.calls).toContain('patch g2 "old2"');
    const overwrites = tables.family_calendar_sync_log.filter((l) => l.action === "overwritten").map((l) => `${l.direction}:${(l.detail as Row).kept}`);
    expect(overwrites.sort()).toEqual(["in:google", "out:mycelium"]);
  });

  it("an event made here, met again after a reconnect, re-links to its row instead of making a twin", async () => {
    tables.family_entries.push({ id: "e-mine", space_id: SPACE, kind: "appointment", title: "Mine", ext_id: null, ext_updated_at: null, updated_at: "2026-11-20T10:00:00.000Z", starts_at: "2026-12-01T10:00:00.000Z" });
    google.pages = [ok({ items: [{ id: "g-mine", summary: "Mine", start: { dateTime: "2026-12-01T10:00:00Z" }, updated: "2026-11-21T11:00:00.000Z", extendedProperties: { private: { mycelium_entry: "e-mine" } } }], nextSyncToken: "st-2" })];
    const r = await pullFamilyCalendar(fakeDb(), sync(), now);
    expect(r).toMatchObject({ ok: true, created: 0, updated: 1 });
    expect(tables.family_entries).toHaveLength(1);
    expect(tables.family_entries[0].ext_id).toBe("g-mine");
  });

  it("Google refusing the token is written down on the row, and the token is kept for next time", async () => {
    google.pages = [{ status: 401, body: null, etag: null }];
    const r = await pullFamilyCalendar(fakeDb(), sync(), now);
    expect(r.ok).toBe(false);
    expect(sync().last_sync_error).toMatch(/reconnect/i);
    expect(sync().last_sync_error_at).toBe(now.toISOString());
    expect(sync().sync_token).toBe("st-1");
  });
});

describe("push: family_entries → Google (spec §4.3)", () => {
  const entry = (extra: Row = {}) => ({ id: "e1", space_id: SPACE, kind: "appointment", title: "Scan", body: null, place: "Hospital", starts_at: "2026-12-02T09:30:00.000Z", ends_at: null, all_day: false, ext_id: null, ext_etag: null, ext_updated_at: null, updated_at: "2026-11-21T11:00:00.000Z", ...extra });

  it("a new appointment is inserted and the row learns its Google id", async () => {
    tables.family_entries.push(entry());
    const r = await pushEntry(fakeDb(), sync(), "e1", "create");
    expect(r).toEqual({ done: true, action: "create" });
    expect(tables.family_entries[0]).toMatchObject({ ext_provider: "google", ext_id: "g-new", ext_etag: '"n1"', ext_updated_at: "2026-11-21T12:00:00.000Z" });
    expect(logActions()).toEqual(["out:created"]);
  });

  it("an update carries If-Match; a 412 with a newer Google copy means Google wins", async () => {
    tables.family_entries.push(entry({ ext_id: "g1", ext_etag: '"e1"', ext_updated_at: "2026-11-21T10:00:00.000Z", updated_at: "2026-11-21T10:30:00.000Z" }));
    google.patch = [{ status: 412, body: null, etag: null }];
    google.get = ok({ id: "g1", summary: "Theirs", start: { dateTime: "2026-12-02T10:00:00Z" }, updated: "2026-11-21T11:00:00.000Z", etag: '"e2"' });
    const r = await pushEntry(fakeDb(), sync(), "e1", "update");
    expect(r).toEqual({ done: true, action: "update" });
    expect(google.calls).toEqual(['patch g1 "e1"', "get g1"]);
    expect(tables.family_entries[0]).toMatchObject({ title: "Theirs", ext_etag: '"e2"' });
    expect(tables.family_calendar_sync_log[0]).toMatchObject({ direction: "in", action: "overwritten", detail: { kept: "google", via: "412" } });
  });

  it("a 412 where ours is newer: write it anyway, without the etag, and log that Google's copy was overwritten", async () => {
    tables.family_entries.push(entry({ ext_id: "g1", ext_etag: '"e1"', ext_updated_at: "2026-11-21T10:00:00.000Z", updated_at: "2026-11-21T11:30:00.000Z" }));
    google.patch = [{ status: 412, body: null, etag: null }];
    google.get = ok({ id: "g1", summary: "Theirs", start: { dateTime: "2026-12-02T10:00:00Z" }, updated: "2026-11-21T11:00:00.000Z" });
    const r = await pushEntry(fakeDb(), sync(), "e1", "update");
    expect(r.done).toBe(true);
    expect(google.calls).toEqual(['patch g1 "e1"', "get g1", "patch g1 no-etag"]);
    expect(tables.family_entries[0].title).toBe("Scan");
    expect(tables.family_calendar_sync_log.map((l) => l.action)).toEqual(["overwritten", "updated"]);
  });

  it("deleted over there while we edited: the row keeps its appointment and is made again on Google", async () => {
    tables.family_entries.push(entry({ ext_id: "g1", ext_etag: '"e1"', ext_updated_at: "2026-11-21T10:00:00.000Z" }));
    google.patch = [{ status: 404, body: null, etag: null }];
    const r = await pushEntry(fakeDb(), sync(), "e1", "update");
    expect(r).toEqual({ done: true, action: "create" });
    expect(tables.family_entries[0].ext_id).toBe("g-new");
  });

  it("a delete removes it over there by the id the row had; already gone counts as done", async () => {
    expect(await pushEntry(fakeDb(), sync(), "e1", "delete", "g1")).toEqual({ done: true, action: "delete" });
    expect(google.calls).toEqual(["remove g1"]);
    expect(logActions()).toEqual(["out:deleted"]);
  });

  it("a row that stopped being an appointment comes off the calendar", async () => {
    tables.family_entries.push(entry({ kind: "note", ext_id: "g1" }));
    expect(await pushEntry(fakeDb(), sync(), "e1", "update")).toEqual({ done: true, action: "delete" });
    expect(google.calls).toEqual(["remove g1"]);
  });

  it("a write that Google refuses is queued, counted, and never dropped", async () => {
    tables.family_entries.push(entry());
    google.token = null;
    await afterEntryWrite(fakeDb(), "kirsty", SPACE, "e1", "create");
    expect(tables.jobs).toHaveLength(1);
    expect(tables.jobs[0]).toMatchObject({ kind: PUSH_JOB, lane: "cloud", dedupe_key: `${PUSH_JOB}:e1:create`, payload: { space_id: SPACE, entry_id: "e1", action: "create" } });
    expect(await queuedPushes(fakeDb(), SPACE)).toBe(1);
    expect(logActions()).toEqual(["out:queued"]);
    // the same change failing again does not make a second job
    await afterEntryWrite(fakeDb(), "kirsty", SPACE, "e1", "create");
    expect(tables.jobs).toHaveLength(1);
  });

  it("nothing is sent when no calendar is connected", async () => {
    tables.family_calendar_sync[0].calendar_id = null;
    tables.family_entries.push(entry());
    await afterEntryWrite(fakeDb(), OWNER, SPACE, "e1", "create");
    expect(google.calls).toEqual([]);
    expect(tables.jobs).toEqual([]);
  });
});

describe("the daily health check (spec §4.4)", () => {
  it("a live connection is written down as fine and nobody is bothered", async () => {
    const r = await healthCheck(fakeDb(), sync(), now);
    expect(r).toEqual({ ok: true, nudged: false, ticket: false });
    expect(sync()).toMatchObject({ health_ok: true, health_error: null, health_checked_at: now.toISOString() });
    expect(nudges).toEqual([]);
  });

  it("a dead token: the reason is recorded, the owner is pushed once with the reconnect link, a dated ticket is raised once", async () => {
    google.token = null;
    tables.user_settings[0].google_sync_error = "invalid_grant";
    const first = await healthCheck(fakeDb(), sync(), now);
    expect(first).toMatchObject({ ok: false, error: "invalid_grant", nudged: true, ticket: true });
    expect(sync()).toMatchObject({ health_ok: false, health_error: "invalid_grant", health_nudged_on: "2026-11-21" });
    expect(nudges).toHaveLength(1);
    expect(nudges[0]).toMatchObject({ uid: OWNER, kind: "family_calendar_reconnect", url: "/other/settings?tab=integrations" });
    expect(tables.tickets).toHaveLength(1);
    expect(tables.tickets[0]).toMatchObject({ title: "Reconnect Google for the Family calendar", scheduled_on: "2026-11-21", owner: OWNER, space_id: "phil-space", status_id: "status-next", meta: { family_calendar: "reconnect" } });

    // later the same day: still broken, but no second nudge and no second ticket
    const again = await healthCheck(fakeDb(), sync(), new Date("2026-11-21T18:00:00Z"));
    expect(again).toMatchObject({ ok: false, nudged: false, ticket: false });
    expect(nudges).toHaveLength(1);

    // the next day: nudged again (the ticket is still open, so not raised again)
    const tomorrow = await healthCheck(fakeDb(), sync(), new Date("2026-11-22T09:00:00Z"));
    expect(tomorrow).toMatchObject({ ok: false, nudged: true, ticket: false });
    expect(nudges).toHaveLength(2);
    expect(tables.tickets).toHaveLength(1);
  });

  it("a refused read with a live token is a failure too", async () => {
    google.pages = [{ status: 403, body: null, etag: null }];
    const r = await healthCheck(fakeDb(), sync(), now);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/403/);
  });
});
