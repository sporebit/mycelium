import { whenFieldsFromBody } from "@/lib/tickets/server";
import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { logTaskActivity } from "@/lib/task-activity";
import { removeGoogleEvent, syncTicketToGoogle } from "@/lib/google/sync";
import { TASK_STATUSES } from "@/lib/types/task";
import { attachAssigneeNames, attachBlockers, type TicketRow } from "@/lib/tickets/query";
import { signTicketAttachment } from "@/lib/storage/tickets";
import { createGithubIssue } from "@/lib/tickets/github";
import {
  isTicketCategory,
  moveTicket,
  principalUid,
  readJson,
  rebuildTicketMentions,
  resolveTicketRef,
  statusIdFor,
  ticketFieldsFromBody,
  ticketWriteGate,
  validateParent,
} from "@/lib/tickets/server";

export const runtime = "nodejs";

type Raw = Parameters<typeof serializeTask>[0];

/**
 * /api/tickets/[key] — the ticket addressed by its stable key ("MYC-33") or,
 * for callers that only hold one, its uuid (spec §11).
 *
 * GET   full row + sub-tasks + links + comments + activity + open blockers.
 * PATCH any field: the Tickets-native columns (validated in
 *       ticketFieldsFromBody), the legacy Tasks columns still shown in the
 *       classic view, and `category` which resolves to the space's status
 *       row. The 0117 trigger keeps `status` / `completed_at` in step.
 * DELETE = cancel (soft, spec §11). `?hard=1` removes the row — the classic
 *       view's delete.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data: row, error } = await supabase
      .from("tickets")
      .select(TASK_SELECT)
      .eq("id", ref.id)
      .maybeSingle();
    if (error || !row) return NextResponse.json({ error: "not found" }, { status: 404 });
    const task: TicketRow = serializeTask(row as unknown as Raw);

    const [comments, activity, subs, links, completions] = await Promise.all([
      supabase
        .from("ticket_comments")
        .select("id, task_id:ticket_id, body, created_at, updated_at")
        .eq("ticket_id", task.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("ticket_activity")
        .select("id, task_id:ticket_id, action, field, from_value, to_value, created_at")
        .eq("ticket_id", task.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("tickets")
        .select(TASK_SELECT)
        .eq("parent_task_id", task.id)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("ticket_links")
        .select("id, kind, ref, url, label, meta, at")
        .eq("ticket_id", task.id)
        .order("at", { ascending: false }),
      supabase
        .from("ticket_completions")
        .select("completed_on")
        .eq("ticket_id", task.id)
        .order("completed_on", { ascending: false })
        .limit(60),
    ]);

    const sub_tasks: TicketRow[] = ((subs.data ?? []) as unknown as Raw[]).map((r) =>
      serializeTask(r),
    );
    await Promise.all([
      attachBlockers(supabase, [task, ...sub_tasks]),
      attachAssigneeNames(supabase, [task, ...sub_tasks]),
    ]);

    // attachments live in the private `tickets` bucket: hand out signed URLs
    const linkRows = await Promise.all(
      ((links.data ?? []) as Array<{ id: string; kind: string; ref: string | null; url: string | null; label: string | null; meta: unknown; at: string }>).map(
        async (l) =>
          l.kind === "attachment" && l.ref && !l.url
            ? { ...l, url: await signTicketAttachment(supabase, l.ref) }
            : l,
      ),
    );

    return NextResponse.json({
      task,
      sub_tasks,
      links: linkRows,
      completions: (completions.data ?? []).map(
        (c) => (c as { completed_on: string }).completed_on,
      ),
      comments: comments.data ?? [],
      activity: activity.data ?? [],
    });
  } catch (err) {
    console.error("[/api/tickets/:key GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** Legacy Tasks columns the classic surfaces still edit. */
