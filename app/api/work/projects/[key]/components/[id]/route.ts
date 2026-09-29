import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { COMPONENT_SELECT, componentWriteFromBody, serializeComponent } from "@/lib/work/projects";
import { bad, resolveProject, UUID_RE, writeErrorMessage } from "@/lib/work/server";
import type { WorkComponent } from "@/lib/work/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string; id: string }> };

/**
 * /api/work/projects/[key]/components/[id]
 *
 * PATCH   name, description, lead_user_id, sort_order, archived (true
 *         stamps archived_at, false clears it).
 * DELETE  removes the component for good; tickets lose it, nothing else.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { key, id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	const write = componentWriteFromBody(body, false);
	if (write.error) return bad(write.error);
	if (Object.keys(write.columns).length === 0) return bad("Nothing to change.");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		const { data: existing } = await supabase.from("components").select("id").eq("id", id).eq("project_id", project.id).maybeSingle();
		if (!existing) return bad("not found", 404);

		const { data, error } = await supabase
			.from("components")
			.update({ ...write.columns, updated_at: new Date().toISOString() })
			.eq("id", id)
			.eq("project_id", project.id)
			.select(COMPONENT_SELECT)
			.maybeSingle();
		if (error) {
			if (error.code === "23505") return bad(`This project already has a component called "${String(write.columns.name)}".`, 409);
			return bad(writeErrorMessage(error), error.code === "42501" ? 403 : 400);
		}
		if (!data) return bad("You do not have permission to do that.", 403);
		return NextResponse.json({ component: serializeComponent(data as unknown as WorkComponent) });
	} catch (err) {
		console.error("[/api/work/projects/:key/components/:id PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
	const { key, id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		const { data: existing } = await supabase.from("components").select("id").eq("id", id).eq("project_id", project.id).maybeSingle();
		if (!existing) return bad("not found", 404);

		const { data, error } = await supabase.from("components").delete().eq("id", id).eq("project_id", project.id).select("id");
		if (error) return bad(writeErrorMessage(error), error.code === "42501" ? 403 : 400);
		if ((data ?? []).length === 0) return bad("You do not have permission to do that.", 403);
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/projects/:key/components/:id DELETE]", err);
		return bad("delete failed", 500);
	}
}
