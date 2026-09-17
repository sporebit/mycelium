/**
 * Tickets — list queries: the GTD lists (spec §3.2) and the Now filter
 * (spec §5). Server-only (uses the user client); the FROZEN now-filter
 * scorer stays client-side and receives the pre-filtered rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import type { Task } from "@/lib/types/task";
import {
  CLOSED_CATEGORIES,
  OPEN_CATEGORIES,
  isClosedCategory,
  londonNow,
  timeWindowContains,
  type GtdList,
  type TicketCategory,
} from "./categories";

/** TASK_SELECT with an inner join on the status row, so category filters
 *  can be applied in PostgREST (`ticket_status.category=in.(...)`). */
const LIST_SELECT =
  TASK_SELECT.replace("ticket_status:ticket_statuses(", "ticket_status:ticket_statuses!inner(") +
  ", space_id";

export type NowContext = {
  where: "anywhere" | "home" | "out" | "place";
  place_id: string | null;
  tools: string[];
  max_points: number | null;
  include_backlog: boolean;
};

export type ListParams = {
  list?: GtdList | null;
  categories?: TicketCategory[];
  projectId?: string | null; // "null" = unprojected
  areaId?: string | null;
  assignee?: string | null; // "me" resolved by caller
  q?: string | null;
  updatedSince?: string | null;
  limit?: number;
  now?: NowContext | null;
  uid?: string | null;
  includeSubtasks?: boolean;
  /** Filter by kind. Habits (series tickets) are excluded unless asked for:
   *  they have their own surfaces (Habits strip, heatmap) — spec Flag 5. */
  kind?: string | null;
};

export type TicketRow = Task & {
  space_id?: string;
  /** Keys of open tickets blocking this one (empty when free). */
  blocked_by?: string[];
};

