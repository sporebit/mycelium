import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { logTaskCreated } from "@/lib/task-activity";
import {
  GTD_LISTS,
  TICKET_CATEGORIES,
  type GtdList,
  type TicketCategory,
} from "@/lib/tickets/categories";
import { listTickets, type NowContext } from "@/lib/tickets/query";
import {
  isTicketCategory,
  moveTicket,
  principalUid,
  readJson,
  ticketFieldsFromBody,
  ticketWriteGate,
  validateParent,
} from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * GET /api/tickets — the list endpoint behind every GTD tab and the Now view
 * (spec §11). Filters: list=now|inbox|today|upcoming|next|waiting|someday|
 * logbook, category=csv, project=<id|null>, assignee=me|<uid>, q, updated_since,
 * limit, subtasks=1; Now overrides: where, place, tools=csv, max_points,
 * include_backlog=1.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const listRaw = sp.get("list");
  const list = listRaw && (GTD_LISTS as readonly string[]).includes(listRaw) ? (listRaw as GtdList) : null;
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
      where: where === "home" || where === "out" || where === "place" ? where : "anywhere",
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
      assignee,
      q: sp.get("q"),
      updatedSince: sp.get("updated_since"),
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      now,
      uid,
      includeSubtasks: sp.get("subtasks") === "1",
    });
    auditListRead(req, tickets, "organisation", "tickets");
    return NextResponse.json({ tickets, today, list: list ?? "all" });
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
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });

  const fields = ticketFieldsFromBody(body);
  if (typeof fields.title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    if (typeof fields.parent_task_id === "string") {
      const problem = await validateParent(supabase, fields.parent_task_id);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      ...fields,
      owner: uid,
      priority_score: 0.5,
      // legacy column, still read by the Today surface; neutral default
      urgency: typeof body.urgency === "string" ? body.urgency : "this_week",
      source: typeof fields.source === "string" ? fields.source : "ui",
    };
    delete insert.status_id; // the 0117 trigger defaults it; `category` moves it

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
    return NextResponse.json({ ticket, key: ticket.ticket_key }, { status: 201 });
  } catch (err) {
    console.error("[/api/tickets POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
