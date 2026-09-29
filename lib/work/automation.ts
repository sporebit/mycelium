/**
 * Work — what automation may do to a ticket's status (claude/spec-work.md
 * §4, W16). The GitHub webhook lands a ticket on the In Progress status
 * named "In Review"; the Vercel webhook lands it on "Done". Both look the
 * status up BY NAME in the ticket's own workflow, and fall back to the
 * workflow's status for the category when a workflow has no status of that
 * name — so a project with its own workflow still gets the automation.
 *
 * Automation only moves forward: never out of a Done-category status, and
 * never from In Progress back to To Do.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logTaskActivity } from "@/lib/task-activity";
import type { StatusCategory } from "./query";

export const IN_REVIEW = "In Review";
export const DONE = "Done";

const ORDER: Record<StatusCategory, number> = { todo: 0, in_progress: 1, done: 2 };

type StatusRow = { id: string; name: string; status_category: StatusCategory; category: string; workflow_id: string; sort_order: number; is_category_default: boolean };

export type AutoTarget = { name: string; category: StatusCategory; legacy: string };
export const TARGET_IN_REVIEW: AutoTarget = { name: IN_REVIEW, category: "in_progress", legacy: "verify" };
export const TARGET_DONE: AutoTarget = { name: DONE, category: "done", legacy: "done" };

/** The status a target means in one workflow (pure). */
export function pickStatus(statuses: StatusRow[], target: AutoTarget): StatusRow | null {
	const byName = statuses.find((s) => s.name.trim().toLowerCase() === target.name.toLowerCase() && s.status_category === target.category);
	if (byName) return byName;
	const inCategory = statuses.filter((s) => s.status_category === target.category);
	if (inCategory.length === 0) return null;
	const rank = (s: StatusRow) => (s.category === target.legacy ? 0 : 1) * 1_000_000 + (s.is_category_default ? 0 : 1) * 100_000 + s.sort_order;
	return [...inCategory].sort((a, b) => rank(a) - rank(b))[0];
}

/** May automation move a ticket from `from` to `to`? (pure) */
export function mayAdvance(from: Pick<StatusRow, "id" | "status_category"> | null, to: Pick<StatusRow, "id" | "status_category">): { ok: boolean; reason?: string } {
	if (!from) return { ok: true };
	if (from.id === to.id) return { ok: false, reason: "already there" };
	if (from.status_category === "done") return { ok: false, reason: "already resolved" };
	if (ORDER[to.status_category] < ORDER[from.status_category]) return { ok: false, reason: "automation only moves forward" };
	return { ok: true };
}

export type AdvanceResult = { moved: boolean; reason?: string; status?: string };

/** Move a ticket to the target status in its own workflow, forward only. */
export async function advanceTicket(db: SupabaseClient, ticketId: string, target: AutoTarget): Promise<AdvanceResult> {
	const { data: t } = await db
		.from("tickets")
		.select("id, space_id, project_id, type_id, status_id")
		.eq("id", ticketId)
		.maybeSingle();
	if (!t) return { moved: false, reason: "not found" };
	const { data: wf, error: wfErr } = await db.rpc("ticket_workflow_for", { p_space: t.space_id, p_project: t.project_id, p_type: t.type_id });
	if (wfErr || !wf) return { moved: false, reason: "no workflow" };
	const { data: rows } = await db
		.from("ticket_statuses")
		.select("id, name, status_category, category, workflow_id, sort_order, is_category_default")
		.eq("workflow_id", wf as string);
	const statuses = (rows ?? []) as StatusRow[];
	const to = pickStatus(statuses, target);
	if (!to) return { moved: false, reason: `no ${target.category} status in this workflow` };
	let from = statuses.find((s) => s.id === t.status_id) ?? null;
	if (!from && t.status_id) {
		const { data: cur } = await db.from("ticket_statuses").select("id, name, status_category, category, workflow_id, sort_order, is_category_default").eq("id", t.status_id).maybeSingle();
		from = (cur as StatusRow | null) ?? null;
	}
	// In Review and Testing are the same stage to automation: a ticket
	// already being verified is not pulled back to In Review
	if (from && target.legacy === "verify" && from.category === "verify") return { moved: false, reason: `already ${from.name}`, status: from.name };
	const may = mayAdvance(from, to);
	if (!may.ok) return { moved: false, reason: may.reason, status: from?.name };

	const { error } = await db.from("tickets").update({ status_id: to.id, updated_at: new Date().toISOString() }).eq("id", ticketId);
	if (error) return { moved: false, reason: error.message };
	await logTaskActivity(db, ticketId, { status_id: from?.name ?? null }, { status_id: to.name });
	return { moved: true, status: to.name };
}

/** The statuses, across every workflow the caller can see, that count as "in review". */
export async function inReviewStatusIds(db: SupabaseClient): Promise<string[]> {
	const { data } = await db.from("ticket_statuses").select("id, name, category, status_category").eq("status_category", "in_progress").limit(2000);
	return ((data ?? []) as Array<{ id: string; name: string; category: string }>)
		.filter((s) => s.category === "verify" || s.name.trim().toLowerCase() === IN_REVIEW.toLowerCase())
		.map((s) => s.id);
}
