/**
 * Bulk reference data out of the hosted database (master run §9): the
 * pure rules. Measured 2026-11-20: the public schema was 88 MB, of which
 * gousto_recipes was 65 MB, and 46 MB of that the `detail` column (12,147
 * recipes' ingredients, steps and nutrition: a copy of a public cookbook,
 * not a personal record). Everything else in the database is small.
 *
 * What moves: a recipe's `detail`, when nobody has reason to want it on
 * the hosted copy. What stays: the listing (title, picture, rating,
 * cuisine, times, categories), every favourite's and every saved recipe's
 * detail, and any detail opened in the last two months. A moved detail
 * comes back when the recipe is opened (lib/health/recipeDetail.ts).
 */

export type OffloadCandidate = {
  slug: string;
  is_favourite: boolean;
  saved_recipe_id: string | null;
  detail_opened_at: string | null;
  detail_offloaded_at: string | null;
  has_detail: boolean;
};

/** A detail opened within this many days stays on the hosted copy. */
export const KEEP_OPENED_DAYS = 60;
/** Rows handed to the PC per job: 300 details is about a megabyte. */
export const OFFLOAD_BATCH = 300;

/** True when this recipe's detail may live on the PC instead of the hosted database. */
export function isCold(c: OffloadCandidate, now: Date = new Date()): boolean {
  if (!c.has_detail) return false;
  if (c.is_favourite || c.saved_recipe_id) return false;
  if (c.detail_opened_at && now.getTime() - new Date(c.detail_opened_at).getTime() < KEEP_OPENED_DAYS * 86_400_000) return false;
  return true;
}

/** The slugs the PC confirmed it holds: strings, each once, at most a batch's worth. */
export function heldOf(result: Record<string, unknown>, max = 1000): string[] {
  const held = Array.isArray(result.held) ? result.held.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 240) : [];
  return [...new Set(held)].slice(0, max);
}

export type HeldState = "hosted" | "pc" | "none";

/** Where a recipe's detail is, from its row. */
export function detailState(row: { detail: unknown; detail_offloaded_at: string | null; detail_fetched_at: string | null }): HeldState {
  if (row.detail) return "hosted";
  if (row.detail_offloaded_at) return "pc";
  return "none";
}
