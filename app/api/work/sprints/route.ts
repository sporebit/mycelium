/**
 * /api/work/sprints — the spec'd path for sprints (claude/spec-work.md §4).
 * The handlers are /api/sprints' own (0123): one implementation, two paths.
 *
 * GET   `?project=<id>` the project's sprints, summarised, and its velocity.
 * POST  `{project_id, name, starts_on, ends_on, goal?, activate?}`.
 */
export { GET, POST } from "@/app/api/sprints/route";

export const runtime = "nodejs";
