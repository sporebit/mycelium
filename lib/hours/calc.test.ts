import { describe, expect, it } from "vitest";
import {
  addDays,
  bannerText,
  buildIndex,
  bundleTotals,
  byTicket,
  checkpoint,
  dayTotals,
  entryState,
  fmtBoth,
  fmtHm,
  fmtPct,
  fridayText,
  historyRows,
  mondayOf,
  pace,
  parseDuration,
  todayPanel,
  tradeOffTable,
  weekSummary,
  weekdayIndex,
} from "./calc";
import type { HoursBundle, HoursEntry } from "./types";

// Synthetic data only: the real seed is private and never enters a test.

let seq = 0;
function entry(date: string | null, minutes: number | null, extra: Partial<HoursEntry> = {}): HoursEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    entry_date: date,
    minutes,
    estimate_minutes: null,
    description: "work",
    ticket_raw: "https://x/browse/ABC-1",
    ticket_key: "ABC-1",
    logged: true,
    source: "manual",
    source_row: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

function bundle(entries: HoursEntry[], extra: Partial<HoursBundle> = {}): HoursBundle {
  return {
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
      block_out_recipients: [],
      block_out_subject_template: "",
      block_out_body_lines: [],
      updated_at: "2026-01-01T00:00:00Z",
    },
    entries,
    absences: [],
    bankHolidays: [],
    ...extra,
  };
}

// Week of Monday 2026-03-02: Mon 10:00, Tue 9:00, Wed 8:30 (+ Thu nothing)
const MON = "2026-03-02";
const TUE = "2026-03-03";
const WED = "2026-03-04";
const THU = "2026-03-05";
const FRI = "2026-03-06";

describe("durations", () => {
  it("formats h:mm and the display pair", () => {
    expect(fmtHm(2020)).toBe("33:40");
    expect(fmtHm(0)).toBe("0:00");
    expect(fmtHm(562.5)).toBe("9:23");
    expect(fmtHm(-70)).toBe("-1:10");
    expect(fmtBoth(2020)).toBe("33:40 (33.67h)");
    expect(fmtPct(2020 / 2250)).toBe("90%");
  });

  it("parses what a person types", () => {
    expect(parseDuration("0:45")).toBe(45);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("25:00")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });
});

