/**
 * Tickets — server-side helpers shared by /api/tickets/* and the
 * /api/tasks/* compatibility routes (spec Flag 6: one write path).
 *
 * Everything runs through the caller's user client, so RLS is the wall.
 * Status changes are expressed as a *category*; the space's status row is
 * resolved here and the 0117 trigger keeps the legacy `status` column,
 * `completed_at` and `cancelled_at` in step.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { extractNameMentions } from "@/lib/people/regex-extract";
import { recordMention, resolveMention } from "@/lib/people/resolve-mention";
import { LIMITS, takeToken } from "@/lib/system/rateLimit";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { logTaskActivity } from "@/lib/task-activity";
import type { Task } from "@/lib/types/task";
import {
  CATEGORY_ORDER,
  POINTS,
  TICKET_CATEGORIES,
  TICKET_KINDS,
  TIME_WINDOWS,
  WHERE_CTX,
  type TicketCategory,
} from "./categories";

export function isTicketCategory(v: unknown): v is TicketCategory {
  return typeof v === "string" && (TICKET_CATEGORIES as readonly string[]).includes(v);
}

/** The calling user's id (session, API_SECRET-as-Phil, or a token principal). */
export async function principalUid(): Promise<string | null> {
  return (await headers()).get(PRINCIPAL_USER_HEADER);
}

/**
 * Re-extract People mentions from a ticket's title + description (soft-fail;
 * mirrors the Tasks PATCH route). Never creates a Person.
 */
export async function rebuildTicketMentions(
  supabase: SupabaseClient,
  ticketId: string,
  title: string,
  description: string | null,
): Promise<void> {
  try {
    await supabase
      .from("people_mentions")
      .delete()
      .eq("source_type", "task")
      .eq("source_id", ticketId);
    const text = `${title} ${description ?? ""}`.trim();
    if (!text) return;
    for (const e of extractNameMentions(text)) {
      try {
        const res = await resolveMention(supabase, e.name_hint);
        await recordMention(supabase, res, { type: "task", id: ticketId });
      } catch (err) {
        console.error("[tickets] mention soft-fail per-extraction:", err);
      }
    }
  } catch (err) {
    console.error("[tickets] mention rebuild failed:", err);
  }
}

/** Per-user write budget; returns a 429 response when exhausted, else null. */
export async function ticketWriteGate(
  supabase: SupabaseClient,
  uid: string | null,
): Promise<NextResponse | null> {
  const ok = await takeToken(supabase, `tickets:user:${uid ?? "anon"}`, LIMITS.ticketWrite);
  if (ok) return null;
  return NextResponse.json({ error: "rate limited" }, { status: 429 });
}

export function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  return req.json().then((j) => (j && typeof j === "object" ? (j as T) : null)).catch(() => null);
}

type Raw = Parameters<typeof serializeTask>[0];

export async function fetchTicketByKey(
  supabase: SupabaseClient,
  key: string,
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tickets")
    .select(TASK_SELECT)
    .eq("ticket_key", key.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return serializeTask(data as unknown as Raw);
}

/** Resolve a key ("MYC-33") or a uuid to the ticket's id + space. */
export async function resolveTicketRef(
  supabase: SupabaseClient,
  ref: string,
): Promise<{ id: string; space_id: string; status_id: string | null; category: string | null } | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const q = supabase
    .from("tickets")
    .select("id, space_id, status_id, ticket_status:ticket_statuses(category)");
  const { data } = await (isUuid ? q.eq("id", ref) : q.eq("ticket_key", ref.toUpperCase())).maybeSingle();
  if (!data) return null;
  const st = Array.isArray(data.ticket_status) ? data.ticket_status[0] : data.ticket_status;
  return {
    id: data.id as string,
    space_id: data.space_id as string,
    status_id: (data.status_id as string | null) ?? null,
    category: (st as { category: string } | null)?.category ?? null,
  };
}

