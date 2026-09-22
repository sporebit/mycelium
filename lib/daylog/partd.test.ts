import { describe, expect, it } from "vitest";
import { seedsBlock, seedsLine, type Seeds } from "./seeds";
import { sceneForMoment, sceneStartsFromTranscript } from "./media";

describe("seeds (spec §4.2)", () => {
  const seeds: Seeds = { gathered_at: "2026-09-21T20:30:00Z", calendar: ["10:00 Dentist", "Whitby"], weather: "light rain, 17°, 60% rain", spotify: ["12 plays — Fontaines D.C. ×5, Wet Leg"], media: ["finished Slow Horses"] };
  it("the prompt line quotes calendar, weather and media without times", () => {
    expect(seedsLine(seeds)).toBe("Calendar had Dentist, Whitby · light rain, 17°, 60% rain · finished Slow Horses.");
  });
  it("the prompt line is empty when nothing is known", () => {
    expect(seedsLine({ gathered_at: "x" })).toBe("");
    expect(seedsLine(null)).toBe("");
  });
  it("the interviewer block labels every source and warns it is not what happened", () => {
    const b = seedsBlock(seeds)!;
    expect(b.startsWith("seeds (from calendars and devices, not from the person")).toBe(true);
    expect(b).toContain("calendar: 10:00 Dentist; Whitby");
    expect(b).toContain("music: 12 plays");
    expect(seedsBlock({ gathered_at: "x" })).toBeNull();
  });
  it("the block is capped near the token budget", () => {
    const big: Seeds = { gathered_at: "x", calendar: Array.from({ length: 40 }, (_, i) => `event ${i} ${"x".repeat(60)}`) };
    expect(seedsBlock(big)!.length).toBeLessThanOrEqual(1200);
  });
});

describe("photos attach by timing (decision 28)", () => {
  const transcript = [
    { role: "assistant", at: "2026-09-21T21:30:00Z", text: "Go on then" },
    { role: "user", at: "2026-09-21T21:31:00Z", text: "Went to Whitby with Kirsty. Quayside for fish and chips, then the beach." },
    { role: "assistant", at: "2026-09-21T21:31:10Z", text: "What did you have?" },
    { role: "user", at: "2026-09-21T21:33:00Z", text: "Cod and chips" },
    { role: "assistant", at: "2026-09-21T21:33:10Z", text: "And the beach?" },
    { role: "user", at: "2026-09-21T21:36:00Z", text: "The beach was windy, Max ran off" },
  ];
  const scenes = [
    { id: "quay", title: "Quayside, fish and chips", position: 0 },
    { id: "beach", title: "The beach", position: 1 },
  ];
  it("a scene starts when its words first appear, never earlier than the previous scene", () => {
    expect(sceneStartsFromTranscript(scenes, transcript)).toEqual([
      { id: "quay", at: "2026-09-21T21:31:00Z" },
      { id: "beach", at: "2026-09-21T21:31:00Z" },
    ]);
  });
  it("a scene with no words in the transcript inherits the floor", () => {
    const starts = sceneStartsFromTranscript([...scenes, { id: "pod", title: "Pod", position: 2 }], transcript);
    expect(starts[2]).toEqual({ id: "pod", at: "2026-09-21T21:31:00Z" });
  });
  it("a photo goes to the latest scene that had started when it arrived", () => {
    const starts = [
      { id: "quay", at: "2026-09-21T21:31:00Z" },
      { id: "beach", at: "2026-09-21T21:35:00Z" },
    ];
    expect(sceneForMoment("2026-09-21T21:20:00Z", starts)).toBe("quay"); // before everything → first
    expect(sceneForMoment("2026-09-21T21:33:00Z", starts)).toBe("quay");
    expect(sceneForMoment("2026-09-21T21:35:00Z", starts)).toBe("beach");
    expect(sceneForMoment("2026-09-21T23:59:00Z", starts)).toBe("beach"); // after everything → last
    expect(sceneForMoment("2026-09-21T21:33:00Z", [])).toBeNull();
  });
});
