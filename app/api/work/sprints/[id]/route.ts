/**
 * /api/work/sprints/[id] — the spec'd path for one sprint
 * (claude/spec-work.md §4). The handlers are /api/sprints/[id]'s own (0123).
 *
 * GET     summary and burndown.
 * PATCH   name, goal, dates, status (planned | active | closed), carry_to.
 * DELETE  a planned sprint only.
 */
export { GET, PATCH, DELETE } from "@/app/api/sprints/[id]/route";

export const runtime = "nodejs";
