/**
 * Features gone quiet, read for the signed-in person. The rules are in
 * features.ts; this asks the database when each feature's tables were last
 * written by them (0166, one call, as the caller).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type FeatureState, featureStates, featureTables } from "./features";

export async function featureStatesFor(db: SupabaseClient, now: Date = new Date()): Promise<FeatureState[]> {
  const { data, error } = await db.rpc("feature_activity", { p_tables: featureTables() });
  if (error) throw new Error(`feature activity: ${error.message}`);
  const last: Record<string, string | null> = {};
  for (const row of (data ?? []) as Array<{ table_name: string; last_at: string | null }>) last[row.table_name] = row.last_at;
  return featureStates(last, now);
}
