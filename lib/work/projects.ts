/**
 * Work — projects (claude/spec-work.md §2.3, §4).
 *
 * Progress counts by status category, the field whitelist for a project
 * create or patch, components, and the issue types a project offers.
 * The checks that need no database are pure and tested in
 * ./projects.test.ts; everything that reads or writes goes through the
 * caller's user client, so RLS is the wall.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatusCategory } from "./query";
import { cleanColumns, cleanLinks, PROJECT_SELECT, serializeProject, UUID_RE, writeErrorMessage } from "./server";
import type { BoardColumn, ProjectProgress, WorkComponent, WorkProject, WorkType } from "./types";

export const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,4}$/;
export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const;
export const BOARD_TYPES = ["kanban", "scrum"] as const;

const COLOUR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type One<T> = T | T[] | null | undefined;
function first<T>(v: One<T>): T | null {
	if (!v) return null;
	return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** A calendar date that exists: 2026-02-30 is not one. */
export function isIsoDate(v: unknown): v is string {
	if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return false;
	const d = new Date(`${v}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ---------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------

export type ProjectWithProgress = WorkProject & { progress: ProjectProgress };

export function emptyProgress(): ProjectProgress {
	return { todo: 0, in_progress: 0, done: 0, total: 0, points_total: 0, points_done: 0 };
}

export type ProgressRow = { project_id: string | null; points: number | null; category: StatusCategory | null };

/** Count tickets and points per project. A ticket with no status counts as To Do. */
export function tallyProgress(rows: readonly ProgressRow[], projectIds: readonly string[] = []): Map<string, ProjectProgress> {
	const out = new Map<string, ProjectProgress>(projectIds.map((id) => [id, emptyProgress()]));
	for (const r of rows) {
		if (!r.project_id) continue;
		let p = out.get(r.project_id);
		if (!p) {
			p = emptyProgress();
			out.set(r.project_id, p);
		}
		const category: StatusCategory = r.category === "in_progress" || r.category === "done" ? r.category : "todo";
		const points = typeof r.points === "number" && Number.isFinite(r.points) ? r.points : 0;
		p[category] += 1;
		p.total += 1;
		p.points_total += points;
		if (category === "done") p.points_done += points;
	}
	return out;
}

const PAGE = 1000;

/** Progress for many projects in as few reads as the row cap allows. */
export async function progressFor(supabase: SupabaseClient, projectIds: readonly string[]): Promise<Map<string, ProjectProgress>> {
	const ids = Array.from(new Set(projectIds.filter((id) => UUID_RE.test(id))));
	const rows: ProgressRow[] = [];
	// PostgREST carries the id list in the URL: keep each request short
	for (let i = 0; i < ids.length; i += 50) {
		const chunk = ids.slice(i, i + 50);
		for (let from = 0; from < 50_000; from += PAGE) {
			const { data, error } = await supabase
				.from("tickets")
				.select("id, project_id, points, status:ticket_statuses(status_category)")
				.in("project_id", chunk)
				.is("deleted_at", null)
				.neq("kind", "habit")
				// what work_search leaves out as well: the template row of a spawning series
				.or("recurrence_mode.is.null,recurrence_mode.neq.spawn,series_id.not.is.null")
				.order("id")
				.range(from, from + PAGE - 1);
			if (error) throw error;
			const page = (data ?? []) as unknown as Array<{ project_id: string | null; points: number | null; status: One<{ status_category: StatusCategory }> }>;
			for (const r of page) rows.push({ project_id: r.project_id, points: r.points, category: first(r.status)?.status_category ?? null });
			if (page.length < PAGE) break;
		}
	}
	return tallyProgress(rows, ids);
}

export async function progressOf(supabase: SupabaseClient, projectId: string): Promise<ProjectProgress> {
	return (await progressFor(supabase, [projectId])).get(projectId) ?? emptyProgress();
}

// ---------------------------------------------------------------------
// Grouping for the projects page
// ---------------------------------------------------------------------

export type ProjectCategory = { id: string; name: string; colour: string | null; archived_at?: string | null };
export type ProjectGroup<P> = { id: string; name: string; colour: string | null; projects: P[] };

/**
 * Projects under their category, in the order the categories come in.
 * An archived category is shown only while it still holds a project.
 */
export function groupByCategory<P extends { category_id: string | null }>(
	projects: readonly P[],
	categories: readonly ProjectCategory[],
): { categories: Array<ProjectGroup<P>>; uncategorised: P[] } {
	const groups = new Map<string, ProjectGroup<P>>(categories.map((c) => [c.id, { id: c.id, name: c.name, colour: c.colour, projects: [] }]));
	const uncategorised: P[] = [];
	for (const p of projects) {
		const g = p.category_id ? groups.get(p.category_id) : undefined;
		if (g) g.projects.push(p);
		else uncategorised.push(p);
	}
	const out: Array<ProjectGroup<P>> = [];
	for (const c of categories) {
		const g = groups.get(c.id);
		if (!g) continue;
		if (c.archived_at && g.projects.length === 0) continue;
		out.push(g);
	}
	return { categories: out, uncategorised };
}

// ---------------------------------------------------------------------
// The field whitelist
// ---------------------------------------------------------------------

export type ProjectWrite = { columns: Record<string, unknown>; error: string | null; status: number };

/** The prefix a project carries itself: none for the default project, none when its key is its id. */
export function prefixOf(project: Pick<WorkProject, "id" | "key" | "is_default">): string | null {
	if (project.is_default || project.key === project.id) return null;
	return project.key;
}

/** One status per column: a status named twice stays in the first column that names it. */
export function dedupeColumns(columns: BoardColumn[] | null): BoardColumn[] | null {
	if (!columns) return null;
	const seen = new Set<string>();
	return columns.map((c) => ({
		name: c.name,
		status_ids: c.status_ids.filter((id) => {
			const k = id.toLowerCase();
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		}),
	}));
}

/**
 * Pick and check what a project create (`current` = null) or patch may
 * write. Returns column names: `category_id` → `area_id`, `key` → `prefix`.
 * Anything not on the list is left out — `is_default` among them.
 */
export function projectWriteFromBody(body: Record<string, unknown>, current: WorkProject | null): ProjectWrite {
	const columns: Record<string, unknown> = {};
	const fail = (error: string, status = 400): ProjectWrite => ({ columns: {}, error, status });

	if ("name" in body || !current) {
		const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
		if (!name) return fail("A project needs a name.");
		columns.name = name.slice(0, 120);
	}
	if ("description" in body) {
		if (body.description !== null && typeof body.description !== "string") return fail("description must be text.");
		const d = typeof body.description === "string" ? body.description.trim() : "";
		columns.description = d ? d.slice(0, 20_000) : null;
	}
	if ("status" in body) {
		const s = body.status;
		if (typeof s !== "string" || !(PROJECT_STATUSES as readonly string[]).includes(s)) return fail("status is one of active, paused, done, archived.");
		if (s === "archived" && current?.is_default) return fail("The default project cannot be archived.", 409);
		columns.status = s;
	}
	if ("colour" in body) {
		const c = typeof body.colour === "string" ? body.colour.trim() : body.colour;
		if (c === null || c === "") columns.colour = null;
		else if (typeof c === "string" && COLOUR_RE.test(c)) columns.colour = c.toLowerCase();
		else return fail("colour is a hex colour such as #7aa2f7.");
	}
	if ("category_id" in body) {
		const c = body.category_id;
		if (c === null || c === "") columns.area_id = null;
		else if (typeof c === "string" && UUID_RE.test(c)) columns.area_id = c;
		else return fail("category_id is a category id.");
	}
	if ("key" in body) {
		const raw = body.key;
		if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
			if (current && prefixOf(current)) columns.prefix = null;
		} else if (typeof raw !== "string") {
			return fail("key is a project key.");
		} else if (current && raw.trim().toLowerCase() === current.key.toLowerCase()) {
			// the key it already answers to: nothing to write
		} else if (current?.is_default) {
			return fail("The default project answers to the space's key and cannot be given one of its own.", 409);
		} else {
			const key = raw.trim().toUpperCase();
			if (!PROJECT_KEY_RE.test(key)) return fail("A project key is two to five characters: a letter, then letters or digits.");
			columns.prefix = key;
		}
	}
	if ("lead_user_id" in body) {
		const l = body.lead_user_id;
		if (l === null || l === "") columns.lead_user_id = null;
		else if (typeof l === "string" && UUID_RE.test(l)) columns.lead_user_id = l;
		else return fail("lead_user_id is a user id.");
	}
	for (const f of ["start_on", "target_on"] as const) {
		if (!(f in body)) continue;
		const v = body[f];
		if (v === null || v === "") columns[f] = null;
		else if (isIsoDate(v)) columns[f] = v;
		else return fail(`${f} is a date, YYYY-MM-DD.`);
	}
	if ("start_on" in columns || "target_on" in columns) {
		const start = ("start_on" in columns ? columns.start_on : (current?.start_on ?? null)) as string | null;
		const target = ("target_on" in columns ? columns.target_on : (current?.target_on ?? null)) as string | null;
		if (start && target && target < start) return fail("The target date is before the start date.");
	}
	if ("links" in body) {
		if (!Array.isArray(body.links)) return fail("links is a list of {label, url}.");
		const links = cleanLinks(body.links);
		if (links.length < body.links.length && body.links.length <= 30) return fail("Every link needs a url that starts with http:// or https://.");
		columns.links = links;
	}
	if ("board_type" in body) {
		const b = body.board_type;
		if (typeof b !== "string" || !(BOARD_TYPES as readonly string[]).includes(b)) return fail("board_type is kanban or scrum.");
		columns.board_type = b;
	}
	if ("board_columns" in body) {
		const b = body.board_columns;
		if (b === null) columns.board_columns = null;
		else if (!Array.isArray(b)) return fail("board_columns is a list of {name, status_ids}, or null for the columns the workflow gives.");
		else {
			const cols = cleanColumns(b);
			if (b.length > 0 && (!cols || cols.length < Math.min(b.length, 20))) return fail("Every board column needs a name.");
			columns.board_columns = dedupeColumns(cols);
		}
	}
	if ("github_repo" in body) {
		const g = typeof body.github_repo === "string" ? body.github_repo.trim() : body.github_repo;
		if (g === null || g === "") columns.github_repo = null;
		else if (typeof g === "string" && REPO_RE.test(g)) columns.github_repo = g.slice(0, 200);
		else return fail("github_repo is owner/name.");
	}
	return { columns, error: null, status: 200 };
}

/** The status ids a set of board columns names. */
export function columnStatusIds(columns: BoardColumn[] | null | undefined): string[] {
	return Array.from(new Set((columns ?? []).flatMap((c) => c.status_ids)));
}

/**
 * The checks a project write needs the database for: the category and the
 * lead exist, a key is free, a key in use stays, board columns name real
 * statuses. Returns what to tell the caller, or null.
 */
export async function checkProjectWrite(
	supabase: SupabaseClient,
	columns: Record<string, unknown>,
	spaceId: string,
	current: WorkProject | null,
): Promise<{ error: string; status: number } | null> {
	if (typeof columns.area_id === "string") {
		const { data } = await supabase.from("areas").select("id").eq("id", columns.area_id).eq("space_id", spaceId).maybeSingle();
		if (!data) return { error: "No such category in this space.", status: 400 };
	}
	if (typeof columns.lead_user_id === "string") {
		const { data } = await supabase.from("profiles").select("id").eq("id", columns.lead_user_id).maybeSingle();
		if (!data) return { error: "No such person.", status: 400 };
	}
	if ("prefix" in columns) {
		const had = current ? prefixOf(current) : null;
		if (current && had && columns.prefix !== had) {
			// a key is for good once a ticket carries it — binned tickets keep theirs too
			const { data, error } = await supabase.from("tickets").select("id").eq("project_id", current.id).like("ticket_key", `${had}-%`).limit(1);
			if (error) throw error;
			if ((data ?? []).length > 0) return { error: `Tickets already carry the key ${had}, so it cannot change.`, status: 409 };
		}
		if (typeof columns.prefix === "string") {
			const { data: space } = await supabase.from("spaces").select("ticket_prefix").eq("id", spaceId).maybeSingle();
			if (((space?.ticket_prefix as string | null) ?? "").toUpperCase() === columns.prefix) {
				return { error: `The key ${columns.prefix} belongs to the space's default project.`, status: 409 };
			}
			let q = supabase.from("projects").select("id, name").eq("space_id", spaceId).eq("prefix", columns.prefix).limit(1);
			if (current) q = q.neq("id", current.id);
			const { data } = await q;
			const taken = ((data ?? []) as Array<{ id: string; name: string }>)[0];
			if (taken) return { error: `The key ${columns.prefix} belongs to the project "${taken.name}".`, status: 409 };
		}
	}
	const statusIds = columnStatusIds(columns.board_columns as BoardColumn[] | null | undefined);
	if (statusIds.length > 0) {
		const found = new Set<string>();
		for (let i = 0; i < statusIds.length; i += 100) {
			const { data, error } = await supabase.from("ticket_statuses").select("id").eq("space_id", spaceId).in("id", statusIds.slice(i, i + 100));
			if (error) throw error;
			for (const r of (data ?? []) as Array<{ id: string }>) found.add(r.id.toLowerCase());
		}
		const missing = statusIds.filter((id) => !found.has(id.toLowerCase()));
		if (missing.length > 0) return { error: `board_columns names ${missing.length === 1 ? "a status" : "statuses"} this space does not have: ${missing.join(", ")}.`, status: 400 };
	}
	return null;
}

