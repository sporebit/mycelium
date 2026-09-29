/**
 * Work — creating and changing a ticket (claude/spec-work.md §4).
 *
 * One write path for the issue page, the boards, the backlog and the
 * quick-create box. It keeps the side effects the old path has (activity
 * log, People mentions, Google Calendar) and adds Work's own: labels,
 * components, watchers and notifications.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncTicketToGoogle } from "@/lib/google/sync";
import { fetchTaskById } from "@/lib/tasks";
import { logTaskActivity, logTaskCreated } from "@/lib/task-activity";
import { rebuildTicketMentions } from "@/lib/tickets/server";
import { checkDoc, docToText, newRefs, refsIn } from "./doc";
import { recordEvents, watchersOf, workUrl, type WorkEvent } from "./notify";
import {
	WORK_SELECT,
	namesFor,
	resolveWorkRef,
	serializeStatus,
	serializeWork,
	setTicketComponents,
	setTicketLabels,
	STATUS_SELECT,
	ticketsByIds,
	watch,
	workWriteFromBody,
	workflowFor,
	statusesOf,
	writeErrorMessage,
} from "./server";
import type { WorkActivity, WorkComment, WorkTicket, WorkTicketDetail } from "./types";

export type WriteResult = { ok: true; ticket: WorkTicket } | { ok: false; status: number; error: string };

function calendar(supabase: SupabaseClient, id: string): void {
	void fetchTaskById(supabase, id)
		.then((task) => (task ? syncTicketToGoogle(supabase, task) : null))
		.catch(() => null);
}

/** A description document, checked, with its text rendition in step. */
function normaliseDescription(body: Record<string, unknown>): string | null {
	if (!("description_doc" in body) || body.description_doc === null) return null;
	const problem = checkDoc(body.description_doc);
	if (problem) return problem;
	// the text is derived, never trusted from the client
	body.description = docToText(body.description_doc);
	return null;
}

export async function createWorkTicket(
	supabase: SupabaseClient,
	uid: string,
	spaceId: string,
	input: Record<string, unknown>,
): Promise<WriteResult> {
	const body = { ...input };
	if (typeof body.title !== "string" || !body.title.trim()) return { ok: false, status: 400, error: "A title is required." };
	const docProblem = normaliseDescription(body);
	if (docProblem) return { ok: false, status: 400, error: docProblem };

	// a ticket with no project lands in the space's default project (0143)
	let projectId: string | null = null;
	if (!("project" in body) && !("project_id" in body)) {
		const { data } = await supabase.from("projects").select("id").eq("space_id", spaceId).eq("is_default", true).maybeSingle();
		projectId = (data?.id as string | undefined) ?? null;
	}
	// a child lives where its parent lives
	if (typeof body.parent === "string" && !("project" in body) && !("project_id" in body)) {
		const parent = await resolveWorkRef(supabase, body.parent);
		if (parent?.project_id) projectId = parent.project_id;
		if (parent && !("type" in body) && !("type_id" in body)) body.type = "subtask";
	}

	const write = await workWriteFromBody(supabase, body, { spaceId, projectId, typeId: null });
	if (write.error) return { ok: false, status: 400, error: write.error };

	const insert: Record<string, unknown> = {
		...write.columns,
		space_id: spaceId,
		owner: uid,
		priority_score: 0.5,
		source: "ui",
	};
	if (!insert.project_id && projectId) insert.project_id = projectId;

	const { data, error } = await supabase.from("tickets").insert(insert).select("id, space_id, project_id, ticket_key, title").single();
	if (error || !data) return { ok: false, status: error?.code === "42501" ? 403 : 400, error: writeErrorMessage(error) };
	const row = data as { id: string; space_id: string; project_id: string | null; ticket_key: string | null; title: string };

	if (write.labels) {
		const problem = await setTicketLabels(supabase, row, write.labels);
		if (problem) return { ok: false, status: 400, error: problem };
	}
	if (write.components) {
		const problem = await setTicketComponents(supabase, row, write.components);
		if (problem) return { ok: false, status: 400, error: problem };
	}

	const assignee = (write.columns.assignee_id as string | null | undefined) ?? null;
	const refs = refsIn(write.columns.description_doc);
	await Promise.all([
		logTaskCreated(supabase, row.id),
		watch(supabase, row, [uid, assignee, ...refs.users]),
		rebuildTicketMentions(supabase, row.id, row.title, (write.columns.description as string | null | undefined) ?? null),
	]);

	const key = row.ticket_key ?? row.id;
	const events: WorkEvent[] = [];
	if (assignee) events.push({ event: "assignment", recipients: [assignee], title: `${key} was assigned to you`, body: row.title, url: workUrl(key), ticket_id: row.id });
	if (refs.users.length > 0) events.push({ event: "mention", recipients: refs.users, title: `You were mentioned in ${key}`, body: row.title, url: workUrl(key), ticket_id: row.id });
	await recordEvents(supabase, { actorId: uid, spaceId }, events);

	if (write.columns.scheduled_on) calendar(supabase, row.id);
	const [ticket] = await ticketsByIds(supabase, [row.id]);
	if (!ticket) return { ok: false, status: 500, error: "The ticket was created but could not be read back." };
	return { ok: true, ticket };
}

