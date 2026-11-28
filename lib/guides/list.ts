/**
 * The Guides list (design §3.1, §4 `GET /api/guides`): every run-book kind
 * ticket the caller can see that has a definition, newest activity first,
 * each with its counts, per-phase progress for the miniature thread, and
 * the resume line. Runs through the caller's user client, so RLS is the
 * wall. Shared by the API route and the /guides page.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { RUNBOOK_KINDS } from "@/lib/tickets/categories";
import { normaliseState, type StepsDefinition } from "@/lib/tickets/steps";
import { overall, phaseProgress, resumePoint, type PhaseState } from "./progress";

export type GuideListItem = {
  key: string;
  title: string;
  kind: string;
  project_name: string | null;
  field_guide: boolean;
  done: number;
  total: number;
  pct: number;
  minutes_left: number;
  phases: Array<{ id: string; title: string; pct: number; state: PhaseState }>;
  resume: string | null;
  next: string | null;
  parked: string | null;
  updated_at: string;
};

export const GUIDE_LIST_LIMIT = 100;

type Row = {
  id: string;
  ticket_key: string | null;
  title: string;
  kind: string;
  steps_definition: StepsDefinition | null;
  steps_state: unknown;
  updated_at: string;
  projects: { name: string } | Array<{ name: string }> | null;
};

export async function listGuides(supabase: SupabaseClient, now: Date = new Date()): Promise<GuideListItem[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, ticket_key, title, kind, steps_definition, steps_state, updated_at, projects(name)")
    .in("kind", RUNBOOK_KINDS as string[])
    .not("steps_definition", "is", null)
    .order("updated_at", { ascending: false })
    .limit(GUIDE_LIST_LIMIT);
  if (error) throw error;
  const out: GuideListItem[] = [];
  for (const row of (data ?? []) as unknown as Row[]) {
    const def = row.steps_definition;
    if (!def || !Array.isArray(def.phases)) continue;
    const state = normaliseState(row.steps_state);
    const phases = phaseProgress(def, state);
    const all = overall(def, state, phases);
    const resume = resumePoint(def, state, now, phases);
    const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const firstNext = phases.flatMap((p) => p.steps).find((s) => !state.steps[s.id]?.done);
    out.push({
      key: row.ticket_key ?? row.id,
      title: def.title || row.title,
      kind: row.kind,
      project_name: proj?.name ?? null,
      field_guide: def.format === "field-guide",
      done: all.done,
      total: all.total,
      pct: all.pct,
      minutes_left: all.minutes_left_est,
      phases: phases.map((p) => ({ id: p.id, title: p.title, pct: p.pct, state: p.state })),
      resume: resume?.line ?? null,
      next: firstNext ? `${firstNext.id} ${firstNext.title}` : null,
      parked: state.park ? `${state.park.step_id}${state.park.note ? `: ${state.park.note}` : ""}` : null,
      updated_at: row.updated_at,
    });
  }
  return out;
}
