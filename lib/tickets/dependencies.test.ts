import { describe, expect, it } from "vitest";
import { dependencyRow, readDependencyBody } from "./dependencies";

describe("readDependencyBody", () => {
  it("reads a blocker", () => {
    expect(readDependencyBody({ blocker: " MYC-1 " })).toEqual({ ok: true, other: "MYC-1", direction: "blocker" });
  });
  it("reads a blocked ticket", () => {
    expect(readDependencyBody({ blocks: "MYC-2" })).toEqual({ ok: true, other: "MYC-2", direction: "blocks" });
  });
  it("refuses both, neither and non-strings", () => {
    expect(readDependencyBody({ blocker: "A", blocks: "B" }).ok).toBe(false);
    expect(readDependencyBody({}).ok).toBe(false);
    expect(readDependencyBody({ blocker: 3 }).ok).toBe(false);
  });
});

describe("dependencyRow", () => {
  it("points the row the right way", () => {
    expect(dependencyRow("self", "other", "blocker")).toEqual({ blocker_id: "other", blocked_id: "self" });
    expect(dependencyRow("self", "other", "blocks")).toEqual({ blocker_id: "self", blocked_id: "other" });
  });
});
