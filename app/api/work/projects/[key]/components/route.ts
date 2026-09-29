import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { COMPONENT_SELECT, componentsOf, componentWriteFromBody, serializeComponent } from "@/lib/work/projects";
import { bad, resolveProject, writeErrorMessage } from "@/lib/work/server";
import type { WorkComponent } from "@/lib/work/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

/**
 * /api/work/projects/[key]/components
 *
 * GET   the project's components; archived ones only with `?all=1`.
 * POST  create `{name, description?, lead_user_id?}`. A name is used once
 *       per project, whatever its case.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const all = req.nextUrl.searchParams.get("all") === "1";
	try {
		const supabase = await createUserClient();
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		return NextResponse.json({ components: await componentsOf(supabase, project.id, all) });
	} catch (err) {
		console.error("[/api/work/projects/:key/components GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function POST(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	const write = componentWriteFromBody(body, true);
	if (write.error) return bad(write.error);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);

		// a new component goes to the end of the list
		const { data: last } = await supabase.from("components").select("sort_order").eq("project_id", project.id).order("sort_order", { ascending: false }).limit(1);
		const next = (((last ?? []) as Array<{ sort_order: number }>)[0]?.sort_order ?? -1) + 1;

		const { data, error } = await supabase
			.from("components")
			.insert({ ...write.columns, space_id: project.space_id, project_id: project.id, sort_order: next })
			.select(COMPONENT_SELECT)
			.single();
		if (error || !data) {
			if (error?.code === "23505") return bad(`This project already has a component called "${String(write.columns.name)}".`, 409);
			return bad(writeErrorMessage(error), error?.code === "42501" ? 403 : 400);
		}
		return NextResponse.json({ component: serializeComponent(data as unknown as WorkComponent) }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/projects/:key/components POST]", err);
		return bad("create failed", 500);
	}
}
