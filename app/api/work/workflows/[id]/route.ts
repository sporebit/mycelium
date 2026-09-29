import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkWorkflow, loadWorkflow, loadWorkflows, notAllowed, ticketsPhrase, ticketsUsing, writeFailure } from "@/lib/work/config";
import { bad } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * /api/work/workflows/[id]
 *
 * GET     the workflow with its statuses.
 * PATCH   `{name?, description?, archived?}`. The space default cannot be archived.
 * DELETE  only a workflow no ticket uses, and never the space default.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const found = await loadWorkflow(supabase, id);
		if (!found) return bad("not found", 404);
		return NextResponse.json({ workflow: found.workflow });
	} catch (err) {
		console.error("[/api/work/workflows/:id GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

		const checked = checkWorkflow(body, { partial: true });
		if (!checked.ok) return bad(checked.error);
		const columns = checked.value;
		if (Object.keys(columns).length === 0) return bad("Nothing to change.");
		if (columns.archived_at && found.workflow.is_default) {
			return bad("The space's default workflow cannot be archived. Make another workflow the default first.", 409);
		}
		// archiving twice keeps the first date
		if (columns.archived_at && found.workflow.archived_at) delete columns.archived_at;
		if (columns.name && columns.name.toLowerCase() !== found.workflow.name.trim().toLowerCase()) {
			const others = await loadWorkflows(supabase, found.space_id);
			if (others.some((w) => w.id !== id && w.name.trim().toLowerCase() === (columns.name as string).toLowerCase())) {
				return bad(`There is already a workflow called "${columns.name}".`, 409);
			}
		}

		if (Object.keys(columns).length > 0) {
			const { data, error } = await supabase.from("ticket_workflows").update(columns).eq("id", id).eq("space_id", found.space_id).select("id");
			if (error) return writeFailure(error);
			if (!data || data.length === 0) return notAllowed();
		}
		const after = await loadWorkflow(supabase, id);
		return NextResponse.json({ workflow: after?.workflow ?? found.workflow });
	} catch (err) {
		console.error("[/api/work/workflows/:id PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await loadWorkflow(supabase, id);
		if (!found) return bad("not found", 404);
		if (found.workflow.is_default) return bad("The space's default workflow cannot be deleted. Make another workflow the default first.", 409);

		const used = await ticketsUsing(supabase, "status_id", found.workflow.statuses.map((s) => s.id));
		if (used > 0) {
			return bad(`${ticketsPhrase(used)} ${used === 1 ? "uses" : "use"} this workflow. Move ${used === 1 ? "it" : "them"} to another workflow's status, or archive the workflow instead.`, 409, { tickets: used });
		}

		// its statuses and its rows in the workflow map go with it (cascade)
		const { data, error } = await supabase.from("ticket_workflows").delete().eq("id", id).eq("space_id", found.space_id).select("id");
		if (error) return writeFailure(error, "Tickets still use this workflow's statuses.");
		if (!data || data.length === 0) return notAllowed();
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/workflows/:id DELETE]", err);
		return bad("delete failed", 500);
	}
}
