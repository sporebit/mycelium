import { describe, expect, it } from "vitest";
import {
  BREAK_GLASS_MAX_AGE,
  breakGlassEnabled,
  breakGlassSecretMatches,
  signBreakGlassToken,
  verifyBreakGlassToken,
} from "./cookie";

const SECRET = "test-break-glass-secret";

describe("break-glass token", () => {
  it("round-trips with the right secret", async () => {
    const now = 1_700_000_000_000;
    const token = await signBreakGlassToken(SECRET, now);
    expect(token.split(".")).toHaveLength(2);
    expect(await verifyBreakGlassToken(token, SECRET, now + 1000)).toEqual({ iat: now });
  });

  it("is refused with the wrong secret or none", async () => {
    const token = await signBreakGlassToken(SECRET);
    expect(await verifyBreakGlassToken(token, "other")).toBeNull();
    expect(await verifyBreakGlassToken(token, undefined)).toBeNull();
    expect(await verifyBreakGlassToken(undefined, SECRET)).toBeNull();
    expect(await verifyBreakGlassToken("", SECRET)).toBeNull();
  });

  it("is refused when tampered", async () => {
    const token = await signBreakGlassToken(SECRET);
    const [payload, sig] = token.split(".");
    expect(await verifyBreakGlassToken(`${payload}x.${sig}`, SECRET)).toBeNull();
    expect(await verifyBreakGlassToken(`${payload}.${sig.slice(0, -2)}AA`, SECRET)).toBeNull();
    expect(await verifyBreakGlassToken("nodot", SECRET)).toBeNull();
    expect(await verifyBreakGlassToken(".sigonly", SECRET)).toBeNull();
  });

  it("expires after the max age and rejects future issue times", async () => {
    const now = 1_700_000_000_000;
    const token = await signBreakGlassToken(SECRET, now);
    const justInside = now + BREAK_GLASS_MAX_AGE * 1000 - 1;
    const justOutside = now + BREAK_GLASS_MAX_AGE * 1000 + 1;
    expect(await verifyBreakGlassToken(token, SECRET, justInside)).not.toBeNull();
    expect(await verifyBreakGlassToken(token, SECRET, justOutside)).toBeNull();
    // Issued two minutes in the future relative to "now": a forgery, not skew.
    expect(await verifyBreakGlassToken(token, SECRET, now - 120_000)).toBeNull();
  });
});

describe("break-glass flag and secret", () => {
  it("is enabled only by the literal string true", () => {
    expect(breakGlassEnabled({ BREAK_GLASS_ENABLED: "true" })).toBe(true);
    expect(breakGlassEnabled({ BREAK_GLASS_ENABLED: "1" })).toBe(false);
    expect(breakGlassEnabled({ BREAK_GLASS_ENABLED: "TRUE" })).toBe(false);
    expect(breakGlassEnabled({})).toBe(false);
  });

  it("matches the configured secret exactly and never an unset one", () => {
    const env = { BREAK_GLASS_SECRET: SECRET };
    expect(breakGlassSecretMatches(SECRET, env)).toBe(true);
    expect(breakGlassSecretMatches(SECRET + " ", env)).toBe(false);
    expect(breakGlassSecretMatches("", env)).toBe(false);
    expect(breakGlassSecretMatches(SECRET, {})).toBe(false);
  });
});
