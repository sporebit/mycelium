import { describe, expect, it } from "vitest";
import { ago, lasted, nextSide, span, summarise, tapToRow, type LogRow } from "./babylog";
import { parseFamilyCapture } from "./capture";
import { fileKind } from "./files";
import { LETTER_QUESTIONS, offsetFor, questionFor, weekIndex, weekStart } from "./letters";
import { listTotals, monthMoney, nextBinDay, parseBinSchedule, parsePounds, pounds } from "./money";
import { dueReminders, letterPromptDue, reminderKey, reminderWords, type Appointment } from "./remind";
import { STARTER_LISTS } from "./starter";
import { babyAge, pregnancyOn, signpostsFor, weekOf } from "./weeks";

describe("pregnancy weeks from the due date", () => {
  it("counts completed weeks and days the way a midwife writes them", () => {
    // due 2027-06-01: forty weeks earlier is 2026-08-25
    expect(pregnancyOn("2027-06-01", "2026-08-25")).toMatchObject({ week: 0, day: 0, label: "0+0", trimester: 1, days_to_go: 280 });
    expect(pregnancyOn("2027-06-01", "2026-11-20")).toMatchObject({ week: 12, day: 3, label: "12+3", trimester: 1 });
    expect(pregnancyOn("2027-06-01", "2026-11-24")).toMatchObject({ week: 13, day: 0, trimester: 2 });
    expect(pregnancyOn("2027-06-01", "2027-03-09")).toMatchObject({ week: 28, day: 0, trimester: 3 });
    expect(pregnancyOn("2027-06-01", "2027-06-01")).toMatchObject({ week: 40, day: 0, days_to_go: 0, past_due: false, progress: 1 });
  });

  it("carries on past the due date for three weeks, then stops guessing", () => {
    expect(pregnancyOn("2027-06-01", "2027-06-08")).toMatchObject({ week: 41, day: 0, days_to_go: -7, past_due: true });
    expect(pregnancyOn("2027-06-01", "2027-06-30")).toBeNull();
  });

  it("gives nothing for a date that cannot be a pregnancy, or is not a date", () => {
    expect(pregnancyOn("2028-12-01", "2026-11-20")).toBeNull();
    expect(pregnancyOn("soon", "2026-11-20")).toBeNull();
    expect(pregnancyOn("2027-02-30", "2026-11-20")).toBeNull();
  });

  it("labels a timeline entry with the week it fell in", () => {
    expect(weekOf("2027-06-01", "2026-11-20")).toBe(12);
    expect(weekOf(null, "2026-11-20")).toBeNull();
    expect(weekOf("2027-06-01", "2025-01-01")).toBeNull();
  });

  it("signposts only what the standard schedule puts in that week", () => {
    expect(signpostsFor(12).join(" ")).toContain("dating scan");
    expect(signpostsFor(20).join(" ")).toContain("anomaly");
    expect(signpostsFor(20).join(" ")).toContain("MAT B1");
    expect(signpostsFor(5)).toEqual([]);
  });
});

describe("the baby's age", () => {
  it("is in days, then weeks, then months", () => {
    expect(babyAge("2027-06-01", "2027-06-01")?.label).toBe("born today");
    expect(babyAge("2027-06-01", "2027-06-02")?.label).toBe("1 day old");
    expect(babyAge("2027-06-01", "2027-06-10")?.label).toBe("9 days old");
    expect(babyAge("2027-06-01", "2027-06-22")?.label).toBe("3 weeks old");
    expect(babyAge("2027-06-01", "2027-09-30")?.label).toBe("3 months old");
    expect(babyAge("2027-06-15", "2027-10-14")?.label).toBe("3 months old");
    expect(babyAge("2027-06-01", "2027-05-01")).toBeNull();
  });
});

