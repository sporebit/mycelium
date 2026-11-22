import { describe, expect, it } from "vitest";
import { londonTime } from "./engine";
import { allLegsInWords, leaveByClock, legsFromFit, legsInWords } from "./legs";
import type { FitResult } from "./types";

const t = (hhmm: string) => londonTime("2026-11-28", hhmm);

const fit: FitResult = {
  verdict: "fits",
  reason: "Fits: 3 h 25 there, leave by 12:10.",
  window: { start: t("12:00"), end: t("18:00"), firmness: "firm", day: "2026-11-28" },
  legs: [
    { person_id: "phil", from_place_id: "home-p", leave_at: t("12:10"), travel_minutes: 55, arrive_at: t("13:05"), mode: "drive", provider: "ors" },
    { person_id: "kirsty", from_place_id: "home-k", leave_at: t("12:25"), travel_minutes: 40, arrive_at: t("13:05"), mode: "drive", provider: "estimate" },
  ],
  arrive_at: t("13:05"),
  leave_at: t("16:30"),
  minutes_there: 205,
  mode: "meet",
};

describe("legs from a fit result (spec §7: leave-by, travel, arrive, time there, home)", () => {
  it("makes five rows per person, in order, with the way back read as the way there", () => {
    const legs = legsFromFit(fit, { from: { "home-p": "Home", "home-k": "Kirsty's" }, thing: "Hackfall Woods" });
    expect(legs.map((l) => `${l.person_id}:${l.position}:${l.kind}`)).toEqual([
      "phil:0:leave", "phil:1:travel", "phil:2:arrive", "phil:3:there", "phil:4:home",
      "kirsty:0:leave", "kirsty:1:travel", "kirsty:2:arrive", "kirsty:3:there", "kirsty:4:home",
    ]);
    const home = legs.find((l) => l.person_id === "phil" && l.kind === "home")!;
    expect(home.minutes).toBe(55);
    expect(home.ends_at).toBe(new Date(t("17:25")).toISOString());
    expect(home.from_label).toBe("Hackfall Woods");
    expect(home.to_label).toBe("Home");
    expect(legs.find((l) => l.kind === "travel")!.provider).toBe("ors");
  });

  it("says nothing for a result that does not fit", () => {
    expect(legsFromFit({ ...fit, verdict: "no", legs: [], arrive_at: null, leave_at: null })).toEqual([]);
  });

  it("reads as one line", () => {
    const legs = legsFromFit(fit, { thing: "Hackfall Woods" }).map((l) => ({ ...l, plan_id: "p1" }));
    expect(legsInWords(legs.filter((l) => l.person_id === "phil"))).toBe("Leave by 12:10 · 55 min drive · there 13:05–16:30 · home by 17:25");
    expect(leaveByClock(legs)).toBe("12:10");
  });

  it("names each person when they start apart, and collapses to one line when the words are the same", () => {
    const legs = legsFromFit(fit).map((l) => ({ ...l, plan_id: "p1" }));
    expect(allLegsInWords(legs, { phil: "Phil", kirsty: "Kirsty" })).toBe("Phil: Leave by 12:10 · 55 min drive · there 13:05–16:30 · home by 17:25\nKirsty: Leave by 12:25 · 40 min drive · there 13:05–16:30 · home by 17:10");
    const together = legsFromFit({ ...fit, legs: fit.legs.map((l) => ({ ...l, leave_at: t("12:10"), travel_minutes: 55 })) }).map((l) => ({ ...l, plan_id: "p1" }));
    expect(allLegsInWords(together, { phil: "Phil", kirsty: "Kirsty" })).toBe("Leave by 12:10 · 55 min drive · there 13:05–16:30 · home by 17:25");
  });
});
