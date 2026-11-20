import { describe, expect, it } from "vitest";
import { buildMemory, recall, type Known } from "./merchantMemory";

const k = (description: string, category: string | null, source: string | null = "ai", confidence: number | null = 0.9, locked = false): Known => ({ description, enriched_merchant: null, category, category_source: source, ai_confidence: confidence, category_locked: locked });

describe("remembering where a merchant goes", () => {
  it("remembers a merchant whose payments agree, whatever reference follows the name", () => {
    const memory = buildMemory([k("TESCO STORES 3301", "Groceries"), k("TESCO STORES 2210", "Groceries"), k("TESCO STORES 9001", "Groceries")]);
    expect(memory.get("TESCO STORES")).toBe("Groceries");
    expect(recall(memory, [{ id: "a", description: "TESCO STORES 4455", enriched_merchant: null }, { id: "b", description: "SOMEWHERE NEW", enriched_merchant: null }])).toEqual([{ id: "a", category: "Groceries" }]);
  });

  it("does not remember from one confident guess, an unsure guess, or 'Uncategorised'", () => {
    expect(buildMemory([k("CORNER CAFE", "Eating Out / Takeaway")]).size).toBe(0);
    expect(buildMemory([k("CORNER CAFE", "Eating Out / Takeaway", "ai", 0.5), k("CORNER CAFE", "Eating Out / Takeaway", "ai", 0.4)]).size).toBe(0);
    expect(buildMemory([k("ODD SHOP", "Uncategorised"), k("ODD SHOP", "Uncategorised")]).size).toBe(0);
    expect(buildMemory([k("NEW PLACE", null), k("NEW PLACE", null)]).size).toBe(0);
  });

  it("takes one choice made by hand as enough, and lets it outweigh the model", () => {
    expect(buildMemory([k("GARDEN CENTRE", "Shopping", "manual", null, true)]).get("GARDEN CENTRE")).toBe("Shopping");
    const memory = buildMemory([k("BIG SUPERSTORE", "Groceries", "ai", 0.9), k("BIG SUPERSTORE", "Shopping", "manual", null, true)]);
    expect(memory.get("BIG SUPERSTORE")).toBe("Shopping");
  });

  it("does not count what it placed itself, so a person's correction wins", () => {
    // two by hand, then twenty placed by the memory, then three corrected by hand: the memory forgets and asks again
    const byHand = [k("CORNER SHOP", "Groceries", "manual", null, true), k("CORNER SHOP", "Groceries", "manual", null, true)];
    const byMemory = Array.from({ length: 20 }, () => k("CORNER SHOP", "Groceries", "memory", null));
    const corrected = [k("CORNER SHOP", "Shopping", "manual", null, true), k("CORNER SHOP", "Shopping", "manual", null, true), k("CORNER SHOP", "Shopping", "manual", null, true)];
    expect(buildMemory([...byHand, ...byMemory]).get("CORNER SHOP")).toBe("Groceries");
    expect(buildMemory([...byHand, ...byMemory, ...corrected]).has("CORNER SHOP")).toBe(false);
  });

  it("leaves a merchant that goes two ways for a person to decide", () => {
    const memory = buildMemory([k("SUPERMARKET FUEL", "Groceries"), k("SUPERMARKET FUEL", "Fuel"), k("SUPERMARKET FUEL", "Groceries")]);
    expect(memory.has("SUPERMARKET FUEL")).toBe(false);
  });
});
