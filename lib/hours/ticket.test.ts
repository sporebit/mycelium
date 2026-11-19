import { describe, expect, it } from "vitest";
import { keyFor, normaliseKey, parseTicket } from "./ticket";

const BASE = "https://example.atlassian.net/browse/";

describe("parseTicket", () => {
  it("takes the key after browse/ and keeps the pasted URL as the link", () => {
    const p = parseTicket("https://example.atlassian.net/browse/ABC-123?focusedCommentId=1", BASE);
    expect(p).toEqual({ key: "ABC-123", url: "https://example.atlassian.net/browse/ABC-123?focusedCommentId=1", isPlainLink: false });
  });

  it("builds the link from the base URL when only a key was typed", () => {
    expect(parseTicket("  abc-7 ", BASE)).toEqual({ key: "ABC-7", url: `${BASE}ABC-7`, isPlainLink: false });
  });

  it("treats a URL without browse/ as a plain link with no key", () => {
    const p = parseTicket("https://example.atlassian.net/wiki/spaces/CC/pages/1/Plan?", BASE);
    expect(p.key).toBeNull();
    expect(p.isPlainLink).toBe(true);
    expect(p.url).toBe("https://example.atlassian.net/wiki/spaces/CC/pages/1/Plan?");
  });

  it("is empty for blank text and has no link without a base", () => {
    expect(parseTicket("", BASE)).toEqual({ key: null, url: null, isPlainLink: false });
    expect(parseTicket("ABC-1", "")).toEqual({ key: "ABC-1", url: null, isPlainLink: false });
  });

  it("stops the key at a hash or a trailing slash", () => {
    expect(parseTicket("https://x/browse/ABC-9#comments", BASE).key).toBe("ABC-9");
    expect(parseTicket("https://x/browse/ABC-9/", BASE).key).toBe("ABC-9");
  });

  it("only upper-cases things shaped like a key", () => {
    expect(normaliseKey("itsd-411308")).toBe("ITSD-411308");
    expect(normaliseKey("catch up call")).toBe("catch up call");
    expect(keyFor("https://x/browse/q-1")).toBe("Q-1");
    expect(keyFor(null)).toBeNull();
  });
});