// `urgency` left this list with spec §18 R4: the column stays one release, unwritten.
const LEGACY_FIELDS = [
  "status",
  "priority_score",
  "due_date",
  "scheduled_at",
  "time_estimate_min",
  "context_where",
  "context_device",
  "context_energy",
  "context_tag",
  "sort_order",
] as const;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });

  // When (spec §18): `due_window` derives the dates server-side and wins over any dates sent alongside.
  const update: Record<string, unknown> = { ...ticketFieldsFromBody(body), ...whenFieldsFromBody(body) };
  for (const k of LEGACY_FIELDS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === "status" && !(TASK_STATUSES as readonly string[]).includes(String(v))) continue;
    if ((k === "priority_score" || k === "time_estimate_min") && v !== null && typeof v !== "number") continue;
    if (k === "sort_order" && typeof v !== "number") continue;
    update[k] = v;
  }
  // A legacy status write keeps completed_at coherent on the way in (the
  // trigger does too, but the response should already reflect it).
  if ("status" in update && !("completed_at" in update)) {
    update.completed_at = update.status === "completed" ? new Date().toISOString() : null;
  }

  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (typeof update.parent_task_id === "string") {
      const problem = await validateParent(supabase, update.parent_task_id, ref.id);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (isTicketCategory(body.category)) {
      const sid = await statusIdFor(supabase, ref.space_id, body.category);
      if (!sid) {
        return NextResponse.json(
          { error: `no ${body.category} status in this space` },
          { status: 500 },
        );
      }
      update.status_id = sid;
      // a category move wins over any stale legacy status in the same body
      delete update.status;
      delete update.completed_at;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "no valid fields" }, { status: 400 });
    }
    update.updated_at = new Date().toISOString();

    const { data: beforeRow } = await supabase
      .from("tickets")
      .select(
        "status, urgency, project_id, due_date, scheduled_at, time_estimate_min, key, owner, entity_id, title, description, parent_task_id, tags, status_id, someday, urgent, points, where_ctx, tools, time_window, scheduled_on, deadline_on, assignee_id, waiting_on_person_id, kind",
      )
      .eq("id", ref.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from("tickets")
      .update(update)
      .eq("id", ref.id)
      .select(TASK_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "update failed" }, { status: 400 });
    }
    const task = serializeTask(data as unknown as Raw);

    if (beforeRow) {
      // Log the category, not the status uuid, so the activity feed reads.
      const after: Record<string, unknown> = { ...update };
      const before: Record<string, unknown> = { ...(beforeRow as Record<string, unknown>) };
      if ("status_id" in after) {
        after.status_id = task.category ?? update.status_id;
        before.status_id = ref.category ?? beforeRow.status_id;
      }
      await logTaskActivity(supabase, ref.id, before, after);
    }

    if ("title" in update || "description" in update) {
      await rebuildTicketMentions(supabase, task.id, task.title, task.description);
    }

    // Opt-in Issues sync (spec Flag 3): ticket → Issue only when flagged.
    if (update.sync_to_github === true && !task.github_issue_number && task.project_id) {
      const { data: proj } = await supabase.from("projects").select("github_repo, github_issues_sync").eq("id", task.project_id).maybeSingle();
      if (proj?.github_repo && proj.github_issues_sync) {
        const issue = await createGithubIssue(
          proj.github_repo as string,
          `${task.ticket_key ?? ""} ${task.title}`.trim(),
          `${task.description ?? ""}\n\n—\nMycelium ticket ${task.ticket_key ?? task.id}`,
        );
        if (issue) {
          await supabase
            .from("tickets")
            .update({ github_issue_number: issue.number, github_issue_url: issue.html_url, github_synced_at: new Date().toISOString() })
            .eq("id", task.id);
          await supabase.from("ticket_links").insert({ ticket_id: task.id, kind: "github_issue", ref: String(issue.number), url: issue.html_url, label: `#${issue.number}` });
          task.github_issue_number = issue.number;
          task.github_issue_url = issue.html_url;
        }
      }
    }

    // Google Calendar (MYC-40): decided from the ticket's state after the write
    if (["scheduled_at", "scheduled_on", "deadline_on", "due_window", "title", "description", "status", "status_id", "completed_at"].some((k) => k in update) || task.category === "done" || task.category === "cancelled") {
      void syncTicketToGoogle(supabase, task);
    }

    return NextResponse.json({ task, ticket: task });
  } catch (err) {
    console.error("[/api/tickets/:key PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const hard = req.nextUrl.searchParams.get("hard") === "1";
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    if (!hard) {
      const moved = await moveTicket(supabase, key, "cancelled");
      if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status });
      removeGoogleEvent(supabase, "tasks", moved.task.google_event_id ?? null).catch(() => {});
      return NextResponse.json({ ok: true, task: moved.task });
    }

    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data: existing } = await supabase
      .from("tickets")
      .select("google_event_id")
      .eq("id", ref.id)
      .maybeSingle();
    const { error } = await supabase.from("tickets").delete().eq("id", ref.id);
    if (error) throw error;
    if (existing?.google_event_id) {
      removeGoogleEvent(supabase, "tasks", existing.google_event_id).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tickets/:key DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
