/**
 * Work — the rich-text document (claude/spec-work.md §2.5, Part C).
 *
 * Ticket descriptions, comments and doc pages store Tiptap JSON beside a
 * plain-text rendition. These helpers are the only place that knows the
 * node shapes, so the editor, the API and the diff all agree.
 * Isomorphic and dependency-free: the server never loads Tiptap.
 *
 *   mention   { type: "mention",   attrs: { kind: "user" | "person", id, label } }
 *   ticketKey { type: "ticketKey", attrs: { key } }
 */

export type DocNode = {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
	content?: DocNode[];
};

export type Doc = { type: "doc"; content: DocNode[] };

export const EMPTY_DOC: Doc = { type: "doc", content: [] };

export function isDoc(v: unknown): v is Doc {
	return !!v && typeof v === "object" && (v as Doc).type === "doc" && Array.isArray((v as Doc).content);
}

const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "horizontalRule", "tableRow"]);

/** Bound what a client may store: depth, node count and size. */
export function checkDoc(v: unknown, maxBytes = 400_000): string | null {
	if (!isDoc(v)) return "The document is not a document.";
	let nodes = 0;
	function walk(n: DocNode, depth: number): string | null {
		if (depth > 40) return "The document is nested too deeply.";
		if (++nodes > 20_000) return "The document is too large.";
		if (n.type !== undefined && typeof n.type !== "string") return "The document has a malformed node.";
		if (n.text !== undefined && typeof n.text !== "string") return "The document has a malformed node.";
		for (const m of n.marks ?? []) {
			if (m.type === "link") {
				const href = String(m.attrs?.href ?? "");
				if (href && !/^(https?:|mailto:|\/)/i.test(href)) return "A link in the document is not http(s).";
			}
		}
		for (const c of n.content ?? []) {
			const e = walk(c, depth + 1);
			if (e) return e;
		}
		return null;
	}
	const err = walk(v, 0);
	if (err) return err;
	if (JSON.stringify(v).length > maxBytes) return "The document is too large.";
	return null;
}

/** The plain-text rendition: what search, exports, tix and the diff read. */
export function docToText(doc: unknown): string {
	if (!isDoc(doc)) return "";
	const out: string[] = [];
	function inline(n: DocNode): string {
		if (n.type === "text") return n.text ?? "";
		if (n.type === "mention") return `@${String(n.attrs?.label ?? "").trim() || "someone"}`;
		if (n.type === "ticketKey") return String(n.attrs?.key ?? "");
		if (n.type === "hardBreak") return "\n";
		return (n.content ?? []).map(inline).join("");
	}
	function block(n: DocNode, prefix: string): void {
		switch (n.type) {
			case "bulletList":
				for (const c of n.content ?? []) block(c, `${prefix}- `);
				return;
			case "orderedList": {
				let i = Number(n.attrs?.start ?? 1);
				for (const c of n.content ?? []) block(c, `${prefix}${i++}. `);
				return;
			}
			case "taskList":
				for (const c of n.content ?? []) block(c, `${prefix}[${c.attrs?.checked ? "x" : " "}] `);
				return;
			case "listItem":
			case "taskItem": {
				const kids = n.content ?? [];
				kids.forEach((c, i) => block(c, i === 0 ? prefix : " ".repeat(prefix.length)));
				return;
			}
			case "heading":
				out.push(`${prefix}${"#".repeat(Math.min(Math.max(Number(n.attrs?.level ?? 1), 1), 6))} ${inline(n)}`);
				return;
			case "blockquote":
				for (const c of n.content ?? []) block(c, `${prefix}> `);
				return;
			case "codeBlock":
				out.push(...inline(n).split("\n").map((l) => `${prefix}    ${l}`));
				return;
			case "horizontalRule":
				out.push(`${prefix}---`);
				return;
			case "table":
				for (const row of n.content ?? []) out.push(prefix + (row.content ?? []).map((cell) => (cell.content ?? []).map(inline).join(" ")).join(" | "));
				return;
			default:
				if (n.type && !BLOCKS.has(n.type) && (n.content ?? []).some((c) => c.type && BLOCKS.has(c.type))) {
					for (const c of n.content ?? []) block(c, prefix);
					return;
				}
				out.push(prefix + inline(n));
		}
	}
	for (const n of doc.content) block(n, "");
	return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text as a document: one paragraph per line, blank lines kept as breaks. */
export function textToDoc(text: string | null | undefined): Doc {
	const t = (text ?? "").replace(/\r\n/g, "\n");
	if (!t.trim()) return { type: "doc", content: [] };
	return {
		type: "doc",
		content: t.split("\n").map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
	};
}

export type DocRefs = {
	/** Users (auth ids) — these are notified. */
	users: string[];
	/** People from the People section — recorded as mentions, never notified. */
	people: string[];
	/** Ticket keys, upper-cased. */
	tickets: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[A-Z][A-Z0-9]{1,4}-\d+$/;

/** Who and what a document points at. */
export function refsIn(doc: unknown): DocRefs {
	const users = new Set<string>();
	const people = new Set<string>();
	const tickets = new Set<string>();
	function walk(n: DocNode): void {
		if (n.type === "mention") {
			const id = String(n.attrs?.id ?? "");
			if (UUID_RE.test(id)) (n.attrs?.kind === "person" ? people : users).add(id.toLowerCase());
		} else if (n.type === "ticketKey") {
			const key = String(n.attrs?.key ?? "").toUpperCase();
			if (KEY_RE.test(key)) tickets.add(key);
		}
		for (const c of n.content ?? []) walk(c);
	}
	if (isDoc(doc)) for (const n of doc.content) walk(n);
	return { users: [...users], people: [...people], tickets: [...tickets] };
}

/** What is in `after` and was not in `before`: the new mentions of an edit. */
export function newRefs(before: unknown, after: unknown): DocRefs {
	const b = refsIn(before);
	const a = refsIn(after);
	return {
		users: a.users.filter((x) => !b.users.includes(x)),
		people: a.people.filter((x) => !b.people.includes(x)),
		tickets: a.tickets.filter((x) => !b.tickets.includes(x)),
	};
}

// ---------------------------------------------------------------------
// Line diff, for page history
// ---------------------------------------------------------------------

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Longest-common-subsequence line diff. Pages are short; this is quadratic on purpose, capped. */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	if (a.length * b.length > 4_000_000) {
		return [...a.map((text) => ({ kind: "del" as const, text })), ...b.map((text) => ({ kind: "add" as const, text }))];
	}
	const n = a.length;
	const m = b.length;
	const w = m + 1;
	const lcs = new Uint32Array((n + 1) * w);
	for (let i = n - 1; i >= 0; i -= 1) {
		for (let j = m - 1; j >= 0; j -= 1) {
			lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ kind: "same", text: a[i] });
			i += 1;
			j += 1;
		} else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
			out.push({ kind: "del", text: a[i] });
			i += 1;
		} else {
			out.push({ kind: "add", text: b[j] });
			j += 1;
		}
	}
	while (i < n) out.push({ kind: "del", text: a[i++] });
	while (j < m) out.push({ kind: "add", text: b[j++] });
	return out;
}
