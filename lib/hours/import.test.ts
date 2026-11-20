import { describe, expect, it } from "vitest";
import { entryFields, planImport, planPayload, readImportFile, type Current, type ImportFile } from "./import";
import type { HoursEntry } from "./types";

// Synthetic rows only.

function dbEntry(id: string, over: Partial<HoursEntry> = {}): HoursEntry {
  return {
    id,
    entry_date: "2026-03-02",
    minutes: 60,
    estimate_minutes: null,
    description: "work",
    ticket_raw: "ABC-1",
    ticket_key: "ABC-1",
    logged: false,
    source: "import",
    source_row: null,
    deleted_at: null,
    merged_at: "2026-03-02T10:00:00Z",
    created_at: "2026-03-02T10:00:00Z",
    updated_at: "2026-03-02T10:00:00Z",
    ...over,
  };
}

const empty: Current = { settings: null, entries: [], absences: [], bankHolidays: [] };
const opts = { filename: "t.json", format: "json" as const };

describe("readImportFile", () => {
  it("accepts the seed shape and the workbook 'x' for Logged", () => {
    const f = readImportFile({ logEntries: [{ sourceRow: 5, date: "2026-03-02", minutes: 45, description: " a ", ticketRaw: "ABC-1", logged: "x" }] });
    expect(f.logEntries[0]).toMatchObject({ sourceRow: 5, date: "2026-03-02", minutes: 45, description: "a", ticketRaw: "ABC-1", logged: true });
  });
  it("refuses anything without logEntries", () => {
    expect(() => readImportFile({})).toThrow(/logEntries/);
    expect(() => readImportFile(null)).toThrow();
  });
});

describe("entryFields", () => {
  it("rejects bad dates and out-of-range minutes", () => {
    expect(entryFields({ date: "2/3/2026", minutes: 10 })).toMatchObject({ ok: false });
    expect(entryFields({ date: "2026-03-02", minutes: 1441 })).toMatchObject({ ok: false });
    expect(entryFields({ date: "2026-03-02", minutes: 10, estimateMinutes: -1 })).toMatchObject({ ok: false });
    expect(entryFields({ date: null, minutes: null, description: "open" })).toMatchObject({ ok: true });
  });
});

