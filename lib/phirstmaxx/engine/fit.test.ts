// New with the port: fit.ts has no old counterpart. Every fixture below is
// worked by hand in the comments, so a change in the numbers is a change in
// the rules, not noise.
import { describe, expect, it } from "vitest";
import type { EngineBlock, TogetherWindow, TravelMode, TravelProvider } from "../types";
import { fitThing, formatDuration, nextFit, type FitPerson, type FitThing, type OpeningHours } from "./fit";
import { addLondonDays, londonClock, londonTime } from "./time";
import { DEFAULT_BUFFERS } from "./windows";

const SAT = "2026-11-28"; // GMT, so London clock = UTC

function window(day: string, start: string, end: string): TogetherWindow {
  const s = londonTime(day, start);
  let e = londonTime(day, end);
  if (e <= s) e = londonTime(addLondonDays(day, 1), end);
  return { start: s, end: e, firmness: "firm", day };
}

function block(personId: string, day: string, start: string, end: string, kind: EngineBlock["kind"], place: string | null): EngineBlock {
  return { person_id: personId, kind, firmness: "firm", start: londonTime(day, start), end: londonTime(day, end), place_id: place };
}

const person = (id: string, blocks: EngineBlock[] = [], home = "home"): FitPerson => ({
  person: { id, buffers: DEFAULT_BUFFERS, home_place_id: home },
  blocks,
});

function lookup(table: Record<string, number>) {
  return (from: string, mode: TravelMode): { minutes: number; provider: TravelProvider } | null =>
    mode === "drive" && from in table ? { minutes: table[from], provider: "google" } : null;
}

const thing = (extra: Partial<FitThing> = {}): FitThing => ({ lat: 54.2, lng: -1.7, min_minutes: 120, max_minutes: 240, opening: null, indoor: false, ...extra });

const at = (ms: number | null) => (ms === null ? null : londonClock(ms));
const BEFORE = Date.parse("2026-11-21T12:00:00Z");

describe("fitThing — a plain Saturday", () => {
  // Window 13:00–17:30 (Kirsty busy at home until 13:00). Both start at home,
  // 50 min each way. Leave 13:00, arrive 13:50; home by 17:30 means leaving
  // at 16:40. There 13:50–16:40 = 170 min against a 120 minimum: fits.
  const people = [person("phil"), person("kirsty", [block("kirsty", SAT, "09:00", "13:00", "busy", "home")])];
  const opening: OpeningHours = { sat: [{ open: "10:00", close: "17:00" }] };
  const results = fitThing({ windows: [window(SAT, "13:00", "17:30")], people, thing: thing({ opening }), travel: lookup({ home: 50 }) });

  it("fits, together, with the times worked out", () => {
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.verdict).toBe("fits");
    expect(r.mode).toBe("together");
    expect(at(r.arrive_at)).toBe("13:50");
    expect(at(r.leave_at)).toBe("16:40");
    expect(r.minutes_there).toBe(170);
    expect(r.reason).toBe("Fits: 2 h 50 there, leave by 13:00.");
    expect(r.legs.map((l) => `${l.person_id} ${londonClock(l.leave_at)} ${l.travel_minutes} ${l.provider}`)).toEqual([
      "phil 13:00 50 google",
      "kirsty 13:00 50 google",
    ]);
  });

  it("says when it next fits", () => {
    expect(nextFit(results, BEFORE)?.text).toBe("next fits: Sat 28 Nov, 13:50–16:40, leave by 13:00");
  });
});

