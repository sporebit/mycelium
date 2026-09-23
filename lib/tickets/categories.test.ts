import { describe, expect, it } from "vitest";
import { looksLikeKey, preferLiveKey, ticketKeyFilter } from "./categories";

describe("ticketKeyFilter (0135 alias-aware key lookup)", () => {
  it("matches the live key or an alias for a key-shaped input, upper-cased", () => {
    expect(ticketKeyFilter("myc-50")).toBe("ticket_key.eq.MYC-50,key_aliases.cs.{MYC-50}");
    expect(ticketKeyFilter("  PW-14 ")).toBe("ticket_key.eq.PW-14,key_aliases.cs.{PW-14}");
  });

  it("refuses anything that is not a key, so nothing else can reach the filter string", () => {
    expect(ticketKeyFilter("")).toBeNull();
    expect(ticketKeyFilter("MYC-50,id.eq.x")).toBeNull();
    expect(ticketKeyFilter("(MYC-50)")).toBeNull();
    expect(ticketKeyFilter("TOOLONG-1")).toBeNull();
    expect(ticketKeyFilter("12-34")).toBeNull();
    expect(looksLikeKey("MYC-50")).toBe(true);
  });
});

describe("preferLiveKey", () => {
  const live = { ticket_key: "DSA-3", key_aliases: ["PW-14"] };
  const other = { ticket_key: "PW-14", key_aliases: [] as string[] };

  it("returns the row whose live key matches, ahead of an alias match", () => {
    expect(preferLiveKey([live, other], "pw-14")).toBe(other);
    expect(preferLiveKey([other, live], "PW-14")).toBe(other);
  });

  it("falls back to the alias match when no live key matches", () => {
    expect(preferLiveKey([live], "PW-14")).toBe(live);
  });

  it("is null on no rows", () => {
    expect(preferLiveKey([], "PW-14")).toBeNull();
  });
});
