import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { typeIdsFromBody, typesOffered } from "@/lib/work/projects";
import { bad, resolveProject, writeErrorMessage } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

/**
 * PUT /api/work/projects/[key]/types — `{type_ids: string[]}` replaces the
 * issue types the project offers. An empty list means it offers every type
 * of its space. Each id must be a type of the project's space.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	const wanted = typeIdsFromBody(body);
	if (wanted.error) return bad(wanted.error);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);

		if (wanted.ids.length > 0) {
			const { data, error } = await supabase.from("issue_types").select("id").eq("space_id", project.space_id).in("id", wanted.ids);
			if (error) throw error;
			const known = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id.toLowerCase()));
			const missing = wanted.ids.filter((id) => !known.has(id));
			if (missing.length > 0) return bad(`Not an issue type of this project's space: ${missing.join(", ")}.`, 400, { missing });
		}

		const { data: current, error: readErr } = await supabase.from("project_issue_types").select("issue_type_id").eq("project_id", project.id).limit(500);
		if (readErr) throw readErr;
		const have = ((current ?? []) as Array<{ issue_type_id: string }>).map((r) => r.issue_type_id.toLowerCase());
		const drop = have.filter((id) => !wanted.ids.includes(id));
		const add = wanted.ids.filter((id) => !have.includes(id));

		if (add.length > 0) {
			const { error } = await supabase
				.from("project_issue_types")
				.upsert(add.map((issue_type_id) => ({ space_id: project.space_id, project_id: project.id, issue_type_id })), { onConflict: "project_id,issue_type_id", ignoreDuplicates: true });
			if (error) return bad(writeErrorMessage(error), error.code === "42501" ? 403 : 400);
		}
		if (drop.length > 0) {
			const { error } = await supabase.from("project_issue_types").delete().eq("project_id", project.id).in("issue_type_id", drop);
			if (error) return bad(writeErrorMessage(error), error.code === "42501" ? 403 : 400);
		}

		const offered = await typesOffered(supabase, project);
		return NextResponse.json({ types: offered.types, type_ids: offered.type_ids, types_restricted: offered.restricted });
	} catch (err) {
		console.error("[/api/work/projects/:key/types PUT]", err);
		return bad("update failed", 500);
	}
}
