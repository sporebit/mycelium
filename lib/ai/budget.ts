/**
 * The monthly cloud-AI cap (master run §9: "hard monthly cloud-AI cap of £5
 * with an alert, enforced from api_usage; over the cap, jobs queue for the
 * PC").
 *
 * Every cloud model call that records its cost in api_usage counts. A
 * feature asks `cloudBudget()` before it calls out; when the answer is no,
 * it uses what is free instead: the PC's local model if the PC is on, the
 * pattern rules if not. Nothing a person captured is ever refused because
 * of the cap; only the paid route is.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkCap, type CapCheck } from "./usage";

/** Pence per calendar month. CLOUD_AI_CAP_PENCE overrides the default of £5. */
export function cloudCapPence(): number {
  const v = Number(process.env.CLOUD_AI_CAP_PENCE);
  return Number.isFinite(v) && v >= 0 ? v : 500;
}

/** Spend this month across every tag, against the cap. `db` acts as the person whose usage is counted. */
export async function cloudBudget(db: SupabaseClient): Promise<CapCheck> {
  return checkCap(db, "", cloudCapPence());
}

/** True when a cloud model may be called: a key exists and the month's cap is not spent. Fails closed on a read error. */
export async function cloudAllowed(db: SupabaseClient): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) return false;
  try {
    return (await cloudBudget(db)).allowed;
  } catch (err) {
    console.error("[ai/budget] could not read the month's spend; not calling the cloud:", err);
    return false;
  }
}
