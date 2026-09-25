/**
 * The Area chip (claude/tasks-merge-spec.md M2): All · Technical · Life · a
 * specific project. It replaces the 0121 `surface=tickets|tasks` partition
 * (the two-page split was reversed by MYC-163); `areas.kind` stays because
 * it is what Technical / Life mean.
 *
 *   technical = the project's area kind is `technical`
 *   life      = everything else, including tickets with no project
 *
 * Resolved as a set of project ids, then applied as a project_id predicate —
 * PostgREST cannot express "embedded is null OR embedded.kind <> x" in one
 * filter. Absent = no filter (All).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AreaKind = "technical" | "life";

/** The `area` query param: a kind, or an area id (uuid). */
export type AreaFilter = { kind: AreaKind | null; areaId: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONE = "00000000-0000-0000-0000-000000000000";

export function parseAreaKind(v: string | null | undefined): AreaKind | null {
  return v === "technical" || v === "life" ? v : null;
}

export function parseArea(v: string | null | undefined): AreaFilter {
  const kind = parseAreaKind(v);
  if (kind) return { kind, areaId: null };
  if (typeof v === "string" && UUID_RE.test(v)) return { kind: null, areaId: v };
  return { kind: null, areaId: null };
}

export async function technicalProjectIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db
    .from("projects")
    .select("id, areas!inner(kind)")
    .eq("areas.kind", "technical");
  return (data ?? []).map((r) => r.id as string);
}

export async function areaProjectIds(db: SupabaseClient, areaId: string): Promise<string[]> {
  const { data } = await db.from("projects").select("id").eq("area_id", areaId);
  return (data ?? []).map((r) => r.id as string);
}

export type ProjectClause = { kind: "in"; ids: string[] } | { kind: "or"; value: string } | { kind: "none" };

/** The project_id predicate for a kind, given the technical project ids. */
export function areaKindClause(kind: AreaKind, technicalIds: string[]): ProjectClause {
  if (kind === "technical") return { kind: "in", ids: technicalIds.length ? technicalIds : [NONE] };
  return technicalIds.length ? { kind: "or", value: `project_id.is.null,project_id.not.in.(${technicalIds.join(",")})` } : { kind: "none" };
}

/** An area id → its projects (an empty area matches nothing). */
export function areaIdClause(ids: string[]): ProjectClause {
  return { kind: "in", ids: ids.length ? ids : [NONE] };
}

/** Client-side membership test (same rule), for rows already fetched. */
export function inAreaKind(projectId: string | null | undefined, kind: AreaKind, technicalIds: Set<string>): boolean {
  const technical = !!projectId && technicalIds.has(projectId);
  return kind === "technical" ? technical : !technical;
}
