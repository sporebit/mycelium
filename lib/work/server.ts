/**
 * Work — server-side helpers shared by /api/work/* (claude/spec-work.md §4).
 *
 * Everything runs through the caller's user client, so RLS is the wall.
 * Work writes statuses by id, types by id, labels and components through
 * their own tables; it never writes the eight legacy categories or the old
 * context columns (the database derives and mirrors those for the old
 * paths — 0142, 0144).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ticketKeyFilter } from "@/lib/tickets/categories";
import { parseJql, JqlError } from "./jql";
import { toJql, validateQuery, type StatusCategory, type WorkQuery } from "./query";
import type {
	BoardColumn,
	ProjectLink,
	Ref,
	SearchResult,
	WorkLabel,
	WorkPerson,
	WorkProject,
	WorkStatus,
	WorkTicket,
} from "./types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const POINTS = [1, 2, 3, 5, 8, 13];

export function bad(message: string, status = 400, extra: Record<string, unknown> = {}): NextResponse {
	return NextResponse.json({ error: message, ...extra }, { status });
}

type One<T> = T | T[] | null | undefined;
function first<T>(v: One<T>): T | null {
	if (!v) return null;
	return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ---------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------

export type SpaceInfo = { id: string; prefix: string | null };

/** The space a request works in: `?space=` when given and visible, else the caller's own. */
export async function resolveSpace(supabase: SupabaseClient, uid: string | null, wanted?: string | null): Promise<SpaceInfo | null> {
	if (wanted && UUID_RE.test(wanted)) {
		const { data } = await supabase.from("spaces").select("id, ticket_prefix").eq("id", wanted).maybeSingle();
		return data ? { id: data.id as string, prefix: (data.ticket_prefix as string | null) ?? null } : null;
	}
	if (!uid) return null;
	const { data: profile } = await supabase.from("profiles").select("personal_space_id").eq("id", uid).maybeSingle();
	const id = (profile?.personal_space_id as string | null) ?? null;
	if (!id) return null;
	const { data } = await supabase.from("spaces").select("id, ticket_prefix").eq("id", id).maybeSingle();
	return data ? { id: data.id as string, prefix: (data.ticket_prefix as string | null) ?? null } : null;
}

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export const PROJECT_SELECT =
	"id, name, description, status, colour, is_default, area_id, prefix, lead_user_id, start_on, target_on, links, board_type, board_columns, github_repo, space_id, created_at, updated_at, area:areas(name), space:spaces(ticket_prefix)";

type RawProject = {
	id: string;
	name: string;
	description: string | null;
	status: WorkProject["status"];
	colour: string | null;
	is_default: boolean;
	area_id: string | null;
	prefix: string | null;
	lead_user_id: string | null;
	start_on: string | null;
	target_on: string | null;
	links: unknown;
	board_type: WorkProject["board_type"];
	board_columns: unknown;
	github_repo: string | null;
	space_id: string;
	created_at: string;
	updated_at: string;
	area?: One<{ name: string }>;
	space?: One<{ ticket_prefix: string | null }>;
};

export function projectKey(prefix: string | null, isDefault: boolean, spacePrefix: string | null, id: string): string {
	if (prefix) return prefix;
	if (isDefault && spacePrefix) return spacePrefix;
	return id;
}

