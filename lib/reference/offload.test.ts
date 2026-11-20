import { describe, expect, it } from "vitest";
import { detailState, heldOf, isCold, KEEP_OPENED_DAYS } from "./offload";

const now = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const base = { slug: "s", is_favourite: false, saved_recipe_id: null, detail_opened_at: null, detail_offloaded_at: null, has_detail: true };

describe("which recipe details may live on the PC", () => {
  it("a plain recipe nobody has opened: yes", () => {
    expect(isCold(base, now)).toBe(true);
  });
  it("a favourite, a saved copy, or one opened in the last two months: no", () => {
    expect(isCold({ ...base, is_favourite: true }, now)).toBe(false);
    expect(isCold({ ...base, saved_recipe_id: "r1" }, now)).toBe(false);
    expect(isCold({ ...base, detail_opened_at: daysAgo(KEEP_OPENED_DAYS - 1) }, now)).toBe(false);
    expect(isCold({ ...base, detail_opened_at: daysAgo(KEEP_OPENED_DAYS + 1) }, now)).toBe(true);
  });
  it("nothing to move when there is no detail", () => {
    expect(isCold({ ...base, has_detail: false }, now)).toBe(false);
  });
});

describe("what the PC says it holds", () => {
  it("strings only, each once, nothing when it said nothing", () => {
    expect(heldOf({ held: ["a", "b", "b", "", 3] })).toEqual(["a", "b"]);
    expect(heldOf({})).toEqual([]);
    expect(heldOf({ held: ["a", "b", "c"] }, 2)).toEqual(["a", "b"]);
  });
});

describe("where a detail is", () => {
  it("hosted, on the PC, or never fetched", () => {
    expect(detailState({ detail: { steps: [] }, detail_offloaded_at: null, detail_fetched_at: "x" })).toBe("hosted");
    expect(detailState({ detail: null, detail_offloaded_at: "x", detail_fetched_at: "x" })).toBe("pc");
    expect(detailState({ detail: null, detail_offloaded_at: null, detail_fetched_at: null })).toBe("none");
  });
});
