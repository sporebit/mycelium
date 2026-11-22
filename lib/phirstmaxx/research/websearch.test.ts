import { describe, expect, it } from "vitest";
import { factsFromModelJson, shapeValue, urlsFromContent } from "./websearch";

describe("web-search facts: every fact carries a cited URL (spec §6.3)", () => {
  const answer = JSON.stringify({
    facts: [
      { key: "typical_minutes", value: { min: 120, max: 240 }, url: "https://www.hackfall.org.uk/visit", confidence: 0.8 },
      { key: "dog_rule", value: "yes", url: "https://www.hackfall.org.uk/dogs", confidence: 0.9 },
      { key: "price", value: { adult_pence: 0, free: true }, confidence: 0.9 },
      { key: "parking", value: { available: true, cost_note: "£2 all day" }, url: "not a link", confidence: 0.5 },
      { key: "made_up_key", value: "x", url: "https://www.hackfall.org.uk/" },
      { key: "seasons", value: ["Spring", "autumn", "monsoon"], url: "https://www.hackfall.org.uk/when", confidence: 0.4 },
      { key: "summary", value: "Dupe", url: "https://www.hackfall.org.uk/" },
      { key: "summary", value: "Second summary is dropped", url: "https://www.hackfall.org.uk/" },
    ],
  });

  it("keeps cited facts, drops the uncited, the unlinkable and the unknown keys, and shapes values", () => {
    const facts = factsFromModelJson(`Here you go:\n${answer}`);
    expect(facts.map((f) => f.key)).toEqual(["typical_minutes", "dog_rule", "seasons", "summary"]);
    expect(facts[0]).toMatchObject({ value: { min: 120, max: 240 }, source_kind: "web_search", source_url: "https://www.hackfall.org.uk/visit", confidence: 0.7 });
    expect(facts[2].value).toEqual(["spring", "autumn"]);
    expect(facts[3].value).toBe("Dupe");
  });

  it("a URL on a site the search never showed the model is not a citation", () => {
    const facts = factsFromModelJson(answer, ["https://www.hackfall.org.uk/visit", "https://nationaltrust.org.uk/x"]);
    expect(facts).toHaveLength(4);
    const elsewhere = factsFromModelJson(JSON.stringify({ facts: [{ key: "summary", value: "Nice", url: "https://example.com/page" }] }), ["https://www.hackfall.org.uk/visit"]);
    expect(elsewhere).toEqual([]);
  });

  it("reads the search tool's result URLs out of the content blocks", () => {
    const content = [
      { type: "server_tool_use", name: "web_search" },
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.example/1" }, { type: "web_search_result", url: "https://b.example/2" }] },
      { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
      { type: "text", text: "{}" },
    ];
    expect(urlsFromContent(content)).toEqual(["https://a.example/1", "https://b.example/2"]);
  });

  it("value shapes", () => {
    expect(shapeValue("typical_minutes", { max: 90 })).toEqual({ min: 90, max: 90 });
    expect(shapeValue("price", { adult_pence: 1250.4, note: "incl. parking" })).toEqual({ adult_pence: 1250, child_pence: null, free: false, note: "incl. parking" });
    expect(shapeValue("booking", { needed: "yes" })).toBeNull();
    expect(shapeValue("dog_rule", "Outside_Only")).toBe("outside_only");
    expect(shapeValue("best_time_of_day", ["Evening", "teatime"])).toEqual(["evening"]);
    expect(shapeValue("toilets", "true")).toBeNull();
  });

  it("no JSON, no facts", () => {
    expect(factsFromModelJson("I could not find anything.")).toEqual([]);
    expect(factsFromModelJson("{not json")).toEqual([]);
  });
});
