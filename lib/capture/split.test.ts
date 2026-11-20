import { describe, expect, it } from "vitest";
import { sameWording, splitSentences } from "./paragraphs";
import { heuristicSegments, parseSegmentReply, segmentUserPrompt, shouldConsiderSplit, splitCapture } from "./split";

const DUMP =
  "Right I need to sort the boiler out before winter because it has been making that noise again. " +
  "The number for the other plumber is in the email from Dave. " +
  "Also the car needs its MOT by the end of the month. " +
  "The garage on the corner did it last year. " +
  "Oh and remind me to cancel the gym trial before it renews on the third.";

const DIARY =
  "Today was a strange one and I am not sure what to make of it. " +
  "Work dragged in the morning but the afternoon walk helped more than I expected. " +
  "I keep thinking about what Kirsty said about slowing down, and she is probably right. " +
  "I felt calmer by the evening than I have all week.";

describe("shouldConsiderSplit", () => {
  it("never considers a short capture", () => {
    expect(shouldConsiderSplit("Buy milk. Call the dentist.")).toBe(false);
  });
  it("considers a long one", () => {
    expect(shouldConsiderSplit(DUMP)).toBe(true);
  });
});

describe("heuristicSegments", () => {
  it("cuts where the speaker announced a new subject", () => {
    const segs = heuristicSegments(DUMP);
    expect(segs.map((s) => s.text.split(" ").slice(0, 3).join(" "))).toEqual(["Right I need", "Also the car", "Oh and remind"]);
  });
  it("keeps every word, in order", () => {
    expect(sameWording(heuristicSegments(DUMP).map((s) => s.text).join(" "), DUMP)).toBe(true);
  });
  it("leaves a diary entry whole", () => {
    expect(heuristicSegments(DIARY)).toHaveLength(1);
  });
});

describe("parseSegmentReply", () => {
  it("accepts ranges that cover every sentence once, in order", () => {
    expect(parseSegmentReply('{"items":[[1,2],[3,4],[5,5]]}', 5)).toEqual([[0, 1], [2, 3], [4, 4]]);
    expect(parseSegmentReply('Here you go:\n```json\n{"items":[[1,5]]}\n```', 5)).toEqual([[0, 4]]);
  });
  it("rejects a reply that skips, repeats, reorders or overruns", () => {
    expect(parseSegmentReply('{"items":[[1,2],[4,5]]}', 5)).toBeNull(); // skips 3
    expect(parseSegmentReply('{"items":[[1,3],[3,5]]}', 5)).toBeNull(); // repeats 3
    expect(parseSegmentReply('{"items":[[3,5],[1,2]]}', 5)).toBeNull(); // out of order
    expect(parseSegmentReply('{"items":[[1,6]]}', 5)).toBeNull(); // past the end
    expect(parseSegmentReply('{"items":[[1,4]]}', 5)).toBeNull(); // stops short
    expect(parseSegmentReply('{"items":[[1,"2"],[3,5]]}', 5)).toBeNull();
    expect(parseSegmentReply("the boiler and the car", 5)).toBeNull();
    expect(parseSegmentReply(null, 5)).toBeNull();
  });
  it("rejects more items than a person would want as cards", () => {
    const many = JSON.stringify({ items: Array.from({ length: 9 }, (_, i) => [i + 1, i + 1]) });
    expect(parseSegmentReply(many, 9)).toBeNull();
  });
});

describe("splitCapture", () => {
  it("uses the model's grouping when it can be trusted, cutting the original text by sentence number", async () => {
    const out = await splitCapture(DUMP, async () => '{"items":[[1,2],[3,4],[5,5]]}');
    expect(out.by).toBe("model");
    expect(out.segments).toHaveLength(3);
    expect(out.segments[1].text).toBe("Also the car needs its MOT by the end of the month. The garage on the corner did it last year.");
    expect(sameWording(out.segments.map((s) => s.text).join(" "), DUMP)).toBe(true);
  });

  it("sends the model numbered sentences and nothing else of the user's", async () => {
    let seen = "";
    await splitCapture(DUMP, async (_system, user) => {
      seen = user;
      return '{"items":[[1,5]]}';
    });
    expect(seen).toBe(segmentUserPrompt(splitSentences(DUMP)));
  });

  it("does not split when the model says it is one thing", async () => {
    const out = await splitCapture(DIARY, async () => '{"items":[[1,4]]}');
    expect(out.by).toBe("none");
    expect(out.segments).toHaveLength(1);
  });

  it("falls back to announced subjects when the model's reply cannot be trusted", async () => {
    const out = await splitCapture(DUMP, async () => '{"items":[[1,2],[4,5]]}');
    expect(out.by).toBe("heuristic");
    expect(out.segments).toHaveLength(3);
  });

  it("falls back when the model throws or is absent", async () => {
    expect((await splitCapture(DUMP, async () => { throw new Error("no credit"); })).by).toBe("heuristic");
    expect((await splitCapture(DUMP, async () => null)).by).toBe("heuristic");
    expect((await splitCapture(DUMP)).by).toBe("heuristic");
  });

  it("never asks a model about a short capture", async () => {
    let asked = false;
    const out = await splitCapture("Buy milk on the way home.", async () => {
      asked = true;
      return null;
    });
    expect(asked).toBe(false);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].text).toBe("Buy milk on the way home.");
  });
});
