/**
 * Source of truth for which cards exist + how the default layout places
 * them in the 3-column grid.
 *
 * Keys here mirror the rows in dashboard_layouts. Adding a card to the
 * home dashboard means: import it into DashboardGrid's CARD_COMPONENTS
 * map, register the key here with default_col + default_position +
 * default_width, and the layout system auto-includes it via
 * reconcileLayout for existing users.
 */

export type CardWidth = 1 | 2 | 3;
export type CardCol = 1 | 2 | 3;

export type CardConfig = {
  /** Human label shown in the Customize sheet. */
  label: string;
  /** Which width spans the card supports — width=1 lives in a single
   *  column, width>=2 renders as a full-width spanner above the columns. */
  supports: CardWidth[];
  default_width: CardWidth;
  /** Which column (1/2/3) this card lands in for a brand-new user.
   *  Spanners (default_width>=2) ignore this at render time but still
   *  carry it so drag-reorder has a stable home. */
  default_col: CardCol;
  /** Lower numbers sort earlier within their column for a brand-new user. */
  default_position: number;
};

/**
 * Default layout per the 3-column rebuild spec:
 *   Col 1: Operator → Session (spanner) → Goals → Nutrition → Calendar
 *   Col 2: Habits → Key Blockers → Finance Pulse (spanner)
 *   Col 3: Capture Review → Fitness → Journal → Fuel
 *
 * `default_position` is a per-column ordinal so positions can repeat
 * across columns without clashing.
 */
export const CARD_REGISTRY: Record<string, CardConfig> = {
  operator:      { label: "Operator",       supports: [1, 2, 3], default_width: 1, default_col: 1, default_position: 0 },
  session:       { label: "Session",        supports: [1, 2, 3], default_width: 2, default_col: 1, default_position: 1 },
  goals:         { label: "Goals",          supports: [1, 2, 3], default_width: 1, default_col: 1, default_position: 2 },
  nutrition:     { label: "Nutrition",      supports: [1, 2, 3], default_width: 1, default_col: 1, default_position: 3 },
  calendar:      { label: "Calendar",       supports: [1, 2, 3], default_width: 1, default_col: 1, default_position: 4 },

  habits:        { label: "Habits",         supports: [1, 2, 3], default_width: 1, default_col: 2, default_position: 0 },
  key_blockers:  { label: "Key Blockers",   supports: [1, 2, 3], default_width: 1, default_col: 2, default_position: 1 },
  finance_pulse: { label: "Finance Pulse",  supports: [1, 2, 3], default_width: 2, default_col: 2, default_position: 2 },

  capture_review:{ label: "Capture Review", supports: [1, 2, 3], default_width: 1, default_col: 3, default_position: 0 },
  fitness:       { label: "Fitness",        supports: [1, 2, 3], default_width: 1, default_col: 3, default_position: 1 },
  journal:       { label: "Journal",        supports: [1, 2, 3], default_width: 1, default_col: 3, default_position: 2 },
  glossary:      { label: "Glossary",       supports: [1, 2, 3], default_width: 1, default_col: 3, default_position: 3 },
  fuel:          { label: "Fuel",           supports: [1, 2, 3], default_width: 1, default_col: 3, default_position: 4 },
  supplements:   { label: "Supplements",   supports: [1, 2, 3], default_width: 1, default_col: 1, default_position: 5 },
  bins:          { label: "Bins",          supports: [1, 2, 3], default_width: 1, default_col: 2, default_position: 3 },
};

export const CARD_KEYS = Object.keys(CARD_REGISTRY);

export type CardLayoutRow = {
  card_key: string;
  col: CardCol;
  position: number;
  width: CardWidth;
  hidden: boolean;
};

function asCol(v: unknown): CardCol {
  return v === 2 || v === 3 ? v : 1;
}

/** Compute the implicit default layout for a brand-new user (no rows yet). */
export function defaultLayout(): CardLayoutRow[] {
  return Object.entries(CARD_REGISTRY).map(([key, cfg]) => ({
    card_key: key,
    col: cfg.default_col,
    position: cfg.default_position,
    width: cfg.default_width,
    hidden: false,
  }));
}

/**
 * Merge stored rows with the registry: drop unknown keys (cards removed
 * from the registry), append any new keys the user hasn't customised
 * yet, coerce widths to ones the card supports, and coerce out-of-range
 * `col` values to safe defaults.
 *
 * For users migrated from the pre-`col` schema (migration 0020 backfills
 * via `(position % 3) + 1`), this preserves the spread while leaving
 * subsequent edits authoritative.
 */
export function reconcileLayout(stored: CardLayoutRow[]): CardLayoutRow[] {
  const knownByKey = new Map<string, CardLayoutRow>();
  for (const row of stored) {
    if (!CARD_REGISTRY[row.card_key]) continue;
    const cfg = CARD_REGISTRY[row.card_key];
    const safeWidth = (cfg.supports as number[]).includes(row.width)
      ? row.width
      : cfg.default_width;
    knownByKey.set(row.card_key, {
      ...row,
      width: safeWidth,
      col: asCol(row.col),
    });
  }
  // Append registry keys the user doesn't have rows for yet — each new
  // card lands at the end of its registry-defined column so recently-
  // added cards (e.g. capture_review) join sensibly without trampling
  // saved positions.
  const maxPosByCol = new Map<CardCol, number>([
    [1, -1],
    [2, -1],
    [3, -1],
  ]);
  for (const row of knownByKey.values()) {
    const cur = maxPosByCol.get(row.col) ?? -1;
    if (row.position > cur) maxPosByCol.set(row.col, row.position);
  }
  for (const [key, cfg] of Object.entries(CARD_REGISTRY)) {
    if (knownByKey.has(key)) continue;
    const targetCol = cfg.default_col;
    const nextPos = (maxPosByCol.get(targetCol) ?? -1) + 1;
    maxPosByCol.set(targetCol, nextPos);
    knownByKey.set(key, {
      card_key: key,
      col: targetCol,
      position: nextPos,
      width: cfg.default_width,
      hidden: false,
    });
  }
  return Array.from(knownByKey.values()).sort((a, b) => {
    if (a.col !== b.col) return a.col - b.col;
    return a.position - b.position;
  });
}
