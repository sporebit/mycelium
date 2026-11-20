import { describe, expect, it } from "vitest";
import { cleanLine, clipKey, clipPath, isVoice, MAX_LINE_CHARS } from "./clips";

describe("a spoken line", () => {
  it("is tidied before it is keyed, so the same words are one clip however they were spaced", () => {
    expect(cleanLine("  Two minutes   left.\n Find a stopping place. ")).toBe("Two minutes left. Find a stopping place.");
    expect(clipKey("bf_emma", "Two minutes left.")).toBe(clipKey("bf_emma", "  Two   minutes left. "));
    expect(clipKey("bf_emma", "Two minutes left.")).not.toBe(clipKey("bm_george", "Two minutes left."));
    expect(clipKey("bf_emma", "Two minutes left.")).not.toBe(clipKey("bf_emma", "Two minutes left"));
  });
  it("is capped, and nothing is nothing", () => {
    expect(cleanLine("x".repeat(MAX_LINE_CHARS + 50))).toHaveLength(MAX_LINE_CHARS);
    expect(cleanLine("   ")).toBe("");
    expect(cleanLine(null)).toBe("");
  });
  it("knows its voices and where its file goes", () => {
    expect(isVoice("bf_emma")).toBe(true);
    expect(isVoice("af_bella")).toBe(false);
    expect(clipPath("abc")).toBe("abc/clip.wav");
  });
});