export type ProjectResult = { ok: true; project: WorkProject } | { ok: false; status: number; error: string };

function writeFailure(error: { message?: string; code?: string } | null): ProjectResult {
	const status = error?.code === "42501" ? 403 : error?.code === "23505" ? 409 : 400;
	return { ok: false, status, error: error?.code === "23505" ? "That key or name is already in use." : writeErrorMessage(error) };
}

export async function createProject(supabase: SupabaseClient, spaceId: string, body: Record<string, unknown>): Promise<ProjectResult> {
	const write = projectWriteFromBody(body, null);
	if (write.error) return { ok: false, status: write.status, error: write.error };
	const problem = await checkProjectWrite(supabase, write.columns, spaceId, null);
	if (problem) return { ok: false, ...problem };
	const { data, error } = await supabase
		.from("projects")
		.insert({ status: "active", ...write.columns, space_id: spaceId })
		.select(PROJECT_SELECT)
		.single();
	if (error || !data) return writeFailure(error);
	return { ok: true, project: serializeProject(data as unknown as Parameters<typeof serializeProject>[0]) };
}

export async function patchProject(supabase: SupabaseClient, current: WorkProject, body: Record<string, unknown>): Promise<ProjectResult> {
	const write = projectWriteFromBody(body, current);
	if (write.error) return { ok: false, status: write.status, error: write.error };
	if (Object.keys(write.columns).length === 0) return { ok: false, status: 400, error: "Nothing to change." };
	const problem = await checkProjectWrite(supabase, write.columns, current.space_id, current);
	if (problem) return { ok: false, ...problem };
	const { data, error } = await supabase
		.from("projects")
		.update({ ...write.columns, updated_at: new Date().toISOString() })
		.eq("id", current.id)
		.select(PROJECT_SELECT)
		.maybeSingle();
	if (error) return writeFailure(error);
	// no row back and no error: RLS let the caller read the project but not change it
	if (!data) return { ok: false, status: 403, error: "You do not have permission to do that." };
	return { ok: true, project: serializeProject(data as unknown as Parameters<typeof serializeProject>[0]) };
}

