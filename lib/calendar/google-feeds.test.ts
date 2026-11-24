/**
 * Personal and UK holidays through the Google connection (replaces the iCal
 * feeds, 2026-11-24). Google and the settings row are doubles; the rules
 * are the point: no connection means no events and no "failed", one refused
 * calendar does not hide the other, a success stamps the connection's
 * last-synced time, and the mapping handles all-day spans and cancellations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const google = vi.hoisted(() => ({
  pages: new Map<string, { status: number; body: unknown }>(),
  synced: [] as string[],
}));

vi.mock("@/lib/google/calendar", () => ({
  listEventsPage: vi.fn(async (_db: unknown, calendarId: string) => google.pages.get(calendarId) ?? { status: 500, body: null, etag: null }),
  markGoogleSynced: vi.fn(async (_db: unknown, now: Date) => {
    google.synced.push(now.toISOString());
  }),
}));

import { clearGoogleFeedCache, eventsFromGoogle, GOOGLE_FEEDS, googleFeedEvents } from "./google-feeds";

const WIN_START = new Date("2026-11-01T00:00:00Z");
const WIN_END = new Date("2026-12-31T00:00:00Z");
const PERSONAL = GOOGLE_FEEDS[0];

function settingsDb(row: Record<string, unknown> | null) {
  const chain = { select: () => chain, limit: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  return { from: () => chain } as never;
}

describe("eventsFromGoogle", () => {
  it("maps a timed event, an all-day span and skips a cancellation", () => {
    const out = eventsFromGoogle(
      [
        { id: "a", summary: "Dentist", start: { dateTime: "2026-11-24T10:00:00Z" }, end: { dateTime: "2026-11-24T10:30:00Z" }, location: "Town" },
        { id: "b", summary: "Away", start: { date: "2026-11-27" }, end: { date: "2026-11-29" } },
        { id: "c", summary: "Gone", status: "cancelled", start: { dateTime: "2026-11-24T12:00:00Z" }, end: { dateTime: "2026-11-24T13:00:00Z" } } as never,
      ],
      PERSONAL,
      WIN_START,
      WIN_END,
    );
    expect(out.map((e) => e.title)).toEqual(["Dentist", "Away"]);
    expect(out[0]).toMatchObject({ id: "Personal:a", allDay: false, calendarName: "Personal", calendarColour: PERSONAL.colour, location: "Town" });
    expect(out[1].allDay).toBe(true);
    // Google's exclusive end (the 29th) becomes the last moment of the 28th
    expect(new Date(out[1].end).getTime()).toBeLessThan(new Date("2026-11-29T00:00:00").getTime());
    expect(new Date(out[1].end).getTime()).toBeGreaterThan(new Date("2026-11-28T23:00:00").getTime());
  });

  it("leaves out what falls outside the window and what has no start", () => {
    const out = eventsFromGoogle(
      [
        { id: "old", summary: "Old", start: { dateTime: "2026-01-01T10:00:00Z" }, end: { dateTime: "2026-01-01T11:00:00Z" } },
        { id: "nostart", summary: "?", start: {}, end: {} },
      ],
      PERSONAL,
      WIN_START,
      WIN_END,
    );
    expect(out).toEqual([]);
  });
});

describe("googleFeedEvents", () => {
  beforeEach(() => {
    google.pages.clear();
    google.synced.length = 0;
    clearGoogleFeedCache();
  });
  afterEach(() => vi.clearAllMocks());

  it("no connection: nothing to show, nothing failed, and Google is not asked", async () => {
    const r = await googleFeedEvents(settingsDb({ id: "s1", google_refresh_token: null, google_account_email: null }), WIN_START, WIN_END);
    expect(r).toEqual({ events: [], failed: [], connected: false });
    expect(google.synced).toEqual([]);
  });

  it("both calendars answer: their events are merged and the connection is stamped", async () => {
    google.pages.set("primary", { status: 200, body: { items: [{ id: "p1", summary: "Mine", start: { dateTime: "2026-11-24T09:00:00Z" }, end: { dateTime: "2026-11-24T10:00:00Z" } }] } });
    google.pages.set(GOOGLE_FEEDS[1].id, { status: 200, body: { items: [{ id: "h1", summary: "Christmas Day", start: { date: "2026-12-25" }, end: { date: "2026-12-26" } }] } });
    const now = new Date("2026-11-24T12:00:00Z");
    const r = await googleFeedEvents(settingsDb({ id: "s1", google_refresh_token: "r", google_account_email: "phil@example.test" }), WIN_START, WIN_END, now);
    expect(r.connected).toBe(true);
    expect(r.failed).toEqual([]);
    expect(r.events.map((e) => `${e.calendarName}:${e.title}`).sort()).toEqual(["Personal:Mine", "UK holidays:Christmas Day"]);
    expect(google.synced).toEqual([now.toISOString()]);
  });

  it("one calendar refused: the other still shows, the refused one is named, the stamp still moves", async () => {
    google.pages.set("primary", { status: 200, body: { items: [] } });
    google.pages.set(GOOGLE_FEEDS[1].id, { status: 404, body: null });
    const r = await googleFeedEvents(settingsDb({ id: "s1", google_refresh_token: "r", google_account_email: "phil@example.test" }), WIN_START, WIN_END);
    expect(r.failed).toEqual(["UK holidays"]);
    expect(r.connected).toBe(true);
    expect(google.synced).toHaveLength(1);
  });

  it("the token refused everywhere: both named, nothing stamped, nothing cached", async () => {
    google.pages.set("primary", { status: 401, body: null });
    google.pages.set(GOOGLE_FEEDS[1].id, { status: 401, body: null });
    const db = settingsDb({ id: "s1", google_refresh_token: "r", google_account_email: "phil@example.test" });
    const r = await googleFeedEvents(db, WIN_START, WIN_END);
    expect(r.failed.sort()).toEqual(["Personal", "UK holidays"]);
    expect(google.synced).toEqual([]);
    // not cached: the next read asks Google again and sees a recovery
    google.pages.set("primary", { status: 200, body: { items: [] } });
    google.pages.set(GOOGLE_FEEDS[1].id, { status: 200, body: { items: [] } });
    expect((await googleFeedEvents(db, WIN_START, WIN_END)).failed).toEqual([]);
  });

  it("a good read is cached for five minutes per account", async () => {
    google.pages.set("primary", { status: 200, body: { items: [] } });
    google.pages.set(GOOGLE_FEEDS[1].id, { status: 200, body: { items: [] } });
    const db = settingsDb({ id: "s1", google_refresh_token: "r", google_account_email: "phil@example.test" });
    const t0 = new Date("2026-11-24T12:00:00Z");
    await googleFeedEvents(db, WIN_START, WIN_END, t0);
    await googleFeedEvents(db, WIN_START, WIN_END, new Date(t0.getTime() + 60_000));
    expect(google.synced).toHaveLength(1);
    await googleFeedEvents(db, WIN_START, WIN_END, new Date(t0.getTime() + 6 * 60_000));
    expect(google.synced).toHaveLength(2);
  });
});