const BEFORE_SELECT =
	"id, space_id, project_id, type_id, status_id, assignee_id, title, description, description_doc, points, deadline_on, scheduled_on, parent_task_id, epic_id, sprint_id, kind, ticket_key, status:ticket_statuses(name), type:issue_types(name)";

export async function patchWorkTicket(
	supabase: SupabaseClient,
	uid: string | null,
	refOrKey: string,
	input: Record<string, unknown>,
): Promise<WriteResult> {
	const found = await resolveWorkRef(supabase, refOrKey);
	if (!found) return { ok: false, status: 404, error: "not found" };
	const body = { ...input };
	const docProblem = normaliseDescription(body);
	if (docProblem) return { ok: false, status: 400, error: docProblem };

	const write = await workWriteFromBody(supabase, body, {
		spaceId: found.space_id,
		projectId: found.project_id,
		typeId: found.type_id,
		ticketId: found.id,
	});
	if (write.error) return { ok: false, status: 400, error: write.error };
	if (Object.keys(write.columns).length === 0 && !write.labels && !write.components) {
		return { ok: false, status: 400, error: "Nothing to change." };
	}

	const { data: beforeRow } = await supabase.from("tickets").select(BEFORE_SELECT).eq("id", found.id).maybeSingle();
	const before = (beforeRow ?? {}) as Record<string, unknown> & { status?: unknown; type?: unknown };

	if (Object.keys(write.columns).length > 0) {
		const { error } = await supabase
			.from("tickets")
			.update({ ...write.columns, updated_at: new Date().toISOString() })
			.eq("id", found.id);
		if (error) return { ok: false, status: error.code === "42501" ? 403 : 400, error: writeErrorMessage(error) };
	}
	const target = { id: found.id, space_id: found.space_id, project_id: (write.columns.project_id as string | undefined) ?? found.project_id };
	if (write.labels) {
		const problem = await setTicketLabels(supabase, target, write.labels);
		if (problem) return { ok: false, status: 400, error: problem };
	}
	if (write.components) {
		const problem = await setTicketComponents(supabase, target, write.components);
		if (problem) return { ok: false, status: 400, error: problem };
	}
	if ((write.labels || write.components) && Object.keys(write.columns).length === 0) {
		await supabase.from("tickets").update({ updated_at: new Date().toISOString() }).eq("id", found.id);
	}

	const [ticket] = await ticketsByIds(supabase, [found.id]);
	if (!ticket) return { ok: false, status: 500, error: "The ticket was changed but could not be read back." };

	// the activity feed reads names, not ids
	const one = (v: unknown): { name?: string } | null => (Array.isArray(v) ? (v[0] ?? null) : ((v as { name?: string } | null) ?? null));
	const logBefore: Record<string, unknown> = { ...before };
	const logAfter: Record<string, unknown> = { ...write.columns };
	delete logAfter.description_doc;
	delete logAfter.due_window;
	delete logAfter.due_date;
	if ("status_id" in logAfter) {
		logBefore.status_id = one(before.status)?.name ?? before.status_id;
		logAfter.status_id = ticket.status?.name ?? logAfter.status_id;
	}
	await logTaskActivity(supabase, found.id, logBefore, logAfter);

	if ("title" in write.columns || "description" in write.columns) {
		await rebuildTicketMentions(supabase, ticket.id, ticket.title, ticket.description);
	}

	const key = ticket.key ?? ticket.id;
	const events: WorkEvent[] = [];
	const newAssignee = "assignee_id" in write.columns && write.columns.assignee_id !== before.assignee_id ? (write.columns.assignee_id as string | null) : null;
	if (newAssignee) {
		await watch(supabase, found, [newAssignee]);
		events.push({ event: "assignment", recipients: [newAssignee], title: `${key} was assigned to you`, body: ticket.title, url: workUrl(key), ticket_id: ticket.id });
	}
	if ("status_id" in write.columns && ticket.status && ticket.status.id !== before.status_id) {
		const watchers = await watchersOf(supabase, ticket.id);
		events.push({
			event: "status_change",
			recipients: [...watchers, ticket.assignee?.id],
			title: `${key} moved to ${ticket.status.name}`,
			body: ticket.title,
			url: workUrl(key),
			ticket_id: ticket.id,
		});
	}
	if ("description_doc" in write.columns) {
		const fresh = newRefs(before.description_doc, write.columns.description_doc);
		if (fresh.users.length > 0) {
			await watch(supabase, found, fresh.users);
			events.push({ event: "mention", recipients: fresh.users, title: `You were mentioned in ${key}`, body: ticket.title, url: workUrl(key), ticket_id: ticket.id });
		}
	}
	await recordEvents(supabase, { actorId: uid, spaceId: found.space_id }, events);

	if (["scheduled_on", "deadline_on", "title", "description", "status_id"].some((k) => k in write.columns)) calendar(supabase, ticket.id);
	return { ok: true, ticket };
}

