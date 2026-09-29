/**
 * Work — the query object (claude/spec-work.md §3.1).
 *
 * One shape for every way of asking for tickets: the filter bar builds it,
 * the JQL parser compiles to it, saved filters store it, and
 * `public.work_search` (0147) executes it under the caller's RLS.
 * Isomorphic: safe in client and server code.
 */

export const CMPS = ["=", "!=", "in", "not in", "~", "<", ">", "<=", ">=", "is empty", "is not empty"] as const;
export type Cmp = (typeof CMPS)[number];

export type Value = string | number;

export type Leaf = { field: string; cmp: Cmp; value?: Value | Value[] };
export type Group = { op: "and" | "or"; nodes: Node[] };
export type Not = { op: "not"; node: Node };
export type Node = Leaf | Group | Not;

export type OrderBy = { field: string; dir: "asc" | "desc" };
export type WorkQuery = { where: Node | null; orderBy: OrderBy[] };

export const EMPTY_QUERY: WorkQuery = { where: null, orderBy: [] };

export type FieldKind = "ref" | "category" | "number" | "date" | "text" | "label";

/** The fixed fields, by canonical name. Anything else is a label field, by slug. */
export const FIELD_KIND: Record<string, FieldKind> = {
	project: "ref",
	type: "ref",
	status: "ref",
	assignee: "ref",
	reporter: "ref",
	component: "ref",
	epic: "ref",
	sprint: "ref",
	key: "ref",
	statusCategory: "category",
	points: "number",
	created: "date",
	updated: "date",
	started: "date",
	resolved: "date",
	due: "date",
	text: "text",
	label: "label",
	location: "label",
	tool: "label",
};

export const FIELD_LABEL: Record<string, string> = {
	project: "Project",
	type: "Type",
	status: "Status",
	statusCategory: "Status category",
	assignee: "Assignee",
	reporter: "Reporter",
	label: "Label",
	location: "Location",
	tool: "Tool",
	component: "Component",
	epic: "Epic",
	sprint: "Sprint",
	points: "Points",
	created: "Created",
	updated: "Updated",
	started: "Started",
	resolved: "Resolved",
	due: "Due",
	text: "Text",
	key: "Key",
};

export const ORDER_FIELDS = [
	"created",
	"updated",
	"started",
	"resolved",
	"due",
	"points",
	"rank",
	"key",
	"title",
	"status",
	"statusCategory",
	"type",
	"project",
	"assignee",
	"reporter",
	"sprint",
	"epic",
] as const;

const CANONICAL = new Map<string, string>(
	[...Object.keys(FIELD_KIND), ...ORDER_FIELDS, "summary"].map((f) => [f.toLowerCase(), f === "summary" ? "title" : f]),
);
CANONICAL.set("labels", "label");
CANONICAL.set("category", "statusCategory");
CANONICAL.set("duedate", "due");
CANONICAL.set("issuetype", "type");

const LABEL_SLUG_RE = /^[a-z][a-z0-9_]{0,31}$/;

/** The canonical name of a field, or null when it is neither fixed nor a plausible label field. */
export function canonicalField(name: string, labelFields: readonly string[] = []): string | null {
	const lower = name.trim().toLowerCase();
	const fixed = CANONICAL.get(lower);
	if (fixed) return fixed;
	if (labelFields.includes(lower) && LABEL_SLUG_RE.test(lower)) return lower;
	return null;
}

export function fieldKind(field: string): FieldKind {
	return FIELD_KIND[field] ?? "label";
}

/** Which comparators a kind of field takes. */
export function cmpsFor(kind: FieldKind): readonly Cmp[] {
	switch (kind) {
		case "text":
			return ["~"];
		case "number":
		case "date":
			return ["=", "!=", "<", ">", "<=", ">=", "in", "not in", "is empty", "is not empty"];
		case "category":
			return ["=", "!=", "in", "not in"];
		default:
			return ["=", "!=", "in", "not in", "~", "is empty", "is not empty"];
	}
}

