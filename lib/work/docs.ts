/**
 * Docs — server helpers and shapes for /api/work/docs/* (claude/spec-work.md
 * §2.6, §7; W9).
 *
 * Everything runs through the caller's user client, so RLS is the wall: a
 * restricted page and its descendants simply are not there for anyone but
 * the creator and the people on its list. The database numbers versions and
 * writes the version rows (0146); nothing here inserts one.
 *
 * The top half is pure (the tree, positions, validation, excerpts) and is
 * covered by docs.test.ts; the bottom half reads and writes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ticketKeyFilter } from "@/lib/tickets/categories";
import { checkDoc, docToText, EMPTY_DOC, isDoc, newRefs, refsIn, type Doc } from "./doc";
import type { WorkEvent } from "./notify";
import type { StatusCategory } from "./query";
import { namesFor, resolveSpace, UUID_RE } from "./server";
import type { WorkPerson } from "./types";

// ---------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------

export type DocSpace = {
	id: string;
	key: string;
	name: string;
	description: string | null;
	icon: string | null;
	home_page_id: string | null;
	archived_at: string | null;
	space_id: string;
	created_at: string;
	updated_at: string;
	/** Pages that are not archived. */
	page_count: number;
};

export type DocPageSummary = {
	id: string;
	doc_space_id: string;
	parent_id: string | null;
	title: string;
	position: number;
	restricted: boolean;
	archived_at: string | null;
	updated_at: string;
	has_children: boolean;
};

export type TreeNode<T> = T & { has_children: boolean; children: Array<TreeNode<T>> };
export type DocTreeNode = TreeNode<DocPageSummary>;

export type LinkSource = "manual" | "mention";

export type DocTicketLink = {
	id: string;
	key: string | null;
	title: string;
	status_name: string | null;
	status_category: StatusCategory | null;
	source: LinkSource;
};

export type DocRestrictionPerson = { id: string; name: string; can_edit: boolean };

export type DocRestriction = {
	/** This page's own switch. */
	restricted: boolean;
	/** The nearest restricted page above this one, when there is one. */
	inherited_from: string | null;
	/** The list in force: this page's when it is restricted, else the inherited one. */
	people: DocRestrictionPerson[];
	/** Only the page's creator sets its restriction. */
	can_manage: boolean;
};

export type DocPage = DocPageSummary & {
	doc_space_key: string;
	body: Doc;
	body_text: string;
	version: number;
	created_at: string;
	created_by: WorkPerson | null;
	updated_by: WorkPerson | null;
	/** Root first; the page itself is not in it. */
	breadcrumbs: Array<{ id: string; title: string }>;
	links: { tickets: DocTicketLink[] };
	restriction: DocRestriction;
};

export type DocVersion = {
	version: number;
	title: string;
	note: string | null;
	created_at: string;
	author: WorkPerson | null;
	/** Only when one version is asked for. */
	body?: unknown;
	body_text?: string;
};

export type DocTemplate = {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	title: string | null;
	body: Doc;
	origin: "ui" | "repo";
	version: number;
	shared: boolean;
	created_at: string;
	updated_at: string;
};

export type DocSearchHit = DocPageSummary & { doc_space_key: string; excerpt: string };

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

// ---------------------------------------------------------------------
// Pure: the tree
// ---------------------------------------------------------------------

type TreeInput = { id: string; parent_id: string | null; position: number; title: string };

