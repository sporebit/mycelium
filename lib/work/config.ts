/**
 * Work — configuration: issue types, workflows and their statuses, the
 * workflow map, label fields and labels, saved filters
 * (claude/spec-work.md §2.1, §2.2, §2.4, §2.5, §4).
 *
 * Two halves. The first is pure — validation, slug derivation and
 * `workflowProblems` — and is what lib/work/config.test.ts covers. The
 * second reads a space's configuration through the caller's user client,
 * so RLS is the wall.
 *
 * A status is only ever written by its `status_category`; the legacy
 * eight-value `category` is derived by the database (0142).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { JqlError, parseJql } from "./jql";
import { canonicalField, FIELD_KIND, STATUS_CATEGORIES, STATUS_CATEGORY_LABEL, type StatusCategory, type WorkQuery } from "./query";
import { bad, namesFor, resolveSpace, serializeStatus, STATUS_SELECT, UUID_RE, writeErrorMessage, type SpaceInfo } from "./server";
import type { SavedFilter, WorkLabelField, WorkPerson, WorkStatus, WorkType, WorkWorkflow, WorkflowMapRow } from "./types";

// ---------------------------------------------------------------------
// Pure: shapes and small checks
// ---------------------------------------------------------------------

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; pos?: number };

export const RESOLUTIONS = ["done", "cancelled", "duplicate", "wont_do"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const LEVELS = [1, 0, -1] as const;
export const LEGACY_KINDS = ["task", "runbook", "test", "guide", "audit", "setup"] as const;

/** Words the JQL grammar keeps for itself: a label field cannot be called one of them. */
export const RESERVED_WORDS = ["and", "or", "not", "in", "is", "empty", "null", "order", "by", "asc", "desc"] as const;

export const COLOUR_RE = /^#[0-9a-f]{6}$/i;
export const TYPE_SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const LABEL_FIELD_SLUG_RE = /^[a-z][a-z0-9_]{0,31}$/;
export const FILTER_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function asObject(v: unknown): Record<string, unknown> | null {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Trimmed, with every run of whitespace collapsed to one space. */
export function cleanName(v: unknown): string {
	return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

function checkName(v: unknown, max: number, what: string): Checked<string> {
	const name = cleanName(v);
	if (!name) return fail(`${what} needs a name.`);
	if (name.length > max) return fail(`${what} name is ${max} characters at most.`);
	return { ok: true, value: name };
}

function checkColour(v: unknown): Checked<string | null> {
	if (v === null || v === "") return { ok: true, value: null };
	if (typeof v !== "string" || !COLOUR_RE.test(v.trim())) return fail("colour is a hex colour such as #7aa2f7.");
	return { ok: true, value: v.trim().toLowerCase() };
}

function checkSortOrder(v: unknown): Checked<number> {
	if (typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) > 100_000) return fail("sort_order is a whole number.");
	return { ok: true, value: v };
}

function checkText(v: unknown, max: number, what: string): Checked<string | null> {
	if (v === null) return { ok: true, value: null };
	if (typeof v !== "string") return fail(`${what} must be text.`);
	const s = v.trim();
	if (s.length > max) return fail(`${what} is ${max} characters at most.`);
	return { ok: true, value: s || null };
}

function archivedAt(v: unknown, now: Date): Checked<string | null> {
	if (typeof v !== "boolean") return fail("archived is true or false.");
	return { ok: true, value: v ? now.toISOString() : null };
}

// ---------------------------------------------------------------------
// Pure: slugs
// ---------------------------------------------------------------------

/** Accents folded to their base letters, lower-cased. */
function fold(s: string): string {
	return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** An issue type's slug from its name: `Change request` → `change-request`. Empty when the name has no letter to start on. */
export function typeSlug(name: string): string {
	return fold(name)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^[^a-z]+/, "")
		.slice(0, 32)
		.replace(/-+$/, "");
}

/** A label field's slug from its name: `Cost centre` → `cost_centre`. */
export function labelFieldSlug(name: string): string {
	return fold(name)
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^[^a-z]+/, "")
		.slice(0, 32)
		.replace(/_+$/, "");
}

