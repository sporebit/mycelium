/**
 * /api/work/sprints — the spec'd path for sprints (claude/spec-work.md §4).
 * The handlers are /api/sprints' own (0123): one implementation, two paths.
 *
 * GET   `?project=<id>` the project's sprints, summarised, and its velocity.
 * POST  `{project_id, name, starts_on, ends_on, goal?, activate?}`.
 */
import { NextRequest, NextResponse } from "next/server";
import { GET, POST as createSprint } from "@/app/api/sprints/route";
import { createUserClient } from "@/lib/supabase/user";

export { GET };

export const runtime = "nodejs";

/**
 * A sprint belongs to a project the caller can see. The insert policy on
 * `sprints` only checks the row's own space, so without this a person could
 * make a sprint in their space that names a project in somebody else's (they
 * would need its id; nothing of the other person's is read or changed, but
 * the row should not exist). /api/sprints itself, the 0123 path, still takes
 * such a request: the same check belongs there.
 */
export async function POST(req: NextRequest) {
	const body = (await req
		.clone()
		.json()
		.catch(() => null)) as { project_id?: unknown } | null;
	if (body && typeof body.project_id === "string") {
		const supabase = await createUserClient();
		const { data } = await supabase.from("projects").select("id").eq("id", body.project_id).maybeSingle();
		if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
	}
	return createSprint(req);
}
