import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { loadBacklog } from "@/lib/work/boards";
import { bad, resolveProject } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

/**
 * GET /api/work/projects/[key]/backlog — the Backlog page: the project's
 * sprints that are not closed (the active one first), each with its
 * tickets and points, over the backlog: every ticket that is not done and
 * is in no sprint, by rank and then by when it was created. Sub-tasks are
 * left out of the backlog list; they travel with their parent.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	try {
		const supabase = await createUserClient();
		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		return NextResponse.json(await loadBacklog(supabase, project));
	} catch (err) {
		console.error("[/api/work/projects/:key/backlog GET]", err);
		return bad("fetch failed", 500);
	}
}
