import { describe, it, expect } from "vitest";
import { TOTAL_TOLERANCE } from "@/lib/types/receipt";
import { isReconcilable, money, reconcile } from "./reconcile";

describe("money", () => {
  it("strips the floating-point tail from a sum of line totals", () => {
    const lines = [11.99, 4.79, 4.79, 3.49, 5.99, 2.99, 6.49, 4.99, 3.45];
    const raw = lines.reduce((a, b) => a + b, 0);
    expect(raw).not.toBe(48.97); // 48.97000000000001
    expect(money(raw)).toBe(48.97);
  });

  it("resolves the classic 0.1 + 0.2 case", () => {
    expect(money(0.1 + 0.2)).toBe(0.3);
  });

  it("leaves a value already at 2dp alone", () => {
    expect(money(116.52)).toBe(116.52);
    expect(money(0)).toBe(0);
  });

  it("rounds a half up at the third decimal — where the binary value allows", () => {
    expect(money(2.675)).toBe(2.68);
  });

  it("does NOT round 1.005 up, because 1.005 * 100 is 100.49999999999999", () => {
    // Pinned deliberately. money() removes the tail from an accumulated sum,
    // which is what its call sites feed it; it is not a general-purpose
    // decimal rounder and must not be relied on as one.
    expect(money(1.005)).toBe(1);
  });
});

describe("reconcile", () => {
  it("holds a receipt with no printed total", () => {
    expect(reconcile(48.97, null)).toEqual({
      status: "needs_review",
      review_reason: "no_total",
    });
  });

  it("treats an absent total the same as a null one", () => {
    expect(reconcile(48.97, undefined)).toEqual({
      status: "needs_review",
      review_reason: "no_total",
    });
  });

  it("files a receipt whose lines match the printed total exactly", () => {
    expect(reconcile(116.52, 116.52)).toEqual({
      status: "parsed",
      review_reason: null,
    });
  });

  it("files a receipt inside tolerance in either direction", () => {
    expect(reconcile(100.03, 100).status).toBe("parsed");
    expect(reconcile(99.97, 100).status).toBe("parsed");
  });

  it("holds a receipt outside tolerance in either direction", () => {
    expect(reconcile(70.71, 116.52)).toEqual({
      status: "needs_review",
      review_reason: "total_mismatch",
    });
    expect(reconcile(116.52, 70.71)).toEqual({
      status: "needs_review",
      review_reason: "total_mismatch",
    });
  });

  it("rejects a difference of exactly one tolerance-width", () => {
    // TOTAL_TOLERANCE is 0.05 and the comparison is a strict `>`, so 5p looks
    // like it should be accepted. It is not: Math.abs(10 - 10.05) evaluates to
    // 0.05000000000000071. The boundary is therefore exclusive in practice but
    // only because of the float representation, not by design — do not lean on
    // either side of it when choosing a tolerance.
    expect(TOTAL_TOLERANCE).toBe(0.05);
    expect(reconcile(10.05, 10).review_reason).toBe("total_mismatch");
  });

  it("files a zero-total receipt with no lines", () => {
    expect(reconcile(0, 0)).toEqual({ status: "parsed", review_reason: null });
  });

  it("agrees with itself when the sum is rounded through money() first", () => {
    // The rule's own doc comment warns that the same sum rounded two ways can
    // land on opposite sides of the boundary. Both call sites must round
    // before comparing, so this pins that they agree once they do.
    const raw = [11.99, 4.79, 4.79, 3.49, 5.99, 2.99, 6.49, 4.99, 3.45].reduce(
      (a, b) => a + b,
      0
    );
    expect(reconcile(money(raw), 48.97).status).toBe("parsed");
  });
});

describe("isReconcilable", () => {
  it("refuses while a reparse is mid-flight", () => {
    // The reparse deletes and re-inserts the whole line set, so a sum taken
    // now may cover a partial set.
    expect(isReconcilable("parsing", null)).toBe(false);
    expect(isReconcilable("parsing", "total_mismatch")).toBe(false);
  });

  it("refuses on a failed parse, so the recorded failure is not overwritten", () => {
    expect(isReconcilable("failed", null)).toBe(false);
    expect(isReconcilable("failed", "no_images")).toBe(false);
  });

  it("refuses when there is no printed total to reconcile against", () => {
    expect(isReconcilable("needs_review", "no_total")).toBe(false);
  });

  it("allows a line edit to resolve a total mismatch", () => {
    expect(isReconcilable("needs_review", "total_mismatch")).toBe(true);
  });

  it("allows a line edit to unfile an already-parsed receipt", () => {
    expect(isReconcilable("parsed", null)).toBe(true);
  });

  it("allows an edit on a freshly uploaded receipt", () => {
    expect(isReconcilable("uploaded", null)).toBe(true);
  });
});
