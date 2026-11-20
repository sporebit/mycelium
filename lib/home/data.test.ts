import { describe, expect, it } from "vitest";
import type { TodayCard } from "@/lib/daily/view";
import { homeItems, shortTitle, weekDays } from "./data";
import { seeded, seedOf, SPECIES, specimen, speciesFor } from "./specimen";

const card = (over: Partial<TodayCard> & { item_id: string }): TodayCard => ({
  ticket_id: `t-${over.item_id}`,
  key: null,
  title: `Item ${over.item_id}`,
  project: null,
  is_win: false,
  position: 0,
  state: "planned",
  minutes: 15,
  first_step: "Open it.",
  why: null,
  left_off: null,
  timer_ends_at: null,
  timer_minutes: null,
  ...over,
});

describe("short titles for small figures", () => {
  it("leaves a short title alone and cuts a long one on a word", () => {
    expect(shortTitle("Boiler quote")).toBe("Boiler quote");
    expect(shortTitle("Reply to the installer about the boiler quote and the dates")).toBe("Reply to the installer…");
    expect(shortTitle("  spaced    out   title  ")).toBe("spaced out title");
  });
  it("cuts mid-word only when there is no sensible word to cut on", () => {
    const s = shortTitle("Supercalifragilisticexpialidocious and more");
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThanOrEqual(28);
  });
});

describe("the plan's cards as Home items", () => {
  it("keeps what is open, in progress or finished today, and drops what was set aside", () => {
    const items = homeItems([
      card({ item_id: "1", is_win: true, state: "done", project: "Organisation" }),
      card({ item_id: "2", state: "started" }),
      card({ item_id: "3", state: "planned" }),
      card({ item_id: "4", state: "not_now" }),
      card({ item_id: "5", state: "parked" }),
      card({ item_id: "6", state: "good_enough" }),
      card({ item_id: "7", state: "dropped" }),
      card({ item_id: "8", state: "moved" }),
    ]);
    expect(items.map((i) => [i.item_id, i.state])).toEqual([
      ["1", "done"],
      ["2", "started"],
      ["3", "open"],
      ["6", "done"],
    ]);
    expect(items[0]).toMatchObject({ is_win: true, section: "Organisation" });
  });

  it("gives an item the same seed every time, from its ticket", () => {
    const a = homeItems([card({ item_id: "1" })])[0];
    const b = homeItems([card({ item_id: "1", title: "renamed" })])[0];
    expect(a.seed).toBe(b.seed);
    expect(a.seed).toBe(seedOf("t-1"));
  });
});

describe("the week so far", () => {
  it("is Monday to Sunday with counts on the days things were finished", () => {
    // Friday 20 November 2026.
    const days = weekDays("2026-11-20", ["2026-11-16", "2026-11-16", "2026-11-19", "2026-11-20"]);
    expect(days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days.map((d) => d.done)).toEqual([2, 0, 0, 1, 1, 0, 0]);
    expect(days.find((d) => d.is_today)?.date).toBe("2026-11-20");
    expect(days.filter((d) => d.is_future).map((d) => d.label)).toEqual(["Sat", "Sun"]);
  });
});

describe("specimens", () => {
  it("there are five species, each with a cap colour and a name", () => {
    expect(SPECIES).toHaveLength(5);
    for (const s of SPECIES) {
      expect(s.cap).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.capD.startsWith("M")).toBe(true);
      expect(s.stemD.startsWith("M")).toBe(true);
    }
  });

  it("the same seed draws the same specimen, on the server and in the browser", () => {
    expect(specimen(2, 12345)).toEqual(specimen(2, 12345));
    expect(specimen(2, 12345).roots).not.toBe(specimen(2, 54321).roots);
    const r = seeded(7);
    const first = [r(), r(), r()];
    const again = seeded(7);
    expect([again(), again(), again()]).toEqual(first);
  });

  it("a small figure leaves out the fine work", () => {
    const small = specimen(0, 99, { detail: false });
    expect(small.hatch).toBe("");
    expect(small.stipple).toBe("");
    expect(small.gills).toBe("");
    expect(small.roots.length).toBeGreaterThan(20);
    const large = specimen(0, 99);
    expect(large.hatch.length).toBeGreaterThan(20);
    expect(large.stipple.length).toBeGreaterThan(200);
  });

  it("every path it draws is plain path data: no NaN, nothing undefined", () => {
    for (let s = 0; s < SPECIES.length; s++) {
      const p = specimen(s, s * 1000 + 3);
      for (const v of [p.gills, p.hatch, p.stipple, p.spots, p.roots, p.ground]) expect(v).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("a species per item, the same one every time, whatever its section", () => {
    expect(speciesFor("Organisation", 7)).toBe(7 % SPECIES.length);
    expect(speciesFor(null, 7)).toBe(speciesFor("Work", 7));
    expect(speciesFor("", 8)).toBe(8 % SPECIES.length);
    // Five items in one project are not five of the same mushroom.
    expect(new Set([0, 1, 2, 3, 4].map((n) => speciesFor("General", n))).size).toBe(SPECIES.length);
  });
});
