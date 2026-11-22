// New with the port: the old app trusted the suncalc package and had no sky
// tests. The hand-rolled maths is pinned against known 2026 dates.
import { describe, expect, it } from "vitest";
import { moonIllumination, moonPhaseLabel, skyScore, sunTimes } from "./sky";

describe("moon", () => {
  it("is dark at the new moon of 12 August 2026 and full on 28 August", () => {
    expect(moonIllumination(Date.parse("2026-08-12T17:00:00Z"))).toBeLessThan(0.02);
    expect(moonIllumination(Date.parse("2026-08-28T04:00:00Z"))).toBeGreaterThan(0.98);
    expect(moonPhaseLabel(Date.parse("2026-08-28T04:00:00Z"))).toBe("Full moon");
    expect(moonPhaseLabel(Date.parse("2026-08-12T17:00:00Z"))).toBe("New moon");
  });
});

describe("sunTimes", () => {
  it("puts midsummer sunset in London at about 21:21 BST", () => {
    const { sunset, darkBy } = sunTimes(Date.parse("2026-06-21T12:00:00Z"), 51.5074, -0.1278);
    expect(sunset).not.toBeNull();
    expect(sunset ?? 0).toBeGreaterThan(Date.parse("2026-06-21T20:15:00Z"));
    expect(sunset ?? 0).toBeLessThan(Date.parse("2026-06-21T20:28:00Z"));
    expect(darkBy ?? 0).toBeGreaterThan(sunset ?? 0);
  });
  it("has no sunset under the midnight sun", () => {
    expect(sunTimes(Date.parse("2026-06-21T12:00:00Z"), 70, 20).sunset).toBeNull();
  });
});

describe("skyScore", () => {
  it("is full marks for a clear, dark night and treats unknown cloud as half", () => {
    expect(skyScore(10, 0.1)).toBe(1);
    expect(skyScore(null, 0.1)).toBe(0.6);
    expect(skyScore(10, 0.95)).toBe(0);
  });
});