export const STATUS_CATEGORIES = ["todo", "in_progress", "done"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];
export const STATUS_CATEGORY_LABEL: Record<StatusCategory, string> = {
	todo: "To Do",
	in_progress: "In Progress",
	done: "Done",
};

export function normaliseStatusCategory(v: string): StatusCategory | null {
	const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
	if (s === "todo" || s === "to_do") return "todo";
	if (s === "in_progress" || s === "inprogress" || s === "doing") return "in_progress";
	if (s === "done") return "done";
	return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_RE = /^[+-]\d{1,4}[dwmy]$/i;
const DATE_WORDS = ["today", "now", "tomorrow", "yesterday"];

export function isDateValue(v: string): boolean {
	const s = v.trim().toLowerCase();
	if (DATE_WORDS.includes(s) || RELATIVE_RE.test(s)) return true;
	if (!DATE_RE.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isLeaf(n: Node): n is Leaf {
	return !("op" in n);
}

export type QueryError = { message: string; path: string };

/**
 * Check a query object and return it in canonical form (field names, status
 * category values, numbers as numbers). This is what the API runs before
 * handing anything to the database; the database checks again.
 */
export function validateQuery(
	input: unknown,
	labelFields: readonly string[] = [],
): { ok: true; query: WorkQuery } | { ok: false; errors: QueryError[] } {
	const errors: QueryError[] = [];
	if (input === null || input === undefined) return { ok: true, query: { where: null, orderBy: [] } };
	if (typeof input !== "object" || Array.isArray(input)) {
		return { ok: false, errors: [{ message: "The query must be an object.", path: "" }] };
	}
	const raw = input as { where?: unknown; orderBy?: unknown };

	let count = 0;
	function node(n: unknown, path: string, depth: number): Node | null {
		if (depth > 12) {
			errors.push({ message: "The query is nested too deeply.", path });
			return null;
		}
		if (!n || typeof n !== "object" || Array.isArray(n)) {
			errors.push({ message: "A clause must be an object.", path });
			return null;
		}
		if (++count > 200) {
			errors.push({ message: "The query has too many clauses.", path });
			return null;
		}
		const o = n as Record<string, unknown>;
		if (typeof o.op === "string") {
			const op = o.op.toLowerCase();
			if (op === "and" || op === "or") {
				if (!Array.isArray(o.nodes) || o.nodes.length === 0) {
					errors.push({ message: `${op.toUpperCase()} needs at least one clause.`, path });
					return null;
				}
				const nodes = o.nodes.map((c, i) => node(c, `${path}.nodes[${i}]`, depth + 1)).filter((c): c is Node => c !== null);
				return { op, nodes };
			}
			if (op === "not") {
				const inner = node(o.node, `${path}.node`, depth + 1);
				return inner ? { op: "not", node: inner } : null;
			}
			errors.push({ message: `Unknown operator "${o.op}".`, path });
			return null;
		}
		return leaf(o, path);
	}

	function leaf(o: Record<string, unknown>, path: string): Leaf | null {
		if (typeof o.field !== "string") {
			errors.push({ message: "A clause needs a field.", path });
			return null;
		}
		const field = canonicalField(o.field, labelFields);
		if (!field || !(field in FIELD_KIND || labelFields.includes(field))) {
			errors.push({ message: `Unknown field "${o.field}".`, path });
			return null;
		}
		const kind = fieldKind(field);
		const cmp = typeof o.cmp === "string" ? (o.cmp.trim().toLowerCase().replace(/\s+/g, " ") as Cmp) : null;
		if (!cmp || !(CMPS as readonly string[]).includes(cmp)) {
			errors.push({ message: `Unknown comparison "${String(o.cmp)}".`, path });
			return null;
		}
		if (!cmpsFor(kind).includes(cmp)) {
			errors.push({ message: `${FIELD_LABEL[field] ?? field} does not support ${cmp.toUpperCase()}.`, path });
			return null;
		}
		if (cmp === "is empty" || cmp === "is not empty") return { field, cmp };

		const list = cmp === "in" || cmp === "not in";
		const values = (Array.isArray(o.value) ? o.value : [o.value]).filter(
			(v): v is Value => (typeof v === "string" && v.trim() !== "") || (typeof v === "number" && Number.isFinite(v)),
		);
		if (values.length === 0) {
			errors.push({ message: `${FIELD_LABEL[field] ?? field} needs a value.`, path });
			return null;
		}
		if (!list && values.length > 1) {
			errors.push({ message: `${FIELD_LABEL[field] ?? field} ${cmp} takes one value.`, path });
			return null;
		}
		if (values.length > 100) {
			errors.push({ message: `Too many values for ${FIELD_LABEL[field] ?? field}.`, path });
			return null;
		}

		const out: Value[] = [];
		for (const v of values) {
			if (kind === "number") {
				const n = typeof v === "number" ? v : Number(v);
				if (!Number.isFinite(n)) {
					errors.push({ message: `"${v}" is not a number.`, path });
					return null;
				}
				out.push(n);
			} else if (kind === "date") {
				if (!isDateValue(String(v))) {
					errors.push({ message: `"${v}" is not a date. Use YYYY-MM-DD, today, or a relative date such as -7d.`, path });
					return null;
				}
				out.push(String(v).trim().toLowerCase());
			} else if (kind === "category") {
				const c = normaliseStatusCategory(String(v));
				if (!c) {
					errors.push({ message: "Status category is one of To Do, In Progress, Done.", path });
					return null;
				}
				out.push(c);
			} else {
				out.push(String(v).trim());
			}
		}
		return { field, cmp, value: list ? out : out[0] };
	}

	const where = raw.where === null || raw.where === undefined ? null : node(raw.where, "where", 0);

	const orderBy: OrderBy[] = [];
	if (raw.orderBy !== undefined && raw.orderBy !== null) {
		if (!Array.isArray(raw.orderBy)) {
			errors.push({ message: "orderBy must be a list.", path: "orderBy" });
		} else if (raw.orderBy.length > 5) {
			errors.push({ message: "Order by five fields at most.", path: "orderBy" });
		} else {
			raw.orderBy.forEach((o, i) => {
				const r = (o ?? {}) as Record<string, unknown>;
				const field = typeof r.field === "string" ? canonicalField(r.field) : null;
				if (!field || !(ORDER_FIELDS as readonly string[]).includes(field)) {
					errors.push({ message: `Cannot order by "${String(r.field)}".`, path: `orderBy[${i}]` });
					return;
				}
				const dir = typeof r.dir === "string" ? r.dir.toLowerCase() : "asc";
				if (dir !== "asc" && dir !== "desc") {
					errors.push({ message: "Order direction is ASC or DESC.", path: `orderBy[${i}]` });
					return;
				}
				orderBy.push({ field, dir });
			});
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, query: { where, orderBy } };
}

// ---------------------------------------------------------------------
// Printing a query back as JQL
// ---------------------------------------------------------------------

const BARE_RE = /^[A-Za-z0-9_.@:+-]+$/;
const RESERVED = new Set(["and", "or", "not", "in", "is", "empty", "null", "order", "by", "asc", "desc"]);

export function quoteValue(v: Value): string {
	if (typeof v === "number") return String(v);
	if (BARE_RE.test(v) && !RESERVED.has(v.toLowerCase())) return v;
	return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function printValue(field: string, v: Value): string {
	if (fieldKind(field) === "category" && typeof v === "string") {
		const c = normaliseStatusCategory(v);
		if (c) return quoteValue(STATUS_CATEGORY_LABEL[c]);
	}
	return quoteValue(v);
}

function printNode(n: Node, parent: "and" | "or" | "not" | null): string {
	if (isLeaf(n)) {
		if (n.cmp === "is empty") return `${n.field} IS EMPTY`;
		if (n.cmp === "is not empty") return `${n.field} IS NOT EMPTY`;
		if (n.cmp === "in" || n.cmp === "not in") {
			const list = (Array.isArray(n.value) ? n.value : [n.value as Value]).map((v) => printValue(n.field, v)).join(", ");
			return `${n.field} ${n.cmp.toUpperCase()} (${list})`;
		}
		const v = Array.isArray(n.value) ? n.value[0] : (n.value as Value);
		return `${n.field} ${n.cmp} ${printValue(n.field, v)}`;
	}
	if (n.op === "not") return `NOT ${printNode(n.node, "not")}`;
	if (n.nodes.length === 1) return printNode(n.nodes[0], parent);
	const s = n.nodes.map((c) => printNode(c, n.op)).join(n.op === "and" ? " AND " : " OR ");
	// AND binds tighter than OR; NOT tighter than both
	const needs = parent === "not" || (parent === "and" && n.op === "or");
	return needs ? `(${s})` : s;
}

export function toJql(q: WorkQuery): string {
	const where = q.where ? printNode(q.where, null) : "";
	const order = q.orderBy.length > 0 ? `ORDER BY ${q.orderBy.map((o) => `${o.field} ${o.dir.toUpperCase()}`).join(", ")}` : "";
	return [where, order].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------
// The filter bar's view of a query
// ---------------------------------------------------------------------

/** What the structured bar can show: one value list per field, ANDed, plus free text. */
export type BarState = {
	values: Record<string, string[]>;
	text: string;
	orderBy: OrderBy[];
};

export const EMPTY_BAR: BarState = { values: {}, text: "", orderBy: [] };

export function barToQuery(bar: BarState): WorkQuery {
	const nodes: Node[] = [];
	for (const [field, values] of Object.entries(bar.values)) {
		const vs = values.filter((v) => v.trim() !== "");
		if (vs.length === 0) continue;
		nodes.push(vs.length === 1 ? { field, cmp: "=", value: vs[0] } : { field, cmp: "in", value: vs });
	}
	if (bar.text.trim()) nodes.push({ field: "text", cmp: "~", value: bar.text.trim() });
	return {
		where: nodes.length === 0 ? null : nodes.length === 1 ? nodes[0] : { op: "and", nodes },
		orderBy: bar.orderBy,
	};
}

/**
 * The bar state for a query, or null when the query is richer than the bar
 * can show (an OR, a NOT, a comparison) — the UI then stays in JQL mode.
 */
export function queryToBar(q: WorkQuery): BarState | null {
	const bar: BarState = { values: {}, text: "", orderBy: q.orderBy };
	if (!q.where) return bar;
	const leaves = isLeaf(q.where) ? [q.where] : q.where.op === "and" ? q.where.nodes : null;
	if (!leaves) return null;
	for (const n of leaves) {
		if (!isLeaf(n)) return null;
		if (n.field === "text" && n.cmp === "~") {
			if (bar.text) return null;
			bar.text = String(n.value ?? "");
			continue;
		}
		if (n.cmp !== "=" && n.cmp !== "in") return null;
		if (fieldKind(n.field) === "number" || fieldKind(n.field) === "date") return null;
		if (bar.values[n.field]) return null;
		bar.values[n.field] = (Array.isArray(n.value) ? n.value : [n.value as Value]).map(String);
	}
	return bar;
}

/** AND a clause onto a query (a board scoping a saved filter to its project, say). */
export function andWhere(q: WorkQuery, extra: Node): WorkQuery {
	if (!q.where) return { ...q, where: extra };
	if (!isLeaf(q.where) && q.where.op === "and") return { ...q, where: { op: "and", nodes: [...q.where.nodes, extra] } };
	return { ...q, where: { op: "and", nodes: [q.where, extra] } };
}