describe("the baby log", () => {
  const now = new Date("2027-06-10T14:00:00Z");
  const dayStart = new Date("2027-06-09T23:00:00Z"); // midnight in London, in summer
  const row = (kind: LogRow["kind"], started_at: string, detail: Record<string, unknown> = {}, ended_at: string | null = null): LogRow => ({ id: started_at + kind, kind, started_at, ended_at, detail, note: null, created_by: null });

  it("turns one tap into one row", () => {
    expect(tapToRow({ kind: "feed", how: "left" }, now)).toEqual({ ok: true, row: { kind: "feed", started_at: now.toISOString(), detail: { how: "left" }, note: null } });
    expect(tapToRow({ kind: "feed", how: "bottle", ml: 89.6 }, now)).toMatchObject({ ok: true, row: { detail: { how: "bottle", ml: 90 } } });
    expect(tapToRow({ kind: "nappy", what: "both" }, now)).toMatchObject({ ok: true, row: { detail: { what: "both" } } });
    expect(tapToRow({ kind: "sleep" }, now)).toMatchObject({ ok: true, row: { kind: "sleep", detail: {} } });
  });

  it("takes a tap put in late, and refuses one from the future or last week", () => {
    expect(tapToRow({ kind: "nappy", at: "2027-06-10T13:20:00Z" }, now)).toMatchObject({ ok: true, row: { started_at: "2027-06-10T13:20:00.000Z" } });
    expect(tapToRow({ kind: "nappy", at: "2027-06-10T15:00:00Z" }, now)).toMatchObject({ ok: false });
    expect(tapToRow({ kind: "nappy", at: "2027-06-01T15:00:00Z" }, now)).toMatchObject({ ok: false });
    expect(tapToRow({ kind: "feed", how: "spoon" }, now)).toMatchObject({ ok: false });
    expect(tapToRow({ kind: "feed", ml: 0 }, now)).toMatchObject({ ok: false });
    expect(tapToRow({ kind: "bath" }, now)).toMatchObject({ ok: false });
  });

  it("adds up today: feeds, nappies, and sleep only for the part that falls in today", () => {
    const s = summarise(
      [
        row("feed", "2027-06-10T12:30:00Z", { how: "right" }),
        row("feed", "2027-06-10T09:00:00Z", { how: "bottle", ml: 90 }),
        row("feed", "2027-06-09T21:00:00Z", { how: "left" }), // yesterday
        row("nappy", "2027-06-10T12:45:00Z", { what: "both" }),
        row("nappy", "2027-06-10T08:00:00Z", { what: "wet" }),
        row("sleep", "2027-06-09T21:30:00Z", {}, "2027-06-10T02:00:00Z"), // 3 h of it is today
        row("sleep", "2027-06-10T13:00:00Z"), // still asleep: an hour so far
      ],
      now,
      dayStart,
    );
    expect(s.last_feed).toMatchObject({ minutes_ago: 90, how: "right" });
    expect(s.last_nappy).toMatchObject({ minutes_ago: 75, what: "both" });
    expect(s.asleep).toMatchObject({ minutes: 60 });
    expect(s.today).toEqual({ feeds: 2, bottle_ml: 90, wet: 2, dirty: 1, sleep_minutes: 240 });
  });

  it("an empty log is all nulls and zeroes", () => {
    expect(summarise([], now, dayStart)).toEqual({ last_feed: null, last_nappy: null, asleep: null, today: { feeds: 0, bottle_ml: 0, wet: 0, dirty: 0, sleep_minutes: 0 } });
  });

  it("says how long ago in plain words, and offers the other side next", () => {
    expect([span(0), span(45), span(60), span(130)]).toEqual(["just now", "45 min", "1 h", "2 h 10 min"]);
    expect([ago(0), ago(45), ago(130)]).toEqual(["just now", "45 min ago", "2 h 10 min ago"]);
    expect([lasted(0), lasted(45)]).toEqual(["0 min", "45 min"]);
    expect([nextSide("left"), nextSide("right"), nextSide(null), nextSide("bottle")]).toEqual(["right", "left", "left", "left"]);
  });
});

describe("household money", () => {
  it("reads and writes pounds", () => {
    expect([pounds(1250), pounds(125000), pounds(5), pounds(0)]).toEqual(["£12.50", "£1,250", "£0.05", "£0"]);
    expect([parsePounds("12"), parsePounds("12.5"), parsePounds("£1,250.00"), parsePounds(3.2)]).toEqual([1200, 1250, 125000, 320]);
    expect([parsePounds("twelve"), parsePounds("-3"), parsePounds("1.234"), parsePounds(null)]).toEqual([null, null, null, null]);
  });

  it("keeps a list's running total: all of it, what is bought, what is left, what has no price", () => {
    expect(
      listTotals([
        { price_pence: 60000, qty: 1, bought: true },
        { price_pence: 1200, qty: 3, bought: false },
        { price_pence: null, qty: 1, bought: false },
        { price_pence: null, qty: 1, bought: true },
      ]),
    ).toEqual({ items: 4, bought: 2, total_pence: 63600, spent_pence: 60000, left_pence: 3600, unpriced: 1 });
  });

  it("says who paid what in a month, and what would even it up between two", () => {
    const m = monthMoney(
      [
        { amount_pence: 10000, paid_by: "phil", paid_on: "2027-06-03", category: "bill" },
        { amount_pence: 4000, paid_by: "kirsty", paid_on: "2027-06-12", category: "baby" },
        { amount_pence: 2000, paid_by: null, paid_on: "2027-06-20", category: "baby" },
        { amount_pence: 99900, paid_by: "phil", paid_on: "2027-05-30", category: "house" }, // last month
      ],
      "2027-06",
      ["phil", "kirsty"],
    );
    expect(m.total_pence).toBe(16000);
    expect(m.by_category).toEqual({ bill: 10000, baby: 6000 });
    expect(m.shares.find((s) => s.person === "phil")).toEqual({ person: "phil", paid_pence: 10000, over_pence: 3000 });
    expect(m.shares.find((s) => s.person === "kirsty")).toEqual({ person: "kirsty", paid_pence: 4000, over_pence: -3000 });
    expect(m.even_up).toEqual({ from: "kirsty", to: "phil", pence: 3000 });
  });

  it("someone who has paid nothing still has a share; with nothing paid there is nothing to even up", () => {
    const m = monthMoney([{ amount_pence: 5000, paid_by: "phil", paid_on: "2027-06-03", category: "food" }], "2027-06", ["phil", "kirsty"]);
    expect(m.even_up).toEqual({ from: "kirsty", to: "phil", pence: 2500 });
    expect(monthMoney([], "2027-06", ["phil", "kirsty"]).even_up).toBeNull();
  });

  it("finds the next bin day from any date it was collected on", () => {
    const fortnightly = parseBinSchedule({ weekday: 4, every_weeks: 2, anchor_on: "2026-11-05" })!;
    expect(nextBinDay(fortnightly, "2026-11-05")).toBe("2026-11-05");
    expect(nextBinDay(fortnightly, "2026-11-06")).toBe("2026-11-19");
    expect(nextBinDay(fortnightly, "2026-11-20")).toBe("2026-12-03");
    expect(nextBinDay(fortnightly, "2026-10-01")).toBe("2026-11-05");
    expect(parseBinSchedule({ weekday: 9, every_weeks: 2, anchor_on: "2026-11-05" })).toBeNull();
    expect(parseBinSchedule({ weekday: 4, every_weeks: 2 })).toBeNull();
  });
});

