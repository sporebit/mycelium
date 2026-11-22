import { describe, expect, it } from "vitest";
import { bestMode, distanceKm, estimateLegMinutes, overrideKey, planDay, pointKey, speedKmh, travelMinutes, type Point } from "./travel";

// Approximate North Yorkshire geography for realistic-ish numbers.
const philHome: Point = { key: "phil-home", label: "Phil", lat: 54.52, lng: -1.55 };
const kirstyHome: Point = { key: "kirsty-home", label: "Kirsty", lat: 54.48, lng: -1.62 };
const pub: Point = { key: "pub", label: "The Anchor", lat: 54.49, lng: -1.6 };
const whitby: Point = { key: "whitby", label: "Whitby", lat: 54.486, lng: -0.614 };
const unknown: Point = { key: "nowhere", label: "Nowhere", lat: null, lng: null };

const homes = { a: { start: philHome, home: philHome }, b: { start: kirstyHome, home: kirstyHome } };

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    const here = { lat: 54.52, lng: -1.55 };
    expect(distanceKm(here, here)).toBe(0);
  });
  it("gets London–Edinburgh roughly right", () => {
    const km = distanceKm({ lat: 51.5074, lng: -0.1278 }, { lat: 55.9533, lng: -3.1883 });
    expect(km).toBeGreaterThan(530);
    expect(km).toBeLessThan(540);
  });
});

describe("speed profile and leg estimate", () => {
  it("uses urban, regional and long-haul speeds", () => {
    expect(speedKmh(1)).toBe(20);
    expect(speedKmh(5)).toBe(42);
    expect(speedKmh(40)).toBe(56);
    expect(speedKmh(200)).toBe(64);
  });
  it("adds the parking minutes to the profile time", () => {
    // 5 km at 42 km/h = 7.1 min + 3 = 10
    expect(estimateLegMinutes(5)).toBe(10);
    // 40 km at 56 km/h = 42.9 min + 3 = 46
    expect(estimateLegMinutes(40)).toBe(46);
  });
  it("is zero for a trivially short hop", () => {
    expect(estimateLegMinutes(0)).toBe(0);
  });
});

describe("travelMinutes by mode (new with the port)", () => {
  it("walks at 5 km/h and cycles at 15 km/h, drives on the profile", () => {
    expect(travelMinutes(2.5, "walk")).toBe(30);
    expect(travelMinutes(5, "cycle")).toBe(20);
    expect(travelMinutes(40, "drive")).toBe(46);
  });
  it("will not guess transit", () => {
    expect(travelMinutes(10, "transit")).toBeNull();
  });
});

describe("planDay — pickup", () => {
  it("builds pickup, outbound, dropoff, home", () => {
    const plan = planDay({ mode: "pickup_by_a", idea: pub, activityMinutes: 120, ...homes });
    expect(plan.legs.map((l) => `${l.kind}:${l.who}`)).toEqual(["pickup:a", "outbound:both", "dropoff:both", "home:a"]);
    expect(plan.complete).toBe(true);
    expect(plan.activityMinutes).toBe(120);
    expect(plan.totalMinutes).toBe(plan.travelMinutes + 120);
    expect(plan.travelShare).toBeCloseTo(plan.travelMinutes / plan.totalMinutes);
    // Short local hops: each under half an hour.
    for (const l of plan.legs) expect(l.minutes).toBeLessThan(30);
  });

  it("swaps the driver for pickup_by_b", () => {
    const plan = planDay({ mode: "pickup_by_b", idea: pub, activityMinutes: 60, ...homes });
    expect(plan.legs[0].who).toBe("b");
    expect(plan.legs[0].from.key).toBe("kirsty-home");
    expect(plan.legs[0].to.key).toBe("phil-home");
  });

  it("a zero-length pickup when the passenger is already at the driver's", () => {
    const plan = planDay({ mode: "pickup_by_a", idea: pub, activityMinutes: 60, a: { start: philHome, home: philHome }, b: { start: philHome, home: kirstyHome } });
    expect(plan.legs[0].minutes).toBe(0);
  });
});

