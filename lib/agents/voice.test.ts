import { describe, expect, it } from "vitest";
import { speakable, takeSentences } from "./voice";

describe("takeSentences (MYC-148)", () => {
  it("returns complete sentences and carries the tail", () => {
    expect(takeSentences("Right, two things to sort. First the dentist tomorrow. Then the")).toEqual({ sentences: ["Right, two things to sort.", "First the dentist tomorrow."], rest: "Then the" });
  });
  it("holds a trailing sentence until whitespace or final", () => {
    expect(takeSentences("Booked for 3.5 hours on Tuesday.")).toEqual({ sentences: [], rest: "Booked for 3.5 hours on Tuesday." });
    expect(takeSentences("Booked for 3.5 hours on Tuesday.", { final: true })).toEqual({ sentences: ["Booked for 3.5 hours on Tuesday."], rest: "" });
  });
  it("merges a short sentence into the next", () => {
    expect(takeSentences("Right. That was the gym, then the shop for milk. And")).toEqual({ sentences: ["Right. That was the gym, then the shop for milk."], rest: "And" });
  });
  it("a short sentence with nothing after it waits, then goes on final", () => {
    expect(takeSentences("Right. ")).toEqual({ sentences: [], rest: "Right. " });
    expect(takeSentences("Right. ", { final: true })).toEqual({ sentences: ["Right."], rest: "" });
  });
  it("handles ? ! and closing quotes", () => {
    expect(takeSentences('Did you go in the end? She said "no way!" Then we left. ').sentences).toEqual(["Did you go in the end?", 'She said "no way!"', "Then we left."]);
  });
  it("streams: feeding deltas yields each sentence once", () => {
    const deltas = ["Two things", " to do today. ", "Dentist at ten, then", " the gym. Sorted."];
    let buf = "";
    const out: string[] = [];
    for (const d of deltas) {
      buf += d;
      const r = takeSentences(buf);
      out.push(...r.sentences);
      buf = r.rest;
    }
    out.push(...takeSentences(buf, { final: true }).sentences);
    expect(out).toEqual(["Two things to do today.", "Dentist at ten, then the gym.", "Sorted."]);
  });
});

describe("speakable", () => {
  it("drops markdown a voice cannot say", () => {
    expect(speakable("**Two** things:\n- Dentist at `10`\n- [Gym](/fitness)\n## Then\nrest.")).toBe("Two things: Dentist at 10 Gym Then rest.");
  });
});