describe("planImport", () => {
  const file: ImportFile = {
    logEntries: [
      { sourceRow: 5, date: "2026-03-02", minutes: 60, description: "work", ticketRaw: "ABC-1", logged: false },
      { sourceRow: 6, date: "2026-03-02", minutes: 30, description: "more", ticketRaw: "https://x/browse/DEF-2?x=1", logged: true },
      { sourceRow: 7, date: null, minutes: null, description: "open", ticketRaw: "", estimateMinutes: 30 },
    ],
    absences: [{ date: "2026-03-05", type: "Annual leave", minutes: 450 }],
    bankHolidays: [{ date: "2026-12-25", name: "Christmas Day" }],
    settings: { contractedMinutesPerWeek: 2250, ticketBaseUrl: "https://x/browse/" },
    blockOut: { recipients: ["a@b.c"], subjectTemplate: "s", bodyLines: ["hi"] },
  };

  it("inserts everything into an empty space and derives the ticket key", () => {
    const plan = planImport(file, empty, opts);
    expect(plan.counts).toMatchObject({ added: 3, changed: 0, unchanged: 0, conflicts: 0, absences_added: 1, holidays_added: 1, settings_changed: 5 });
    expect(plan.entries_insert[1]).toMatchObject({ ticket_key: "DEF-2", source_row: 6, logged: true });
    expect(plan.settings).toMatchObject({ ticket_base_url: "https://x/browse/", block_out_recipients: ["a@b.c"] });
    const payload = planPayload(plan);
    expect(payload).toHaveProperty("entries_insert");
    expect(payload).not.toHaveProperty("conflicts");
  });

  it("is idempotent on sourceRow: a second load changes nothing", () => {
    const first = planImport(file, empty, opts);
    const current: Current = {
      settings: {
        id: "s",
        contracted_minutes_per_week: 2250,
        standard_day_minutes: 450,
        checkpoint_threshold_minutes: 1500,
        checkpoint_label: "Wednesday 13:00",
        tracking_start: "2026-03-02",
        review_length_weeks: 6,
        wed_minutes_before_1300: 210,
        wed_minutes_after_1300: 300,
        ticket_base_url: "https://x/browse/",
        catch_all_tickets: [],
        block_out_recipients: ["a@b.c"],
        block_out_subject_template: "s",
        block_out_body_lines: ["hi"],
        updated_at: "2026-03-02T10:00:00Z",
      },
      entries: first.entries_insert.map((e, i) => dbEntry(`e${i}`, { ...e })),
      absences: [{ id: "a", absence_date: "2026-03-05", type: "Annual leave", minutes: 450, note: "" }],
      bankHolidays: [{ id: "h", holiday_date: "2026-12-25", name: "Christmas Day" }],
    };
    const again = planImport(file, current, opts);
    expect(again.counts).toMatchObject({ added: 0, changed: 0, unchanged: 3, conflicts: 0, absences_added: 0, holidays_added: 0, settings_changed: 0 });
  });

  it("updates a row whose sourceRow matches but fields differ", () => {
    const current: Current = { ...empty, entries: [dbEntry("e1", { source_row: 5, minutes: 45 })] };
    const plan = planImport({ logEntries: [file.logEntries[0]] }, current, opts);
    expect(plan.counts).toMatchObject({ added: 0, changed: 1 });
    expect(plan.entries_update[0]).toMatchObject({ id: "e1", before: { minutes: 45 }, after: { minutes: 60 } });
  });

  it("leaves a deleted row deleted", () => {
    const current: Current = { ...empty, entries: [dbEntry("e1", { source_row: 5, deleted_at: "2026-03-03T00:00:00Z" })] };
    const plan = planImport({ logEntries: [file.logEntries[0]] }, current, opts);
    expect(plan.counts).toMatchObject({ added: 0, changed: 0, skipped_deleted: 1 });
  });

  it("matches by id, flags a conflict when the row changed after the export, and takes a resolution", () => {
    const current: Current = { ...empty, entries: [dbEntry("e1", { minutes: 45, updated_at: "2026-03-04T00:00:00Z" })] };
    const f: ImportFile = { exportedAt: "2026-03-03T00:00:00Z", logEntries: [{ id: "e1", date: "2026-03-02", minutes: 60, description: "work", ticketRaw: "ABC-1", logged: false }] };
    const plan = planImport(f, current, opts);
    expect(plan.counts).toMatchObject({ conflicts: 1, changed: 0 });
    expect(plan.conflicts[0]).toMatchObject({ id: "e1", file: { minutes: 60 }, db: { minutes: 45 } });
    expect(planImport(f, current, { ...opts, resolutions: { e1: "file" } }).counts).toMatchObject({ conflicts: 0, changed: 1 });
    expect(planImport(f, current, { ...opts, resolutions: { e1: "db" } }).counts).toMatchObject({ conflicts: 0, unchanged: 1 });
    // not changed since export: a plain update
    const older: Current = { ...empty, entries: [dbEntry("e1", { minutes: 45, updated_at: "2026-03-02T00:00:00Z" })] };
    expect(planImport(f, older, opts).counts).toMatchObject({ conflicts: 0, changed: 1 });
  });

  it("without id or sourceRow, an identical live row counts as unchanged and anything else is added", () => {
    const current: Current = { ...empty, entries: [dbEntry("e1")] };
    const paste: ImportFile = {
      logEntries: [
        { date: "2026-03-02", minutes: 60, description: "work", ticketRaw: "ABC-1" },
        { date: "2026-03-02", minutes: 60, description: "work", ticketRaw: "ABC-1" },
      ],
    };
    const plan = planImport(paste, current, { ...opts, format: "paste" });
    expect(plan.counts).toMatchObject({ unchanged: 1, added: 1 });
  });

  it("rejects an unreadable row and says which", () => {
    const plan = planImport({ logEntries: [{ sourceRow: 9, date: "bad", minutes: 1 }] }, empty, opts);
    expect(plan.rejected).toEqual([{ row: 9, reason: 'date "bad" is not YYYY-MM-DD' }]);
    expect(plan.counts.added).toBe(0);
  });
});