describe("fitThing — two start points (meet)", () => {
  // Phil's shift ends 12:45 at work (+15 buffer = 13:00), 30 min from there:
  // he could arrive 13:30. Kirsty leaves home at 13:00, 50 min: 13:50. Both
  // arrive 13:50, so Phil leaves work at 13:20. Phil sits at Nan's from
  // 17:30 (30 min buffer: there by 17:00), 25 min away: leave by 16:35.
  // Kirsty is home by 17:30, so 16:40. The earlier wins: 16:35. 165 min.
  const people = [
    person("phil", [block("phil", SAT, "08:00", "12:45", "shift", "work"), block("phil", SAT, "17:30", "21:00", "sit", "nans")]),
    person("kirsty"),
  ];
  const [r] = fitThing({ windows: [window(SAT, "13:00", "17:30")], people, thing: thing(), travel: lookup({ home: 50, work: 30, nans: 25 }) });

  it("meets there, the nearer person leaving later", () => {
    expect(r.mode).toBe("meet");
    expect(r.verdict).toBe("fits");
    expect(at(r.arrive_at)).toBe("13:50");
    expect(at(r.leave_at)).toBe("16:35");
    expect(r.minutes_there).toBe(165);
    const phil = r.legs.find((l) => l.person_id === "phil");
    const kirsty = r.legs.find((l) => l.person_id === "kirsty");
    expect(phil?.from_place_id).toBe("work");
    expect(at(phil?.leave_at ?? null)).toBe("13:20");
    expect(at(kirsty?.leave_at ?? null)).toBe("13:00");
    expect(r.reason).toBe("Fits: 2 h 45 there, leave by 13:00.");
  });
});

describe("fitThing — a window that crosses midnight", () => {
  // Saturday 20:00 to Sunday 00:30, 40 min each way: arrive 20:40, leave
  // 23:50 to be home by 00:30. Open 18:00 to 01:00 (past midnight). 190 min.
  const w = window(SAT, "20:00", "00:30");
  const people = [person("phil"), person("kirsty")];

  it("fits and still belongs to Saturday", () => {
    const [r] = fitThing({
      windows: [w],
      people,
      thing: thing({ min_minutes: 90, max_minutes: null, opening: { sat: [{ open: "18:00", close: "01:00" }] } }),
      travel: lookup({ home: 40 }),
    });
    expect(r.window.day).toBe(SAT);
    expect(r.verdict).toBe("fits");
    expect(at(r.arrive_at)).toBe("20:40");
    expect(at(r.leave_at)).toBe("23:50");
    expect(r.reason).toBe("Fits: 3 h 10 there, leave by 20:00.");
  });

  it("is cut short by an 23:00 close", () => {
    const [r] = fitThing({
      windows: [w],
      people,
      thing: thing({ min_minutes: 90, max_minutes: null, opening: { sat: [{ open: "18:00", close: "23:00" }] } }),
      travel: lookup({ home: 40 }),
    });
    expect(at(r.leave_at)).toBe("23:00");
    expect(r.minutes_there).toBe(140);
  });
});

describe("fitThing — closed", () => {
  const people = [person("phil"), person("kirsty")];
  const run = (opening: OpeningHours) =>
    fitThing({ windows: [window(SAT, "13:00", "17:30")], people, thing: thing({ opening }), travel: lookup({ home: 50 }) })[0];

  it("closed by the time you would arrive (shuts 13:30, you arrive 13:50)", () => {
    const r = run({ sat: [{ open: "10:00", close: "13:30" }] });
    expect(r.verdict).toBe("no");
    expect(r.reason).toBe("Doesn't fit: closed by the time you would arrive.");
  });

  it("closed all day", () => {
    expect(run({ sun: [{ open: "10:00", close: "16:00" }] }).reason).toBe("Doesn't fit: closed on Saturdays.");
  });

  it("opens only after you would have to leave (16:40)", () => {
    expect(run({ sat: [{ open: "17:00", close: "22:00" }] }).reason).toBe("Doesn't fit: not open until 17:00.");
  });

  it("opening late moves the arrival, not the departure", () => {
    const r = run({ sat: [{ open: "14:00", close: "22:00" }] });
    expect(at(r.arrive_at)).toBe("14:00");
    expect(r.minutes_there).toBe(160);
    // Both set off at 13:10 to arrive as it opens.
    expect(r.reason).toBe("Fits: 2 h 40 there, leave by 13:10.");
  });
});

