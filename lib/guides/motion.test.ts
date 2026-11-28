import { describe, expect, it } from "vitest";
import { countAt, DURATIONS, durationFor, easeOut, isMotionLevel, motionLevel } from "./motion";

describe("durationFor", () => {
  it("uses the design's durations at full motion", () => {
    expect(durationFor("thread", "full")).toBe(480);
    expect(durationFor("count", "full")).toBe(400);
    expect(durationFor("fruit", "full")).toBe(320);
    expect(durationFor("finish", "full")).toBe(1200);
  });
  it("makes the thread, fruits and numbers jump under reduced motion", () => {
    expect(durationFor("thread", "reduced")).toBe(0);
    expect(durationFor("fruit", "reduced")).toBe(0);
    expect(durationFor("count", "reduced")).toBe(0);
  });
  it("moves nothing when motion is off, but keeps the arm timeout", () => {
    for (const k of Object.keys(DURATIONS) as Array<keyof typeof DURATIONS>) {
      expect(durationFor(k, "off")).toBe(k === "arm" ? DURATIONS.arm : 0);
    }
  });
});

describe("counting", () => {
  it("eases out and lands on the target", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(countAt(0, 100, 0, 400)).toBe(0);
    expect(countAt(0, 100, 400, 400)).toBe(100);
    expect(countAt(0, 100, 200, 400)).toBeGreaterThan(50);
    expect(countAt(10, 60, 5, 0)).toBe(60);
  });
});

describe("motionLevel", () => {
  it("is full on the server", () => {
    expect(motionLevel(undefined)).toBe("full");
  });
  it("reads data-motion", () => {
    const doc = (motion: string) => ({ documentElement: { dataset: { motion } } }) as unknown as Document;
    expect(motionLevel(doc("off"))).toBe("off");
    expect(motionLevel(doc("reduced"))).toBe("reduced");
    expect(motionLevel(doc("nonsense"))).toBe("full");
  });
  it("knows its levels", () => {
    expect(isMotionLevel("full")).toBe(true);
    expect(isMotionLevel("fast")).toBe(false);
  });
});