function byPosition(a: TreeInput, b: TreeInput): number {
	return a.position - b.position || a.title.localeCompare(b.title, "en-GB", { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/**
 * A flat list as a nested tree, ordered by position then title. A page whose
 * parent is not in the list (hidden, archived or gone) becomes a root, so
 * nothing the caller can see is ever lost from the sidebar.
 */
export function buildTree<T extends TreeInput>(pages: T[]): Array<TreeNode<T>> {
	const nodes = new Map<string, TreeNode<T>>();
	for (const p of pages) {
		if (!nodes.has(p.id)) nodes.set(p.id, { ...p, has_children: false, children: [] });
	}
	const roots: Array<TreeNode<T>> = [];
	for (const n of nodes.values()) {
		const parent = n.parent_id && n.parent_id !== n.id ? nodes.get(n.parent_id) : undefined;
		if (parent) parent.children.push(n);
		else roots.push(n);
	}

	// the database refuses a loop; if one is handed in anyway, open it rather than drop its pages
	const reached = new Set<string>();
	const mark = (n: TreeNode<T>): void => {
		if (reached.has(n.id)) return;
		reached.add(n.id);
		for (const c of n.children) mark(c);
	};
	for (const r of roots) mark(r);
	for (const n of [...nodes.values()].sort(byPosition)) {
		if (reached.has(n.id)) continue;
		const parent = n.parent_id ? nodes.get(n.parent_id) : undefined;
		if (parent) parent.children = parent.children.filter((c) => c.id !== n.id);
		roots.push(n);
		mark(n);
	}

	const tidy = (list: Array<TreeNode<T>>): Array<TreeNode<T>> => {
		list.sort(byPosition);
		for (const n of list) {
			n.has_children = n.children.length > 0;
			tidy(n.children);
		}
		return list;
	};
	return tidy(roots);
}

/** The position that puts a new page at the end of its siblings. */
export function nextPosition(siblings: Array<{ position: number | null | undefined }>): number {
	let max = -1;
	for (const s of siblings) {
		const p = Number(s.position);
		if (Number.isFinite(p) && p > max) max = p;
	}
	return Math.floor(max) + 1;
}

/** Every page below `id`, nearest first. */
export function descendantsOf(pages: Array<{ id: string; parent_id: string | null }>, id: string): string[] {
	const kids = new Map<string, string[]>();
	for (const p of pages) {
		if (!p.parent_id) continue;
		const list = kids.get(p.parent_id);
		if (list) list.push(p.id);
		else kids.set(p.parent_id, [p.id]);
	}
	const out: string[] = [];
	const seen = new Set<string>([id]);
	const queue = [id];
	while (queue.length > 0) {
		const cur = queue.shift() as string;
		for (const k of kids.get(cur) ?? []) {
			if (seen.has(k)) continue;
			seen.add(k);
			out.push(k);
			queue.push(k);
		}
	}
	return out;
}

/**
 * Where a moved page lands: the destination's siblings with the page put in
 * at `index` (the end when none is given), as the ids in their new order.
 */
export function placeAmong(siblings: TreeInput[], pageId: string, index?: number | null): string[] {
	const others = siblings.filter((s) => s.id !== pageId).sort(byPosition).map((s) => s.id);
	const at = index === null || index === undefined ? others.length : Math.min(Math.max(Math.floor(index), 0), others.length);
	others.splice(at, 0, pageId);
	return others;
}

// ---------------------------------------------------------------------
// Pure: validation
// ---------------------------------------------------------------------

export const DOC_SPACE_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export const TEMPLATE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const TITLE_MAX = 300;

export type DocSpaceWrite = { key?: string; name?: string; description?: string | null; icon?: string | null };

function optionalText(v: unknown, max: number, what: string): Checked<string | null> {
	if (v === null) return { ok: true, value: null };
	if (typeof v !== "string") return { ok: false, error: `${what} must be text.` };
	const t = v.trim();
	if (t.length > max) return { ok: false, error: `${what} is at most ${max} characters.` };
	return { ok: true, value: t || null };
}

/**
 * What a doc space create or patch may write. The key is upper-cased and
 * only read on create: a key is in every page's URL, so it does not change.
 */
export function checkDocSpace(body: Record<string, unknown>, mode: "create" | "patch"): Checked<DocSpaceWrite> {
	const value: DocSpaceWrite = {};
	if (mode === "create") {
		const key = typeof body.key === "string" ? body.key.trim().toUpperCase() : "";
		if (!key) return { ok: false, error: "A doc space needs a key." };
		if (!DOC_SPACE_KEY_RE.test(key)) return { ok: false, error: "A key is 2 to 10 letters or digits, starting with a letter." };
		value.key = key;
	}
	if (mode === "create" || "name" in body) {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name) return { ok: false, error: "A doc space needs a name." };
		if (name.length > 120) return { ok: false, error: "A name is at most 120 characters." };
		value.name = name;
	}
	if ("description" in body && body.description !== undefined) {
		const d = optionalText(body.description, 2000, "description");
		if (!d.ok) return d;
		value.description = d.value;
	}
	if ("icon" in body && body.icon !== undefined) {
		const i = optionalText(body.icon, 40, "icon");
		if (!i.ok) return i;
		value.icon = i.value;
	}
	return { ok: true, value };
}

export type PageWrite = { title?: string; body?: Doc; body_text?: string };

/**
 * The title and body of a page write. The plain text is always derived
 * here, from the document; whatever text a client sends is ignored.
 */
export function checkPageWrite(body: Record<string, unknown>, mode: "create" | "patch"): Checked<PageWrite> {
	const value: PageWrite = {};
	if (mode === "create" || "title" in body) {
		if (typeof body.title !== "string") return { ok: false, error: "A page needs a title." };
		const title = body.title.trim();
		if (!title) return { ok: false, error: "A page needs a title." };
		if (title.length > TITLE_MAX) return { ok: false, error: `A title is at most ${TITLE_MAX} characters.` };
		value.title = title;
	}
	if ("body" in body && body.body !== undefined && body.body !== null) {
		const problem = checkDoc(body.body);
		if (problem) return { ok: false, error: problem };
		value.body = body.body as Doc;
		value.body_text = docToText(body.body);
	} else if (mode === "create" || "body" in body) {
		if (mode === "patch") return { ok: false, error: "body must be a document." };
		value.body = EMPTY_DOC;
		value.body_text = "";
	}
	return { ok: true, value };
}

export type ParentRow = { id: string; parent_id: string | null; doc_space_id: string };

/**
 * May `pageId` sit under `parentId`? `pages` needs to hold the parent and
 * the pages above it. The database refuses the same things (0146); this
 * says why first. Null when it is fine.
 */
export function checkParent(pages: ParentRow[], pageId: string | null, parentId: string | null, docSpaceId: string): string | null {
	if (parentId === null) return null;
	if (pageId && parentId === pageId) return "A page cannot be its own parent.";
	const byId = new Map(pages.map((p) => [p.id, p]));
	const parent = byId.get(parentId);
	if (!parent) return "No such parent page.";
	if (parent.doc_space_id !== docSpaceId) return "A page and its parent must be in the same doc space.";
	if (!pageId) return null;
	let cur: ParentRow | undefined = parent;
	for (let depth = 0; cur && depth < 64; depth += 1) {
		if (cur.id === pageId) return "A page cannot be moved under one of its own descendants.";
		cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
	}
	return null;
}

export function checkPosition(v: unknown): Checked<number> {
	if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100_000) return { ok: false, error: "position is a whole number, 0 or more." };
	return { ok: true, value: v };
}

/** A slug from a name: lower case, hyphens, at most 48 characters. */
export function slugify(s: string): string {
	return (
		s
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 48)
			.replace(/-+$/g, "") || "template"
	);
}