/** The status row for a category in the space's default workflow. */
export async function statusIdFor(
  supabase: SupabaseClient,
  spaceId: string,
  category: TicketCategory,
): Promise<string | null> {
  const { data } = await supabase
    .from("ticket_statuses")
    .select("id, ticket_workflows!inner(is_default)")
    .eq("space_id", spaceId)
    .eq("category", category)
    .eq("ticket_workflows.is_default", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export type MoveResult =
  | { ok: true; task: Task; from: string | null; to: TicketCategory }
  | { ok: false; status: number; error: string };

/**
 * Move a ticket to a category. `forwardOnly` is the automation rule (spec
 * §6): never backwards by category order, never out of done/cancelled.
 */
export async function moveTicket(
  supabase: SupabaseClient,
  ref: string,
  category: TicketCategory,
  opts: { forwardOnly?: boolean; extra?: Record<string, unknown> } = {},
): Promise<MoveResult> {
  const t = await resolveTicketRef(supabase, ref);
  if (!t) return { ok: false, status: 404, error: "not found" };
  const from = t.category;
  if (opts.forwardOnly && from) {
    if (from === "done" || from === "cancelled") {
      return { ok: false, status: 409, error: `ticket is already ${from}` };
    }
    if (CATEGORY_ORDER[category] < CATEGORY_ORDER[from as TicketCategory]) {
      return { ok: false, status: 409, error: `automation cannot move ${from} → ${category}` };
    }
  }
  const statusId = await statusIdFor(supabase, t.space_id, category);
  if (!statusId) return { ok: false, status: 500, error: `no ${category} status in this space` };

  const update: Record<string, unknown> = {
    status_id: statusId,
    updated_at: new Date().toISOString(),
    ...(opts.extra ?? {}),
  };
  const { data, error } = await supabase
    .from("tickets")
    .update(update)
    .eq("id", t.id)
    .select(TASK_SELECT)
    .single();
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? "update failed" };

  await logTaskActivity(
    supabase,
    t.id,
    { status_id: from ?? t.status_id },
    { status_id: category },
  );
  return { ok: true, task: serializeTask(data as unknown as Raw), from, to: category };
}

// ---------------------------------------------------------------------
// Field whitelist + validation for writes (create and patch)
// ---------------------------------------------------------------------

const STRING_FIELDS = ["title", "description", "kind", "where_ctx", "time_window", "source"] as const;
const DATE_FIELDS = ["scheduled_on", "deadline_on"] as const;
const BOOL_FIELDS = ["someday", "urgent", "key"] as const;
const UUID_FIELDS = [
  "project_id",
  "parent_task_id",
  "entity_id",
  "place_id",
  "assignee_id",
  "waiting_on_person_id",
  "status_id",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/**
 * Pick the Tickets-native fields out of a request body, validated. Unknown
 * keys are ignored; a malformed value drops the key rather than failing the
 * whole write (the row keeps its old value). Legacy Tasks fields are handled
 * by the compat routes themselves.
 */
export function ticketFieldsFromBody(
  body: Record<string, unknown>,
  omit: readonly string[] = [],
): Record<string, unknown> {
  const out = pickTicketFields(body);
  for (const k of omit) delete out[k];
  return out;
}

/** Keys the legacy Tasks routes compute themselves (inheritance, defaults). */
export const LEGACY_HANDLED_KEYS = [
  "title",
  "description",
  "key",
  "tags",
  "project_id",
  "parent_task_id",
  "entity_id",
] as const;

function pickTicketFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of STRING_FIELDS) {
    const v = body[k];
    if (v === undefined) continue;
    if (v === null && (k === "description")) { out[k] = null; continue; }
    if (typeof v !== "string") continue;
    if (k === "kind" && !(TICKET_KINDS as readonly string[]).includes(v)) continue;
    if (k === "where_ctx" && !(WHERE_CTX as readonly string[]).includes(v)) continue;
    if (k === "time_window" && !(TIME_WINDOWS as readonly string[]).includes(v)) continue;
    if (k === "title") { const t = v.trim(); if (!t) continue; out[k] = t; continue; }
    out[k] = v;
  }
  for (const k of DATE_FIELDS) {
    const v = body[k];
    if (v === undefined) continue;
    if (v === null) { out[k] = null; continue; }
    if (typeof v === "string" && DATE_RE.test(v)) out[k] = v;
  }
  for (const k of BOOL_FIELDS) {
    const v = body[k];
    if (typeof v === "boolean") out[k] = v;
  }
  for (const k of UUID_FIELDS) {
    const v = body[k];
    if (v === undefined) continue;
    if (v === null) { out[k] = null; continue; }
    if (typeof v === "string" && UUID_RE.test(v)) out[k] = v;
  }
  if ("points" in body) {
    const v = body.points;
    if (v === null) out.points = null;
    else if (typeof v === "number" && (POINTS as readonly number[]).includes(v)) out.points = v;
  }
  if (Array.isArray(body.tools)) {
    const tools = body.tools
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length > 0 && x.length <= 32);
    out.tools = tools.length > 0 ? Array.from(new Set(tools)) : ["none"];
  }
  if (Array.isArray(body.tags)) {
    out.tags = body.tags.filter((x): x is string => typeof x === "string");
  }
  if ("time_from" in body) {
    const v = body.time_from;
    if (v === null) out.time_from = null;
    else if (typeof v === "string" && TIME_RE.test(v)) out.time_from = v;
  }
  if ("time_to" in body) {
    const v = body.time_to;
    if (v === null) out.time_to = null;
    else if (typeof v === "string" && TIME_RE.test(v)) out.time_to = v;
  }
  if ("days" in body) {
    const v = body.days;
    if (v === null) out.days = null;
    else if (Array.isArray(v)) {
      const d = v.filter((x): x is number => typeof x === "number" && x >= 1 && x <= 7);
      out.days = d.length > 0 ? d : null;
    }
  }
  if ("remind_at" in body) {
    const v = body.remind_at;
    if (v === null) out.remind_at = null;
    else if (typeof v === "string" && !Number.isNaN(Date.parse(v))) out.remind_at = new Date(v).toISOString();
  }
  if ("suggested" in body) {
    const v = body.suggested;
    if (v === null || (typeof v === "object" && !Array.isArray(v))) out.suggested = v;
  }
  return out;
}

