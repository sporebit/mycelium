import { describe, expect, it } from "vitest";
import { DRIFT_EVERY_MS, IDLE_AFTER_MS, LOCK_AFTER_MS, dimLevel, driftPosition, isNight, maySpeak, shouldLock, wallMode } from "./schedule";

// London, late November: GMT, so these UTC instants are local times too.
const at = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00Z`);
// British summer: 22:30Z is 23:30 in London.
const summer = (hhmmZ: string) => new Date(`2026-07-10T${hhmmZ}:00Z`);

describe("night", () => {
  it("runs from 23:00 to 06:00 London", () => {
    expect(isNight(at("22:59"))).toBe(false);
    expect(isNight(at("23:00"))).toBe(true);
    expect(isNight(at("03:00"))).toBe(true);
    expect(isNight(at("05:59"))).toBe(true);
    expect(isNight(at("06:00"))).toBe(false);
    expect(isNight(at("12:00"))).toBe(false);
  });
  it("follows London clocks, not UTC", () => {
    expect(isNight(summer("22:30"))).toBe(true);
    expect(isNight(summer("21:30"))).toBe(false);
  });
});

describe("mode", () => {
  const noon = at("12:00");
  it("is active while someone is touching it", () => {
    expect(wallMode(noon, noon.getTime() - 1000)).toBe("active");
    expect(wallMode(noon, noon.getTime() - IDLE_AFTER_MS + 1)).toBe("active");
  });
  it("goes idle after three quiet minutes by day and to night after dark", () => {
    expect(wallMode(noon, noon.getTime() - IDLE_AFTER_MS)).toBe("idle");
    const late = at("23:30");
    expect(wallMode(late, late.getTime() - IDLE_AFTER_MS)).toBe("night");
  });
  it("lifts the night view for a touch", () => {
    const late = at("23:30");
    expect(wallMode(late, late.getTime() - 5000)).toBe("active");
  });
  it("dims by mode", () => {
    expect(dimLevel("active")).toBe(1);
    expect(dimLevel("idle")).toBeLessThan(1);
    expect(dimLevel("night")).toBeLessThan(dimLevel("idle"));
  });
});

describe("voice", () => {
  it("is silent overnight and when muted", () => {
    expect(maySpeak(at("12:00"), true)).toBe(true);
    expect(maySpeak(at("12:00"), false)).toBe(false);
    expect(maySpeak(at("23:30"), true)).toBe(false);
    expect(maySpeak(at("05:00"), true)).toBe(false);
  });
});

describe("self-lock", () => {
  it("locks a person's view after two quiet minutes, sooner than the note's ten", () => {
    const n = at("12:00");
    expect(shouldLock(n, n.getTime() - LOCK_AFTER_MS + 1)).toBe(false);
    expect(shouldLock(n, n.getTime() - LOCK_AFTER_MS)).toBe(true);
    expect(LOCK_AFTER_MS).toBeLessThan(10 * 60_000);
  });
  it("honours a shorter span", () => {
    const n = at("12:00");
    expect(shouldLock(n, n.getTime() - 3000, 3000)).toBe(true);
  });
});

describe("drift", () => {
  it("keeps the figure inside the panel and moves it every minute", () => {
    const seen = new Set<string>();
    for (let t = 0; t < 120; t++) {
      const p = driftPosition(t);
      expect(p.x).toBeGreaterThanOrEqual(0.2);
      expect(p.x).toBeLessThanOrEqual(0.8);
      expect(p.y).toBeGreaterThanOrEqual(0.25);
      expect(p.y).toBeLessThanOrEqual(0.75);
      seen.add(`${p.x},${p.y}`);
    }
    expect(seen.size).toBe(120);
    expect(DRIFT_EVERY_MS).toBeLessThanOrEqual(60_000);
  });
});
