import { describe, expect, it } from "vitest";
import { aclRefusal, aclStrangers, decideIncoming, describeScope, ENTRY_PROP, entryColumnsFromEvent, eventFromEntry, londonMidnight, nextDate, queueLine, readAcl, roleWords, staleness, syncWindow } from "./map";

describe("a Google event becomes a family appointment (spec §4.2)", () => {
  it("a timed event keeps its instant, its end, its place and its ids", () => {
    const cols = entryColumnsFromEvent({
      id: "ev1",
      etag: '"e1"',
      iCalUID: "ev1@google.com",
      updated: "2026-11-21T10:00:00.000Z",
      summary: "  Midwife ",
      description: "Bring the notes",
      location: "The surgery",
      start: { dateTime: "2026-12-02T09:30:00Z" },
      end: { dateTime: "2026-12-02T10:15:00Z" },
    })!;
    expect(cols).toMatchObject({
      kind: "appointment",
      title: "Midwife",
      body: "Bring the notes",
      place: "The surgery",
      starts_at: "2026-12-02T09:30:00.000Z",
      ends_at: "2026-12-02T10:15:00.000Z",
      all_day: false,
      happened_on: "2026-12-02",
      ext_provider: "google",
      ext_id: "ev1",
      ext_etag: '"e1"',
      ext_ical_uid: "ev1@google.com",
      ext_updated_at: "2026-11-21T10:00:00.000Z",
    });
  });

  it("the day is the London day, not the UTC one", () => {
    // 23:30 UTC in summer is 00:30 the next day in London
    const cols = entryColumnsFromEvent({ id: "e", start: { dateTime: "2026-07-01T23:30:00Z" } })!;
    expect(cols.happened_on).toBe("2026-07-02");
  });

  it("an all-day event starts at London midnight and is marked", () => {
    const cols = entryColumnsFromEvent({ id: "e", summary: "Nursery closed", start: { date: "2026-07-01" }, end: { date: "2026-07-02" } })!;
    expect(cols.all_day).toBe(true);
    expect(cols.happened_on).toBe("2026-07-01");
    expect(cols.starts_at).toBe("2026-06-30T23:00:00.000Z");
    expect(cols.ends_at).toBe("2026-07-01T23:00:00.000Z");
  });

  it("no start means it cannot be an appointment", () => {
    expect(entryColumnsFromEvent({ id: "e", summary: "?" })).toBeNull();
  });

  it("an empty title becomes (No title); an end before the start is pulled up to it", () => {
    const cols = entryColumnsFromEvent({ id: "e", start: { dateTime: "2026-12-02T09:30:00Z" }, end: { dateTime: "2026-12-02T09:00:00Z" } })!;
    expect(cols.title).toBe("(No title)");
    expect(cols.ends_at).toBe(cols.starts_at);
  });
});

describe("a family appointment becomes a Google event (spec §4.3)", () => {
  const row = { id: "row1", title: "Scan", body: "20 weeks", place: "Hospital", starts_at: "2026-12-02T09:30:00.000Z", ends_at: null, all_day: false };

  it("an hour long when no end was given, London-zoned, carrying its row id", () => {
    const ev = eventFromEntry(row, false)!;
    expect(ev.summary).toBe("Scan");
    expect(ev.location).toBe("Hospital");
    expect(ev.start).toEqual({ dateTime: "2026-12-02T09:30:00.000Z", timeZone: "Europe/London" });
    expect(ev.end).toEqual({ dateTime: "2026-12-02T10:30:00.000Z", timeZone: "Europe/London" });
    expect(ev.extendedProperties.private[ENTRY_PROP]).toBe("row1");
  });

  it("no Google reminders unless the setting says so: nothing buzzes twice", () => {
    expect(eventFromEntry(row, false)!.reminders).toEqual({ useDefault: false, overrides: [] });
    expect(eventFromEntry(row, true)!.reminders).toEqual({ useDefault: true });
  });

  it("an all-day row is a date, with Google's exclusive end", () => {
    const ev = eventFromEntry({ ...row, starts_at: "2026-06-30T23:00:00.000Z", all_day: true }, false)!;
    expect(ev.start).toEqual({ date: "2026-07-01" });
    expect(ev.end).toEqual({ date: "2026-07-02" });
  });

  it("a row with no time is not sent", () => {
    expect(eventFromEntry({ ...row, starts_at: null }, false)).toBeNull();
  });

  it("the two directions agree with each other", () => {
    const ev = eventFromEntry(row, false)!;
    const back = entryColumnsFromEvent({ id: "g1", ...ev, start: ev.start, end: ev.end })!;
    expect(back.title).toBe(row.title);
    expect(back.starts_at).toBe(row.starts_at);
    expect(back.ends_at).toBe("2026-12-02T10:30:00.000Z");
    expect(back.place).toBe(row.place);
  });
});