// ---------------------------------------------------------------------
// Evidence links (spec §4.5) — the kind is a fixed vocabulary in 0116
// ---------------------------------------------------------------------

export const LINK_KINDS = [
  "commit",
  "pr",
  "deploy",
  "smoke",
  "url",
  "attachment",
  "calendar_event",
  "email",
  "github_issue",
  "purchase",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export function isLinkKind(v: unknown): v is LinkKind {
  return typeof v === "string" && (LINK_KINDS as readonly string[]).includes(v);
}

/** Classify an evidence URL into a link kind when the caller gave none. */
export function linkKindFor(url: string): LinkKind {
  const u = url.toLowerCase();
  if (/github\.com\/[^/]+\/[^/]+\/commit\//.test(u)) return "commit";
  if (/github\.com\/[^/]+\/[^/]+\/pull\//.test(u)) return "pr";
  if (/github\.com\/[^/]+\/[^/]+\/issues\//.test(u)) return "github_issue";
  if (/vercel\.(app|com)/.test(u) || /\/deployments?\//.test(u)) return "deploy";
  if (/\/api\/health\b/.test(u) || /smoke/.test(u)) return "smoke";
  return "url";
}

export type LinkInput = {
  kind?: unknown;
  url?: unknown;
  ref?: unknown;
  label?: unknown;
  meta?: unknown;
};

/** Validate a link body; returns the insertable row (minus ticket_id) or an error. */
export function linkRowFromBody(
  body: LinkInput,
): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!url && !ref) return { ok: false, error: "url or ref required" };
  if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: "url must be http(s)" };
  const kind: LinkKind = isLinkKind(body.kind) ? body.kind : url ? linkKindFor(url) : "url";
  const row: Record<string, unknown> = {
    kind,
    url: url || null,
    ref: ref || null,
    label: typeof body.label === "string" ? body.label.trim().slice(0, 200) || null : null,
  };
  if (body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) row.meta = body.meta;
  return { ok: true, row };
}

/** Sub-task depth rule: a parent may not itself be a sub-task. */
export async function validateParent(
  supabase: SupabaseClient,
  parentId: string,
  selfId?: string,
): Promise<string | null> {
  if (selfId && parentId === selfId) return "A ticket cannot be its own parent.";
  const { data: parent } = await supabase
    .from("tickets")
    .select("id, parent_task_id")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent) return "parent ticket not found";
  if (parent.parent_task_id) return "Sub-tasks cannot have their own sub-tasks.";
  if (selfId) {
    const { data: kids } = await supabase
      .from("tickets")
      .select("id")
      .eq("parent_task_id", selfId)
      .limit(1);
    if (kids && kids.length > 0) return "This ticket has sub-tasks; it cannot itself become a sub-task.";
  }
  return null;
}
