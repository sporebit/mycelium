import { describe, expect, it } from "vitest";
import { applySpeakerRules, DUPLICATE_THRESHOLD, parseRelativeSaidAt, readBack, similarity, type QuoteExtraction } from "./text";

const base: QuoteExtraction = {
  text: "Your dog is crazy",
  speaker: null,
  is_own: false,
  speaker_confidence: "certain",
  context: null,
  said_at_relative: null,
  source: null,
  likely_original: true,
};

describe("speaker rules (spec §4.3)", () => {
  it("X told me → X, certain", () => {
    const r = applySpeakerRules("Jake told me last Tuesday the best time to plant a tree was twenty years ago", { ...base, speaker: "Jake" });
    expect(r.speaker).toBe("Jake");
    expect(r.is_own).toBe(false);
    expect(r.speaker_confidence).toBe("certain");
  });

  it("X said → X even when the model left speaker null", () => {
    const r = applySpeakerRules("sarah said sleep is the best pre-workout", { ...base, speaker: null });
    expect(r.speaker).toBe("Sarah");
    expect(r.is_own).toBe(false);
  });

  it("X's quote → X", () => {
    const r = applySpeakerRules("Luke's quote: never trust a skinny chef", { ...base, speaker: "Luke" });
    expect(r.speaker).toBe("Luke");
    expect(r.is_own).toBe(false);
  });

  it("I said / I've just said / my quote → own, certain, no speaker", () => {
    for (const raw of ["I said a quote: sleep is the best pre-workout", "I've just said a quote, sleep is the best pre-workout", "my quote: sleep is the best pre-workout"]) {
      const r = applySpeakerRules(raw, { ...base, speaker: "Jake" });
      expect(r.is_own).toBe(true);
      expect(r.speaker).toBeNull();
      expect(r.speaker_confidence).toBe("certain");
    }
  });

  it("addressee-only → own + uncertain", () => {
    const r = applySpeakerRules("Jake, your dog is crazy", { ...base, speaker: null });
    expect(r.is_own).toBe(true);
    expect(r.speaker_confidence).toBe("uncertain");
  });

  it("no attribution → own + uncertain", () => {
    const r = applySpeakerRules("quote: the best time to plant a tree was twenty years ago", { ...base, speaker: null });
    expect(r.is_own).toBe(true);
    expect(r.speaker_confidence).toBe("uncertain");
  });

  it("pronouns are not speakers", () => {
    const r = applySpeakerRules("he said the best time to plant a tree was twenty years ago", { ...base, speaker: null });
    expect(r.speaker).toBeNull();
    expect(r.is_own).toBe(true);
    expect(r.speaker_confidence).toBe("uncertain");
  });
});

describe("relative said_at", () => {
  const now = new Date("2026-09-18T12:00:00Z"); // a Friday
  it("today / yesterday / N days ago", () => {
    expect(parseRelativeSaidAt("this morning", now)).toBe(now.toISOString());
    expect(parseRelativeSaidAt("yesterday", now)?.slice(0, 10)).toBe("2026-09-17");
    expect(parseRelativeSaidAt("3 days ago", now)?.slice(0, 10)).toBe("2026-09-15");
    expect(parseRelativeSaidAt("2 weeks ago", now)?.slice(0, 10)).toBe("2026-09-04");
  });
  it("last Tuesday is the most recent Tuesday before now", () => {
    expect(parseRelativeSaidAt("last Tuesday", now)?.slice(0, 10)).toBe("2026-09-15");
    expect(parseRelativeSaidAt("on Friday", now)?.slice(0, 10)).toBe("2026-09-11");
  });
  it("ISO dates pass through; nonsense is null", () => {
    expect(parseRelativeSaidAt("2026-09-01", now)?.slice(0, 10)).toBe("2026-09-01");
    expect(parseRelativeSaidAt("at some point", now)).toBeNull();
    expect(parseRelativeSaidAt(null, now)).toBeNull();
  });
});

describe("near-duplicate threshold", () => {
  it("re-tellings of the same line are above 0.6, different lines are below", () => {
    const a = "you have to get comfortable with being uncomfortable";
    expect(similarity(a, "get comfortable with being uncomfortable")).toBeGreaterThan(DUPLICATE_THRESHOLD);
    expect(similarity(a, "sleep is the best pre-workout")).toBeLessThan(DUPLICATE_THRESHOLD);
    expect(similarity(a, a)).toBe(1);
    expect(similarity("", a)).toBe(0);
  });
});

describe("read-back", () => {
  it("names the speaker and flags uncertainty", () => {
    expect(readBack({ ...base, speaker: "Jake" }, "Jake Smith")).toBe('Saved for review — Jake Smith: "Your dog is crazy"');
    expect(readBack({ ...base, is_own: true, speaker_confidence: "uncertain" }, null)).toBe('Saved for review — You: "Your dog is crazy" (speaker uncertain)');
  });
});
