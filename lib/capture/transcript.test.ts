import { describe, expect, it } from "vitest";
import { chooseText, difference, wordDistance, words } from "./transcript";

describe("comparing two transcripts", () => {
  it("ignores punctuation and capitals", () => {
    expect(difference("Right, I need to sort the boiler out.", "right i need to sort the boiler out")).toBe(0);
    expect(difference("It's Dave's email", "it’s dave’s email")).toBe(0);
  });
  it("counts differing words", () => {
    expect(wordDistance(words("call the plumber today"), words("call the plumber tomorrow"))).toBe(1);
    expect(wordDistance(words("call plumber"), words("call the plumber now"))).toBe(2);
    expect(difference("book the m o t", "book the MOT")).toBeGreaterThan(0.5);
  });
});

describe("chooseText — which transcript stands", () => {
  it("uses Whisper when only audio arrived", () => {
    expect(chooseText({ stored: null, whisper: "Buy nappies.", editedByHand: false })).toEqual({ use: "whisper", reason: "no_text" });
    expect(chooseText({ stored: "  ", whisper: "Buy nappies.", editedByHand: false })).toEqual({ use: "whisper", reason: "no_text" });
  });

  it("keeps the person's own edit whatever Whisper heard", () => {
    expect(chooseText({ stored: "Ring Dave re boiler", whisper: "Bring Dave three boilers", editedByHand: true })).toEqual({ use: "keep", reason: "edited_by_hand" });
  });

  it("keeps the dictation when the words are the same", () => {
    expect(chooseText({ stored: "Remind me to cancel the gym trial.", whisper: "remind me to cancel the gym trial", editedByHand: false })).toEqual({ use: "keep", reason: "same_words" });
  });

  it("corrects a short capture on any real difference", () => {
    expect(chooseText({ stored: "Book the car in for its M O T", whisper: "Book the car in for its MOT", editedByHand: false })).toEqual({ use: "whisper", reason: "differs" });
    expect(chooseText({ stored: "Ring gave about the oiler", whisper: "Ring Dave about the boiler", editedByHand: false })).toEqual({ use: "whisper", reason: "differs" });
  });

  it("does not rewrite a long capture over one stray word in a hundred", () => {
    const base = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const oneOff = base.replace("word50", "wurd50");
    const several = base.replace("word10", "x").replace("word20", "y").replace("word30", "z").replace("word40", "q").replace("word60", "r");
    expect(chooseText({ stored: base, whisper: oneOff, editedByHand: false }).use).toBe("keep");
    expect(chooseText({ stored: base, whisper: several, editedByHand: false }).use).toBe("whisper");
  });

  it("keeps what is stored when Whisper returned nothing", () => {
    expect(chooseText({ stored: "Buy milk", whisper: "", editedByHand: false })).toEqual({ use: "keep", reason: "whisper_empty" });
    expect(chooseText({ stored: null, whisper: null, editedByHand: false })).toEqual({ use: "keep", reason: "whisper_empty" });
  });
});
