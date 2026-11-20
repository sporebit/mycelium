/**
 * Near-duplicate gift ideas, pure (spec §4.7). The spec asked for a trigram
 * similarity over titles for the same recipient; pg_trgm is not installed
 * on the hosted project, so the same measure runs in app code over the
 * caller's own gifts (a few hundred rows at most), as the quotes do.
 */
import { similarity } from "@/lib/quotes/text";

export const GIFT_DUPLICATE_THRESHOLD = 0.6;

export type Candidate = { id: string; title: string; for_person_id: string | null; for_label: string | null; status: string };
export type Similar = { id: string; title: string; status: string; score: number };

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Gifts for the same recipient whose title reads like this one. "Same
 * recipient" is the same person id, or the same free-text label when there
 * is no person yet; a gift with no recipient at all compares with every
 * unassigned one.
 */
export function similarGifts(
  title: string,
  recipient: { for_person_id: string | null; for_label: string | null },
  pool: readonly Candidate[],
  excludeId?: string | null,
): Similar[] {
  const t = norm(title);
  if (!t) return [];
  const label = recipient.for_label ? norm(recipient.for_label) : null;
  return pool
    .filter((g) => g.id !== excludeId)
    .filter((g) => {
      if (recipient.for_person_id) return g.for_person_id === recipient.for_person_id;
      if (label) return !g.for_person_id && !!g.for_label && norm(g.for_label) === label;
      return !g.for_person_id && !g.for_label;
    })
    .map((g) => {
      const other = norm(g.title);
      const score = other === t || other.includes(t) || t.includes(other) ? 1 : similarity(t, other);
      return { id: g.id, title: g.title, status: g.status, score };
    })
    .filter((g) => g.score > GIFT_DUPLICATE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