describe("planDay — meet there", () => {
  it("takes the longer of the two individual round trips", () => {
    const plan = planDay({ mode: "meet_there", idea: whitby, activityMinutes: 180, ...homes });
    const a = plan.legs.filter((l) => l.who === "a").reduce((s, l) => s + l.minutes, 0);
    const b = plan.legs.filter((l) => l.who === "b").reduce((s, l) => s + l.minutes, 0);
    expect(plan.travelMinutes).toBe(Math.max(a, b));
    expect(plan.totalMinutes).toBe(plan.travelMinutes + 180);
  });
});

describe("planDay — overrides and unknowns", () => {
  it("applies a remembered override in either direction", () => {
    const overrides = new Map([[overrideKey(philHome, kirstyHome), 9]]);
    const plan = planDay({ mode: "pickup_by_a", idea: pub, activityMinutes: 60, ...homes, overrides });
    expect(plan.legs[0].minutes).toBe(9);
    expect(plan.legs[0].overridden).toBe(true);
    // The reverse direction (Kirsty's home to Phil's) also uses it.
    expect(plan.legs[3].minutes).toBe(9);
  });

  it("marks the plan incomplete when the idea has no pin", () => {
    const plan = planDay({ mode: "pickup_by_a", idea: unknown, activityMinutes: 60, ...homes });
    expect(plan.complete).toBe(false);
    expect(plan.legs[1].known).toBe(false);
    // Known legs still count.
    expect(plan.legs[0].known).toBe(true);
    expect(plan.totalMinutes).toBeGreaterThanOrEqual(60);
  });

  it("an override makes an un-pinned leg known", () => {
    const overrides = new Map([[overrideKey(kirstyHome, unknown), 25]]);
    const plan = planDay({ mode: "pickup_by_a", idea: unknown, activityMinutes: 60, ...homes, overrides });
    expect(plan.legs[1].known).toBe(true);
    expect(plan.legs[1].minutes).toBe(25);
  });
});

describe("bestMode", () => {
  it("prefers the shortest complete plan", () => {
    const base = { idea: pub, activityMinutes: 60, ...homes };
    const plans = [planDay({ ...base, mode: "pickup_by_a" }), planDay({ ...base, mode: "pickup_by_b" }), planDay({ ...base, mode: "meet_there" })];
    expect(bestMode(plans)?.totalMinutes).toBe(Math.min(...plans.map((p) => p.totalMinutes)));
  });
});

describe("pointKey", () => {
  it("rounds to three decimals so nearby pins share overrides", () => {
    expect(pointKey(54.48601, -0.61449)).toBe("54.486,-0.614");
  });
});

describe("estimateLegMinutes — calibration against a router (10 Sep 2026)", () => {
  // OSRM driving minutes for routes out of Darlington. The estimate should
  // sit within ±20% of the router, and never under by more than 10%, since
  // a router ignores parking and real traffic.
  const routes: Array<[string, number, number]> = [
    ["Darlington → Hurworth", 5.3, 8.4],
    ["Middlesbrough → Saltburn", 17.0, 19.8],
    ["Darlington → Richmond", 18.0, 20.7],
    ["Darlington → Northallerton", 22.3, 26.0],
    ["Darlington → Durham", 27.9, 31.5],
    ["Darlington → Hawes", 48.4, 57.0],
    ["Darlington → Newcastle", 50.5, 50.0],
    ["Darlington → Whitby", 60.8, 65.2],
    ["Darlington → York", 70.0, 69.3],
    ["Darlington → Leeds", 80.6, 80.5],
    ["Darlington → Keswick", 102.3, 91.8],
    ["Darlington → Edinburgh", 189.6, 194.1],
  ];
  for (const [name, km, router] of routes) {
    it(`${name}: within tolerance of ${router} min`, () => {
      const ours = estimateLegMinutes(km);
      // Under 10 km the parking-and-doors minutes dominate; a router has none.
      const ceiling = km < 10 ? 1.4 : 1.2;
      expect(ours / router).toBeGreaterThan(0.9);
      expect(ours / router).toBeLessThan(ceiling);
    });
  }
});