/**
 * A label's slug. This is public.work_label_slug (0144) to the letter:
 * `lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))` — btrim takes off
 * SPACES only, then every run of whitespace becomes one space. Names that
 * went through `cleanName` first give the same slug under either rule.
 */
export function labelSlug(name: string): string {
	return name
		.replace(/^ +| +$/g, "")
		.replace(/\s+/g, " ")
		.toLowerCase();
}

/** A saved filter's slug from its name: `My open work` → `my-open-work`. */
export function filterSlug(name: string): string {
	return fold(name)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+/, "")
		.slice(0, 64)
		.replace(/-+$/, "");
}

/** `base`, or `base-2`, `base-3`… — the first one not taken, never longer than `max`. */
export function uniqueSlug(base: string, taken: Iterable<string>, max = 64): string {
	const used = new Set(taken);
	if (!used.has(base)) return base;
	for (let n = 2; n < 10_000; n += 1) {
		const suffix = `-${n}`;
		const candidate = `${base.slice(0, max - suffix.length).replace(/-+$/, "")}${suffix}`;
		if (!used.has(candidate)) return candidate;
	}
	return base;
}

/** Why a slug cannot be a label field's, or null when it can. */
export function labelFieldSlugProblem(slug: string): string | null {
	if (!LABEL_FIELD_SLUG_RE.test(slug)) {
		return "A label field's slug starts with a letter and holds lower-case letters, digits and underscores, 32 characters at most.";
	}
	if ((RESERVED_WORDS as readonly string[]).includes(slug)) return `"${slug}" is a word the query language keeps for itself.`;
	// the fixed fields, their aliases and the ORDER BY names, whatever their case
	const fixed = Object.keys(FIELD_KIND).some((f) => f.toLowerCase() === slug) || canonicalField(slug) !== null;
	if (fixed) return `"${slug}" is already a field in the query language.`;
	return null;
}

// ---------------------------------------------------------------------
// Pure: workflows and statuses
// ---------------------------------------------------------------------

export type StatusValues = {
	name: string;
	status_category: StatusCategory;
	resolution: Resolution | null;
	colour: string | null;
};

export type StatusWrite = {
	/** What to write: only the columns the caller gave. */
	columns: Partial<StatusValues>;
	/** The status as it will stand. */
	merged: StatusValues;
};

