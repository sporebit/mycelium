import { whenFieldsFromBody } from "@/lib/tickets/server";
import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { syncTicketToGoogle } from "@/lib/google/sync";
import { logTaskCreated } from "@/lib/task-activity";
import {
  GTD_LISTS,
  TICKET_CATEGORIES,
  type GtdList,
  type TicketCategory,
} from "@/lib/tickets/categories";
import { listTickets, type NowContext } from "@/lib/tickets/query";
import { parseArea } from "@/lib/tickets/area";
import { parseDateRanges, parseSort } from "@/lib/tickets/dateFilters";
import { pickPostBody } from "@/lib/capture/registry";
import { TEMPLATE_SELECT, instantiateTemplate, type TemplateRow } from "@/lib/tickets/templates";
import {
  isTicketCategory,
  legacyFieldsFromBody,
  moveTicket,
  principalUid,
  readJson,
  ticketFieldsFromBody,
  ticketWriteGate,
  validateParent,
} from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * GET /api/tickets — the list endpoint behind every GTD tab, the Now view and
 * the dates list (spec §11, tasks-merge M2/M4). Filters: list=now|inbox|today|
 * upcoming|next|waiting|someday|logbook|all (all = every ticket, done and
 * cancelled included), category=csv, status_id=csv, area=technical|life|<area id>,
 * project=<id|null>, assignee=me|<uid>, q, updated_since, limit, subtasks=1,
 * created_from/to, started_from/to, completed_from/to, closed_from/to (a bare
 * date is a London day), sort=<whitelisted column>&dir=asc|desc; Now
 * overrides: where, place, tools=csv, max_points, include_backlog=1.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const listRaw = sp.get("list");
  const all = listRaw === "all";
  const list = listRaw && (GTD_LISTS as readonly string[]).includes(listRaw) ? (listRaw as GtdList) : null;
  const area = parseArea(sp.get("area"));
  const statusIds = (sp.get("status_id") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const categories = (sp.get("category") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TicketCategory => (TICKET_CATEGORIES as readonly string[]).includes(s));
  const uid = await principalUid();
  const assigneeRaw = sp.get("assignee");
  const assignee = assigneeRaw === "me" ? uid : assigneeRaw;

  let now: NowContext | null = null;
  if (list === "now") {
    const where = sp.get("where");
    const tools = (sp.get("tools") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const mp = sp.get("max_points");
    now = {
      where: where === "home" || where === "out" || where === "place" || where === "any" ? where : "anywhere",
      place_id: sp.get("place"),
      tools,
      max_points: mp ? Number(mp) || null : null,
      include_backlog: sp.get("include_backlog") === "1",
    };
  }

  try {
    const supabase = await createUserClient();
    const { tickets, today } = await listTickets(supabase, {
      list,
      categories,
      projectId: sp.get("project"),
      areaKind: area.kind,
      areaId: area.areaId,
      all,
      dates: parseDateRanges((k) => sp.get(k)),
      sort: parseSort(sp.get("sort"), sp.get("dir")),
      statusIds,
      assignee,
      q: sp.get("q"),
      kind: sp.get("kind"),
      sprint: sp.get("sprint"),
      updatedSince: sp.get("updated_since"),
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      now,
      uid,
      includeSubtasks: sp.get("subtasks") === "1",
    });
    auditListRead(req, tickets, "organisation", "tickets");
    return NextResponse.json({ tickets, today, list: all ? "all" : (list ?? "open") });
  } catch (err) {
    console.error("[/api/tickets GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * POST /api/tickets — create. Title required; everything else optional.
 * Lands in Inbox unless `category` is given (spec §11). Returns the key.
 */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await readJson(req);
  if (!raw) return NextResponse.json({ error: "bad json" }, { status: 400 });
  // The registry's whitelist is the body (MYC-161): unknown keys never reach the insert.
  const body = pickPostBody("task", raw);

  // Tickets-native fields plus the classic views' legacy columns (MYC-163).
  const fields = { ...legacyFieldsFromBody(body), ...ticketFieldsFromBody(body) };
  const templateSlug = typeof body.template === "string" ? body.template.trim() : "";
  if (typeof fields.title !== "string" && !templateSlug) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    // `template` (spec §11): fill the ticket and its sub-tasks from a template.
    if (templateSlug) {
      const { data: tplRow } = await supabase
        .from("ticket_templates")
        .select(TEMPLATE_SELECT)
        .eq("slug", templateSlug)
        .maybeSingle();
      if (!tplRow) return NextResponse.json({ error: "template not found" }, { status: 404 });
      const ticket = await instantiateTemplate(supabase, tplRow as TemplateRow, {
        uid,
        title: typeof fields.title === "string" ? fields.title : undefined,
        project_id: typeof fields.project_id === "string" ? fields.project_id : undefined,
        category: isTicketCategory(body.category) && (body.category === "inbox" || body.category === "backlog") ? body.category : "next",
        vars: body.vars && typeof body.vars === "object" ? (body.vars as Record<string, string>) : undefined,
      });
      return NextResponse.json({ ticket, key: ticket.ticket_key }, { status: 201 });
    }

    if (typeof fields.parent_task_id === "string") {
      const problem = await validateParent(supabase, fields.parent_task_id);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      ...fields,
      // When (spec §18 R4): `due_window` derives the dates here; the legacy
      // `urgency` column is no longer written.
      ...whenFieldsFromBody(body),
      owner: typeof fields.owner === "string" && fields.owner.trim() ? fields.owner.trim() : uid,
      priority_score: typeof fields.priority_score === "number" ? fields.priority_score : 0.5,
      source: typeof fields.source === "string" ? fields.source : "ui",
    };
    delete insert.status_id; // the 0117 trigger defaults it; `category` moves it
    // A legacy status on create keeps completed_at coherent (the trigger derives the category).
    if (typeof insert.status === "string" && insert.status === "completed") insert.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("tickets")
      .insert(insert)
      .select(TASK_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    const id = (data as { id: string }).id;
    await logTaskCreated(supabase, id);

    let ticket = serializeTask(data as Parameters<typeof serializeTask>[0]);
    if (isTicketCategory(body.category) && body.category !== "inbox") {
      const moved = await moveTicket(supabase, id, body.category);
      if (moved.ok) ticket = moved.task;
    }
    if (ticket.scheduled_on || ticket.scheduled_at) void syncTicketToGoogle(supabase, ticket);
    return NextResponse.json({ ticket, key: ticket.ticket_key }, { status: 201 });
  } catch (err) {
    console.error("[/api/tickets POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
