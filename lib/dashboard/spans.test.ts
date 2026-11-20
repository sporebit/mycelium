import { describe, expect, it } from "vitest";
import {
  ALL_SIZES,
  DESKTOP_COLS,
  SIZE_CONFIG,
  TABLET_COLS,
  colSpanFor,
  sizeToWidth,
} from "./spans";

describe("dashboard card spans", () => {
  it("desktop keeps the configured span for every size", () => {
    for (const size of ALL_SIZES) {
      expect(colSpanFor(size, DESKTOP_COLS)).toBe(SIZE_CONFIG[size].colSpan);
    }
  });

  it("tablet keeps the three widths distinct: a third, two thirds, the row", () => {
    expect(colSpanFor("sm", TABLET_COLS)).toBe(2);
    expect(colSpanFor("tall", TABLET_COLS)).toBe(2);
    expect(colSpanFor("md", TABLET_COLS)).toBe(4);
    expect(colSpanFor("md-4", TABLET_COLS)).toBe(4);
    expect(colSpanFor("wide", TABLET_COLS)).toBe(6);
    expect(colSpanFor("lg", TABLET_COLS)).toBe(6);
    expect(colSpanFor("full", TABLET_COLS)).toBe(6);
  });

  it("a width-2 card is never promoted to the width-3 span", () => {
    for (const cols of [DESKTOP_COLS, TABLET_COLS]) {
      for (const size of ALL_SIZES) {
        if (sizeToWidth(size) !== 2) continue;
        expect(colSpanFor(size, cols)).toBeLessThan(colSpanFor("full", cols));
      }
    }
  });

  it("the tablet span of a card never exceeds the grid", () => {
    for (const size of ALL_SIZES) {
      expect(colSpanFor(size, TABLET_COLS)).toBeLessThanOrEqual(TABLET_COLS);
    }
  });

  it("the width class follows the desktop span", () => {
    expect(sizeToWidth("sm")).toBe(1);
    expect(sizeToWidth("md")).toBe(2);
    expect(sizeToWidth("wide")).toBe(3);
    expect(sizeToWidth("full")).toBe(3);
  });
});