/** A short piece of `text` around the first place `q` appears; the opening of the text when it does not. */
export function excerptAround(text: string, q: string, radius = 80): string {
	const flat = text.replace(/\s+/g, " ").trim();
	if (!flat) return "";
	const needle = q.replace(/\s+/g, " ").trim().toLowerCase();
	const at = needle ? flat.toLowerCase().indexOf(needle) : -1;
	if (at < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}…` : flat;
	const from = Math.max(0, at - radius);
	const to = Math.min(flat.length, at + needle.length + radius);
	return `${from > 0 ? "…" : ""}${flat.slice(from, to).trim()}${to < flat.length ? "…" : ""}`;
}

/** Escape what LIKE reads as a wildcard, so a search is a plain "contains". */
export function likePattern(q: string): string {
	// PostgREST reads * as %, and it cannot be escaped: a star is searched for as a space
	return `%${q.replace(/\*/g, " ").replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ---------------------------------------------------------------------
// Doc spaces
// ---------------------------------------------------------------------

export const DOC_SPACE_SELECT = "id, key, name, description, icon, home_page_id, archived_at, space_id, created_at, updated_at";

type RawDocSpace = Omit<DocSpace, "page_count">;

export async function pageCount(supabase: SupabaseClient, docSpaceId: string): Promise<number> {
	const { count, error } = await supabase.from("doc_pages").select("id", { count: "exact", head: true }).eq("doc_space_id", docSpaceId).is("archived_at", null);
	if (error) throw error;
	return count ?? 0;
}

export async function withPageCounts(supabase: SupabaseClient, rows: RawDocSpace[]): Promise<DocSpace[]> {
	const counts = await Promise.all(rows.map((r) => pageCount(supabase, r.id)));
	return rows.map((r, i) => ({ ...r, page_count: counts[i] }));
}

/**
 * A doc space by id or key. A key is unique within a space, so someone in
 * several spaces may see the same key twice: `wanted` (a space id) picks
 * one, else the caller's own space wins.
 */
export async function resolveDocSpace(supabase: SupabaseClient, uid: string | null, ref: string, wanted?: string | null): Promise<RawDocSpace | null> {
	const r = ref.trim();
	if (!r) return null;
	if (UUID_RE.test(r)) {
		const { data } = await supabase.from("doc_spaces").select(DOC_SPACE_SELECT).eq("id", r).maybeSingle();
		return (data as RawDocSpace | null) ?? null;
	}
	const key = r.toUpperCase();
	if (!DOC_SPACE_KEY_RE.test(key)) return null;
	let q = supabase.from("doc_spaces").select(DOC_SPACE_SELECT).eq("key", key);
	if (wanted && UUID_RE.test(wanted)) q = q.eq("space_id", wanted);
	const { data } = await q.order("created_at").limit(20);
	const rows = (data ?? []) as RawDocSpace[];
	if (rows.length <= 1) return rows[0] ?? null;
	const own = await resolveSpace(supabase, uid);
	return rows.find((d) => d.space_id === own?.id) ?? rows[0];
}

// ---------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------

export const PAGE_SUMMARY_SELECT = "id, doc_space_id, parent_id, title, position, restricted, archived_at, updated_at";
export const PAGE_SELECT = `${PAGE_SUMMARY_SELECT}, space_id, body, body_text, version, created_by, updated_by, created_at`;

export type RawSummary = Omit<DocPageSummary, "has_children">;

export type RawPage = RawSummary & {
	space_id: string;
	body: unknown;
	body_text: string;
	version: number;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
};

export function toSummary(r: RawSummary, hasChildren: boolean): DocPageSummary {
	return {
		id: r.id,
		doc_space_id: r.doc_space_id,
		parent_id: r.parent_id,
		title: r.title,
		position: r.position,
		restricted: r.restricted,
		archived_at: r.archived_at,
		updated_at: r.updated_at,
		has_children: hasChildren,
	};
}

/** One page's row, as the caller may see it. */
export async function pageRow(supabase: SupabaseClient, id: string): Promise<RawPage | null> {
	if (!UUID_RE.test(id)) return null;
	const { data, error } = await supabase.from("doc_pages").select(PAGE_SELECT).eq("id", id).maybeSingle();
	if (error) throw error;
	return (data as RawPage | null) ?? null;
}

/** Every page of a doc space the caller can see, read a thousand at a time (the API's row cap). */
export async function pagesOf(supabase: SupabaseClient, docSpaceId: string): Promise<RawSummary[]> {
	const out: RawSummary[] = [];
	for (let from = 0; from < 50_000; from += 1000) {
		const { data, error } = await supabase
			.from("doc_pages")
			.select(PAGE_SUMMARY_SELECT)
			.eq("doc_space_id", docSpaceId)
			.order("position")
			.order("id")
			.range(from, from + 999);
		if (error) throw error;
		const rows = (data ?? []) as RawSummary[];
		out.push(...rows);
		if (rows.length < 1000) break;
	}
	return out;
}

/** The tree of a doc space. Archived pages, and everything under one, are left out unless asked for. */
export async function treeOf(supabase: SupabaseClient, docSpaceId: string, withArchived = false): Promise<DocTreeNode[]> {
	const all = await pagesOf(supabase, docSpaceId);
	let rows = all;
	if (!withArchived) {
		const gone = new Set<string>();
		for (const p of all) {
			if (!p.archived_at || gone.has(p.id)) continue;
			gone.add(p.id);
			for (const d of descendantsOf(all, p.id)) gone.add(d);
		}
		rows = all.filter((p) => !gone.has(p.id));
	}
	return buildTree(rows.map((r) => toSummary(r, false)));
}

export type ChainRow = { id: string; parent_id: string | null; title: string; doc_space_id: string; restricted: boolean; archived_at: string | null; created_by: string | null };

/** A page and the pages above it, nearest first. Whoever can see a page can see what is above it. */
export async function chainOf(supabase: SupabaseClient, id: string): Promise<ChainRow[]> {
	const out: ChainRow[] = [];
	const seen = new Set<string>();
	let cur: string | null = id;
	while (cur && !seen.has(cur) && out.length < 64) {
		seen.add(cur);
		const { data, error } = await supabase.from("doc_pages").select("id, parent_id, title, doc_space_id, restricted, archived_at, created_by").eq("id", cur).maybeSingle();
		if (error) throw error;
		if (!data) break;
		const row = data as ChainRow;
		out.push(row);
		cur = row.parent_id;
	}
	return out;
}

/** The page's tickets, by key. A deleted ticket is left out. */
export async function pageTickets(supabase: SupabaseClient, pageId: string): Promise<DocTicketLink[]> {
	const { data, error } = await supabase
		.from("doc_page_links")
		.select("source, ticket:tickets(id, ticket_key, title, deleted_at, status:ticket_statuses(name, status_category))")
		.eq("page_id", pageId);
	if (error) throw error;
	type One<T> = T | T[] | null;
	type Row = {
		source: LinkSource;
		ticket: One<{ id: string; ticket_key: string | null; title: string; deleted_at: string | null; status: One<{ name: string; status_category: StatusCategory }> }>;
	};
	const pick = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
	const out: DocTicketLink[] = [];
	for (const r of (data ?? []) as unknown as Row[]) {
		const t = pick(r.ticket);
		if (!t || t.deleted_at) continue;
		const s = pick(t.status);
		out.push({ id: t.id, key: t.ticket_key, title: t.title, status_name: s?.name ?? null, status_category: s?.status_category ?? null, source: r.source });
	}
	return out.sort((a, b) => (a.key ?? "").localeCompare(b.key ?? "", "en-GB", { numeric: true }));
}

/** Who may see and edit, given a page's chain (chainOf): the page first. */
export async function restrictionOf(supabase: SupabaseClient, uid: string | null, chain: ChainRow[]): Promise<DocRestriction> {
	const page = chain[0];
	if (!page) return { restricted: false, inherited_from: null, people: [], can_manage: false };
	const above = chain.slice(1).find((p) => p.restricted) ?? null;
	const listOn = page.restricted ? page.id : (above?.id ?? null);
	let people: DocRestrictionPerson[] = [];
	if (listOn) {
		const { data, error } = await supabase.from("doc_page_restrictions").select("grantee_id, can_edit").eq("page_id", listOn);
		if (error) throw error;
		const rows = (data ?? []) as Array<{ grantee_id: string; can_edit: boolean }>;
		const names = await namesFor(supabase, rows.map((r) => r.grantee_id));
		people = rows
			.map((r) => ({ id: r.grantee_id, name: names.get(r.grantee_id) ?? r.grantee_id.slice(0, 8), can_edit: r.can_edit }))
			.sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
	}
	return { restricted: page.restricted, inherited_from: above?.id ?? null, people, can_manage: !!uid && page.created_by === uid };
}

/** The whole page: body, breadcrumbs, tickets and restriction. */
export async function loadDocPage(supabase: SupabaseClient, uid: string | null, id: string): Promise<DocPage | null> {
	const row = await pageRow(supabase, id);
	if (!row) return null;
	const [chain, tickets, kids, space, names] = await Promise.all([
		chainOf(supabase, row.id),
		pageTickets(supabase, row.id),
		supabase.from("doc_pages").select("id", { count: "exact", head: true }).eq("parent_id", row.id).is("archived_at", null),
		supabase.from("doc_spaces").select("key").eq("id", row.doc_space_id).maybeSingle(),
		namesFor(supabase, [row.created_by, row.updated_by]),
	]);
	const person = (p: string | null): WorkPerson | null => (p ? { id: p, name: names.get(p) ?? p.slice(0, 8) } : null);
	return {
		...toSummary(row, (kids.count ?? 0) > 0),
		doc_space_key: ((space.data as { key: string } | null)?.key ?? "") as string,
		body: isDoc(row.body) ? row.body : EMPTY_DOC,
		body_text: row.body_text,
		version: row.version,
		created_at: row.created_at,
		created_by: person(row.created_by),
		updated_by: person(row.updated_by),
		breadcrumbs: chain
			.slice(1)
			.reverse()
			.map((p) => ({ id: p.id, title: p.title })),
		links: { tickets },
		restriction: await restrictionOf(supabase, uid, chain),
	};
}

/**
 * Number the pages under one parent 0..n with `pageId` at `index` (the end
 * when none is given). Archived siblings keep their order after the live
 * ones, so the index a sidebar sends is the index it sees.
 */
export async function renumberSiblings(
	supabase: SupabaseClient,
	where: { docSpaceId: string; parentId: string | null; pageId?: string | null; index?: number | null },
): Promise<void> {
	let q = supabase.from("doc_pages").select("id, parent_id, title, position, archived_at").eq("doc_space_id", where.docSpaceId);
	q = where.parentId ? q.eq("parent_id", where.parentId) : q.is("parent_id", null);
	const { data, error } = await q.order("position").order("title").limit(1000);
	if (error) throw error;
	type Row = { id: string; parent_id: string | null; title: string; position: number; archived_at: string | null };
	const rows = (data ?? []) as Row[];
	const live = rows.filter((r) => !r.archived_at || r.id === where.pageId);
	const archived = rows.filter((r) => r.archived_at && r.id !== where.pageId);
	const moved = where.pageId && live.some((r) => r.id === where.pageId) ? where.pageId : null;
	const order = moved ? placeAmong(live, moved, where.index) : [...live].sort(byPosition).map((r) => r.id);
	const wanted = [...order, ...archived.map((r) => r.id)];
	const now = new Map(rows.map((r) => [r.id, r.position]));
	for (let i = 0; i < wanted.length; i += 1) {
		if (now.get(wanted[i]) === i) continue;
		// a sibling the caller may not edit stays where it is: the update matches no row
		const { error: upErr } = await supabase.from("doc_pages").update({ position: i }).eq("id", wanted[i]);
		if (upErr) throw upErr;
	}
}

/**
 * Archive a page with everything under it, or bring it back. The pages
 * under it carry the same timestamp, so bringing the page back brings back
 * exactly what went with it and nothing archived on its own before. A page
 * brought back from under a parent that is still archived moves to the top
 * of the tree, where it can be seen.
 */
export async function setArchived(supabase: SupabaseClient, page: { id: string; doc_space_id: string; parent_id: string | null; archived_at: string | null }, archived: boolean): Promise<number> {
	const all = await pagesOf(supabase, page.doc_space_id);
	const below = new Set(descendantsOf(all, page.id));
	const stamp = archived ? new Date().toISOString() : null;
	const ids = [page.id, ...all.filter((p) => below.has(p.id) && (archived ? !p.archived_at : p.archived_at === page.archived_at)).map((p) => p.id)];
	let changed = 0;
	for (let i = 0; i < ids.length; i += 100) {
		const { data, error } = await supabase
			.from("doc_pages")
			.update({ archived_at: stamp })
			.in("id", ids.slice(i, i + 100))
			.select("id");
		if (error) throw error;
		changed += (data ?? []).length;
	}
	if (!archived && page.parent_id) {
		const above = (await chainOf(supabase, page.id)).slice(1);
		if (above.some((p) => p.archived_at)) {
			const { error } = await supabase.from("doc_pages").update({ parent_id: null }).eq("id", page.id);
			if (error) throw error;
			await renumberSiblings(supabase, { docSpaceId: page.doc_space_id, parentId: null, pageId: page.id, index: null });
		}
	}
	return changed;
}

/** The keys of some doc spaces, by id. */
export async function docSpaceKeys(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
	const want = Array.from(new Set(ids));
	const out = new Map<string, string>();
	for (let i = 0; i < want.length; i += 100) {
		const { data, error } = await supabase.from("doc_spaces").select("id, key").in("id", want.slice(i, i + 100));
		if (error) throw error;
		for (const d of (data ?? []) as Array<{ id: string; key: string }>) out.set(d.id, d.key);
	}
	return out;
}

// ---------------------------------------------------------------------
// Links and mentions
// ---------------------------------------------------------------------

/**
 * Make the page's `mention` links match the ticket keys in the document:
 * new keys gain a link, a mention link whose key has left the document is
 * removed, and a link made by hand is never touched. Keys resolve to
 * tickets in the page's own space, by live key or an alias.
 */
export async function syncPageLinks(
	supabase: SupabaseClient,
	page: { id: string; space_id: string },
	body: unknown,
): Promise<{ added: number; removed: number }> {
	const keys = refsIn(body).tickets.slice(0, 200);
	const wanted = new Set<string>();
	for (const key of keys) {
		const filter = ticketKeyFilter(key);
		if (!filter) continue;
		const { data, error } = await supabase.from("tickets").select("id, ticket_key, kind").eq("space_id", page.space_id).or(filter).is("deleted_at", null).limit(5);
		if (error) throw error;
		const rows = ((data ?? []) as Array<{ id: string; ticket_key: string | null; kind: string | null }>).filter((r) => r.kind !== "habit");
		const hit = rows.find((r) => r.ticket_key === key) ?? rows[0];
		if (hit) wanted.add(hit.id);
	}

	const { data: current, error } = await supabase.from("doc_page_links").select("ticket_id, source").eq("page_id", page.id);
	if (error) throw error;
	const have = (current ?? []) as Array<{ ticket_id: string; source: LinkSource }>;
	const linked = new Set(have.map((r) => r.ticket_id));
	const drop = have.filter((r) => r.source === "mention" && !wanted.has(r.ticket_id)).map((r) => r.ticket_id);
	const add = [...wanted].filter((id) => !linked.has(id));

	for (let i = 0; i < drop.length; i += 100) {
		const { error: delErr } = await supabase
			.from("doc_page_links")
			.delete()
			.eq("page_id", page.id)
			.eq("source", "mention")
			.in("ticket_id", drop.slice(i, i + 100));
		if (delErr) throw delErr;
	}
	if (add.length > 0) {
		const { error: addErr } = await supabase
			.from("doc_page_links")
			.upsert(add.map((ticket_id) => ({ space_id: page.space_id, page_id: page.id, ticket_id, source: "mention" })), { onConflict: "page_id,ticket_id", ignoreDuplicates: true });
		if (addErr) throw addErr;
	}
	return { added: add.length, removed: drop.length };
}

/**
 * The mention events of an edit: the users @mentioned in `after` who were
 * not in `before`. Only people the caller can see are told, so an id made
 * up in a document never reaches the notifications table.
 */
export async function mentionEvents(
	supabase: SupabaseClient,
	edit: { actorId: string | null; pageId: string; title: string; url: string; before: unknown; after: unknown },
): Promise<WorkEvent[]> {
	const fresh = newRefs(edit.before, edit.after).users.filter((u) => u !== edit.actorId);
	if (fresh.length === 0) return [];
	const { data } = await supabase.from("profiles").select("id").in("id", fresh.slice(0, 100));
	const known = ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
	if (known.length === 0) return [];
	const names = await namesFor(supabase, [edit.actorId]);
	const who = (edit.actorId ? names.get(edit.actorId) : null) ?? "Someone";
	return [
		{
			event: "mention",
			recipients: known,
			title: `${who} mentioned you in ${edit.title}`,
			body: excerptAround(docToText(edit.after), "", 200) || null,
			url: edit.url,
			doc_page_id: edit.pageId,
		},
	];
}

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------

export const TEMPLATE_SELECT = "id, slug, name, description, title, body, origin, version, shared, created_at, updated_at";

/** A template by slug or id. The same slug in two spaces: `wanted` picks, else the caller's own space. */
export async function resolveDocTemplate(supabase: SupabaseClient, uid: string | null, ref: string, wanted?: string | null): Promise<(DocTemplate & { space_id: string }) | null> {
	const r = ref.trim();
	const sel = `${TEMPLATE_SELECT}, space_id`;
	type Row = DocTemplate & { space_id: string };
	if (UUID_RE.test(r)) {
		const { data } = await supabase.from("doc_templates").select(sel).eq("id", r).maybeSingle();
		return (data as unknown as Row | null) ?? null;
	}
	const slug = r.toLowerCase();
	if (!TEMPLATE_SLUG_RE.test(slug)) return null;
	let q = supabase.from("doc_templates").select(sel).eq("slug", slug);
	if (wanted && UUID_RE.test(wanted)) q = q.eq("space_id", wanted);
	const { data } = await q.order("created_at").limit(20);
	const rows = (data ?? []) as unknown as Row[];
	if (rows.length <= 1) return rows[0] ?? null;
	const own = await resolveSpace(supabase, uid);
	return rows.find((t) => t.space_id === own?.id) ?? rows[0];
}

export function toTemplate(r: DocTemplate & { space_id?: string }): DocTemplate {
	return {
		id: r.id,
		slug: r.slug,
		name: r.name,
		description: r.description,
		title: r.title,
		body: isDoc(r.body) ? r.body : EMPTY_DOC,
		origin: r.origin,
		version: r.version,
		shared: r.shared,
		created_at: r.created_at,
		updated_at: r.updated_at,
	};
}

/** Turn a Postgres error from a docs write into something a person can act on. */
export function docsErrorMessage(err: { message?: string; code?: string } | null): string {
	const m = err?.message ?? "";
	if (/same doc space/.test(m)) return "A page and its parent must be in the same doc space.";
	if (/moved under itself/.test(m)) return "A page cannot be moved under one of its own descendants.";
	if (err?.code === "23505") return "That already exists.";
	if (err?.code === "23503") return "That refers to something that is not there.";
	if (err?.code === "42501") return "You do not have permission to do that.";
	return m || "The write failed.";
}

export function docsErrorStatus(err: { code?: string } | null): number {
	if (err?.code === "42501") return 403;
	if (err?.code === "23505") return 409;
	return 400;
}
