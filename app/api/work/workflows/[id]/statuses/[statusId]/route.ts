import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkStatus, loadWorkflow, notAllowed, ticketsPhrase, ticketsUsing, workflowProblems, writeFailure, type StatusValues } from "@/lib/work/config";
import { bad, serializeStatus, STATUS_SELECT, UUID_RE } from "@/lib/work/server";
import type { WorkStatus } from "@/lib/work/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; statusId: string }> };

/** The problems a change would bring that the workflow does not already have. */
function newProblems(before: WorkStatus[], after: Array<{ name: string; category: string }>): string[] {
	const had = workflowProblems(before);
	return workflowProblems(after).filter((p) => !had.includes(p));
}

/**
 * /api/work/workflows/[id]/statuses/[statusId]
 *
 * PATCH   `{name?, status_category?, resolution?, colour?}`.
 * DELETE  `?move_to=<status id in the same workflow>` — the tickets in the
 *         status move there first; required when any ticket is in it.
 *
 * Either is refused with 409, and nothing changes, when it would leave the
 * workflow without a status in one of the three categories or with two
 * statuses of one name.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { id, statusId } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await loadWorkflow(supabase, id);
		const current = found?.workflow.statuses.find((s) => s.id === statusId.toLowerCase());
		if (!found || !current) return bad("not found", 404);

		const checked = checkStatus(body, {
			name: current.name,
			status_category: current.category,
			resolution: (current.resolution as StatusValues["resolution"]) ?? null,
			colour: current.colour,
		});
		if (!checked.ok) return bad(checked.error);
		const { columns, merged } = checked.value;
		if (Object.keys(columns).length === 0) return bad("Nothing to change.");

		const problems = newProblems(
			found.workflow.statuses,
			found.workflow.statuses.map((s) => (s.id === current.id ? { name: merged.name, category: merged.status_category } : s)),
		);
		if (problems.length > 0) return bad(problems.join(" "), 409, { problems });

		const moved = merged.status_category !== current.category;
		const write: Record<string, unknown> = { ...columns };
		// the default of its old legacy category cannot follow it into another (0137's one default per category)
		if (moved) write.is_category_default = false;

		const { data, error } = await supabase
			.from("ticket_statuses")
			.update(write)
			.eq("id", current.id)
			.eq("workflow_id", id)
			.select(STATUS_SELECT);
		if (error) return writeFailure(error, `This workflow already has a status called "${merged.name}".`);
		if (!data || data.length === 0) return notAllowed();
		const status = serializeStatus(data[0] as unknown as Parameters<typeof serializeStatus>[0]);

		// A status that crossed into or out of Done: the tickets in it are now
		// resolved, or no longer. The ticket trigger stamps or clears
		// resolved_at when the resolution is written (0142).
		if (moved && (merged.status_category === "done" || current.category === "done")) {
			const { error: syncErr } = await supabase
				.from("tickets")
				.update({ resolution: merged.status_category === "done" ? status.resolution : null })
				.eq("status_id", current.id);
			if (syncErr) console.error("[/api/work/workflows/:id/statuses/:statusId PATCH] resolution sync failed:", syncErr.message);
		}

		const after = await loadWorkflow(supabase, id);
		return NextResponse.json({ status, workflow: after?.workflow ?? found.workflow });
	} catch (err) {
		console.error("[/api/work/workflows/:id/statuses/:statusId PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { id, statusId } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const moveTo = req.nextUrl.searchParams.get("move_to");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await loadWorkflow(supabase, id);
		const current = found?.workflow.statuses.find((s) => s.id === statusId.toLowerCase());
		if (!found || !current) return bad("not found", 404);

		const problems = newProblems(found.workflow.statuses, found.workflow.statuses.filter((s) => s.id !== current.id));
		if (problems.length > 0) return bad(problems.join(" "), 409, { problems });

		let target: WorkStatus | null = null;
		if (moveTo !== null && moveTo !== "") {
			if (!UUID_RE.test(moveTo)) return bad("move_to is a status id.");
			if (moveTo.toLowerCase() === current.id) return bad("move_to is the status being deleted.");
			target = found.workflow.statuses.find((s) => s.id === moveTo.toLowerCase()) ?? null;
			if (!target) return bad("move_to must be a status in the same workflow.");
		}

		const used = await ticketsUsing(supabase, "status_id", [current.id]);
		if (used > 0 && !target) {
			return bad(`${ticketsPhrase(used)} ${used === 1 ? "is" : "are"} in ${current.name}. Say where to move ${used === 1 ? "it" : "them"} with move_to.`, 409, { tickets: used });
		}

		let moved = 0;
		if (used > 0 && target) {
			const { data, error } = await supabase.from("tickets").update({ status_id: target.id }).eq("status_id", current.id).select("id");
			if (error) return writeFailure(error);
			moved = (data ?? []).length;
		}

		const { data, error } = await supabase.from("ticket_statuses").delete().eq("id", current.id).eq("workflow_id", id).select("id");
		if (error) return writeFailure(error, `Tickets are still in ${current.name}.`);
		if (!data || data.length === 0) return notAllowed();
		const after = await loadWorkflow(supabase, id);
		return NextResponse.json({ ok: true, moved, moved_to: target?.id ?? null, workflow: after?.workflow ?? found.workflow });
	} catch (err) {
		console.error("[/api/work/workflows/:id/statuses/:statusId DELETE]", err);
		return bad("delete failed", 500);
	}
}
