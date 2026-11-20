import { describe, expect, it } from "vitest";
import { PIN_RE, hashPin, newSalt } from "./quickUnlock";

describe("the quick-unlock PIN", () => {
  it("is four to eight digits", () => {
    expect(PIN_RE.test("1234")).toBe(true);
    expect(PIN_RE.test("12345678")).toBe(true);
    expect(PIN_RE.test("123")).toBe(false);
    expect(PIN_RE.test("123456789")).toBe(false);
    expect(PIN_RE.test("12a4")).toBe(false);
    expect(PIN_RE.test("")).toBe(false);
  });
  it("hashes the same PIN the same with the same salt, and differently otherwise", async () => {
    const salt = newSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    const a = await hashPin("2468", salt);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPin("2468", salt)).toBe(a);
    expect(await hashPin("2469", salt)).not.toBe(a);
    expect(await hashPin("2468", newSalt())).not.toBe(a);
    expect(a).not.toContain("2468");
  });
});