describe("dates", () => {
  it("knows Mondays and weekday indexes", () => {
    expect(weekdayIndex(MON)).toBe(0);
    expect(weekdayIndex("2026-03-08")).toBe(6);
    expect(mondayOf(THU)).toBe(MON);
    expect(mondayOf("2026-03-08")).toBe(MON);
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("day and week totals", () => {
  const b = bundle(
    [
      entry(MON, 600),
      entry(TUE, 540, { logged: false }),
      entry(WED, 510),
      entry(THU, null, { description: "open item", estimate_minutes: 30 }),
    ],
    { absences: [{ id: "a", absence_date: THU, type: "Annual leave", minutes: 450, note: "" }] },
  );

  it("credits an absence and a bank holiday into the day total", () => {
    const idx = buildIndex(b, FRI);
    expect(dayTotals(idx, MON)).toMatchObject({ logged: 600, credited: 0, total: 600, loggedTicked: 600, notYetLogged: 0 });
    expect(dayTotals(idx, TUE)).toMatchObject({ logged: 540, loggedTicked: 0, notYetLogged: 540 });
    expect(dayTotals(idx, THU)).toMatchObject({ logged: 0, credited: 450, total: 450, hasAbsence: true });
    const idx2 = buildIndex(bundle([], { bankHolidays: [{ id: "h", holiday_date: MON, name: "Test" }] }), FRI);
    expect(dayTotals(idx2, MON)).toMatchObject({ credited: 450, isBankHoliday: true });
  });

  it("sums the week and derives remaining, surplus and not-yet-logged", () => {
    const ws = weekSummary(buildIndex(b, FRI), MON, FRI);
    expect(ws.banked).toBe(600 + 540 + 510 + 450);
    expect(ws.remaining).toBe(2250 - 2100);
    expect(ws.surplusLost).toBe(0);
    expect(ws.notYetLogged).toBe(540);
    expect(ws.friWorked).toBe(0);
    expect(ws.stillOutstanding).toBe(150);
  });

  it("ignores deleted entries and undated ones for day totals", () => {
    const idx = buildIndex(bundle([entry(MON, 100, { deleted_at: "2026-03-03T00:00:00Z" }), entry(null, 50)]), FRI);
    expect(dayTotals(idx, MON).total).toBe(0);
    expect(bundleTotals(idx).withTime).toBe(1);
  });
});

describe("week status", () => {
  const met = bundle([entry(MON, 600), entry(TUE, 600), entry(WED, 600), entry(THU, 460)]);
  const short = bundle([entry(MON, 600), entry(TUE, 600), entry(WED, 600)]);
  const covered = bundle([entry(MON, 600), entry(TUE, 600), entry(WED, 600), entry(FRI, 450)]);

  it("is blank for a future week and In progress until Thursday has passed", () => {
    expect(weekSummary(buildIndex(short, "2026-02-20"), MON, "2026-02-20").status).toBe("");
    expect(weekSummary(buildIndex(short, THU), MON, THU).status).toBe("In progress");
    expect(weekSummary(buildIndex(short, FRI), MON, FRI).status).toBe("Short");
  });

  it("is Met when banked reaches the target, with the surplus lost", () => {
    const ws = weekSummary(buildIndex(met, FRI), MON, FRI);
    expect(ws.status).toBe("Met");
    expect(ws.surplusLost).toBe(10);
    expect(ws.remaining).toBe(0);
  });

  it("is Covered on Friday when Friday's hours reach the shortfall (O2)", () => {
    const ws = weekSummary(buildIndex(covered, "2026-03-09"), MON, "2026-03-09");
    expect(ws.status).toBe("Covered on Friday");
    expect(ws.stillOutstanding).toBe(0);
    expect(fridayText(ws)).toBe("SHORTFALL COVERED");
  });

  it("lists one row per week from the tracking start to the current week", () => {
    const rows = historyRows(buildIndex(short, "2026-03-18"), "2026-03-18");
    expect(rows.map((r) => r.monday)).toEqual([MON, "2026-03-09", "2026-03-16"]);
    expect(rows.map((r) => r.status)).toEqual(["Short", "Short", "In progress"]);
  });
});

describe("dashboard pieces", () => {
  const b = bundle([entry(MON, 600), entry(TUE, 540), entry(WED, 200)]);

  it("banner", () => {
    const idx = buildIndex(b, WED);
    expect(bannerText(weekSummary(idx, MON, WED))).toBe("15:10 LEFT TO WORK THIS WEEK");
    const near = buildIndex(bundle([entry(MON, 2200)]), WED);
    expect(bannerText(weekSummary(near, MON, WED))).toBe("ALMOST THERE - 0:50 LEFT THIS WEEK");
    const done = buildIndex(bundle([entry(MON, 2250)]), WED);
    expect(bannerText(weekSummary(done, MON, WED))).toBe("STOP - 37:30 MET, FRIDAY IS CLEAR");
  });

  it("today panel paces the rest of the target over the days left, including today", () => {
    const idx = buildIndex(b, WED);
    const ws = weekSummary(idx, MON, WED);
    const t = todayPanel(idx, ws, WED);
    expect(t.daysLeftInclToday).toBe(2);
    expect(t.evenPaceToday).toBe((2250 - 1140) / 2);
    expect(t.leftToday).toBe(555 - 200);
    expect(t.pill).toBe("KEEP GOING - 5:55 LEFT TODAY");
  });

  it("today panel counts a credited day as done (the workbook bug the spec names)", () => {
    const leave = bundle([entry(MON, 600), entry(TUE, 540)], { absences: [{ id: "a", absence_date: WED, type: "Annual leave", minutes: 450, note: "" }] });
    const idx = buildIndex(leave, WED);
    const t = todayPanel(idx, weekSummary(idx, MON, WED), WED);
    // even pace is 555 and the day already carries 450; 1:45 left, not 9:15
    expect(t.leftToday).toBe(105);
  });

  it("today panel outside Mon-Thu and when the week is met", () => {
    const idx = buildIndex(b, FRI);
    expect(todayPanel(idx, weekSummary(idx, MON, FRI), FRI).pill).toBe("OUTSIDE MON-THU");
    const done = buildIndex(bundle([entry(MON, 2250)]), TUE);
    expect(todayPanel(done, weekSummary(done, MON, TUE), TUE).pill).toBe("WEEK COMPLETE - STOP");
  });

  it("checkpoint", () => {
    const idx = buildIndex(b, WED);
    const ws = weekSummary(idx, MON, WED);
    expect(checkpoint(ws, 1500)).toEqual({ shortfall: 160, send: false, pill: "HOLD - 2:40 SHORT" });
    expect(checkpoint(ws, 1200).pill).toBe("SEND BLOCK-OUT");
  });

  it("pace to Thursday and including Friday", () => {
    const idx = buildIndex(b, TUE);
    const ws = weekSummary(idx, MON, TUE);
    expect(pace(ws, TUE)).toEqual({ toThursday: 910 / 2, inclFriday: 910 / 3 });
    expect(pace(ws, THU).toThursday).toBeNull();
    expect(pace(ws, FRI)).toEqual({ toThursday: null, inclFriday: null });
  });

  it("trade-off table", () => {
    const idx = buildIndex(b, WED);
    expect(tradeOffTable(idx.settings)).toEqual([
      { threshold: 1200, mon: 495, tue: 495, wed: 510, thu: 750 },
      { threshold: 1350, mon: 570, tue: 570, wed: 510, thu: 600 },
      { threshold: 1500, mon: 645, tue: 645, wed: 510, thu: 450 },
    ]);
  });
});

describe("entry state and by ticket", () => {
  it("colours", () => {
    expect(entryState(entry(MON, 30))).toBe("green");
    expect(entryState(entry(MON, 30, { logged: false }))).toBe("amber");
    expect(entryState(entry(MON, 30, { ticket_raw: "", ticket_key: null }))).toBe("red");
    expect(entryState(entry(MON, 30, { description: "" }))).toBe("red");
    expect(entryState(entry(MON, null))).toBe("open");
  });

  it("groups by key, largest first, with a No ticket total and % of the target", () => {
    const idx = buildIndex(
      bundle([
        entry(MON, 60, { ticket_key: "A-1", description: "first" }),
        entry(TUE, 30, { ticket_key: "A-1", logged: false, description: "second" }),
        entry(TUE, 120, { ticket_key: "B-2" }),
        entry(WED, 15, { ticket_key: null, ticket_raw: "" }),
        entry("2026-03-10", 500, { ticket_key: "C-3" }),
      ]),
      WED,
    );
    const t = byTicket(idx, MON, "2026-03-08", 2250);
    expect(t.rows.map((r) => [r.key, r.minutes, r.notYetLogged, r.description])).toEqual([
      ["B-2", 120, 0, "work"],
      ["A-1", 90, 30, "first"],
    ]);
    expect(t.noTicket).toBe(15);
    expect(t.rows[0].pct).toBeCloseTo(120 / 2250);
    const all = byTicket(idx, null, null, null);
    expect(all.total).toBe(725);
    expect(all.rows[0].pct).toBeCloseTo(500 / 725);
  });
});