export async function listTickets(
  supabase: SupabaseClient,
  p: ListParams,
): Promise<{ tickets: TicketRow[]; today: string }> {
  const now = londonNow();
  const today = now.date;
  const limit = Math.min(Math.max(p.limit ?? 300, 1), 1000);

  let q = supabase.from("tickets").select(LIST_SELECT).is("deleted_at", null);

  let cats: readonly TicketCategory[] | null = p.categories?.length ? p.categories : null;
  let postFilter: ((t: TicketRow) => boolean) | null = null;
  let order: Array<[string, { ascending: boolean; nullsFirst?: boolean }]> = [
    ["urgent", { ascending: false }],
    ["deadline_on", { ascending: true, nullsFirst: false }],
    ["scheduled_on", { ascending: true, nullsFirst: false }],
    ["priority_score", { ascending: false, nullsFirst: false }],
    ["created_at", { ascending: false }],
  ];

  switch (p.list) {
    case "inbox":
      cats = ["inbox"];
      order = [["created_at", { ascending: true }]];
      break;
    case "today":
      cats = cats ?? OPEN_CATEGORIES;
      q = q.or(`scheduled_on.lte.${today},deadline_on.lte.${today}`);
      break;
    case "upcoming":
      cats = cats ?? OPEN_CATEGORIES;
      q = q.or(`scheduled_on.gt.${today},deadline_on.gt.${today}`);
      order = [
        ["scheduled_on", { ascending: true, nullsFirst: false }],
        ["deadline_on", { ascending: true, nullsFirst: false }],
      ];
      break;
    case "next":
      cats = ["next"];
      q = q.eq("someday", false);
      postFilter = (t) => (t.blocked_by?.length ?? 0) === 0;
      break;
    case "waiting":
      cats = ["waiting"];
      order = [["updated_at", { ascending: true }]];
      break;
    case "someday":
      cats = cats ?? OPEN_CATEGORIES;
      q = q.eq("someday", true);
      order = [["updated_at", { ascending: false }]];
      break;
    case "logbook":
      cats = CLOSED_CATEGORIES;
      order = [["completed_at", { ascending: false, nullsFirst: false }], ["updated_at", { ascending: false }]];
      break;
    case "now": {
      const ctx = p.now;
      cats = ctx?.include_backlog ? ["next", "doing", "backlog"] : ["next", "doing"];
      q = q.eq("someday", false);
      if (p.uid) q = q.or(`assignee_id.is.null,assignee_id.eq.${p.uid}`);
      if (ctx) {
        const whereParts = ["where_ctx.eq.anywhere"];
        if (ctx.where === "home" || ctx.where === "out") whereParts.push(`where_ctx.eq.${ctx.where}`);
        if (ctx.where === "place" && ctx.place_id) {
          whereParts.push(`and(where_ctx.eq.place,place_id.eq.${ctx.place_id})`);
        }
        q = q.or(whereParts.join(","));
        const tools = ctx.tools.filter((t) => /^[a-z0-9_-]+$/i.test(t));
        if (tools.length > 0) q = q.or(`tools.cs.{none},tools.ov.{${tools.join(",")}}`);
        if (ctx.max_points != null) q = q.or(`points.is.null,points.lte.${ctx.max_points}`);
      }
      postFilter = (t) =>
        (t.blocked_by?.length ?? 0) === 0 &&
        timeWindowContains(now, t.time_window, t.time_from, t.time_to, t.days);
      order = [
        ["now_score", { ascending: false, nullsFirst: false }],
        ["urgent", { ascending: false }],
        ["deadline_on", { ascending: true, nullsFirst: false }],
        ["scheduled_on", { ascending: true, nullsFirst: false }],
        ["priority_score", { ascending: false, nullsFirst: false }],
      ];
      break;
    }
    default:
      cats = cats ?? OPEN_CATEGORIES;
  }

  if (cats) q = q.in("ticket_status.category", [...cats]);
  if (p.kind) q = q.eq("kind", p.kind);
  else q = q.neq("kind", "habit");
  if (p.projectId === "null") q = q.is("project_id", null);
  else if (p.projectId) q = q.eq("project_id", p.projectId);
  if (p.assignee) q = q.eq("assignee_id", p.assignee);
  if (p.updatedSince) q = q.gte("updated_at", p.updatedSince);
  if (p.q) {
    const term = p.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%,ticket_key.ilike.%${term}%`);
  }
  if (!p.includeSubtasks && p.list !== "now" && p.list !== "next") {
    // sub-tasks stay under their parent in the general lists; Now and Next
    // surface them as actions in their own right (spec §3.2).
    q = q.is("parent_task_id", null);
  }
  for (const [col, o] of order) q = q.order(col, o);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw error;
  let tickets: TicketRow[] = (data ?? []).map((row) => ({
    ...serializeTask(row as unknown as Parameters<typeof serializeTask>[0]),
    space_id: (row as { space_id?: string }).space_id,
  }));

  await attachBlockers(supabase, tickets);
  if (postFilter) tickets = tickets.filter(postFilter);
  return { tickets, today };
}

/** Fill `blocked_by` with the keys of open blockers (spec §3.2, §5). */
export async function attachBlockers(
  supabase: SupabaseClient,
  tickets: TicketRow[],
): Promise<void> {
  if (tickets.length === 0) return;
  const ids = tickets.map((t) => t.id);
  const { data: deps } = await supabase
    .from("ticket_dependencies")
    .select("blocker_id, blocked_id")
    .in("blocked_id", ids);
  const rows = (deps ?? []) as Array<{ blocker_id: string; blocked_id: string }>;
  for (const t of tickets) t.blocked_by = [];
  if (rows.length === 0) return;
  const blockerIds = Array.from(new Set(rows.map((r) => r.blocker_id)));
  const { data: blockers } = await supabase
    .from("tickets")
    .select("id, ticket_key, ticket_status:ticket_statuses(category)")
    .in("id", blockerIds);
  const openKey = new Map<string, string>();
  for (const b of (blockers ?? []) as Array<{
    id: string;
    ticket_key: string | null;
    ticket_status: { category: string } | { category: string }[] | null;
  }>) {
    const st = Array.isArray(b.ticket_status) ? b.ticket_status[0] : b.ticket_status;
    if (!isClosedCategory(st?.category)) openKey.set(b.id, b.ticket_key ?? b.id);
  }
  const byBlocked = new Map<string, string[]>();
  for (const r of rows) {
    const k = openKey.get(r.blocker_id);
    if (!k) continue;
    const list = byBlocked.get(r.blocked_id) ?? [];
    list.push(k);
    byBlocked.set(r.blocked_id, list);
  }
  for (const t of tickets) t.blocked_by = byBlocked.get(t.id) ?? [];
}

export type TicketCounts = Record<Exclude<GtdList, "now">, number>;

/**
 * Tab badges for the GTD home: one light query over open top-level tickets
 * plus a head count of the Logbook. Now is context-dependent and counted by
 * the Now view itself. Next ignores blockers here (a badge, not the list).
 */
export async function ticketCounts(supabase: SupabaseClient): Promise<TicketCounts> {
  const today = londonNow().date;
  const [open, closed] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, someday, scheduled_on, deadline_on, ticket_status:ticket_statuses!inner(category)")
      .in("ticket_status.category", [...OPEN_CATEGORIES])
      .is("parent_task_id", null)
      .is("deleted_at", null)
      .neq("kind", "habit")
      .limit(2000),
    supabase
      .from("tickets")
      .select("id, ticket_status:ticket_statuses!inner(category)", { count: "exact", head: true })
      .in("ticket_status.category", [...CLOSED_CATEGORIES])
      .is("parent_task_id", null)
      .is("deleted_at", null)
      .neq("kind", "habit"),
  ]);
  const counts: TicketCounts = {
    inbox: 0,
    today: 0,
    upcoming: 0,
    next: 0,
    waiting: 0,
    someday: 0,
    logbook: closed.count ?? 0,
  };
  type Row = {
    someday: boolean;
    scheduled_on: string | null;
    deadline_on: string | null;
    ticket_status: { category: string } | { category: string }[] | null;
  };
  for (const r of (open.data ?? []) as unknown as Row[]) {
    const st = Array.isArray(r.ticket_status) ? r.ticket_status[0] : r.ticket_status;
    const cat = st?.category;
    if (cat === "inbox") counts.inbox += 1;
    if (cat === "waiting") counts.waiting += 1;
    if (cat === "next" && !r.someday) counts.next += 1;
    if (r.someday) counts.someday += 1;
    const anchor = [r.scheduled_on, r.deadline_on].filter((d): d is string => !!d);
    if (anchor.some((d) => d <= today)) counts.today += 1;
    else if (anchor.some((d) => d > today)) counts.upcoming += 1;
  }
  return counts;
}