function isStatusCategory(v: unknown): v is StatusCategory {
	return typeof v === "string" && (STATUS_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Check a new status, or a change to `current`. The three-value category
 * is read from `status_category` (or `category`, the name the API returns
 * it under); the legacy column is never written.
 */
export function checkStatus(input: unknown, current?: StatusValues): Checked<StatusWrite> {
	const o = asObject(input);
	if (!o) return fail("A status must be an object.");
	const columns: Partial<StatusValues> = {};

	if ("name" in o || !current) {
		const name = checkName(o.name, 60, "A status");
		if (!name.ok) return name;
		columns.name = name.value;
	}

	const rawCategory = "status_category" in o ? o.status_category : o.category;
	if (rawCategory !== undefined || !current) {
		if (!isStatusCategory(rawCategory)) return fail("status_category is one of todo, in_progress, done.");
		columns.status_category = rawCategory;
	}
	const category = columns.status_category ?? (current as StatusValues).status_category;

	if ("colour" in o && o.colour !== undefined) {
		const colour = checkColour(o.colour);
		if (!colour.ok) return colour;
		columns.colour = colour.value;
	}

	let resolution: Resolution | null = category === "done" ? (current?.status_category === "done" ? current.resolution : null) ?? "done" : null;
	if ("resolution" in o && o.resolution !== undefined && o.resolution !== null) {
		if (typeof o.resolution !== "string" || !(RESOLUTIONS as readonly string[]).includes(o.resolution)) {
			return fail("resolution is one of done, cancelled, duplicate, wont_do.");
		}
		if (category !== "done") return fail("Only a Done status carries a resolution.");
		resolution = o.resolution as Resolution;
		columns.resolution = resolution;
	} else if (category !== "done" && current && current.resolution !== null) {
		// leaving Done: the resolution goes with it
		columns.resolution = null;
	}

	return {
		ok: true,
		value: {
			columns,
			merged: {
				name: columns.name ?? (current as StatusValues).name,
				status_category: category,
				resolution,
				colour: "colour" in columns ? (columns.colour ?? null) : (current?.colour ?? null),
			},
		},
	};
}

/**
 * What is wrong with a workflow's statuses, in words: it needs at least one
 * status in each of the three categories, and no two statuses may share a
 * name (whatever their case). Empty when the workflow is sound.
 */
export function workflowProblems(statuses: ReadonlyArray<{ name: string; category: string }>): string[] {
	const problems: string[] = [];
	for (const c of STATUS_CATEGORIES) {
		if (!statuses.some((s) => s.category === c)) problems.push(`A workflow needs at least one ${STATUS_CATEGORY_LABEL[c]} status.`);
	}
	const seen = new Map<string, string>();
	const reported = new Set<string>();
	for (const s of statuses) {
		const k = cleanName(s.name).toLowerCase();
		if (seen.has(k) && !reported.has(k)) {
			problems.push(`Two statuses are called "${seen.get(k)}".`);
			reported.add(k);
		}
		if (!seen.has(k)) seen.set(k, cleanName(s.name));
	}
	return problems;
}

/** The three statuses a workflow starts with when none are given. */
export const MINIMAL_STATUSES: StatusValues[] = [
	{ name: "To Do", status_category: "todo", resolution: null, colour: null },
	{ name: "In Progress", status_category: "in_progress", resolution: null, colour: null },
	{ name: "Done", status_category: "done", resolution: "done", colour: null },
];

/** Check a list of statuses for a new workflow, in the order given. */
export function checkStatusList(input: unknown): Checked<StatusValues[]> {
	if (!Array.isArray(input) || input.length === 0) return fail("statuses is a list of at least three statuses.");
	if (input.length > 40) return fail("A workflow holds 40 statuses at most.");
	const out: StatusValues[] = [];
	for (const raw of input) {
		const checked = checkStatus(raw);
		if (!checked.ok) return checked;
		out.push(checked.value.merged);
	}
	const problems = workflowProblems(out.map((s) => ({ name: s.name, category: s.status_category })));
	if (problems.length > 0) return fail(problems.join(" "));
	return { ok: true, value: out };
}

export type WorkflowColumns = { name?: string; description?: string | null; archived_at?: string | null };

export function checkWorkflow(input: unknown, opts: { partial: boolean; now?: Date }): Checked<WorkflowColumns> {
	const o = asObject(input);
	if (!o) return fail("A workflow must be an object.");
	const columns: WorkflowColumns = {};
	if ("name" in o || !opts.partial) {
		const name = checkName(o.name, 60, "A workflow");
		if (!name.ok) return name;
		columns.name = name.value;
	}
	if ("description" in o && o.description !== undefined) {
		const d = checkText(o.description, 2000, "description");
		if (!d.ok) return d;
		columns.description = d.value;
	}
	if (opts.partial && "archived" in o) {
		const a = archivedAt(o.archived, opts.now ?? new Date());
		if (!a.ok) return a;
		columns.archived_at = a.value;
	}
	return { ok: true, value: columns };
}

// ---------------------------------------------------------------------
// Pure: issue types
// ---------------------------------------------------------------------

export type NewType = {
	name: string;
	slug: string;
	level: number;
	has_steps: boolean;
	legacy_kind: string | null;
	icon: string | null;
	colour: string | null;
	sort_order?: number;
};

function checkIcon(v: unknown): Checked<string | null> {
	if (v === null || v === "") return { ok: true, value: null };
	if (typeof v !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(v.trim())) return fail("icon is an icon name such as check-square.");
	return { ok: true, value: v.trim() };
}

export function checkNewType(input: unknown): Checked<NewType> {
	const o = asObject(input);
	if (!o) return fail("An issue type must be an object.");
	const name = checkName(o.name, 60, "An issue type");
	if (!name.ok) return name;

	let slug: string;
	if (o.slug === undefined || o.slug === null || o.slug === "") {
		slug = typeSlug(name.value);
		if (!TYPE_SLUG_RE.test(slug)) return fail("No slug can be made from that name: give one.");
	} else {
		if (typeof o.slug !== "string" || !TYPE_SLUG_RE.test(o.slug)) {
			return fail("An issue type's slug starts with a letter and holds lower-case letters, digits and hyphens, 32 characters at most.");
		}
		slug = o.slug;
	}

	const level = o.level === undefined ? 0 : o.level;
	if (typeof level !== "number" || !(LEVELS as readonly number[]).includes(level)) return fail("level is 1 (Epic), 0 (standard) or -1 (Sub-task).");
	if (o.has_steps !== undefined && typeof o.has_steps !== "boolean") return fail("has_steps is true or false.");
	if (o.legacy_kind !== undefined && o.legacy_kind !== null && !(LEGACY_KINDS as readonly unknown[]).includes(o.legacy_kind)) {
		return fail(`legacy_kind is one of ${LEGACY_KINDS.join(", ")}.`);
	}

	const value: NewType = {
		name: name.value,
		slug,
		level,
		has_steps: o.has_steps === true,
		legacy_kind: (o.legacy_kind as string | null | undefined) ?? null,
		icon: null,
		colour: null,
	};
	if (o.icon !== undefined) {
		const icon = checkIcon(o.icon);
		if (!icon.ok) return icon;
		value.icon = icon.value;
	}
	if (o.colour !== undefined) {
		const colour = checkColour(o.colour);
		if (!colour.ok) return colour;
		value.colour = colour.value;
	}
	if (o.sort_order !== undefined) {
		const s = checkSortOrder(o.sort_order);
		if (!s.ok) return s;
		value.sort_order = s.value;
	}
	return { ok: true, value };
}

export type TypeColumns = {
	name?: string;
	icon?: string | null;
	colour?: string | null;
	sort_order?: number;
	has_steps?: boolean;
	archived_at?: string | null;
};

/** A change to an issue type. `slug`, `level` and `legacy_kind` are fixed once created. */
export function checkTypePatch(
	input: unknown,
	current: { slug: string; level: number; legacy_kind?: string | null },
	now: Date = new Date(),
): Checked<TypeColumns> {
	const o = asObject(input);
	if (!o) return fail("An issue type must be an object.");
	for (const fixed of ["slug", "level", "legacy_kind"] as const) {
		if (o[fixed] !== undefined && o[fixed] !== (current[fixed] ?? null)) return fail(`An issue type's ${fixed} is fixed once it is created.`);
	}
	const columns: TypeColumns = {};
	if ("name" in o) {
		const name = checkName(o.name, 60, "An issue type");
		if (!name.ok) return name;
		columns.name = name.value;
	}
	if (o.icon !== undefined) {
		const icon = checkIcon(o.icon);
		if (!icon.ok) return icon;
		columns.icon = icon.value;
	}
	if (o.colour !== undefined) {
		const colour = checkColour(o.colour);
		if (!colour.ok) return colour;
		columns.colour = colour.value;
	}
	if (o.sort_order !== undefined) {
		const s = checkSortOrder(o.sort_order);
		if (!s.ok) return s;
		columns.sort_order = s.value;
	}
	if (o.has_steps !== undefined) {
		if (typeof o.has_steps !== "boolean") return fail("has_steps is true or false.");
		columns.has_steps = o.has_steps;
	}
	if ("archived" in o) {
		const a = archivedAt(o.archived, now);
		if (!a.ok) return a;
		columns.archived_at = a.value;
	}
	return { ok: true, value: columns };
}

// ---------------------------------------------------------------------
// Pure: label fields and labels
// ---------------------------------------------------------------------

export function checkNewLabelField(input: unknown): Checked<{ name: string; slug: string }> {
	const o = asObject(input);
	if (!o) return fail("A label field must be an object.");
	const name = checkName(o.name, 60, "A label field");
	if (!name.ok) return name;
	let slug: string;
	if (o.slug === undefined || o.slug === null || o.slug === "") {
		slug = labelFieldSlug(name.value);
		if (!slug) return fail("No slug can be made from that name: give one.");
	} else {
		if (typeof o.slug !== "string") return fail("slug must be text.");
		slug = o.slug;
	}
	const problem = labelFieldSlugProblem(slug);
	if (problem) return fail(problem);
	return { ok: true, value: { name: name.value, slug } };
}

/** A label field can be renamed and reordered; its slug is a JQL field name and stays. */
export function checkLabelFieldPatch(input: unknown): Checked<{ name?: string; sort_order?: number }> {
	const o = asObject(input);
	if (!o) return fail("A label field must be an object.");
	const columns: { name?: string; sort_order?: number } = {};
	if ("name" in o) {
		const name = checkName(o.name, 60, "A label field");
		if (!name.ok) return name;
		columns.name = name.value;
	}
	if (o.sort_order !== undefined) {
		const s = checkSortOrder(o.sort_order);
		if (!s.ok) return s;
		columns.sort_order = s.value;
	}
	return { ok: true, value: columns };
}

export type LabelColumns = { name?: string; slug?: string; colour?: string | null; archived_at?: string | null };

/** A new label (`partial: false`, the name is required) or a change to one. A name always brings its slug. */
export function checkLabel(input: unknown, opts: { partial: boolean; now?: Date }): Checked<LabelColumns> {
	const o = asObject(input);
	if (!o) return fail("A label must be an object.");
	const columns: LabelColumns = {};
	if ("name" in o || !opts.partial) {
		const name = checkName(o.name, 80, "A label");
		if (!name.ok) return name;
		columns.name = name.value;
		columns.slug = labelSlug(name.value);
	}
	if (o.colour !== undefined) {
		const colour = checkColour(o.colour);
		if (!colour.ok) return colour;
		columns.colour = colour.value;
	}
	if (opts.partial && "archived" in o) {
		const a = archivedAt(o.archived, opts.now ?? new Date());
		if (!a.ok) return a;
		columns.archived_at = a.value;
	}
	return { ok: true, value: columns };
}

// ---------------------------------------------------------------------
// Pure: saved filters
// ---------------------------------------------------------------------

export type FilterColumns = {
	name?: string;
	slug?: string;
	description?: string | null;
	jql?: string;
	query?: WorkQuery;
	shared?: boolean;
	sort_order?: number;
};

/**
 * A new saved filter (`partial: false`: name and jql required, slug derived
 * from the name) or a change to one (the slug stays, so links to
 * `?filter=<slug>` keep landing). The JQL is stored as typed beside the
 * query object it parses to. A JQL that does not parse comes back with the
 * parser's message and `pos`.
 */
export function checkFilter(input: unknown, labelFields: readonly string[], opts: { partial: boolean }): Checked<FilterColumns> {
	const o = asObject(input);
	if (!o) return fail("A saved filter must be an object.");
	const columns: FilterColumns = {};
	if ("name" in o || !opts.partial) {
		const name = checkName(o.name, 80, "A saved filter");
		if (!name.ok) return name;
		columns.name = name.value;
		if (!opts.partial) {
			const slug = filterSlug(name.value);
			if (!FILTER_SLUG_RE.test(slug)) return fail("A saved filter's name needs at least one letter or digit.");
			columns.slug = slug;
		}
	}
	if ("jql" in o || !opts.partial) {
		if (typeof o.jql !== "string") return fail("jql must be text.");
		if (o.jql.length > 4000) return fail("jql is 4000 characters at most.");
		try {
			columns.query = parseJql(o.jql, { labelFields });
		} catch (err) {
			if (err instanceof JqlError) return { ok: false, error: err.message, pos: err.pos };
			throw err;
		}
		columns.jql = o.jql.trim();
	}
	if ("description" in o && o.description !== undefined) {
		const d = checkText(o.description, 2000, "description");
		if (!d.ok) return d;
		columns.description = d.value;
	}
	if (o.shared !== undefined) {
		if (typeof o.shared !== "boolean") return fail("shared is true or false.");
		columns.shared = o.shared;
	}
	if (o.sort_order !== undefined) {
		const s = checkSortOrder(o.sort_order);
		if (!s.ok) return s;
		columns.sort_order = s.value;
	}
	return { ok: true, value: columns };
}

// ---------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------

/** The space a configuration request works in; null when `wanted` is not a space the caller can see. */
export async function spaceOf(supabase: SupabaseClient, uid: string | null, wanted: string | null | undefined): Promise<SpaceInfo | null> {
	if (wanted !== null && wanted !== undefined && !UUID_RE.test(wanted)) return null;
	return resolveSpace(supabase, uid, wanted ?? null);
}

/** The response for a failed configuration write: 403 for RLS, 409 for a clash, else 400. */
export function writeFailure(err: { message?: string; code?: string } | null, clash?: string): NextResponse {
	if (err?.code === "42501") return bad(writeErrorMessage(err), 403);
	if (err?.code === "23505" || err?.code === "23503") return bad(clash ?? writeErrorMessage(err), 409);
	return bad(writeErrorMessage(err), 400);
}

/** A write that touched no row: RLS hid it from this caller. */
export function notAllowed(): NextResponse {
	return bad("You do not have permission to change that.", 403);
}

/** How many tickets carry one of these statuses or types (deleted tickets included: the foreign key counts them too). */
export async function ticketsUsing(supabase: SupabaseClient, column: "status_id" | "type_id", ids: string[]): Promise<number> {
	if (ids.length === 0) return 0;
	const { count, error } = await supabase.from("tickets").select("id", { count: "exact", head: true }).in(column, ids);
	if (error) throw error;
	return count ?? 0;
}

export function ticketsPhrase(n: number): string {
	return n === 1 ? "1 ticket" : `${n} tickets`;
}

// ---------------------------------------------------------------------
// Issue types
// ---------------------------------------------------------------------

export const TYPE_SELECT = "id, name, slug, level, has_steps, icon, colour, sort_order, archived_at";

export async function loadTypes(supabase: SupabaseClient, spaceId: string, all = false): Promise<WorkType[]> {
	let q = supabase.from("issue_types").select(TYPE_SELECT).eq("space_id", spaceId);
	if (!all) q = q.is("archived_at", null);
	const { data, error } = await q.order("sort_order").order("name");
	if (error) throw error;
	return (data ?? []) as unknown as WorkType[];
}

// ---------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------

export const WORKFLOW_SELECT = "id, name, description, is_default, archived_at, space_id";

type RawWorkflow = { id: string; name: string; description: string | null; is_default: boolean; archived_at: string | null; space_id: string };
type RawStatus = Parameters<typeof serializeStatus>[0];

function serializeWorkflow(w: RawWorkflow, statuses: WorkStatus[]): WorkWorkflow {
	return { id: w.id, name: w.name, description: w.description, is_default: w.is_default, archived_at: w.archived_at, statuses };
}

/** A space's workflows, the default first, each with its statuses in order. */
export async function loadWorkflows(supabase: SupabaseClient, spaceId: string): Promise<WorkWorkflow[]> {
	const [workflows, statuses] = await Promise.all([
		supabase.from("ticket_workflows").select(WORKFLOW_SELECT).eq("space_id", spaceId).order("is_default", { ascending: false }).order("name"),
		supabase.from("ticket_statuses").select(STATUS_SELECT).eq("space_id", spaceId).order("sort_order").order("name"),
	]);
	if (workflows.error) throw workflows.error;
	if (statuses.error) throw statuses.error;
	const byWorkflow = new Map<string, WorkStatus[]>();
	for (const s of (statuses.data ?? []) as unknown as RawStatus[]) {
		const list = byWorkflow.get(s.workflow_id) ?? [];
		list.push(serializeStatus(s));
		byWorkflow.set(s.workflow_id, list);
	}
	return ((workflows.data ?? []) as unknown as RawWorkflow[]).map((w) => serializeWorkflow(w, byWorkflow.get(w.id) ?? []));
}

/** One workflow with its statuses, and the space it belongs to. */
export async function loadWorkflow(supabase: SupabaseClient, id: string): Promise<{ workflow: WorkWorkflow; space_id: string } | null> {
	if (!UUID_RE.test(id)) return null;
	const { data, error } = await supabase.from("ticket_workflows").select(WORKFLOW_SELECT).eq("id", id).maybeSingle();
	if (error) throw error;
	if (!data) return null;
	const w = data as unknown as RawWorkflow;
	const { data: statuses, error: stErr } = await supabase.from("ticket_statuses").select(STATUS_SELECT).eq("workflow_id", id).order("sort_order").order("name");
	if (stErr) throw stErr;
	return { workflow: serializeWorkflow(w, ((statuses ?? []) as unknown as RawStatus[]).map(serializeStatus)), space_id: w.space_id };
}

export async function loadWorkflowMap(supabase: SupabaseClient, spaceId: string): Promise<WorkflowMapRow[]> {
	const { data, error } = await supabase
		.from("ticket_workflow_map")
		.select("id, project_id, issue_type_id, workflow_id")
		.eq("space_id", spaceId)
		.order("created_at");
	if (error) throw error;
	return (data ?? []) as unknown as WorkflowMapRow[];
}

/** Write a workflow's statuses, in order, as sort_order 1..n. */
export async function insertStatuses(
	supabase: SupabaseClient,
	spaceId: string,
	workflowId: string,
	statuses: StatusValues[],
): Promise<{ message?: string; code?: string } | null> {
	const rows = statuses.map((s, i) => ({
		space_id: spaceId,
		workflow_id: workflowId,
		name: s.name,
		status_category: s.status_category,
		resolution: s.status_category === "done" ? s.resolution : null,
		colour: s.colour,
		sort_order: i + 1,
	}));
	const { error } = await supabase.from("ticket_statuses").insert(rows);
	return error ?? null;
}

// ---------------------------------------------------------------------
// Label fields
// ---------------------------------------------------------------------

export const LABEL_FIELD_SELECT = "id, name, slug, is_system, sort_order";
export const LABEL_SELECT = "id, field_id, name, slug, colour, archived_at";

type RawField = { id: string; name: string; slug: string; is_system: boolean; sort_order: number };
type RawLabel = { id: string; field_id: string; name: string; slug: string; colour: string | null; archived_at: string | null };

export type LabelOptions = { all?: boolean; field?: string | null; q?: string | null };

/** A space's label fields with their labels. `field` narrows to one slug, `q` to labels whose name contains it. */
export async function loadLabelFields(supabase: SupabaseClient, spaceId: string, opts: LabelOptions = {}): Promise<WorkLabelField[]> {
	let fq = supabase.from("label_fields").select(LABEL_FIELD_SELECT).eq("space_id", spaceId);
	if (opts.field) fq = fq.eq("slug", opts.field.trim().toLowerCase());
	const { data: fields, error } = await fq.order("sort_order").order("name");
	if (error) throw error;
	const rows = (fields ?? []) as unknown as RawField[];
	if (rows.length === 0) return [];

	let lq = supabase.from("labels").select(LABEL_SELECT).in("field_id", rows.map((f) => f.id));
	if (!opts.all) lq = lq.is("archived_at", null);
	const needle = (opts.q ?? "").trim();
	if (needle) lq = lq.ilike("name", `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
	const { data: labels, error: lErr } = await lq.order("name").limit(2000);
	if (lErr) throw lErr;

	const byField = new Map<string, WorkLabelField["labels"]>();
	for (const l of (labels ?? []) as unknown as RawLabel[]) {
		const list = byField.get(l.field_id) ?? [];
		list.push({ id: l.id, name: l.name, slug: l.slug, colour: l.colour, archived_at: l.archived_at });
		byField.set(l.field_id, list);
	}
	return rows.map((f) => ({ id: f.id, name: f.name, slug: f.slug, is_system: f.is_system, sort_order: f.sort_order, labels: byField.get(f.id) ?? [] }));
}

// ---------------------------------------------------------------------
// Saved filters
// ---------------------------------------------------------------------

export const FILTER_SELECT = "id, name, slug, description, jql, query, shared, is_system, sort_order, created_by, space_id";

export type RawFilter = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	jql: string;
	query: unknown;
	shared: boolean;
	is_system: boolean;
	sort_order: number;
	created_by: string | null;
	space_id: string;
};

export function serializeFilter(r: RawFilter, uid: string | null): SavedFilter {
	return {
		id: r.id,
		name: r.name,
		slug: r.slug,
		description: r.description,
		jql: r.jql,
		query: r.query,
		shared: r.shared,
		is_system: r.is_system,
		sort_order: r.sort_order,
		mine: !!uid && r.created_by === uid,
	};
}

/** The shared filters of a space plus the caller's own. */
export async function loadFilters(supabase: SupabaseClient, spaceId: string, uid: string | null): Promise<SavedFilter[]> {
	const { data, error } = await supabase.from("saved_filters").select(FILTER_SELECT).eq("space_id", spaceId).order("sort_order").order("name");
	if (error) throw error;
	return ((data ?? []) as unknown as RawFilter[])
		// the restrictive policy (0145) already hides other people's private filters
		.filter((r) => r.shared || (!!uid && r.created_by === uid))
		.map((r) => serializeFilter(r, uid));
}

/** One filter by id, or by slug within a space. */
export async function loadFilter(supabase: SupabaseClient, ref: string, spaceId: string | null): Promise<RawFilter | null> {
	const r = ref.trim();
	let q = supabase.from("saved_filters").select(FILTER_SELECT);
	if (UUID_RE.test(r)) q = q.eq("id", r);
	else if (FILTER_SLUG_RE.test(r.toLowerCase()) && spaceId) q = q.eq("slug", r.toLowerCase()).eq("space_id", spaceId);
	else return null;
	const { data, error } = await q.limit(1);
	if (error) throw error;
	return ((data ?? [])[0] as unknown as RawFilter | undefined) ?? null;
}

// ---------------------------------------------------------------------
// People
// ---------------------------------------------------------------------

/**
 * Who a ticket can be assigned to: the caller plus every member of the
 * caller's teams (RLS on team_members limits the rows), the caller first.
 */
export async function loadPeople(supabase: SupabaseClient, uid: string | null): Promise<{ me: WorkPerson | null; people: WorkPerson[] }> {
	const ids = new Set<string>();
	if (uid) ids.add(uid);
	const { data: members } = await supabase.from("team_members").select("user_id").limit(500);
	for (const m of (members ?? []) as Array<{ user_id: string | null }>) if (m.user_id) ids.add(m.user_id);
	const names = await namesFor(supabase, [...ids]);
	const people = [...ids].map((id) => ({ id, name: names.get(id) ?? (id === uid ? "Me" : id.slice(0, 8)) }));
	people.sort((a, b) => Number(b.id === uid) - Number(a.id === uid) || a.name.localeCompare(b.name));
	return { me: people.find((p) => p.id === uid) ?? null, people };
}
