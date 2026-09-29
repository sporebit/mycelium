import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import {
	checkStatusList,
	checkWorkflow,
	insertStatuses,
	loadWorkflow,
	loadWorkflowMap,
	loadWorkflows,
	MINIMAL_STATUSES,
	spaceOf,
	workflowProblems,
	writeFailure,
	type StatusValues,
} from "@/lib/work/config";
import { bad, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

/**
 * /api/work/workflows (claude/spec-work.md §2.1, §4)
 *
 * GET   a space's workflows with their statuses, and the workflow map.
 *       `?space=<uuid>`.
 * POST  create `{name, description?, copy_from?, statuses?}`. `copy_from`
 *       takes another workflow's statuses; `statuses` names them; with
 *       neither, the workflow starts as To Do, In Progress, Done.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const space = await spaceOf(supabase, uid, req.nextUrl.searchParams.get("space"));
		if (!space) return bad("No such space.", 404);
		const [workflows, workflowMap] = await Promise.all([loadWorkflows(supabase, space.id), loadWorkflowMap(supabase, space.id)]);
		return NextResponse.json({ workflows, workflow_map: workflowMap });
	} catch (err) {
		console.error("[/api/work/workflows GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function POST(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const wanted = req.nextUrl.searchParams.get("space") ?? (typeof body.space === "string" ? body.space : null);
		const space = await spaceOf(supabase, uid, wanted);
		if (!space) return bad("No such space.", 404);

		const checked = checkWorkflow(body, { partial: false });
		if (!checked.ok) return bad(checked.error);
		const hasCopy = body.copy_from !== undefined && body.copy_from !== null;
		const hasStatuses = body.statuses !== undefined && body.statuses !== null;
		if (hasCopy && hasStatuses) return bad("Give copy_from or statuses, not both.");

		let statuses: StatusValues[] = MINIMAL_STATUSES;
		if (hasStatuses) {
			const list = checkStatusList(body.statuses);
			if (!list.ok) return bad(list.error);
			statuses = list.value;
		} else if (hasCopy) {
			if (typeof body.copy_from !== "string" || !UUID_RE.test(body.copy_from)) return bad("copy_from is a workflow id.");
			const source = await loadWorkflow(supabase, body.copy_from);
			if (!source || source.space_id !== space.id) return bad("No such workflow to copy from in this space.", 404);
			statuses = source.workflow.statuses.map((s) => ({
				name: s.name,
				status_category: s.category,
				resolution: s.category === "done" ? ((s.resolution as StatusValues["resolution"]) ?? "done") : null,
				colour: s.colour,
			}));
		}
		const problems = workflowProblems(statuses.map((s) => ({ name: s.name, category: s.status_category })));
		if (problems.length > 0) return bad(problems.join(" "), 400, { problems });

		const existing = await loadWorkflows(supabase, space.id);
		const name = checked.value.name as string;
		if (existing.some((w) => w.name.trim().toLowerCase() === name.toLowerCase())) return bad(`There is already a workflow called "${name}".`, 409);

		const { data, error } = await supabase
			.from("ticket_workflows")
			.insert({ space_id: space.id, name, description: checked.value.description ?? null, is_default: false })
			.select("id")
			.single();
		if (error || !data) return writeFailure(error);
		const id = data.id as string;

		const stErr = await insertStatuses(supabase, space.id, id, statuses);
		if (stErr) {
			// no half-made workflow is left behind
			await supabase.from("ticket_workflows").delete().eq("id", id).eq("space_id", space.id);
			return writeFailure(stErr);
		}
		const made = await loadWorkflow(supabase, id);
		if (!made) return bad("The workflow was created but could not be read back.", 500);
		return NextResponse.json({ workflow: made.workflow }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/workflows POST]", err);
		return bad("create failed", 500);
	}
}
