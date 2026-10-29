import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Programme phases whose programme is still live. Every "which programme is
 * on this week" lookup goes through here so an archived programme drops out
 * of Today, the week summary, the calendar, swaps, the voice route and the
 * dashboard headline at once — archiving used to change nothing, because
 * each of those read the phases table on its own with no archive filter.
 */
export type ActivePhase = {
  id: string;
  programme_id: string;
  start_week_iso: string;
  end_week_iso: string | null;
};

export const LIVE_PHASE_SELECT =
  "id, programme_id, start_week_iso, end_week_iso, workout_programmes!inner(archived_at)";

/** Phases of live programmes; add week bounds and ordering on the result. */
export function livePhases(supabase: SupabaseClient) {
  return supabase
    .from("workout_programme_phases")
    .select(LIVE_PHASE_SELECT)
    .is("workout_programmes.archived_at", null);
}

/** The one phase in force for an ISO week (`YYYY-Www`), latest start first. */
export function activePhaseQuery(supabase: SupabaseClient, weekIso: string) {
  return livePhases(supabase)
    .lte("start_week_iso", weekIso)
    .or(`end_week_iso.is.null,end_week_iso.gte.${weekIso}`)
    .order("start_week_iso", { ascending: false })
    .limit(1);
}

export async function activePhaseForWeek(
  supabase: SupabaseClient,
  weekIso: string,
): Promise<ActivePhase | null> {
  const { data } = await activePhaseQuery(supabase, weekIso);
  const rows = (data ?? []) as unknown as ActivePhase[];
  return rows[0] ?? null;
}
