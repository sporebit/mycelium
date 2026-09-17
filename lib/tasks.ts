import type { SupabaseClient } from "@supabase/supabase-js";
import type { Task } from "@/lib/types/task";

type One<T> = T | T[] | null;
type RawTaskRow = Omit<
  Task,
  "entity_name" | "project_name" | "project_colour" | "sub_tasks" | "category" | "status_name" | "waiting_on_name"
> & {
  entities: One<{ name: string }>;
  projects: One<{ name: string; colour: string | null }>;
  ticket_status?: One<{ name: string; category: string }>;
  waiting_on?: One<{ display_name: string | null }>;
};

/**
 * One select for every ticket read. Legacy Tasks columns first, then the
 * 0116 Tickets columns, then the embeds: `ticket_status` is the workflow
 * row (aliased because `status` is the legacy text column), `waiting_on`
 * the Person behind the Waiting list.
 */
export const TASK_SELECT =
  "id, title, description, urgency, status, key, ticket_key, seq, priority_score, time_estimate_min, tags, due_date, scheduled_at, owner, entity_id, project_id, completed_at, created_at, updated_at, parent_task_id, converted_from, context_where, context_device, context_energy, context_tag, google_event_id, status_id, kind, someday, urgent, points, where_ctx, place_id, tools, time_window, time_from, time_to, days, scheduled_on, deadline_on, remind_at, assignee_id, waiting_on_person_id, verified_by, verified_at, cancelled_at, source, suggested, rundown_md, recurrence_mode, recurrence_rrule, series_id, sync_to_github, github_issue_number, github_issue_url, meta, entities(name), projects(name, colour), ticket_status:ticket_statuses(name, category), waiting_on:people(display_name)";

function first<T>(v: One<T> | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function serializeTask(row: RawTaskRow): Task {
  const ent = first(row.entities);
  const proj = first(row.projects);
  const st = first(row.ticket_status);
  const wo = first(row.waiting_on);
  const {
    entities: _entities,
    projects: _projects,
    ticket_status: _status,
    waiting_on: _waitingOn,
    ...rest
  } = row;
  void _entities;
  void _projects;
  void _status;
  void _waitingOn;
  return {
    ...rest,
    entity_name: ent?.name ?? null,
    project_name: proj?.name ?? null,
    project_colour: proj?.colour ?? null,
    category: (st?.category as Task["category"]) ?? null,
    status_name: st?.name ?? null,
    waiting_on_name: wo?.display_name ?? null,
  };
}

export async function fetchTaskById(
  supabase: SupabaseClient,
  taskId: string
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return null;
  return serializeTask(data as unknown as RawTaskRow);
}
