/**
 * One Gousto recipe with its detail, wherever the detail is (master run §9
 * "database size"). The one function the app reads a recipe through:
 *
 *   hosted  the detail is on the row: returned, and the opening stamped
 *           so the recipe stays on the hosted copy for two months.
 *   pc      the detail is on the PC. If the PC is on, it is asked for
 *           (one request per recipe; the row fills within a minute) and
 *           the answer says `pending`. If the PC is off, the listing is
 *           returned with `held: "pc"` and the page says so: nothing
 *           breaks, nothing waits.
 *   none    the sync has not fetched it (or Gousto no longer serves it).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { pcIsOn } from "@/lib/jobs/queue";
import { detailState, type HeldState } from "@/lib/reference/offload";
import { queueGet } from "@/lib/reference/jobs";
import { DETAIL_SELECT, type GoustoRow } from "./gousto";

export type RecipeDetailAnswer = {
  recipe: GoustoRow & { detail_offloaded_at: string | null; detail_opened_at: string | null };
  held: HeldState;
  /** The PC is on and has been asked; ask again shortly. */
  pending: boolean;
  /** Kept for the page's older shape: true whenever there is no detail to show. */
  needs_detail: boolean;
};

const SELECT = `${DETAIL_SELECT}, detail_offloaded_at, detail_opened_at`;

export async function recipeDetail(db: SupabaseClient, slug: string, now: Date = new Date()): Promise<RecipeDetailAnswer | null> {
  const { data, error } = await db.from("gousto_recipes").select(SELECT).eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const recipe = data as unknown as RecipeDetailAnswer["recipe"];
  const held = detailState(recipe);
  let pending = false;
  if (held === "hosted") {
    // Opened today: it stays on the hosted copy for KEEP_OPENED_DAYS.
    void db
      .from("gousto_recipes")
      .update({ detail_opened_at: now.toISOString() })
      .eq("slug", slug)
      .then(() => undefined);
  } else if (held === "pc" && (await pcIsOn(db))) {
    await queueGet(db, slug).catch((err) => console.error("[recipe] could not ask the PC:", err instanceof Error ? err.message : err));
    pending = true;
  }
  return { recipe, held, pending, needs_detail: !recipe.detail };
}