/** Everything the issue page shows. */
export async function workTicketDetail(supabase: SupabaseClient, uid: string | null, refOrKey: string): Promise<WorkTicketDetail | null> {
	const found = await resolveWorkRef(supabase, refOrKey);
	if (!found) return null;
	const [ticket] = await ticketsByIds(supabase, [found.id]);
	if (!ticket) return null;

	const [children, epicChildren, comments, activity, links, docs, watchers, workflow] = await Promise.all([
		supabase.from("tickets").select(WORK_SELECT).eq("parent_task_id", found.id).is("deleted_at", null).order("sort_order").order("created_at"),
		ticket.type?.level === 1
			? supabase.from("tickets").select(WORK_SELECT).eq("epic_id", found.id).is("deleted_at", null).order("sort_order").order("created_at")
			: Promise.resolve({ data: [] as unknown[] }),
		supabase.from("ticket_comments").select("id, body, body_doc, created_by, created_at, updated_at").eq("ticket_id", found.id).order("created_at"),
		supabase.from("ticket_activity").select("id, action, field, from_value, to_value, created_by, created_at").eq("ticket_id", found.id).order("created_at", { ascending: false }).limit(200),
		supabase.from("ticket_links").select("id, kind, ref, url, label, at").eq("ticket_id", found.id).order("at", { ascending: false }),
		// doc_pages and doc_spaces are joined by two foreign keys (doc_space_id, home_page_id): name the column
		supabase.from("doc_page_links").select("source, page:doc_pages(id, title, archived_at, doc_space:doc_space_id(key))").eq("ticket_id", found.id),
		supabase.from("ticket_watchers").select("watcher_id").eq("ticket_id", found.id),
		workflowFor(supabase, found.space_id, found.project_id, found.type_id),
	]);

	type Row = Parameters<typeof serializeWork>[0];
	const childRows = (children.data ?? []) as unknown as Row[];
	const epicRows = ((epicChildren as { data: unknown[] | null }).data ?? []) as unknown as Row[];
	const commentRows = (comments.data ?? []) as Array<{ id: string; body: string; body_doc: unknown; created_by: string | null; created_at: string; updated_at: string }>;
	const activityRows = (activity.data ?? []) as Array<{ id: string; action: string; field: string | null; from_value: string | null; to_value: string | null; created_by: string | null; created_at: string }>;
	const watcherIds = ((watchers.data ?? []) as Array<{ watcher_id: string }>).map((w) => w.watcher_id);

	const names = await namesFor(supabase, [
		...childRows.flatMap((r) => [r.assignee_id, r.created_by]),
		...epicRows.flatMap((r) => [r.assignee_id, r.created_by]),
		...commentRows.map((c) => c.created_by),
		...activityRows.map((a) => a.created_by),
		...watcherIds,
	]);
	const person = (id: string | null) => (id ? { id, name: names.get(id) ?? id.slice(0, 8) } : null);

	type DocLink = { source: string; page: unknown };
	const docRows: WorkTicketDetail["docs"] = [];
	for (const d of (docs.data ?? []) as DocLink[]) {
		const page = (Array.isArray(d.page) ? d.page[0] : d.page) as { id: string; title: string; archived_at: string | null; doc_space: unknown } | null;
		if (!page || page.archived_at) continue;
		const ds = (Array.isArray(page.doc_space) ? page.doc_space[0] : page.doc_space) as { key: string } | null;
		docRows.push({ id: page.id, title: page.title, doc_space_key: ds?.key ?? "", source: d.source });
	}

	let statuses = workflow ? await statusesOf(supabase, workflow) : [];
	if (statuses.length === 0 && ticket.status) {
		const { data } = await supabase.from("ticket_statuses").select(STATUS_SELECT).eq("workflow_id", ticket.status.workflow_id).order("sort_order");
		statuses = ((data ?? []) as unknown as Array<Parameters<typeof serializeStatus>[0]>).map(serializeStatus);
	}

	return {
		ticket,
		children: childRows.map((r) => serializeWork(r, names)),
		epic_children: epicRows.map((r) => serializeWork(r, names)),
		comments: commentRows.map((c): WorkComment => ({ id: c.id, body: c.body, body_doc: c.body_doc ?? null, author: person(c.created_by), created_at: c.created_at, updated_at: c.updated_at })),
		activity: activityRows.map((a): WorkActivity => ({ id: a.id, action: a.action, field: a.field, from_value: a.from_value, to_value: a.to_value, actor: person(a.created_by), created_at: a.created_at })),
		links: (links.data ?? []) as WorkTicketDetail["links"],
		docs: docRows,
		watchers: watcherIds.map((id) => ({ id, name: names.get(id) ?? id.slice(0, 8) })),
		watching: !!uid && watcherIds.includes(uid),
		statuses,
	};
}
