/**
 * Source of truth for which cards exist + which widths they support.
 * Keys here mirror the rows in dashboard_layouts. Adding a card to the home
 * dashboard means: import it into Shell, register the key here, and the
 * Phase 4 layout system auto-includes it (defaults to position = max+1).
 */

export type CardWidth = 1 | 2 | 3;

export type CardConfig = {
  /** Human label shown in the Customize sheet. */
  label: string;
  /** Which width spans the card supports on the desktop grid. */
  supports: CardWidth[];
  default_width: CardWidth;
  /** Lower numbers sort earlier in the implicit default layout. */
  default_position: number;
};

export const CARD_REGISTRY: Record<string, CardConfig> = {
  operator:      { label: "Operator",      supports: [1, 2],    default_width: 1, default_position: 0 },
  session:       { label: "Session",       supports: [1, 2],    default_width: 1, default_position: 1 },
  finance_pulse: { label: "Finance Pulse", supports: [1, 2, 3], default_width: 2, default_position: 2 },
  habits:        { label: "Habits",        supports: [1, 2],    default_width: 1, default_position: 3 },
  goals:         { label: "Goals",         supports: [1, 2],    default_width: 1, default_position: 4 },
  key_blockers:  { label: "Key Blockers",  supports: [1, 2, 3], default_width: 2, default_position: 5 },
  journal:       { label: "Journal",       supports: [1, 2, 3], default_width: 1, default_position: 6 },
  calendar:      { label: "Calendar",      supports: [2, 3],    default_width: 3, default_position: 7 },
  nutrition:     { label: "Nutrition",     supports: [1, 2],    default_width: 1, default_position: 8 },
  fitness:       { label: "Fitness",       supports: [1, 2, 3], default_width: 1, default_position: 9 },
  fuel:          { label: "Fuel",          supports: [1, 2],    default_width: 1, default_position: 10 },
};

export const CARD_KEYS = Object.keys(CARD_REGISTRY);

export type CardLayoutRow = {
  card_key: string;
  position: number;
  width: CardWidth;
  hidden: boolean;
};

/** Compute the implicit default layout for a brand-new user (no rows yet). */
export function defaultLayout(): CardLayoutRow[] {
  return Object.entries(CARD_REGISTRY)
    .map(([key, cfg]) => ({
      card_key: key,
      position: cfg.default_position,
      width: cfg.default_width,
      hidden: false,
    }))
    .sort((a, b) => a.position - b.position);
}

/**
 * Merge stored rows with the registry: drop unknown keys (cards removed from
 * the registry), append any new keys the user hasn't customised yet, and
 * coerce widths to ones the card supports.
 */
export function reconcileLayout(stored: CardLayoutRow[]): CardLayoutRow[] {
  const knownByKey = new Map<string, CardLayoutRow>();
  for (const row of stored) {
    if (!CARD_REGISTRY[row.card_key]) continue;
    const cfg = CARD_REGISTRY[row.card_key];
    const safeWidth = (cfg.supports as number[]).includes(row.width)
      ? row.width
      : cfg.default_width;
    knownByKey.set(row.card_key, { ...row, width: safeWidth });
  }
  // Append any registry keys the user doesn't have rows for yet.
  let maxPos = stored.reduce((m, r) => Math.max(m, r.position), -1);
  for (const [key, cfg] of Object.entries(CARD_REGISTRY)) {
    if (knownByKey.has(key)) continue;
    maxPos += 1;
    knownByKey.set(key, {
      card_key: key,
      position: maxPos,
      width: cfg.default_width,
      hidden: false,
    });
  }
  return Array.from(knownByKey.values()).sort(
    (a, b) => a.position - b.position
  );
}
