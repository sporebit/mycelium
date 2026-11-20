import { describe, expect, it } from "vitest";
import { bannedIn } from "@/lib/daily/words";
import { nameToShow, NUDGE_PRESETS, nudgeDone, nudgeSpoken, presetFor } from "./nudge";

describe("nudges", () => {
  it("every wording is an offer or a kindness, and none says a forbidden thing", () => {
    for (const p of NUDGE_PRESETS) {
      const said = p.say("Kirsty", "Reply about the boiler quote");
      expect(said.startsWith("Kirsty"), p.key).toBe(true);
      expect(said).toContain("boiler quote");
      expect(bannedIn(said), said).toBeNull();
      expect(bannedIn(p.label), p.label).toBeNull();
      expect(said).not.toMatch(/still|yet|remember|forgot|why haven|when will|hurry|late/i);
    }
    expect(new Set(NUDGE_PRESETS.map((p) => p.key)).size).toBe(NUDGE_PRESETS.length);
  });

  it("a long title is cut, not left to run on", () => {
    const said = NUDGE_PRESETS[0].say("Kirsty", "x".repeat(200));
    expect(said.length).toBeLessThan(110);
    expect(said).toContain("…");
  });

  it("only the fixed wordings exist: there is no free text to misuse", () => {
    expect(presetFor("company")?.key).toBe("company");
    expect(presetFor("you still haven't done this")).toBeNull();
    expect(presetFor(undefined)).toBeNull();
    expect(presetFor(42)).toBeNull();
  });

  it("the wall says it in twelve words or fewer", () => {
    for (const p of NUDGE_PRESETS) expect(nudgeSpoken("Kirsty", p.key).split(/\s+/).length, p.key).toBeLessThanOrEqual(12);
    expect(nudgeSpoken("Kirsty", "unknown")).toBe("Kirsty sent a note.");
  });

  it("the sender is told plainly when it is done", () => {
    expect(nudgeDone("Phil", "Reply about the boiler quote")).toEqual({ title: "Phil finished it", body: "Reply about the boiler quote" });
  });

  it("a name is the person's own choice, never an email address", () => {
    expect(nameToShow("Kirsty")).toBe("Kirsty");
    expect(nameToShow("  ")).toBe("Someone");
    expect(nameToShow(null)).toBe("Someone");
    expect(nameToShow("someone@example.com")).toBe("Someone");
    expect(nameToShow("someone@example.com", "Your partner")).toBe("Your partner");
  });
});