export function cleanLinks(v: unknown): ProjectLink[] {
	if (!Array.isArray(v)) return [];
	const out: ProjectLink[] = [];
	for (const l of v) {
		if (!l || typeof l !== "object") continue;
		const url = typeof (l as ProjectLink).url === "string" ? (l as ProjectLink).url.trim() : "";
		if (!/^https?:\/\//i.test(url)) continue;
		const label = typeof (l as ProjectLink).label === "string" ? (l as ProjectLink).label.trim().slice(0, 120) : "";
		out.push({ label: label || url, url: url.slice(0, 2000) });
	}
	return out.slice(0, 30);
}

export function cleanColumns(v: unknown): BoardColumn[] | null {
	if (!Array.isArray(v)) return null;
	const out: BoardColumn[] = [];
	for (const c of v) {
		if (!c || typeof c !== "object") continue;
		const name = typeof (c as BoardColumn).name === "string" ? (c as BoardColumn).name.trim().slice(0, 60) : "";
		const ids = Array.isArray((c as BoardColumn).status_ids)
			? (c as BoardColumn).status_ids.filter((s): s is string => typeof s === "string" && UUID_RE.test(s))
			: [];
		if (name) out.push({ name, status_ids: Array.from(new Set(ids)) });
	}
	return out.length > 0 ? out.slice(0, 20) : null;
}

export function serializeProject(row: RawProject): WorkProject {
	const space = first(row.space);
	return {
		id: row.id,
		key: projectKey(row.prefix, row.is_default, space?.ticket_prefix ?? null, row.id),
		name: row.name,
		description: row.description,
		status: row.status,
		colour: row.colour,
		is_default: row.is_default,
		category_id: row.area_id,
		category_name: first(row.area)?.name ?? null,
		lead_user_id: row.lead_user_id,
		start_on: row.start_on,
		target_on: row.target_on,
		links: cleanLinks(row.links),
		board_type: row.board_type,
		board_columns: cleanColumns(row.board_columns),
		github_repo: row.github_repo,
		space_id: row.space_id,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

/** A project by key (prefix, or the space prefix for the default project) or id. */
export async function resolveProject(supabase: SupabaseClient, ref: string): Promise<WorkProject | null> {
	const r = ref.trim();
	if (!r) return null;
	if (UUID_RE.test(r)) {
		const { data } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", r).maybeSingle();
		return data ? serializeProject(data as unknown as RawProject) : null;
	}
	if (!/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(r)) return null;
	const key = r.toUpperCase();
	const { data } = await supabase.from("projects").select(PROJECT_SELECT).eq("prefix", key).limit(1);
	if (data && data.length > 0) return serializeProject(data[0] as unknown as RawProject);
	// the default project answers to its space's prefix
	const { data: defaults } = await supabase.from("projects").select(PROJECT_SELECT).eq("is_default", true).limit(50);
	for (const d of (defaults ?? []) as unknown as RawProject[]) {
		if ((first(d.space)?.ticket_prefix ?? "").toUpperCase() === key) return serializeProject(d);
	}
	return null;
}

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

export const WORK_SELECT =
	"id, ticket_key, key_aliases, title, description, description_doc, space_id, project_id, type_id, status_id, resolution, assignee_id, created_by, points, deadline_on, due_date, scheduled_on, parent_task_id, epic_id, sprint_id, sort_order, created_at, updated_at, started_at, resolved_at, kind, " +
	"project:projects(id, name, prefix, colour, is_default), " +
	"space:spaces(ticket_prefix), " +
	"type:issue_types(id, name, slug, level, has_steps, icon, colour), " +
	"status:ticket_statuses(id, name, status_category, colour, workflow_id), " +
	"sprint:sprints(id, name, status), " +
	// a self-reference embeds by its COLUMN: PostgREST reads a constraint-name
	// hint on tickets → tickets as ambiguous and refuses it
	"parent:parent_task_id(id, ticket_key, title), " +
	"epic:epic_id(id, ticket_key, title), " +
	"ticket_labels(label:labels(id, name, slug, colour, field:label_fields(slug))), " +
	"ticket_components(component:components(id, name))";

type RawRef = { id: string; ticket_key: string | null; title: string };
type RawWork = {
	id: string;
	ticket_key: string | null;
	key_aliases: string[] | null;
	title: string;
	description: string | null;
	description_doc: unknown | null;
	space_id: string;
	project_id: string | null;
	type_id: string | null;
	status_id: string | null;
	resolution: string | null;
	assignee_id: string | null;
	created_by: string | null;
	points: number | null;
	deadline_on: string | null;
	due_date: string | null;
	scheduled_on: string | null;
	parent_task_id: string | null;
	epic_id: string | null;
	sprint_id: string | null;
	sort_order: number | null;
	created_at: string;
	updated_at: string;
	started_at: string | null;
	resolved_at: string | null;
	kind: string | null;
	project?: One<{ id: string; name: string; prefix: string | null; colour: string | null; is_default: boolean }>;
	space?: One<{ ticket_prefix: string | null }>;
	type?: One<{ id: string; name: string; slug: string; level: number; has_steps: boolean; icon: string | null; colour: string | null }>;
	status?: One<{ id: string; name: string; status_category: StatusCategory; colour: string | null; workflow_id: string }>;
	sprint?: One<{ id: string; name: string; status: string }>;
	parent?: One<RawRef>;
	epic?: One<RawRef>;
	ticket_labels?: Array<{ label: One<{ id: string; name: string; slug: string; colour: string | null; field: One<{ slug: string }> }> }> | null;
	ticket_components?: Array<{ component: One<{ id: string; name: string }> }> | null;
};

function ref(r: RawRef | null): Ref | null {
	return r ? { id: r.id, key: r.ticket_key, title: r.title } : null;
}

export function serializeWork(row: RawWork, names: Map<string, string> = new Map()): WorkTicket {
	const project = first(row.project);
	const space = first(row.space);
	const status = first(row.status);
	const labels: WorkLabel[] = [];
	for (const tl of row.ticket_labels ?? []) {
		const l = first(tl.label);
		if (l) labels.push({ id: l.id, name: l.name, slug: l.slug, colour: l.colour, field: first(l.field)?.slug ?? "labels" });
	}
	labels.sort((a, b) => a.field.localeCompare(b.field) || a.name.localeCompare(b.name));
	const components: Array<{ id: string; name: string }> = [];
	for (const tc of row.ticket_components ?? []) {
		const c = first(tc.component);
		if (c) components.push({ id: c.id, name: c.name });
	}
	components.sort((a, b) => a.name.localeCompare(b.name));
	const person = (id: string | null): WorkPerson | null => (id ? { id, name: names.get(id) ?? id.slice(0, 8) } : null);
	return {
		id: row.id,
		key: row.ticket_key,
		key_aliases: row.key_aliases ?? [],
		title: row.title,
		description: row.description,
		description_doc: row.description_doc ?? null,
		space_id: row.space_id,
		project: project
			? { id: project.id, key: projectKey(project.prefix, project.is_default, space?.ticket_prefix ?? null, project.id), name: project.name, colour: project.colour }
			: null,
		type: first(row.type),
		status: status ? { id: status.id, name: status.name, category: status.status_category, colour: status.colour, workflow_id: status.workflow_id } : null,
		resolution: row.resolution,
		assignee: person(row.assignee_id),
		reporter: person(row.created_by),
		points: row.points,
		due: row.deadline_on ?? row.due_date ?? null,
		scheduled_on: row.scheduled_on,
		parent: ref(first(row.parent)),
		epic: ref(first(row.epic)),
		sprint: first(row.sprint),
		labels,
		components,
		rank: row.sort_order ?? 0,
		created_at: row.created_at,
		updated_at: row.updated_at,
		started_at: row.started_at,
		resolved_at: row.resolved_at,
		kind: row.kind ?? "task",
	};
}

/** Display names for a set of user ids (profiles is readable for people you share a space with). */
export async function namesFor(supabase: SupabaseClient, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
	const want = Array.from(new Set(ids.filter((x): x is string => !!x)));
	const out = new Map<string, string>();
	if (want.length === 0) return out;
	const { data } = await supabase.from("profiles").select("id, display_name").in("id", want);
	for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
		if (p.display_name) out.set(p.id, p.display_name);
	}
	return out;
}

/** Read tickets by id, serialised, in the order given. */
export async function ticketsByIds(supabase: SupabaseClient, ids: string[]): Promise<WorkTicket[]> {
	if (ids.length === 0) return [];
	const rows: RawWork[] = [];
	// PostgREST carries the id list in the URL: keep each request short
	for (let i = 0; i < ids.length; i += 100) {
		const { data, error } = await supabase.from("tickets").select(WORK_SELECT).in("id", ids.slice(i, i + 100));
		if (error) throw error;
		rows.push(...((data ?? []) as unknown as RawWork[]));
	}
	const names = await namesFor(supabase, rows.flatMap((r) => [r.assignee_id, r.created_by]));
	const byId = new Map(rows.map((r) => [r.id, serializeWork(r, names)]));
	return ids.map((id) => byId.get(id)).filter((t): t is WorkTicket => !!t);
}

export type SearchOptions = { limit?: number; offset?: number; space?: string | null };

/** Run a checked query object. Throws on a database error; a bad query is a 400 before it gets here. */
export async function searchTickets(supabase: SupabaseClient, query: WorkQuery, opts: SearchOptions = {}): Promise<SearchResult> {
	const limit = Math.min(Math.max(opts.limit ?? 50, 1), 1000);
	const offset = Math.max(opts.offset ?? 0, 0);
	const { data, error } = await supabase.rpc("work_search", {
		p_query: query,
		p_limit: limit,
		p_offset: offset,
		p_space: opts.space ?? null,
	});
	if (error) throw error;
	const rows = (data ?? []) as Array<{ ticket_id: string; total: number }>;
	const tickets = await ticketsByIds(supabase, rows.map((r) => r.ticket_id));
	return { tickets, total: Number(rows[0]?.total ?? 0), limit, offset, jql: toJql(query) };
}

/** The label fields a space has beyond the fixed JQL names. */
export async function labelFieldSlugs(supabase: SupabaseClient, spaceId?: string | null): Promise<string[]> {
	let q = supabase.from("label_fields").select("slug");
	if (spaceId) q = q.eq("space_id", spaceId);
	const { data } = await q.limit(200);
	return Array.from(new Set(((data ?? []) as Array<{ slug: string }>).map((r) => r.slug)));
}

/**
 * The query a request carries: `jql=` or `q=` (the query object as JSON).
 * Returns a response to send when it cannot be read.
 */
export async function queryFromRequest(
	supabase: SupabaseClient,
	params: URLSearchParams,
	spaceId?: string | null,
): Promise<{ ok: true; query: WorkQuery } | { ok: false; response: NextResponse }> {
	const jql = params.get("jql");
	const q = params.get("q");
	const fields = await labelFieldSlugs(supabase, spaceId);
	if (q !== null && q.trim() !== "") {
		let parsed: unknown;
		try {
			parsed = JSON.parse(q);
		} catch {
			return { ok: false, response: bad("q is not JSON") };
		}
		const checked = validateQuery(parsed, fields);
		if (!checked.ok) return { ok: false, response: bad(checked.errors[0].message, 400, { errors: checked.errors }) };
		return { ok: true, query: checked.query };
	}
	try {
		return { ok: true, query: parseJql(jql ?? "", { labelFields: fields }) };
	} catch (err) {
		if (err instanceof JqlError) return { ok: false, response: bad(err.message, 400, { pos: err.pos }) };
		throw err;
	}
}

/** A ticket's id, space and current state by key (live or alias) or uuid. */
export async function resolveWorkRef(
	supabase: SupabaseClient,
	refOrKey: string,
): Promise<{ id: string; space_id: string; project_id: string | null; type_id: string | null; status_id: string | null; assignee_id: string | null; key: string | null; title: string; kind: string } | null> {
	const sel = "id, space_id, project_id, type_id, status_id, assignee_id, ticket_key, title, kind";
	type Row = { id: string; space_id: string; project_id: string | null; type_id: string | null; status_id: string | null; assignee_id: string | null; ticket_key: string | null; title: string; kind: string | null };
	let row: Row | null = null;
	if (UUID_RE.test(refOrKey)) {
		row = ((await supabase.from("tickets").select(sel).eq("id", refOrKey).is("deleted_at", null).maybeSingle()).data as Row | null) ?? null;
	} else {
		const filter = ticketKeyFilter(refOrKey);
		if (!filter) return null;
		const rows = ((await supabase.from("tickets").select(sel).or(filter).is("deleted_at", null).limit(2)).data ?? []) as Row[];
		const k = refOrKey.trim().toUpperCase();
		row = rows.find((r) => r.ticket_key === k) ?? rows[0] ?? null;
	}
	if (!row || row.kind === "habit") return null;
	return { ...row, key: row.ticket_key, kind: row.kind ?? "task" };
}

// ---------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------

export const STATUS_SELECT = "id, workflow_id, name, status_category, resolution, colour, sort_order";

type RawStatus = { id: string; workflow_id: string; name: string; status_category: StatusCategory; resolution: string | null; colour: string | null; sort_order: number };

export function serializeStatus(r: RawStatus): WorkStatus {
	return { id: r.id, workflow_id: r.workflow_id, name: r.name, category: r.status_category, resolution: r.resolution, colour: r.colour, sort_order: r.sort_order };
}

/** The workflow a ticket of this project and type uses (0142 `ticket_workflow_for`). */
export async function workflowFor(supabase: SupabaseClient, spaceId: string, projectId: string | null, typeId: string | null): Promise<string | null> {
	const { data, error } = await supabase.rpc("ticket_workflow_for", { p_space: spaceId, p_project: projectId, p_type: typeId });
	if (error) throw error;
	return (data as string | null) ?? null;
}

export async function statusesOf(supabase: SupabaseClient, workflowId: string): Promise<WorkStatus[]> {
	const { data, error } = await supabase.from("ticket_statuses").select(STATUS_SELECT).eq("workflow_id", workflowId).order("sort_order");
	if (error) throw error;
	return ((data ?? []) as unknown as RawStatus[]).map(serializeStatus);
}

// ---------------------------------------------------------------------
// Labels and components on a ticket
// ---------------------------------------------------------------------

/**
 * Set a ticket's labels for the fields named in `spec` (`{location: ["Home"]}`
 * replaces the ticket's Location labels and leaves its other fields alone).
 * Unknown label names are created in their field.
 */
export async function setTicketLabels(
	supabase: SupabaseClient,
	ticket: { id: string; space_id: string },
	spec: Record<string, unknown>,
): Promise<string | null> {
	const slugs = Object.keys(spec).map((s) => (s === "label" ? "labels" : s.toLowerCase()));
	if (slugs.length === 0) return null;
	const { data: fields, error } = await supabase.from("label_fields").select("id, slug").eq("space_id", ticket.space_id).in("slug", slugs);
	if (error) throw error;
	const fieldBySlug = new Map(((fields ?? []) as Array<{ id: string; slug: string }>).map((f) => [f.slug, f.id]));

	for (const [rawSlug, rawValues] of Object.entries(spec)) {
		const slug = rawSlug === "label" ? "labels" : rawSlug.toLowerCase();
		const fieldId = fieldBySlug.get(slug);
		if (!fieldId) return `Unknown label field "${rawSlug}".`;
		if (!Array.isArray(rawValues)) return `${rawSlug} must be a list.`;
		const names = Array.from(
			new Map(
				rawValues
					.filter((v): v is string => typeof v === "string" && v.trim() !== "")
					.map((v) => [v.trim().replace(/\s+/g, " ").toLowerCase(), v.trim().replace(/\s+/g, " ").slice(0, 80)] as const),
			).entries(),
		);
		if (names.length > 50) return `Too many ${rawSlug} values.`;

		const { data: existing } = await supabase.from("labels").select("id, slug").eq("field_id", fieldId).in("slug", names.length ? names.map(([s]) => s) : ["-"]);
		const idBySlug = new Map(((existing ?? []) as Array<{ id: string; slug: string }>).map((l) => [l.slug, l.id]));
		const missing = names.filter(([s]) => !idBySlug.has(s));
		if (missing.length > 0) {
			const { data: made, error: mkErr } = await supabase
				.from("labels")
				.upsert(
					missing.map(([s, name]) => ({ space_id: ticket.space_id, field_id: fieldId, name, slug: s })),
					{ onConflict: "field_id,slug", ignoreDuplicates: false },
				)
				.select("id, slug");
			if (mkErr) throw mkErr;
			for (const l of (made ?? []) as Array<{ id: string; slug: string }>) idBySlug.set(l.slug, l.id);
		}
		const want = new Set(names.map(([s]) => idBySlug.get(s)).filter((x): x is string => !!x));

		const { data: current } = await supabase
			.from("ticket_labels")
			.select("label_id, label:labels!inner(field_id)")
			.eq("ticket_id", ticket.id)
			.eq("label.field_id", fieldId);
		const have = new Set(((current ?? []) as Array<{ label_id: string }>).map((r) => r.label_id));
		const drop = [...have].filter((id) => !want.has(id));
		const add = [...want].filter((id) => !have.has(id));
		if (drop.length > 0) {
			const { error: delErr } = await supabase.from("ticket_labels").delete().eq("ticket_id", ticket.id).in("label_id", drop);
			if (delErr) throw delErr;
		}
		if (add.length > 0) {
			const { error: addErr } = await supabase
				.from("ticket_labels")
				.upsert(add.map((label_id) => ({ space_id: ticket.space_id, ticket_id: ticket.id, label_id })), { onConflict: "ticket_id,label_id", ignoreDuplicates: true });
			if (addErr) throw addErr;
		}
	}
	return null;
}

/** Replace a ticket's components. Each must belong to the ticket's project. */
export async function setTicketComponents(
	supabase: SupabaseClient,
	ticket: { id: string; space_id: string; project_id: string | null },
	values: unknown,
): Promise<string | null> {
	if (!Array.isArray(values)) return "components must be a list.";
	const wanted = values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
	let ids: string[] = [];
	if (wanted.length > 0) {
		if (!ticket.project_id) return "A ticket needs a project before it can have components.";
		const { data } = await supabase.from("components").select("id, name").eq("project_id", ticket.project_id);
		const rows = (data ?? []) as Array<{ id: string; name: string }>;
		for (const w of wanted) {
			const hit = rows.find((c) => c.id === w || c.name.toLowerCase() === w.toLowerCase());
			if (!hit) return `No component "${w}" in this project.`;
			ids.push(hit.id);
		}
		ids = Array.from(new Set(ids));
	}
	const { data: current } = await supabase.from("ticket_components").select("component_id").eq("ticket_id", ticket.id);
	const have = new Set(((current ?? []) as Array<{ component_id: string }>).map((r) => r.component_id));
	const drop = [...have].filter((id) => !ids.includes(id));
	const add = ids.filter((id) => !have.has(id));
	if (drop.length > 0) {
		const { error } = await supabase.from("ticket_components").delete().eq("ticket_id", ticket.id).in("component_id", drop);
		if (error) throw error;
	}
	if (add.length > 0) {
		const { error } = await supabase
			.from("ticket_components")
			.upsert(add.map((component_id) => ({ space_id: ticket.space_id, ticket_id: ticket.id, component_id })), { onConflict: "ticket_id,component_id", ignoreDuplicates: true });
		if (error) throw error;
	}
	return null;
}

/** Make someone a watcher; a no-op when they already are. */
export async function watch(supabase: SupabaseClient, ticket: { id: string; space_id: string }, userIds: Array<string | null | undefined>): Promise<void> {
	const ids = Array.from(new Set(userIds.filter((x): x is string => !!x && UUID_RE.test(x))));
	if (ids.length === 0) return;
	const { error } = await supabase
		.from("ticket_watchers")
		.upsert(ids.map((watcher_id) => ({ space_id: ticket.space_id, ticket_id: ticket.id, watcher_id })), { onConflict: "ticket_id,watcher_id", ignoreDuplicates: true });
	if (error) console.error("[work] watch failed:", error.message);
}

// ---------------------------------------------------------------------
// Field whitelist for Work writes
// ---------------------------------------------------------------------

export type WorkWrite = {
	/** Columns on tickets. */
	columns: Record<string, unknown>;
	labels: Record<string, unknown> | null;
	components: unknown[] | null;
	error: string | null;
};

/**
 * Pick and validate what a Work create or patch may write. References
 * (`project`, `type`, `status`, `epic`, `parent`) may be given as ids or as
 * the names people type; they are resolved against the ticket's space.
 */
export async function workWriteFromBody(
	supabase: SupabaseClient,
	body: Record<string, unknown>,
	ctx: { spaceId: string; projectId: string | null; typeId: string | null; ticketId?: string },
): Promise<WorkWrite> {
	const columns: Record<string, unknown> = {};
	const fail = (error: string): WorkWrite => ({ columns: {}, labels: null, components: null, error });

	if ("title" in body) {
		const t = typeof body.title === "string" ? body.title.trim() : "";
		if (!t) return fail("A title is required.");
		columns.title = t.slice(0, 500);
	}
	if ("description" in body) {
		if (body.description !== null && typeof body.description !== "string") return fail("description must be text.");
		columns.description = body.description === null ? null : (body.description as string).slice(0, 100_000);
		// the document rides with its text; a text-only write clears it (0145)
		columns.description_doc = "description_doc" in body && body.description_doc && typeof body.description_doc === "object" ? body.description_doc : null;
	} else if ("description_doc" in body) {
		return fail("description_doc needs its plain-text description alongside.");
	}
	if ("points" in body) {
		if (body.points !== null && !(typeof body.points === "number" && POINTS.includes(body.points))) return fail("points is one of 1, 2, 3, 5, 8, 13.");
		columns.points = body.points;
	}
	for (const [key, col] of [["due", "deadline_on"], ["scheduled_on", "scheduled_on"]] as const) {
		if (!(key in body)) continue;
		const v = body[key];
		if (v !== null && !(typeof v === "string" && DATE_RE.test(v))) return fail(`${key} is a date, YYYY-MM-DD.`);
		columns[col] = v;
		if (col === "deadline_on") {
			// the picked-date When (spec §18): the old surfaces read these together
			columns.due_window = v === null ? null : "date";
			columns.due_date = v;
		}
	}
	if ("rank" in body) {
		if (typeof body.rank !== "number" || !Number.isFinite(body.rank)) return fail("rank is a number.");
		columns.sort_order = Math.round(body.rank);
	}
	if ("resolution" in body) {
		if (body.resolution !== null && !["done", "cancelled", "duplicate", "wont_do"].includes(String(body.resolution))) return fail("Unknown resolution.");
		columns.resolution = body.resolution;
	}
	if ("assignee_id" in body) {
		if (body.assignee_id !== null && !(typeof body.assignee_id === "string" && UUID_RE.test(body.assignee_id))) return fail("assignee_id is a user id.");
		columns.assignee_id = body.assignee_id;
	}
	if ("sprint_id" in body) {
		if (body.sprint_id !== null && !(typeof body.sprint_id === "string" && UUID_RE.test(body.sprint_id))) return fail("sprint_id is a sprint id.");
		columns.sprint_id = body.sprint_id;
	}

	let projectId = ctx.projectId;
	if ("project" in body || "project_id" in body) {
		const v = body.project ?? body.project_id;
		if (typeof v !== "string" || !v.trim()) return fail("A ticket needs a project.");
		const p = await resolveProject(supabase, v);
		if (!p || p.space_id !== ctx.spaceId) return fail(`No project "${v}" in this space.`);
		projectId = p.id;
		columns.project_id = p.id;
	}

	let typeId = ctx.typeId;
	if ("type" in body || "type_id" in body) {
		const v = body.type ?? body.type_id;
		if (typeof v !== "string" || !v.trim()) return fail("A ticket needs a type.");
		let q = supabase.from("issue_types").select("id, slug, level").eq("space_id", ctx.spaceId).is("archived_at", null);
		q = UUID_RE.test(v) ? q.eq("id", v) : q.or(`slug.eq.${v.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")},name.ilike.${v.trim().replace(/[%,()*]/g, " ")}`);
		const { data } = await q.limit(1);
		const t = (data ?? [])[0] as { id: string } | undefined;
		if (!t) return fail(`No issue type "${v}".`);
		typeId = t.id;
		columns.type_id = t.id;
	}

	if ("status" in body || "status_id" in body) {
		const v = body.status ?? body.status_id;
		if (typeof v !== "string" || !v.trim()) return fail("status is a status name or id.");
		const wf = await workflowFor(supabase, ctx.spaceId, projectId, typeId);
		if (!wf) return fail("This space has no workflow.");
		const statuses = await statusesOf(supabase, wf);
		const hit = statuses.find((s) => s.id === v || s.name.toLowerCase() === v.trim().toLowerCase());
		if (!hit) return fail(`"${v}" is not a status in this ticket's workflow (${statuses.map((s) => s.name).join(", ")}).`);
		columns.status_id = hit.id;
	}

	for (const [key, col] of [["epic", "epic_id"], ["parent", "parent_task_id"]] as const) {
		if (!(key in body)) continue;
		const v = body[key];
		if (v === null) {
			columns[col] = null;
			continue;
		}
		if (typeof v !== "string") return fail(`${key} is a ticket key.`);
		const t = await resolveWorkRef(supabase, v);
		if (!t || t.space_id !== ctx.spaceId) return fail(`No ticket "${v}".`);
		if (ctx.ticketId && t.id === ctx.ticketId) return fail(`A ticket cannot be its own ${key}.`);
		columns[col] = t.id;
	}

	let labels: Record<string, unknown> | null = null;
	if ("labels" in body) {
		const v = body.labels;
		if (Array.isArray(v)) labels = { labels: v };
		else if (v && typeof v === "object") labels = v as Record<string, unknown>;
		else return fail("labels is a list, or an object of lists by field.");
	}
	for (const f of ["location", "tool"]) {
		if (f in body) labels = { ...(labels ?? {}), [f]: body[f] };
	}
	const components = "components" in body ? (Array.isArray(body.components) ? (body.components as unknown[]) : null) : null;
	if ("components" in body && components === null) return fail("components is a list.");

	return { columns, labels, components, error: null };
}

/** Turn a Postgres error from a ticket write into something a person can act on. */
export function writeErrorMessage(err: { message?: string; code?: string } | null): string {
	const m = err?.message ?? "";
	if (/epic_id must point/.test(m)) return "That is not an Epic in this project, or this ticket is itself an Epic.";
	if (/own epic/.test(m)) return "A ticket cannot be its own epic.";
	if (/issue type .* belongs to another space/.test(m)) return "That issue type belongs to another space.";
	if (/sub-projects were replaced/.test(m)) return "Sub-projects were replaced by components.";
	if (/belongs to the space/.test(m)) return "That key belongs to the default project.";
	if (err?.code === "23505") return "That already exists.";
	if (err?.code === "42501") return "You do not have permission to do that.";
	return m || "The write failed.";
}
