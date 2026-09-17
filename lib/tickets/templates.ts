/**
 * Tickets — templates (spec §9.3, Q20). A template's `definition` carries a
 * ticket's reusable parts: title pattern, body, steps definition, contexts,
 * points, kind and sub-tasks. Authored in the UI ("Save as template") or by
 * Claude as repo JSON (docs/tickets/templates/<slug>.json, origin = repo,
 * synced by POST /api/tickets/templates?sync=1). Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import type { Task } from "@/lib/types/task";
import { isStepsDefinition, type StepsDefinition } from "./steps";
import { moveTicket, resolveTicketRef, statusIdFor } from "./server";
import { REPO_TEMPLATES } from "@/docs/tickets/templates/index";

export type TemplateDefinition = {
  title: string;
  body_md?: string | null;
  kind?: string;
  steps_definition?: StepsDefinition | null;
  where_ctx?: string;
  tools?: string[];
  time_window?: string;
  points?: number | null;
  project_id?: string | null;
  /** Days from instantiation to scheduled_on / deadline_on. */
  scheduled_in_days?: number | null;
  deadline_in_days?: number | null;
  sub_tasks?: Array<{ title: string; where_ctx?: string; tools?: string[]; time_window?: string; points?: number | null }>;
};

export type TemplateRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  definition: TemplateDefinition;
  shared: boolean;
  origin: "ui" | "repo";
  version: number;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_SELECT = "id, slug, name, kind, definition, shared, origin, version, created_at, updated_at";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "template";
}

export function isTemplateDefinition(v: unknown): v is TemplateDefinition {
  if (!v || typeof v !== "object") return false;
  const d = v as TemplateDefinition;
  if (typeof d.title !== "string" || !d.title.trim()) return false;
  if (d.steps_definition != null && !isStepsDefinition(d.steps_definition)) return false;
  if (d.sub_tasks != null && !Array.isArray(d.sub_tasks)) return false;
  return true;
}

/** Build a template definition from an existing ticket (+ its sub-tasks). */
export async function definitionFromTicket(db: SupabaseClient, ref: string): Promise<TemplateDefinition | null> {
  const r = await resolveTicketRef(db, ref);
  if (!r) return null;
  const { data } = await db
    .from("tickets")
    .select(`${TASK_SELECT}, steps_definition`)
    .eq("id", r.id)
    .single();
  if (!data) return null;
  const t = serializeTask(data as unknown as Parameters<typeof serializeTask>[0]) as Task & {
    steps_definition?: StepsDefinition | null;
  };
  const { data: subs } = await db
    .from("tickets")
    .select("title, where_ctx, tools, time_window, points")
    .eq("parent_task_id", r.id)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  return {
    title: t.title,
    body_md: t.description ?? null,
    kind: t.kind ?? "task",
    steps_definition: ((data as { steps_definition?: StepsDefinition | null }).steps_definition ?? null),
    where_ctx: t.where_ctx ?? "anywhere",
    tools: t.tools ?? ["none"],
    time_window: t.time_window ?? "anytime",
    points: t.points ?? null,
    project_id: t.project_id ?? null,
    sub_tasks: ((subs ?? []) as Array<{ title: string; where_ctx?: string; tools?: string[]; time_window?: string; points?: number | null }>).map(
      (s) => ({ title: s.title, where_ctx: s.where_ctx, tools: s.tools, time_window: s.time_window, points: s.points ?? null }),
    ),
  };
}

function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "New from template": a ticket plus its sub-tasks, landing in Next (or the
 * category given). `{{title}}`-style overrides come from `vars`.
 */
export async function instantiateTemplate(
  db: SupabaseClient,
  tpl: TemplateRow,
  opts: { uid: string | null; title?: string; project_id?: string | null; category?: "inbox" | "next" | "backlog"; vars?: Record<string, string> },
): Promise<Task> {
  const d = tpl.definition;
  const vars = opts.vars ?? {};
  const sub = (s: string) => s.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
  const title = (opts.title ?? sub(d.title)).trim();
  const insert: Record<string, unknown> = {
    title,
    description: d.body_md ? sub(d.body_md) : null,
    kind: d.kind ?? tpl.kind ?? "task",
    where_ctx: d.where_ctx ?? "anywhere",
    tools: d.tools?.length ? d.tools : ["none"],
    time_window: d.time_window ?? "anytime",
    points: d.points ?? null,
    project_id: opts.project_id ?? d.project_id ?? null,
    steps_definition: d.steps_definition ?? null,
    template_id: tpl.id,
    source: "template",
    owner: opts.uid,
    urgency: "this_week",
    priority_score: 0.5,
    scheduled_on: d.scheduled_in_days != null ? plusDays(d.scheduled_in_days) : null,
    deadline_on: d.deadline_in_days != null ? plusDays(d.deadline_in_days) : null,
  };
  const { data, error } = await db.from("tickets").insert(insert).select(TASK_SELECT).single();
  if (error || !data) throw error ?? new Error("insert failed");
  let ticket = serializeTask(data as unknown as Parameters<typeof serializeTask>[0]);
  const category = opts.category ?? "next";
  if (category !== "inbox") {
    const moved = await moveTicket(db, ticket.id, category);
    if (moved.ok) ticket = moved.task;
  }
  const spaceId = (data as { space_id?: string }).space_id;
  let subStatus: string | null = null;
  if (spaceId) subStatus = await statusIdFor(db, spaceId, "next");
  let i = 0;
  for (const s of d.sub_tasks ?? []) {
    i += 1;
    const row: Record<string, unknown> = {
      title: sub(s.title),
      parent_task_id: ticket.id,
      project_id: insert.project_id,
      kind: "task",
      where_ctx: s.where_ctx ?? insert.where_ctx,
      tools: s.tools?.length ? s.tools : insert.tools,
      time_window: s.time_window ?? insert.time_window,
      points: s.points ?? null,
      source: "template",
      owner: opts.uid,
      urgency: "this_week",
      priority_score: 0.5,
      sort_order: i,
    };
    if (subStatus) row.status_id = subStatus;
    await db.from("tickets").insert(row);
  }
  return ticket;
}

/** Upsert the repo-authored templates (origin = repo) into the caller's space. */
export async function syncRepoTemplates(db: SupabaseClient): Promise<{ synced: string[]; skipped: string[] }> {
  const synced: string[] = [];
  const skipped: string[] = [];
  const { data: existing } = await db.from("ticket_templates").select("id, slug, origin, version");
  const bySlug = new Map((existing ?? []).map((r) => [r.slug as string, r as { id: string; origin: string; version: number }]));
  for (const t of REPO_TEMPLATES) {
    if (!isTemplateDefinition(t.definition)) {
      skipped.push(`${t.slug} (invalid definition)`);
      continue;
    }
    const cur = bySlug.get(t.slug);
    if (cur && cur.origin === "ui") {
      skipped.push(`${t.slug} (UI-owned)`);
      continue;
    }
    if (cur && cur.version >= t.version) {
      skipped.push(`${t.slug} (v${cur.version} current)`);
      continue;
    }
    const row = { slug: t.slug, name: t.name, kind: t.kind, definition: t.definition, shared: true, origin: "repo", version: t.version, updated_at: new Date().toISOString() };
    const { error } = cur
      ? await db.from("ticket_templates").update(row).eq("id", cur.id)
      : await db.from("ticket_templates").insert(row);
    if (error) skipped.push(`${t.slug} (${error.message})`);
    else synced.push(t.slug);
  }
  return { synced, skipped };
}
