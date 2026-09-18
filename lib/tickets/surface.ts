/**
 * Tickets / Tasks partition (0121): one table, two surfaces.
 *   tickets = project's area kind is `technical`
 *   tasks   = everything else, including tickets with no project
 * Resolved as a set of technical project ids, then applied as a project_id
 * predicate — PostgREST cannot express "embedded is null OR embedded.kind
 * <> x" in one filter. Absent `surface` = no filter (compat routes).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Surface = "tickets" | "tasks";

export function parseSurface(v: string | null | undefined): Surface | null {
  return v === "tickets" || v === "tasks" ? v : null;
}

export async function technicalProjectIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from("projects")
    .select("id, areas!inner(kind)")
    .eq("areas.kind", "technical");
  return (data ?? []).map((r) => r.id as string);
}

/** PostgREST `or` filter string for the surface, or null when none applies. */
export function surfaceFilter(surface: Surface, technicalIds: string[]): { column: "project_id"; op: "in" | "not.in" } & { ids: string[] } {
  return surface === "tickets" ? { column: "project_id", op: "in", ids: technicalIds } : { column: "project_id", op: "not.in", ids: technicalIds };
}

/** Client-side membership test (same rule), for rows already fetched. */
export function onSurface(projectId: string | null | undefined, surface: Surface, technicalIds: Set<string>): boolean {
  const technical = !!projectId && technicalIds.has(projectId);
  return surface === "tickets" ? technical : !technical;
}
