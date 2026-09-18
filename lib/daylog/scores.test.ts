import { describe, expect, it } from "vitest";
import { DEFAULT_SCORE_KEYS, parseScoreLine } from "./scores";

const K = DEFAULT_SCORE_KEYS;

describe("score line parse (spec §8)", () => {
  it("digits in key order", () => {
    const r = parseScoreLine("4 3 5 2", K);
    expect(r.scores).toEqual({ mood: 4, energy: 3, sleep: 5, productivity: 2 });
    expect(r.missing).toEqual([]);
  });
  it("commas and slashes", () => {
    expect(parseScoreLine("4,3,5,2", K).scores).toEqual({ mood: 4, energy: 3, sleep: 5, productivity: 2 });
    expect(parseScoreLine("4/3/5/2", K).scores).toEqual({ mood: 4, energy: 3, sleep: 5, productivity: 2 });
  });
  it("words", () => {
    const r = parseScoreLine("four three", K);
    expect(r.scores).toEqual({ mood: 4, energy: 3 });
    expect(r.missing).toEqual(["sleep", "productivity"]);
  });
  it("partial reply names the missing keys; a second reply fills them in order", () => {
    const first = parseScoreLine("5 3", K);
    expect(first.missing).toEqual(["sleep", "productivity"]);
    const second = parseScoreLine("4 1", K, first.scores);
    expect(second.scores).toEqual({ mood: 5, energy: 3, sleep: 4, productivity: 1 });
    expect(second.missing).toEqual([]);
  });
  it("keyed values", () => {
    const r = parseScoreLine("mood 4, sleep five", K);
    expect(r.scores).toEqual({ mood: 4, sleep: 5 });
    expect(r.missing).toEqual(["energy", "productivity"]);
  });
  it("out of range rejected, nothing recorded for it", () => {
    const r = parseScoreLine("6 3 0 2", K);
    expect(r.rejected).toEqual(["6", "0"]);
    expect(r.scores).toEqual({ energy: 3, productivity: 2 });
  });
  it("no numbers → nothing", () => {
    const r = parseScoreLine("done", K);
    expect(r.any).toBe(false);
    expect(r.missing).toEqual([...K]);
  });
});
