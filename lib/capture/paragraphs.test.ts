import { describe, expect, it } from "vitest";
import { formatParagraphs, sameWording, splitSentences, wordCount } from "./paragraphs";

const DUMP =
  "Right I need to sort the boiler out before winter because it has been making that noise again and the last quote was far too high. " +
  "I think the number for the other plumber is in the email from Dave. " +
  "It might be worth asking next door who they used as well. " +
  "Also the car needs its MOT by the end of the month and I have not booked it. " +
  "The garage on the corner did it last year for about forty five pounds. " +
  "Another thing I keep forgetting is the nursery paint which needs ordering before the weekend so it has time to arrive. " +
  "We said the green one but I want to check the sample in daylight first. " +
  "Oh and remind me to cancel the gym trial before it renews on the third.";

describe("formatParagraphs", () => {
  it("leaves a short capture exactly as it came, bar stray spaces", () => {
    expect(formatParagraphs("Buy milk  on the way home.")).toBe("Buy milk on the way home.");
    expect(formatParagraphs("Call the dentist. Book the MOT.")).toBe("Call the dentist. Book the MOT.");
  });

  it("returns an empty string for nothing", () => {
    expect(formatParagraphs("")).toBe("");
    expect(formatParagraphs("   \n  ")).toBe("");
  });

  it("breaks a long dictation where the subject changes", () => {
    const out = formatParagraphs(DUMP);
    const paragraphs = out.split("\n\n");
    expect(paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(paragraphs.some((p) => p.startsWith("Also the car"))).toBe(true);
    expect(paragraphs.some((p) => p.startsWith("Another thing"))).toBe(true);
    expect(paragraphs.some((p) => p.startsWith("Oh and remind me"))).toBe(true);
  });

  it("never changes a word: only spaces and line breaks differ", () => {
    expect(sameWording(formatParagraphs(DUMP), DUMP)).toBe(true);
    const odd = "Weight 82.4 kg today e.g. after breakfast. Dr. Patel said 3.5 mg twice daily! Is that right? " + DUMP;
    expect(sameWording(formatParagraphs(odd), odd)).toBe(true);
  });

  it("holds the same-wording rule for arbitrary text", () => {
    const words = ["tea", "Also", "the", "Next.", "quote?", "3.5", "kg.", "Dr.", "Oh", "and", "boiler!", "“yes”", "it's", "e.g.", "—", "A", "I"];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let run = 0; run < 200; run++) {
      const n = 20 + (next() % 160);
      const text = Array.from({ length: n }, () => words[next() % words.length]).join(next() % 5 === 0 ? "  " : " ");
      expect(sameWording(formatParagraphs(text), text)).toBe(true);
    }
  });

  it("breaks a long run with no change-of-subject words once it has run long enough", () => {
    const sentence = "The delivery came on Tuesday and the box was left by the side gate again.";
    const text = Array.from({ length: 9 }, () => sentence).join(" ");
    const out = formatParagraphs(text);
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(3);
    for (const p of out.split("\n\n")) expect(wordCount(p)).toBeLessThanOrEqual(84);
  });

  it("keeps the writer's own line breaks and only tidies them", () => {
    const typed = "First thought.  \n\n\n\nSecond thought.\n- a list item\n- another";
    expect(formatParagraphs(typed)).toBe("First thought.\n\nSecond thought.\n- a list item\n- another");
  });

  it("does not leave a tiny last sentence on its own", () => {
    const text = DUMP + " Thanks.";
    const out = formatParagraphs(text);
    expect(out.split("\n\n").at(-1)).not.toBe("Thanks.");
  });

  it("is stable: formatting twice gives the same text", () => {
    const once = formatParagraphs(DUMP);
    expect(formatParagraphs(once)).toBe(once);
  });
});

describe("splitSentences", () => {
  it("keeps decimals, titles and abbreviations inside their sentence", () => {
    expect(splitSentences("Weight was 82.4 kg. Dr. Patel rang. Fine.")).toEqual(["Weight was 82.4 kg.", "Dr. Patel rang.", "Fine."]);
  });
  it("splits on question and exclamation marks", () => {
    expect(splitSentences("Did it arrive? Yes! Good.")).toEqual(["Did it arrive?", "Yes!", "Good."]);
  });
});
