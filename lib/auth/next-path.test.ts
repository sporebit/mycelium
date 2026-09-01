import { describe, it, expect } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps a same-origin absolute path", () => {
    expect(safeNextPath("/organisation/receipts")).toBe(
      "/organisation/receipts"
    );
  });

  it("keeps a path with a query string and fragment", () => {
    expect(safeNextPath("/studio?range=7d#charts")).toBe(
      "/studio?range=7d#charts"
    );
  });

  it("falls back to the root for a missing target", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("rejects an absolute URL on another origin", () => {
    expect(safeNextPath("https://evil.example/")).toBe("/");
    expect(safeNextPath("http://evil.example/")).toBe("/");
  });

  it("rejects a protocol-relative URL", () => {
    // "//evil.example" is a valid URL that resolves off-origin, and it starts
    // with "/" — the naive check this function replaces let it straight through.
    expect(safeNextPath("//evil.example/")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
  });

  it("rejects the backslash form browsers normalise to protocol-relative", () => {
    expect(safeNextPath("/\\evil.example/")).toBe("/");
    expect(safeNextPath("/\\\\evil.example/")).toBe("/");
  });

  it("rejects a scheme with no authority", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("data:text/html,x")).toBe("/");
  });

  it("rejects a bare relative path", () => {
    expect(safeNextPath("organisation/receipts")).toBe("/");
  });
});