describe("letters to the baby", () => {
  it("has a year of different questions, each one a question or an invitation", () => {
    expect(LETTER_QUESTIONS.length).toBeGreaterThanOrEqual(52);
    expect(new Set(LETTER_QUESTIONS).size).toBe(LETTER_QUESTIONS.length);
    for (const q of LETTER_QUESTIONS) expect(q.length, q).toBeLessThan(140);
  });

  it("asks one question all week and a different one the next, with no repeat for a year", () => {
    expect(weekStart("2026-11-20")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(questionFor("2026-11-16").question).toBe(questionFor("2026-11-22").question);
    const seen = new Set<string>();
    for (let w = 0; w < LETTER_QUESTIONS.length; w++) seen.add(questionFor(new Date(Date.parse("2026-11-16T00:00:00Z") + w * 7 * 86_400_000).toISOString().slice(0, 10), 7).question);
    expect(seen.size).toBe(LETTER_QUESTIONS.length);
    expect(weekIndex("2025-12-29")).toBe(-1);
    expect(questionFor("2025-12-29").question).toBe(LETTER_QUESTIONS[LETTER_QUESTIONS.length - 1]);
  });

  it("starts each household somewhere of its own", () => {
    const a = offsetFor("3f2a1c9e-0b7d-4e5f-8a9b-0c1d2e3f4a5b");
    expect(a).toBe(offsetFor("3f2a1c9e-0b7d-4e5f-8a9b-0c1d2e3f4a5b"));
    expect(a).not.toBe(offsetFor("7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b"));
  });
});

describe("what the family space keeps", () => {
  it("starter lists are filled in, with no prices and nothing twice", () => {
    expect(STARTER_LISTS.map((l) => l.slug)).toEqual(["hospital-bag", "nursery", "buying"]);
    for (const l of STARTER_LISTS) {
      expect(l.items.length).toBeGreaterThan(8);
      expect(new Set(l.items).size).toBe(l.items.length);
    }
  });

  it("pictures, PDFs and recordings are kept; anything else is not", () => {
    expect(fileKind("image/jpeg")).toMatchObject({ ext: "jpg", group: "image" });
    expect(fileKind("audio/mp4; codecs=mp4a")).toMatchObject({ ext: "m4a", group: "audio" });
    expect(fileKind("application/pdf")).toMatchObject({ group: "document" });
    expect(fileKind("application/zip")).toBeNull();
    expect(fileKind("text/html")).toBeNull();
    expect(fileKind(null)).toBeNull();
  });
});

describe("what the family space says unprompted", () => {
  const ME = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
  const appt = (starts_at: string, created_at: string, reminded: Record<string, unknown> = {}): Appointment => ({ id: starts_at, title: "Anomaly scan", starts_at, place: "Maternity unit", reminded, created_at });
  const which = (entries: Appointment[], now: string) => dueReminders(entries, new Date(now), ME).map((d) => d.which);

  it("reminds the evening before, from six o'clock London time, once", () => {
    const a = appt("2026-11-24T08:30:00Z", "2026-11-10T10:00:00Z");
    expect(which([a], "2026-11-23T17:55:00Z")).toEqual([]);
    expect(which([a], "2026-11-23T18:00:00Z")).toEqual(["day_before"]);
    expect(which([a], "2026-11-22T19:00:00Z"), "two evenings before is too early").toEqual([]);
    expect(which([appt(a.starts_at, a.created_at, { [reminderKey("day_before", ME)]: "2026-11-23T18:00:00Z" })], "2026-11-23T18:15:00Z")).toEqual([]);
    // the other person's reminder having gone does not count as mine
    expect(which([appt(a.starts_at, a.created_at, { [reminderKey("day_before", "f218ed69-6cbf-49ea-908a-8826f2f1178a")]: "x" })], "2026-11-23T18:15:00Z")).toEqual(["day_before"]);
  });

  it("reminds two hours before, and not for something that has started", () => {
    const a = appt("2026-11-24T08:30:00Z", "2026-11-10T10:00:00Z");
    expect(which([a], "2026-11-24T06:25:00Z")).toEqual([]);
    expect(which([a], "2026-11-24T06:30:00Z")).toEqual(["two_hours"]);
    expect(which([a], "2026-11-24T08:30:00Z")).toEqual([]);
    expect(which([a], "2026-11-24T09:00:00Z")).toEqual([]);
  });

  it("says nothing about a moment that had already come when the appointment was written down", () => {
    // booked an hour ahead
    expect(which([appt("2026-11-24T08:30:00Z", "2026-11-24T07:30:00Z")], "2026-11-24T07:35:00Z")).toEqual([]);
    // written down at nine the evening before: no evening-before reminder, but the two-hour one still comes
    const late = appt("2026-11-24T08:30:00Z", "2026-11-23T21:00:00Z");
    expect(which([late], "2026-11-23T21:15:00Z")).toEqual([]);
    expect(which([late], "2026-11-24T06:45:00Z")).toEqual(["two_hours"]);
  });

  it("uses London's evening in summer too", () => {
    const a = appt("2027-06-15T09:00:00Z", "2027-06-01T10:00:00Z"); // 10:00 BST
    expect(which([a], "2027-06-14T16:55:00Z")).toEqual([]); // 17:55 BST
    expect(which([a], "2027-06-14T17:00:00Z")).toEqual(["day_before"]); // 18:00 BST
  });

  it("words a reminder with the time in London and the place", () => {
    const [d] = dueReminders([appt("2027-06-15T09:00:00Z", "2027-06-01T10:00:00Z")], new Date("2027-06-14T17:00:00Z"), ME);
    expect(reminderWords(d)).toEqual({ title: "Tomorrow: Anomaly scan, 10:00", body: "Maternity unit" });
  });

  it("offers the week's letter question on Sunday evening and at no other time", () => {
    expect(letterPromptDue(new Date("2026-11-22T18:00:00Z"))).toBe(true); // a Sunday
    expect(letterPromptDue(new Date("2026-11-22T17:59:00Z"))).toBe(false);
    expect(letterPromptDue(new Date("2026-11-21T19:00:00Z"))).toBe(false); // Saturday
    expect(letterPromptDue(new Date("2026-11-23T00:30:00Z"))).toBe(false); // Monday already
  });
});

describe("a capture addressed to the family", () => {
  it("is one that names the family first, however it is punctuated", () => {
    expect(parseFamilyCapture("Family: felt the first kick tonight")).toEqual({ title: "Felt the first kick tonight", body: null });
    expect(parseFamilyCapture("for the baby, we chose the green paint.")).toEqual({ title: "We chose the green paint", body: null });
    expect(parseFamilyCapture("Baby - 20 week scan all fine. Heartbeat was 150. Next one is in March.")).toEqual({ title: "20 week scan all fine", body: "Heartbeat was 150. Next one is in March." });
    expect(parseFamilyCapture("  family timeline: booked the antenatal class")?.title).toBe("Booked the antenatal class");
  });

  it("is not one that merely mentions them, or says nothing after the opening", () => {
    expect(parseFamilyCapture("Book a family holiday")).toBeNull();
    expect(parseFamilyCapture("The baby monitor needs batteries")).toBeNull();
    expect(parseFamilyCapture("Family dinner on Sunday: bring wine")).toBeNull();
    expect(parseFamilyCapture("Family:")).toBeNull();
    expect(parseFamilyCapture("Buy nappies")).toBeNull();
  });

  it("keeps a long ramble whole and gives it a short line to go by", () => {
    const long = "Family: " + "we walked round the park and talked about names for an hour and a half ".repeat(3);
    const p = parseFamilyCapture(long)!;
    expect(p.title.length).toBeLessThanOrEqual(121);
    expect(p.title.endsWith("…")).toBe(true);
    expect(p.body).toContain("for an hour and a half we walked");
  });
});
