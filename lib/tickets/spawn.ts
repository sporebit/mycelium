/**
 * Tickets — the spawn recurrence engine (spec §8.3).
 *
 * A `spawn` template is a ticket with recurrence_mode = 'spawn' and
 * series_id null (hidden from every list). Each occurrence is a real ticket
 * with series_id → template, source = recurrence, scheduled_on = the
 * occurrence date (and remind_at for reminder kinds), landing in Next.
 * The nightly job spawns occurrences due within the next 7 days; a rule
 * with meta.after_completion spawns the next one when the previous is done.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, londonDateTimeToIso, londonTimeOf, nextOccurrence, occurrencesBetween } from "./recur";
import { statusIdFor } from "./server";

export type TemplateTicket = {
  id: string;
  space_id: string;
  title: string;
  description: string | null;
  kind: string;
  project_id: string | null;
  where_ctx: string;
  tools: string[];
  time_window: string;
  time_from: string | null;
  time_to: string | null;
  days: number[] | null;
  points: number | null;
  scheduled_on: string | null;
  remind_at: string | null;
  recurrence_rrule: string | null;
  steps_definition: unknown;
  meta: Record<string, unknown> | null;
  created_at: string;
  owner: string | null;
};

export const TEMPLATE_SELECT =
  "id, space_id, title, description, kind, project_id, where_ctx, tools, time_window, time_from, time_to, days, points, scheduled_on, remind_at, recurrence_rrule, steps_definition, meta, created_at, owner";

export async function listSpawnTemplates(db: SupabaseClient): Promise<TemplateTicket[]> {
  const { data, error } = await db
    .from("tickets")
    .select(TEMPLATE_SELECT)
    .eq("recurrence_mode", "spawn")
    .is("series_id", null)
    .is("deleted_at", null)
    .is("cancelled_at", null)
    .not("recurrence_rrule", "is", null);
  if (error) throw error;
  return (data ?? []) as unknown as TemplateTicket[];
}

async function existingOccurrenceDates(db: SupabaseClient, templateId: string): Promise<Set<string>> {
  const { data } = await db.from("tickets").select("scheduled_on").eq("series_id", templateId).not("scheduled_on", "is", null).limit(1000);
  return new Set((data ?? []).map((r) => (r as { scheduled_on: string }).scheduled_on));
}

async function lastOccurrenceDate(db: SupabaseClient, templateId: string): Promise<string | null> {
  const { data } = await db
    .from("tickets")
    .select("scheduled_on")
    .eq("series_id", templateId)
    .not("scheduled_on", "is", null)
    .order("scheduled_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.scheduled_on as string | undefined) ?? null;
}

export async function spawnOccurrence(db: SupabaseClient, tpl: TemplateTicket, date: string): Promise<string | null> {
  const status = await statusIdFor(db, tpl.space_id, "next");
  const remindTime = tpl.remind_at ? londonTimeOf(tpl.remind_at) : null;
  const row: Record<string, unknown> = {
    space_id: tpl.space_id,
    title: tpl.title,
    description: tpl.description,
    kind: tpl.kind,
    project_id: tpl.project_id,
    where_ctx: tpl.where_ctx,
    tools: tpl.tools,
    time_window: tpl.time_window,
    time_from: tpl.time_from,
    time_to: tpl.time_to,
    days: tpl.days,
    points: tpl.points,
    scheduled_on: date,
    remind_at: remindTime ? londonDateTimeToIso(date, remindTime) : null,
    series_id: tpl.id,
    source: "recurrence",
    owner: tpl.owner,
    urgency: "this_week",
    priority_score: 0.5,
    steps_definition: tpl.steps_definition ?? null,
    meta: { spawned_from: tpl.id },
  };
  if (status) row.status_id = status;
  const { data, error } = await db.from("tickets").insert(row).select("id").single();
  if (error) {
    console.error("[spawn] insert failed:", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

/** Nightly: create occurrences due within `horizonDays` for every template. */
export async function spawnDue(db: SupabaseClient, today: string, horizonDays = 7): Promise<{ templates: number; spawned: number }> {
  const templates = await listSpawnTemplates(db);
  let spawned = 0;
  const until = addDays(today, horizonDays);
  for (const tpl of templates) {
    if (tpl.meta?.after_completion === true) continue; // driven by completion
    const start = tpl.scheduled_on ?? tpl.created_at.slice(0, 10);
    const have = await existingOccurrenceDates(db, tpl.id);
    // from the day before today so a due-today occurrence is included
    for (const d of occurrencesBetween(tpl.recurrence_rrule!, start, addDays(today, -1), until)) {
      if (have.has(d)) continue;
      const id = await spawnOccurrence(db, tpl, d);
      if (id) spawned += 1;
    }
  }
  return { templates: templates.length, spawned };
}

/** On completing an occurrence of an after_completion template: spawn the next. */
export async function spawnAfterCompletion(db: SupabaseClient, occurrenceId: string, completedOn: string): Promise<string | null> {
  const { data: occ } = await db.from("tickets").select("series_id").eq("id", occurrenceId).maybeSingle();
  const seriesId = (occ?.series_id as string | null) ?? null;
  if (!seriesId) return null;
  const { data: tplRow } = await db.from("tickets").select(TEMPLATE_SELECT).eq("id", seriesId).maybeSingle();
  const tpl = tplRow as unknown as TemplateTicket | null;
  if (!tpl || tpl.meta?.after_completion !== true || !tpl.recurrence_rrule) return null;
  const next = nextOccurrence(tpl.recurrence_rrule, completedOn, completedOn);
  if (!next) return null;
  const last = await lastOccurrenceDate(db, tpl.id);
  if (last && last >= next) return null;
  return spawnOccurrence(db, tpl, next);
}
