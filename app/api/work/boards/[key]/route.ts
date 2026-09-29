import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { loadBoard, quickFilters } from "@/lib/work/boards";
import { patchProject } from "@/lib/work/projects";
import { bad, resolveProject } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

/**
 * /api/work/boards/[key] — a project's board, by project key or id.
 *
 * GET    `{project, board_type, columns: [{name, status_ids, category,
 *        tickets}], sprint, statuses}`. Kanban shows the whole project
 *        (Done for fourteen days, the backlog statuses on the Backlog
 *        page); Scrum shows the active sprint, and `sprint: null` with no
 *        cards when nothing is running. Quick filters, ANDed on:
 *        `assignee=me`, `type=`, `epic=`, `label=`.
 * PATCH  the board's settings `{board_type?, board_columns?}`; `null`
 *        columns go back to the ones the workflow gives.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	try {
		const supabase = await createUserClient();
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		const res = await loadBoard(supabase, project, quickFilters(req.nextUrl.searchParams));
		if (!res.ok) return bad(res.error, res.status);
		return NextResponse.json(res.board);
	} catch (err) {
		const e = err as { code?: string; message?: string };
		// the database checks the query again; its refusals are the caller's to fix
		if (e.code === "22023" || e.code === "22007") return bad(e.message?.replace(/^work query: /, "") ?? "bad query");
		console.error("[/api/work/boards/:key GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	const config: Record<string, unknown> = {};
	if ("board_type" in body) config.board_type = body.board_type;
	if ("board_columns" in body) config.board_columns = body.board_columns;
	if (Object.keys(config).length === 0) return bad("Nothing to change: send board_type, board_columns or both.");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		const res = await patchProject(supabase, project, config);
		if (!res.ok) return bad(res.error, res.status);
		const board = await loadBoard(supabase, res.project);
		if (!board.ok) return bad(board.error, board.status);
		return NextResponse.json(board.board);
	} catch (err) {
		console.error("[/api/work/boards/:key PATCH]", err);
		return bad("update failed", 500);
	}
}