// ---------------------------------------------------------------------
// Issue types a project offers
// ---------------------------------------------------------------------

export const TYPE_SELECT = "id, name, slug, level, has_steps, icon, colour, sort_order, archived_at";

export type TypesOffered = {
	/** What a ticket in this project can be. */
	types: WorkType[];
	/** The project's own picks; empty = it offers every type of the space. */
	type_ids: string[];
	restricted: boolean;
};

/** Pure: a project's picks against the space's types. No picks = every unarchived type. */
export function offeredTypes(all: readonly WorkType[], picks: readonly string[]): TypesOffered {
	const live = all.filter((t) => !t.archived_at).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
	const known = new Set(all.map((t) => t.id));
	const type_ids = Array.from(new Set(picks)).filter((id) => known.has(id));
	if (type_ids.length === 0) return { types: live, type_ids: [], restricted: false };
	const picked = new Set(type_ids);
	return { types: live.filter((t) => picked.has(t.id)), type_ids, restricted: true };
}

export async function typesOffered(supabase: SupabaseClient, project: Pick<WorkProject, "id" | "space_id">): Promise<TypesOffered> {
	const [all, picks] = await Promise.all([
		supabase.from("issue_types").select(TYPE_SELECT).eq("space_id", project.space_id).order("sort_order").limit(500),
		supabase.from("project_issue_types").select("issue_type_id").eq("project_id", project.id).limit(500),
	]);
	if (all.error) throw all.error;
	if (picks.error) throw picks.error;
	return offeredTypes((all.data ?? []) as unknown as WorkType[], ((picks.data ?? []) as Array<{ issue_type_id: string }>).map((r) => r.issue_type_id));
}

