import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { openSprints } from "@/lib/work/boards";
import { componentsOf, patchProject, progressOf, typesOffered } from "@/lib/work/projects";
import { bad, namesFor, resolveProject } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

/**
 * /api/work/projects/[key] — a project, by key or id. The default project
 * answers to its space's key.
 *
 * GET     the overview: the project, its progress by status category, its
 *         lead, components, the issue types it offers and its open sprints.
 * PATCH   name, description, status, colour, category_id, key, lead_user_id,
 *         start_on, target_on, links, board_type, board_columns, github_repo.
 * DELETE  archive — nothing is removed. Refused for the default project.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	try {
		const supabase = await createUserClient();
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		const [progress, components, offered, sprints, names] = await Promise.all([
			progressOf(supabase, project.id),
			componentsOf(supabase, project.id),
			typesOffered(supabase, project),
			openSprints(supabase, project.id),
			namesFor(supabase, [project.lead_user_id]),
		]);
		const lead = project.lead_user_id ? { id: project.lead_user_id, name: names.get(project.lead_user_id) ?? project.lead_user_id.slice(0, 8) } : null;
		return NextResponse.json({
			project,
			progress,
			lead,
			components,
			types: offered.types,
			type_ids: offered.type_ids,
			types_restricted: offered.restricted,
			sprints: {
				active: sprints.find((s) => s.status === "active") ?? null,
				planned: sprints.filter((s) => s.status === "planned"),
			},
		});
	} catch (err) {
		console.error("[/api/work/projects/:key GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		const res = await patchProject(supabase, project, body);
		if (!res.ok) return bad(res.error, res.status);
		return NextResponse.json({ project: res.project, key: res.project.key });
	} catch (err) {
		console.error("[/api/work/projects/:key PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		if (project.is_default) return bad("The default project cannot be archived.", 409);
		const res = await patchProject(supabase, project, { status: "archived" });
		if (!res.ok) return bad(res.error, res.status);
		return NextResponse.json({ ok: true, project: res.project });
	} catch (err) {
		console.error("[/api/work/projects/:key DELETE]", err);
		return bad("archive failed", 500);
	}
}
