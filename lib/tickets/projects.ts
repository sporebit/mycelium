/** Project fields added by Tickets (0116): prefix, area, GitHub settings (spec §11). */

export const PROJECT_PREFIX_RE = /^[A-Z][A-Z0-9]{1,4}$/;

export const PROJECT_SELECT_TICKETS =
  "id, name, description, status, colour, created_at, updated_at, space_id, prefix, area_id, parent_id, workflow_id, github_repo, github_issues_sync, sort_order";

export function projectTicketFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("prefix" in body) {
    const v = typeof body.prefix === "string" ? body.prefix.trim().toUpperCase() : null;
    if (v === null || v === "") out.prefix = null;
    else if (PROJECT_PREFIX_RE.test(v)) out.prefix = v;
  }
  if ("area_id" in body) out.area_id = typeof body.area_id === "string" && body.area_id ? body.area_id : null;
  if ("github_repo" in body) {
    const v = typeof body.github_repo === "string" ? body.github_repo.trim() : "";
    out.github_repo = /^[\w.-]+\/[\w.-]+$/.test(v) ? v : null;
  }
  if (typeof body.github_issues_sync === "boolean") out.github_issues_sync = body.github_issues_sync;
  if (typeof body.sort_order === "number") out.sort_order = body.sort_order;
  return out;
}
