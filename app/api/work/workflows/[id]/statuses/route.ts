import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkStatus, loadWorkflow, notAllowed, workflowProblems, writeFailure } from "@/lib/work/config";
import { bad, serializeStatus, STATUS_SELECT, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * /api/work/workflows/[id]/statuses
 *
 * POST  add a status `{name, status_category, resolution?, colour?}`; it
 *       goes to the end of the workflow.
 * PUT   `{order: string[]}` — every status id of the workflow, in the order
 *       wanted; written as sort_order 1..n.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await loadWorkflow(supabase, id);
		if (!found) return bad("not found", 404);

		const checked = checkStatus(body);
		if (!checked.ok) return bad(checked.error);
		const status = checked.value.merged;
		const statuses = found.workflow.statuses;
		if (statuses.length >= 40) return bad("A workflow holds 40 statuses at most.", 409);
		const problems = workflowProblems([...statuses, { name: status.name, category: status.status_category }]);
		// a workflow that was already short of a category is not made worse by a new status
		const mine = problems.filter((p) => !workflowProblems(statuses).includes(p));
		if (mine.length > 0) return bad(mine.join(" "), 409, { problems: mine });

		const { data, error } = await supabase
			.from("ticket_statuses")
			.insert({
				space_id: found.space_id,
				workflow_id: id,
				name: status.name,
				status_category: status.status_category,
				resolution: status.resolution,
				colour: status.colour,
				sort_order: statuses.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1,
			})
			.select(STATUS_SELECT)
			.single();
		if (error || !data) return writeFailure(error, `This workflow already has a status called "${status.name}".`);
		const after = await loadWorkflow(supabase, id);
		return NextResponse.json({ status: serializeStatus(data as unknown as Parameters<typeof serializeStatus>[0]), workflow: after?.workflow ?? found.workflow }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/workflows/:id/statuses POST]", err);
		return bad("create failed", 500);
	}
}

export async function PUT(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await loadWorkflow(supabase, id);
		if (!found) return bad("not found", 404);

		const order = Array.isArray(body.order) ? body.order : null;
		if (!order || !order.every((s): s is string => typeof s === "string" && UUID_RE.test(s))) return bad("order is a list of status ids.");
		const have = new Set(found.workflow.statuses.map((s) => s.id));
		const want = new Set(order.map((s) => s.toLowerCase()));
		if (want.size !== order.length) return bad("order names a status twice.");
		if (want.size !== have.size || [...want].some((s) => !have.has(s))) {
			return bad("order must name every status of this workflow, once each, and no others.");
		}

		for (let i = 0; i < order.length; i += 1) {
			const { data, error } = await supabase
				.from("ticket_statuses")
				.update({ sort_order: i + 1 })
				.eq("id", order[i].toLowerCase())
				.eq("workflow_id", id)
				.select("id");
			if (error) return writeFailure(error);
			if (!data || data.length === 0) return notAllowed();
		}
		const after = await loadWorkflow(supabase, id);
		return NextResponse.json({ workflow: after?.workflow ?? found.workflow });
	} catch (err) {
		console.error("[/api/work/workflows/:id/statuses PUT]", err);
		return bad("reorder failed", 500);
	}
}
