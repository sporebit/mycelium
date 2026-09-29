import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { loadWorkflow, loadWorkflowMap, loadWorkflows, notAllowed, spaceOf, workflowProblems, writeFailure } from "@/lib/work/config";
import { bad, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

/** A uuid or null from a body; `undefined` when it is neither. */
function idOrNull(v: unknown): string | null | undefined {
	if (v === null) return null;
	return typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : undefined;
}

/** Move every ticket to its counterpart status in the workflow it now uses (0148). Soft: a map change never fails on it. */
async function rehome(supabase: SupabaseClient, spaceId: string): Promise<number> {
	const { data, error } = await supabase.rpc("work_rehome", { p_space: spaceId });
	if (error) {
		console.error("[/api/work/workflows/map] re-home failed:", error.message);
		return 0;
	}
	return Number(data ?? 0);
}

async function inSpace(supabase: SupabaseClient, table: "projects" | "issue_types", id: string, spaceId: string): Promise<boolean> {
	const { data } = await supabase.from(table).select("id").eq("id", id).eq("space_id", spaceId).maybeSingle();
	return !!data;
}

/**
 * /api/work/workflows/map — which workflow a ticket uses (claude/spec-work.md
 * §2.1): project + type → project → space + type → the space default.
 *
 * GET   the map of a space. `?space=<uuid>`.
 * PUT   `{project_id, issue_type_id, workflow_id}` sets one assignment;
 *       `workflow_id: null` clears it. One of project_id / issue_type_id
 *       must be given: the space-wide default is not a row in the map.
 * POST  `{default_workflow_id}` makes a workflow the space default.
 *
 * Tickets already in the scope keep their status until their next move: the
 * database re-homes a status into the ticket's workflow on that write.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const space = await spaceOf(supabase, uid, req.nextUrl.searchParams.get("space"));
		if (!space) return bad("No such space.", 404);
		return NextResponse.json({ workflow_map: await loadWorkflowMap(supabase, space.id) });
	} catch (err) {
		console.error("[/api/work/workflows/map GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PUT(req: NextRequest) {
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

		const projectId = idOrNull(body.project_id ?? null);
		const typeId = idOrNull(body.issue_type_id ?? null);
		const workflowId = idOrNull(body.workflow_id);
		if (projectId === undefined) return bad("project_id is a project id or null.");
		if (typeId === undefined) return bad("issue_type_id is an issue type id or null.");
		if (workflowId === undefined) return bad("workflow_id is a workflow id, or null to clear the assignment.");
		if (projectId === null && typeId === null) {
			return bad("Give a project_id, an issue_type_id or both. The space-wide default is set with POST {default_workflow_id}.");
		}
		if (projectId && !(await inSpace(supabase, "projects", projectId, space.id))) return bad("No such project in this space.", 404);
		if (typeId && !(await inSpace(supabase, "issue_types", typeId, space.id))) return bad("No such issue type in this space.", 404);

		const map = await loadWorkflowMap(supabase, space.id);
		const existing = map.find((m) => m.project_id === projectId && m.issue_type_id === typeId) ?? null;

		if (workflowId === null) {
			if (existing) {
				const { data, error } = await supabase.from("ticket_workflow_map").delete().eq("id", existing.id).eq("space_id", space.id).select("id");
				if (error) return writeFailure(error);
				if (!data || data.length === 0) return notAllowed();
			}
			const moved = await rehome(supabase, space.id);
			return NextResponse.json({ workflow_map: await loadWorkflowMap(supabase, space.id), rehomed: moved });
		}

		const workflow = await loadWorkflow(supabase, workflowId);
		if (!workflow || workflow.space_id !== space.id) return bad("No such workflow in this space.", 404);
		if (workflow.workflow.archived_at) return bad("An archived workflow cannot be assigned.", 409);
		const problems = workflowProblems(workflow.workflow.statuses);
		if (problems.length > 0) return bad(problems.join(" "), 409, { problems });

		if (existing) {
			if (existing.workflow_id !== workflowId) {
				const { data, error } = await supabase
					.from("ticket_workflow_map")
					.update({ workflow_id: workflowId })
					.eq("id", existing.id)
					.eq("space_id", space.id)
					.select("id");
				if (error) return writeFailure(error);
				if (!data || data.length === 0) return notAllowed();
			}
		} else {
			const { error } = await supabase
				.from("ticket_workflow_map")
				.insert({ space_id: space.id, project_id: projectId, issue_type_id: typeId, workflow_id: workflowId });
			if (error) return writeFailure(error, "That assignment already exists.");
		}
		const rehomed = await rehome(supabase, space.id);
		return NextResponse.json({ workflow_map: await loadWorkflowMap(supabase, space.id), rehomed });
	} catch (err) {
		console.error("[/api/work/workflows/map PUT]", err);
		return bad("update failed", 500);
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

		const wantedId = idOrNull(body.default_workflow_id);
		if (!wantedId) return bad("default_workflow_id is a workflow id.");
		const next = await loadWorkflow(supabase, wantedId);
		if (!next) return bad("No such workflow.", 404);
		if (next.workflow.archived_at) return bad("An archived workflow cannot be the default.", 409);
		const problems = workflowProblems(next.workflow.statuses);
		if (problems.length > 0) return bad(problems.join(" "), 409, { problems });

		if (!next.workflow.is_default) {
			const { data: currentRows, error: readErr } = await supabase
				.from("ticket_workflows")
				.select("id")
				.eq("space_id", next.space_id)
				.eq("is_default", true);
			if (readErr) throw readErr;
			const current = ((currentRows ?? []) as Array<{ id: string }>).map((r) => r.id);

			// one default per space (a partial unique index): the old one steps down first
			for (const oldId of current) {
				const { data, error } = await supabase.from("ticket_workflows").update({ is_default: false }).eq("id", oldId).select("id");
				if (error) return writeFailure(error);
				if (!data || data.length === 0) return notAllowed();
			}
			const { data, error } = await supabase.from("ticket_workflows").update({ is_default: true }).eq("id", wantedId).select("id");
			if (error || !data || data.length === 0) {
				// never leave the space without a default
				for (const oldId of current) await supabase.from("ticket_workflows").update({ is_default: true }).eq("id", oldId);
				return error ? writeFailure(error) : notAllowed();
			}
		}
		const rehomed = await rehome(supabase, next.space_id);
		const [workflows, workflowMap] = await Promise.all([loadWorkflows(supabase, next.space_id), loadWorkflowMap(supabase, next.space_id)]);
		return NextResponse.json({ default_workflow_id: wantedId, workflows, workflow_map: workflowMap, rehomed });
	} catch (err) {
		console.error("[/api/work/workflows/map POST]", err);
		return bad("update failed", 500);
	}
}
