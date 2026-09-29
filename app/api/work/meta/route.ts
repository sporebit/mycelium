import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";
import { loadFilters, loadLabelFields, loadPeople, loadTypes, loadWorkflowMap, loadWorkflows, spaceOf } from "@/lib/work/config";
import { bad, projectKey } from "@/lib/work/server";
import type { WorkMeta } from "@/lib/work/types";

export const runtime = "nodejs";

type ProjectRow = {
	id: string;
	name: string;
	colour: string | null;
	is_default: boolean;
	status: WorkMeta["projects"][number]["status"];
	area_id: string | null;
	prefix: string | null;
	board_type: WorkMeta["projects"][number]["board_type"];
};

/**
 * GET /api/work/meta — everything the filter bar and the forms need, in one
 * call (claude/spec-work.md §4): issue types, workflows with their statuses,
 * the workflow map, label fields with their labels, projects, project
 * categories, who can be assigned, and the saved filters.
 *
 * `?space=<uuid>` picks a space (default: the caller's own). `?all=1`
 * includes archived issue types.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const space = await spaceOf(supabase, uid, sp.get("space"));
		if (!space) return bad("No such space.", 404);

		const [types, workflows, workflowMap, labelFields, filters, who, projects, categories] = await Promise.all([
			loadTypes(supabase, space.id, sp.get("all") === "1"),
			loadWorkflows(supabase, space.id),
			loadWorkflowMap(supabase, space.id),
			loadLabelFields(supabase, space.id),
			loadFilters(supabase, space.id, uid),
			loadPeople(supabase, uid),
			supabase
				.from("projects")
				.select("id, name, colour, is_default, status, area_id, prefix, board_type")
				.eq("space_id", space.id)
				.neq("status", "archived")
				.order("is_default", { ascending: false })
				.order("sort_order")
				.order("name"),
			supabase.from("areas").select("id, name, colour").eq("space_id", space.id).is("archived_at", null).order("sort_order").order("name"),
		]);
		if (projects.error) throw projects.error;
		if (categories.error) throw categories.error;

		const meta: WorkMeta = {
			space_id: space.id,
			space_prefix: space.prefix,
			me: who.me,
			types,
			workflows,
			workflow_map: workflowMap,
			label_fields: labelFields,
			projects: ((projects.data ?? []) as unknown as ProjectRow[]).map((p) => ({
				id: p.id,
				key: projectKey(p.prefix, p.is_default, space.prefix, p.id),
				name: p.name,
				colour: p.colour,
				is_default: p.is_default,
				status: p.status,
				category_id: p.area_id,
				board_type: p.board_type,
			})),
			categories: (categories.data ?? []) as WorkMeta["categories"],
			people: who.people,
			filters,
		};
		return NextResponse.json(meta);
	} catch (err) {
		console.error("[/api/work/meta GET]", err);
		return bad("fetch failed", 500);
	}
}