/** Read `{type_ids}`: a list of ids, no repeats. */
export function typeIdsFromBody(body: Record<string, unknown>): { ids: string[]; error: string | null } {
	if (!Array.isArray(body.type_ids)) return { ids: [], error: "type_ids is a list of issue type ids." };
	const ids: string[] = [];
	for (const v of body.type_ids) {
		if (typeof v !== "string" || !UUID_RE.test(v)) return { ids: [], error: "type_ids is a list of issue type ids." };
		if (!ids.includes(v.toLowerCase())) ids.push(v.toLowerCase());
	}
	if (ids.length > 200) return { ids: [], error: "Too many issue types." };
	return { ids, error: null };
}

// ---------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------

export const COMPONENT_SELECT = "id, project_id, name, description, lead_user_id, sort_order, archived_at";

export function serializeComponent(r: WorkComponent): WorkComponent {
	return {
		id: r.id,
		project_id: r.project_id,
		name: r.name,
		description: r.description,
		lead_user_id: r.lead_user_id,
		sort_order: r.sort_order,
		archived_at: r.archived_at,
	};
}

export type ComponentWrite = { columns: Record<string, unknown>; error: string | null };

/** What a component create (`create` = true: a name is required) or patch may write. */
export function componentWriteFromBody(body: Record<string, unknown>, create: boolean, now: Date = new Date()): ComponentWrite {
	const columns: Record<string, unknown> = {};
	const fail = (error: string): ComponentWrite => ({ columns: {}, error });

	if ("name" in body || create) {
		const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
		if (!name) return fail("A component needs a name.");
		columns.name = name.slice(0, 80);
	}
	if ("description" in body) {
		if (body.description !== null && typeof body.description !== "string") return fail("description must be text.");
		const d = typeof body.description === "string" ? body.description.trim() : "";
		columns.description = d ? d.slice(0, 2000) : null;
	}
	if ("lead_user_id" in body) {
		const l = body.lead_user_id;
		if (l === null || l === "") columns.lead_user_id = null;
		else if (typeof l === "string" && UUID_RE.test(l)) columns.lead_user_id = l;
		else return fail("lead_user_id is a user id.");
	}
	if (!create) {
		if ("sort_order" in body) {
			if (typeof body.sort_order !== "number" || !Number.isFinite(body.sort_order)) return fail("sort_order is a number.");
			columns.sort_order = Math.max(-1_000_000, Math.min(1_000_000, Math.round(body.sort_order)));
		}
		if ("archived" in body) {
			if (typeof body.archived !== "boolean") return fail("archived is true or false.");
			columns.archived_at = body.archived ? now.toISOString() : null;
		}
	}
	return { columns, error: null };
}

export async function componentsOf(supabase: SupabaseClient, projectId: string, includeArchived = false): Promise<WorkComponent[]> {
	let q = supabase.from("components").select(COMPONENT_SELECT).eq("project_id", projectId);
	if (!includeArchived) q = q.is("archived_at", null);
	const { data, error } = await q.order("sort_order").order("name").limit(500);
	if (error) throw error;
	return ((data ?? []) as unknown as WorkComponent[]).map(serializeComponent);
}
