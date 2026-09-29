import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { createProject, emptyProgress, groupByCategory, progressFor, PROJECT_STATUSES, type ProjectCategory, type ProjectWithProgress } from "@/lib/work/projects";
import { bad, PROJECT_SELECT, resolveSpace, serializeProject } from "@/lib/work/server";

export const runtime = "nodejs";

/**
 * /api/work/projects (claude/spec-work.md §4)
 *
 * GET   every project the caller can see, each with its progress by status
 *       category, grouped by project category. `status=active|paused|done|
 *       archived|all` (default: everything except archived); `space`.
 * POST  create. `name` required; `key` optional (two to five characters).
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	const sp = req.nextUrl.searchParams;
	const status = (sp.get("status") ?? "").trim().toLowerCase();
	if (status && status !== "all" && !(PROJECT_STATUSES as readonly string[]).includes(status)) {
		return bad("status is one of active, paused, done, archived, all.");
	}
	try {
		const supabase = await createUserClient();
		const space = sp.get("space") ? await resolveSpace(supabase, uid, sp.get("space")) : null;
		if (sp.get("space") && !space) return bad("No such space.", 404);

		let q = supabase.from("projects").select(PROJECT_SELECT).order("sort_order").order("name").limit(1000);
		if (!status) q = q.neq("status", "archived");
		else if (status !== "all") q = q.eq("status", status);
		if (space) q = q.eq("space_id", space.id);

		let areas = supabase.from("areas").select("id, name, colour, archived_at").order("sort_order").order("name").limit(500);
		if (space) areas = areas.eq("space_id", space.id);

		const [rows, cats] = await Promise.all([q, areas]);
		if (rows.error) throw rows.error;
		if (cats.error) throw cats.error;

		const found = ((rows.data ?? []) as unknown as Array<Parameters<typeof serializeProject>[0]>).map(serializeProject);
		const progress = await progressFor(supabase, found.map((p) => p.id));
		const projects: ProjectWithProgress[] = found.map((p) => ({ ...p, progress: progress.get(p.id) ?? emptyProgress() }));
		const grouped = groupByCategory(projects, (cats.data ?? []) as ProjectCategory[]);
		return NextResponse.json({ ...grouped, projects });
	} catch (err) {
		console.error("[/api/work/projects GET]", err);
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
		const space = await resolveSpace(supabase, uid, typeof body.space === "string" ? body.space : null);
		if (!space) return bad("No such space.", 404);
		const made = await createProject(supabase, space.id, body);
		if (!made.ok) return bad(made.error, made.status);
		return NextResponse.json({ project: { ...made.project, progress: emptyProgress() }, key: made.project.key }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/projects POST]", err);
		return bad("create failed", 500);
	}
}
