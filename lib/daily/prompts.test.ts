import { describe, expect, it } from "vitest";
import { dueFallbacks, type FallbackState } from "./prompts";

const settings = { morning_fallback: "08:30", evening_fallback: "21:30" };
const at = (time: string, over: Partial<FallbackState> = {}): FallbackState => ({
  time,
  morningSent: false,
  eveningSent: false,
  closed: false,
  hasCard: true,
  hasSomethingToClose: true,
  ...over,
});

describe("the fallback prompts", () => {
  it("nothing before the morning time", () => {
    expect(dueFallbacks(settings, at("08:29"))).toEqual({ morning: false, evening: false });
  });

  it("the morning prompt from its time until midday, if the alarm never sent it", () => {
    expect(dueFallbacks(settings, at("08:30")).morning).toBe(true);
    expect(dueFallbacks(settings, at("11:59")).morning).toBe(true);
    expect(dueFallbacks(settings, at("12:00")).morning).toBe(false);
    expect(dueFallbacks(settings, at("09:00", { morningSent: true })).morning).toBe(false);
  });

  it("an empty day is not announced", () => {
    expect(dueFallbacks(settings, at("09:00", { hasCard: false })).morning).toBe(false);
  });

  it("the evening prompt from its time on, once", () => {
    expect(dueFallbacks(settings, at("21:29")).evening).toBe(false);
    expect(dueFallbacks(settings, at("21:30")).evening).toBe(true);
    expect(dueFallbacks(settings, at("23:50")).evening).toBe(true);
    expect(dueFallbacks(settings, at("22:00", { eveningSent: true })).evening).toBe(false);
  });

  it("a closed day is left alone, and so is an evening with nothing to show", () => {
    expect(dueFallbacks(settings, at("22:00", { closed: true }))).toEqual({ morning: false, evening: false });
    expect(dueFallbacks(settings, at("22:00", { hasSomethingToClose: false })).evening).toBe(false);
  });

  it("uses the person's own times", () => {
    const late = { morning_fallback: "10:00", evening_fallback: "23:00" };
    expect(dueFallbacks(late, at("09:00")).morning).toBe(false);
    expect(dueFallbacks(late, at("10:00")).morning).toBe(true);
    expect(dueFallbacks(late, at("22:30")).evening).toBe(false);
    expect(dueFallbacks(late, at("23:00")).evening).toBe(true);
  });
});
