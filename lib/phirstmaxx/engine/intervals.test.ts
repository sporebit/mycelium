import { describe, expect, it } from "vitest";
import { intersect, merge, subtract } from "./intervals";

const i = (start: number, end: number) => ({ start, end });

describe("merge", () => {
  it("coalesces overlapping and touching intervals", () => {
    expect(merge([i(0, 10), i(5, 15), i(15, 20), i(30, 40)])).toEqual([i(0, 20), i(30, 40)]);
  });
  it("drops empty intervals", () => {
    expect(merge([i(5, 5), i(10, 2)])).toEqual([]);
  });
});

describe("intersect", () => {
  it("finds the common parts", () => {
    expect(intersect([i(0, 10), i(20, 30)], [i(5, 25)])).toEqual([i(5, 10), i(20, 25)]);
  });
  it("is empty when disjoint", () => {
    expect(intersect([i(0, 10)], [i(10, 20)])).toEqual([]);
  });
});

describe("subtract", () => {
  it("cuts holes", () => {
    expect(subtract([i(0, 100)], [i(10, 20), i(50, 60)])).toEqual([i(0, 10), i(20, 50), i(60, 100)]);
  });
  it("handles cuts that overhang the edges", () => {
    expect(subtract([i(10, 50)], [i(0, 20), i(40, 60)])).toEqual([i(20, 40)]);
  });
  it("removes everything when fully covered", () => {
    expect(subtract([i(10, 50)], [i(0, 60)])).toEqual([]);
  });
});
