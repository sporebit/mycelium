/**
 * Categorising without asking (master run §10: "silent; only low-confidence
 * ones become swipe cards"). Pure.
 *
 * Most spending is at places already seen. If every payment to a merchant
 * that has a category has the same one, the next payment to that merchant
 * gets it too: no model, no cost, the same answer every time. What a
 * person chose by hand counts for most; a confident guess by the model
 * counts; an unsure guess does not count at all.
 */
import { merchantKey } from "./recurring";

export type Known = { description: string | null; enriched_merchant: string | null; category: string | null; category_source: string | null; ai_confidence: number | null; category_locked: boolean };
export type Unknown = { id: string; description: string | null; enriched_merchant: string | null };

/** How much one categorised payment counts towards its merchant's category. */
function weight(t: Known): number {
  if (!t.category || t.category === "Uncategorised") return 0;
  if (t.category_locked || t.category_source === "manual") return 5;
  // What the memory itself placed is not evidence: it would vote for its own answer for ever.
  if (t.category_source === "memory") return 0;
  if (t.category_source === "rule") return 2;
  if (t.category_source === "ai") return (t.ai_confidence ?? 0) >= 0.8 ? 1 : 0;
  return 1;
}

/**
 * Merchant → category, for the merchants whose payments agree. A merchant
 * is remembered when it has at least two votes' worth of evidence and at
 * least 80% of it points one way (a supermarket that is sometimes fuel is
 * left for a person to decide).
 */
export function buildMemory(known: readonly Known[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const t of known) {
    const w = weight(t);
    if (!w) continue;
    const key = merchantKey(t.description, t.enriched_merchant);
    if (key.length < 3) continue;
    const m = votes.get(key) ?? new Map<string, number>();
    m.set(t.category as string, (m.get(t.category as string) ?? 0) + w);
    votes.set(key, m);
  }
  const memory = new Map<string, string>();
  for (const [key, m] of votes) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [category, top] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total >= 2 && top / total >= 0.8) memory.set(key, category);
  }
  return memory;
}

/** The payments the memory can place, with where. */
export function recall(memory: ReadonlyMap<string, string>, unknown: readonly Unknown[]): Array<{ id: string; category: string }> {
  const out: Array<{ id: string; category: string }> = [];
  for (const t of unknown) {
    const category = memory.get(merchantKey(t.description, t.enriched_merchant));
    if (category) out.push({ id: t.id, category });
  }
  return out;
}

/** Below this, a model's category is a guess to be checked, not an answer. */
export const UNSURE_BELOW = 0.6;