describe("when both sides changed (spec §4.3): the later wins, Google on a tie", () => {
  const seen = "2026-11-21T10:00:00.000Z";
  it("Google unchanged since we last looked: nothing to do", () => {
    expect(decideIncoming({ ext_updated_at: seen, updated_at: "2026-11-21T10:00:00.000Z" }, seen)).toEqual({ action: "skip", why: "unchanged" });
  });
  it("only Google changed: take it, nothing lost", () => {
    expect(decideIncoming({ ext_updated_at: seen, updated_at: seen }, "2026-11-21T11:00:00.000Z")).toEqual({ action: "apply_google", overwrote_local: false });
  });
  it("both changed and Google is later: Google wins and the local edit is written down as overwritten", () => {
    expect(decideIncoming({ ext_updated_at: seen, updated_at: "2026-11-21T10:30:00.000Z" }, "2026-11-21T11:00:00.000Z")).toEqual({ action: "apply_google", overwrote_local: true });
  });
  it("both changed at the same instant: Google wins the tie", () => {
    expect(decideIncoming({ ext_updated_at: seen, updated_at: "2026-11-21T11:00:00.000Z" }, "2026-11-21T11:00:00.000Z")).toEqual({ action: "apply_google", overwrote_local: true });
  });
  it("both changed and ours is later: ours stands and is pushed", () => {
    expect(decideIncoming({ ext_updated_at: seen, updated_at: "2026-11-21T11:30:00.000Z" }, "2026-11-21T11:00:00.000Z")).toEqual({ action: "keep_local_push" });
  });
  it("a row never synced counts as locally changed", () => {
    expect(decideIncoming({ ext_updated_at: null, updated_at: "2026-11-21T11:30:00.000Z" }, "2026-11-21T11:00:00.000Z")).toEqual({ action: "keep_local_push" });
  });
});

describe("the status line (spec §4.4)", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  it("'Last synced 3 min ago', amber past an hour, red past a day", () => {
    expect(staleness("2026-11-21T11:57:10Z", now)).toEqual({ label: "Last synced 3 min ago", level: "ok" });
    expect(staleness("2026-11-21T11:59:50Z", now)).toEqual({ label: "Last synced just now", level: "ok" });
    expect(staleness("2026-11-21T09:00:00Z", now)).toEqual({ label: "Last synced 3 h ago", level: "amber" });
    expect(staleness("2026-11-19T11:00:00Z", now)).toEqual({ label: "Last synced 2 days ago", level: "red" });
    expect(staleness("2026-11-20T11:00:00Z", now)).toEqual({ label: "Last synced 1 day ago", level: "red" });
    expect(staleness(null, now)).toEqual({ label: "Never synced", level: "never" });
  });
  it("the queue line counts what is waiting", () => {
    expect(queueLine(0)).toBeNull();
    expect(queueLine(1)).toBe("1 change waiting to reach Google");
    expect(queueLine(2)).toBe("2 changes waiting to reach Google");
  });
  it("the full-sync window is 30 days back and 18 months on", () => {
    const w = syncWindow(now);
    expect(w.timeMin).toBe("2026-10-22T12:00:00.000Z");
    expect(w.timeMax).toBe("2028-05-21T12:00:00.000Z");
  });
  it("London midnight and the next date", () => {
    expect(londonMidnight("2026-01-15")).toBe("2026-01-15T00:00:00.000Z");
    expect(londonMidnight("2026-07-15")).toBe("2026-07-14T23:00:00.000Z");
    expect(nextDate("2026-12-31")).toBe("2027-01-01");
  });
});

describe("reading a calendar's ACL (decision D7, spec §4.1)", () => {
  const allowed = ["pwhelanonline@gmail.com", "kirstykjpetco@gmail.com"];
  const phil = { role: "owner", scope: { type: "user", value: "pwhelanonline@gmail.com" } };
  const kirsty = { role: "writer", scope: { type: "user", value: "Kirstykjpetco@gmail.com" } };

  it("the two allowed addresses are not strangers, whatever their case; a removed entry (role none) is ignored", () => {
    expect(aclStrangers([phil, kirsty, { role: "none", scope: { type: "user", value: "gone@example.com" } }], allowed)).toEqual([]);
    expect(readAcl([phil, kirsty], allowed).map((e) => e.stranger)).toEqual([false, false]);
  });

  it("anyone else is a stranger and is named with what they may do", () => {
    const rules = [
      phil,
      kirsty,
      { role: "reader", scope: { type: "user", value: "dave@example.com" } },
      { role: "writer", scope: { type: "group", value: "friends@googlegroups.com" } },
      { role: "reader", scope: { type: "domain", value: "example.com" } },
      { role: "freeBusyReader", scope: { type: "default" } },
    ];
    expect(aclStrangers(rules, allowed)).toEqual([
      "dave@example.com (sees all details)",
      "the group friends@googlegroups.com (can change events)",
      "everyone at example.com (sees all details)",
      "the public (anyone with the link) (sees free/busy only)",
    ]);
  });

  it("a group or domain is a stranger even when its name is an allowed address: Mycelium cannot see who is behind it", () => {
    expect(aclStrangers([{ role: "reader", scope: { type: "group", value: "kirstykjpetco@gmail.com" } }], allowed)).toEqual(["the group kirstykjpetco@gmail.com (sees all details)"]);
  });

  it("scopes and roles are said in the Share dialog's words", () => {
    expect(describeScope({ type: "user" })).toBe("an unnamed account");
    expect(describeScope({ type: "default" })).toBe("the public (anyone with the link)");
    expect(roleWords("writer")).toBe("can change events");
    expect(roleWords("something-new")).toBe("something-new");
  });

  it("the refusal names them and says what to do next, differently on choose and in the daily check", () => {
    const choose = aclRefusal(["dave@example.com (sees all details)"], "choose");
    expect(choose).toContain("Phirsty Life may be shared with the two of you and nobody else, but this calendar is also shared with dave@example.com (sees all details).");
    expect(choose).toMatch(/then choose it again\.$/);
    const health = aclRefusal(["dave@example.com (sees all details)", "the public (anyone with the link) (sees free/busy only)"], "health");
    expect(health).toContain("dave@example.com (sees all details), the public (anyone with the link) (sees free/busy only)");
    expect(health).toMatch(/stopped writing to it; new appointments wait/);
    expect(health).toMatch(/then press Sync now\.$/);
  });
});
