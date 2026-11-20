import type { CardWidth } from "./card-registry";

/**
 * The home dashboard's card sizes and how each one spans the grid.
 *
 * Desktop is a 12-column grid: a quarter, a half, three quarters, the row.
 * Tablet is a 6-column grid, which cannot hold quarters, so a card's span
 * there follows its width class instead: a third, two thirds, the row.
 * Mobile stacks the cards and has no spans.
 */
export type CardSize =
  | "sm"
  | "tall"
  | "tall-3"
  | "tall-4"
  | "md"
  | "md-3"
  | "md-4"
  | "wide"
  | "lg"
  | "full";

export const SIZE_CONFIG: Record<CardSize, { colSpan: number; rowSpan: number }> = {
  sm:       { colSpan: 3,  rowSpan: 1 },
  tall:     { colSpan: 3,  rowSpan: 2 },
  "tall-3": { colSpan: 3,  rowSpan: 3 },
  "tall-4": { colSpan: 3,  rowSpan: 4 },
  md:       { colSpan: 6,  rowSpan: 2 },
  "md-3":   { colSpan: 6,  rowSpan: 3 },
  "md-4":   { colSpan: 6,  rowSpan: 4 },
  wide:     { colSpan: 9,  rowSpan: 1 },
  lg:       { colSpan: 9,  rowSpan: 2 },
  full:     { colSpan: 12, rowSpan: 1 },
};

export const ALL_SIZES: CardSize[] = [
  "sm", "tall", "tall-3", "tall-4", "md", "md-3", "md-4", "wide", "lg", "full",
];

export const DESKTOP_COLS = 12;
export const TABLET_COLS = 6;

/** The width class a card renders its content for: 1 narrow, 2 medium, 3 wide. */
export function sizeToWidth(size: CardSize): CardWidth {
  const span = SIZE_CONFIG[size].colSpan;
  if (span <= 3) return 1;
  if (span <= 6) return 2;
  return 3;
}

/**
 * Column span on a given grid. Desktop uses the configured span. Tablet
 * has no quarters, so the span follows the width class: a third, two
 * thirds, the row. (It used to send every span of six or more to the whole
 * row, which turned a width-2 card into a width-3 one on that breakpoint
 * and broke the dense flow into a stack.)
 */
export function colSpanFor(size: CardSize, cols: number): number {
  if (cols === DESKTOP_COLS) return SIZE_CONFIG[size].colSpan;
  return sizeToWidth(size) * (TABLET_COLS / 3);
}