describe("fitThing — too short, and tight", () => {
  // Same Saturday: 170 min available.
  const people = [person("phil"), person("kirsty")];
  const run = (min: number) => fitThing({ windows: [window(SAT, "13:00", "17:30")], people, thing: thing({ min_minutes: min, max_minutes: null }), travel: lookup({ home: 50 }) })[0];

  it("doesn't fit under 70% of the minimum (170 < 0.7 × 300 = 210)", () => {
    const r = run(300);
    expect(r.verdict).toBe("no");
    expect(r.reason).toBe("Doesn't fit: only 2 h 50 there, and it needs 5 h.");
  });

  it("is tight between 70% and 100% (170 against 180)", () => {
    const r = run(180);
    expect(r.verdict).toBe("tight");
    expect(r.reason).toBe("Tight: 2 h 50 there against 3 h needed, leave by 13:00.");
  });

  it("is tight when it only just makes it (5 min of slack against 165)", () => {
    const r = run(165);
    expect(r.verdict).toBe("tight");
    expect(r.reason).toBe("Tight: 2 h 50 there with little to spare, leave by 13:00.");
  });

  it("caps time there at the maximum", () => {
    const r = fitThing({ windows: [window(SAT, "13:00", "17:30")], people, thing: thing({ min_minutes: 60, max_minutes: 90 }), travel: lookup({ home: 50 }) })[0];
    expect(r.minutes_there).toBe(90);
    expect(at(r.leave_at)).toBe("15:20");
  });

  it("the journey alone can swallow the window", () => {
    const r = fitThing({ windows: [window(SAT, "13:00", "14:30")], people, thing: thing(), travel: lookup({ home: 50 }) })[0];
    expect(r.reason).toBe("Doesn't fit: the journey there and back takes up the whole window.");
  });
});

describe("fitThing — missing data and the horizon", () => {
  const people = [person("phil"), person("kirsty")];

  it("no travel time yet is a 'no' that says so", () => {
    const [r] = fitThing({ windows: [window(SAT, "13:00", "17:30")], people, thing: thing(), travel: lookup({}) });
    expect(r.verdict).toBe("no");
    expect(r.reason).toBe("Doesn't fit: there is no travel time from one of your start points yet.");
  });

  it("a window already under way is fitted from the horizon start", () => {
    const [r] = fitThing({
      windows: [window(SAT, "13:00", "17:30")],
      people,
      thing: thing(),
      travel: lookup({ home: 50 }),
      horizon: { start: londonTime(SAT, "14:00"), end: londonTime(SAT, "23:59") },
    });
    // Leave 14:00, arrive 14:50, leave 16:40: 110 min against 120 is tight.
    expect(r.verdict).toBe("tight");
    expect(at(r.arrive_at)).toBe("14:50");
  });

  it("windows outside the horizon are skipped", () => {
    const results = fitThing({
      windows: [window(SAT, "13:00", "17:30")],
      people,
      thing: thing(),
      travel: lookup({ home: 50 }),
      horizon: { start: londonTime("2026-11-29", "00:00"), end: londonTime("2026-12-31", "00:00") },
    });
    expect(results).toEqual([]);
  });
});

describe("nextFit", () => {
  const people = [person("phil"), person("kirsty")];
  // Friday 13:00–16:30: 110 min there against 120, tight. Saturday fits.
  const fri = window("2026-11-27", "13:00", "16:30");
  const sat = window(SAT, "13:00", "17:30");
  const fit = (ws: TogetherWindow[]) => fitThing({ windows: ws, people, thing: thing(), travel: lookup({ home: 50 }) });

  it("prefers a later fit over an earlier tight one", () => {
    expect(nextFit(fit([fri, sat]), BEFORE)?.text).toBe("next fits: Sat 28 Nov, 13:50–16:40, leave by 13:00");
  });

  it("falls back to tight, in words", () => {
    expect(nextFit(fit([fri]), BEFORE)?.text).toBe("next tight fit: Fri 27 Nov, 13:50–15:40, leave by 13:00");
  });

  it("is null once the time to leave has gone", () => {
    expect(nextFit(fit([sat]), londonTime(SAT, "13:05"))).toBeNull();
  });
});

describe("formatDuration", () => {
  it("reads as people say it", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(180)).toBe("3 h");
    expect(formatDuration(190)).toBe("3 h 10");
    expect(formatDuration(125)).toBe("2 h 05");
  });
});
