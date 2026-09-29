/**
 * Work — the JQL parser (claude/spec-work.md §3.2).
 *
 *   query  := [ expr ] [ ORDER BY order { , order } ]
 *   expr   := term { OR term }
 *   term   := factor { AND factor }
 *   factor := NOT factor | ( expr ) | clause
 *   clause := field cmp value
 *           | field [NOT] IN ( value { , value } )
 *           | field IS [NOT] EMPTY
 *
 * It compiles to the query object in ./query.ts — the same object the
 * filter bar emits. No functions in v1. Isomorphic and pure: the JQL box
 * parses as you type, the API parses again.
 */
import { canonicalField, cmpsFor, fieldKind, validateQuery, FIELD_LABEL, ORDER_FIELDS, type Cmp, type Node, type OrderBy, type Value, type WorkQuery } from "./query";

export class JqlError extends Error {
	/** Offset into the source where the problem starts. */
	readonly pos: number;
	constructor(message: string, pos: number) {
		super(message);
		this.name = "JqlError";
		this.pos = pos;
	}
}

type Tok =
	| { t: "word"; v: string; pos: number }
	| { t: "string"; v: string; pos: number }
	| { t: "op"; v: "=" | "!=" | "~" | "<" | ">" | "<=" | ">="; pos: number }
	| { t: "(" | ")" | ","; pos: number }
	| { t: "end"; pos: number };

const WORD_RE = /[A-Za-z0-9_.@:+\-/]/;

function tokenise(src: string): Tok[] {
	const out: Tok[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (/\s/.test(c)) {
			i += 1;
			continue;
		}
		if (c === "(" || c === ")" || c === ",") {
			out.push({ t: c, pos: i });
			i += 1;
			continue;
		}
		if (c === '"' || c === "'") {
			const start = i;
			let s = "";
			i += 1;
			let closed = false;
			while (i < src.length) {
				if (src[i] === "\\" && i + 1 < src.length) {
					s += src[i + 1];
					i += 2;
					continue;
				}
				if (src[i] === c) {
					closed = true;
					i += 1;
					break;
				}
				s += src[i];
				i += 1;
			}
			if (!closed) throw new JqlError("This quote is never closed.", start);
			out.push({ t: "string", v: s, pos: start });
			continue;
		}
		if (c === "!" && src[i + 1] === "=") {
			out.push({ t: "op", v: "!=", pos: i });
			i += 2;
			continue;
		}
		if ((c === "<" || c === ">") && src[i + 1] === "=") {
			out.push({ t: "op", v: c === "<" ? "<=" : ">=", pos: i });
			i += 2;
			continue;
		}
		if (c === "=" || c === "~" || c === "<" || c === ">") {
			out.push({ t: "op", v: c, pos: i });
			i += 1;
			continue;
		}
		if (WORD_RE.test(c)) {
			const start = i;
			while (i < src.length && WORD_RE.test(src[i])) i += 1;
			out.push({ t: "word", v: src.slice(start, i), pos: start });
			continue;
		}
		throw new JqlError(`Unexpected "${c}".`, i);
	}
	out.push({ t: "end", pos: src.length });
	return out;
}

export type ParseOptions = {
	/** Slugs of the space's label fields beyond label / location / tool. */
	labelFields?: readonly string[];
};

export function parseJql(src: string, opts: ParseOptions = {}): WorkQuery {
	const labelFields = opts.labelFields ?? [];
	const toks = tokenise(src);
	let p = 0;

	const peek = () => toks[p];
	const next = () => toks[p++];
	const isKw = (tok: Tok, kw: string) => tok.t === "word" && tok.v.toLowerCase() === kw;

	function describe(tok: Tok): string {
		if (tok.t === "end") return "the end of the query";
		if (tok.t === "word" || tok.t === "string" || tok.t === "op") return `"${tok.v}"`;
		return `"${tok.t}"`;
	}

	function field(): { name: string; pos: number } {
		const tok = next();
		if (tok.t !== "word" && tok.t !== "string") throw new JqlError(`Expected a field, found ${describe(tok)}.`, tok.pos);
		const name = canonicalField(tok.v, labelFields);
		if (!name) throw new JqlError(`Unknown field "${tok.v}".`, tok.pos);
		return { name, pos: tok.pos };
	}

	function value(f: string): Value {
		const tok = next();
		if (tok.t !== "word" && tok.t !== "string") throw new JqlError(`Expected a value, found ${describe(tok)}.`, tok.pos);
		if (tok.t === "word" && ["and", "or", "not", "order"].includes(tok.v.toLowerCase())) {
			throw new JqlError(`Expected a value, found ${describe(tok)}. Put it in quotes if it is the value.`, tok.pos);
		}
		if (fieldKind(f) === "number") {
			const n = Number(tok.v);
			if (!Number.isFinite(n)) throw new JqlError(`"${tok.v}" is not a number.`, tok.pos);
			return n;
		}
		return tok.v;
	}

	function check(f: { name: string; pos: number }, cmp: Cmp, pos: number): void {
		if (!cmpsFor(fieldKind(f.name)).includes(cmp)) {
			throw new JqlError(`${FIELD_LABEL[f.name] ?? f.name} does not support ${cmp.toUpperCase()}.`, pos);
		}
	}

	function clause(): Node {
		const f = field();
		const tok = next();
		if (tok.t === "op") {
			check(f, tok.v, tok.pos);
			return { field: f.name, cmp: tok.v, value: value(f.name) };
		}
		if (isKw(tok, "is")) {
			let cmp: Cmp = "is empty";
			if (isKw(peek(), "not")) {
				next();
				cmp = "is not empty";
			}
			const e = next();
			if (!isKw(e, "empty") && !isKw(e, "null")) throw new JqlError(`Expected EMPTY, found ${describe(e)}.`, e.pos);
			check(f, cmp, tok.pos);
			return { field: f.name, cmp };
		}
		let cmp: Cmp | null = null;
		if (isKw(tok, "in")) cmp = "in";
		else if (isKw(tok, "not") && isKw(peek(), "in")) {
			next();
			cmp = "not in";
		}
		if (cmp) {
			check(f, cmp, tok.pos);
			const open = next();
			if (open.t !== "(") throw new JqlError(`Expected "(" after ${cmp.toUpperCase()}, found ${describe(open)}.`, open.pos);
			const values: Value[] = [];
			for (;;) {
				values.push(value(f.name));
				const sep = next();
				if (sep.t === ")") break;
				if (sep.t !== ",") throw new JqlError(`Expected "," or ")", found ${describe(sep)}.`, sep.pos);
			}
			return { field: f.name, cmp, value: values };
		}
		throw new JqlError(`Expected a comparison after ${f.name}, found ${describe(tok)}.`, tok.pos);
	}

	function factor(): Node {
		const tok = peek();
		if (isKw(tok, "not")) {
			next();
			return { op: "not", node: factor() };
		}
		if (tok.t === "(") {
			next();
			const e = expr();
			const close = next();
			if (close.t !== ")") throw new JqlError(`Expected ")", found ${describe(close)}.`, close.pos);
			return e;
		}
		return clause();
	}

	function term(): Node {
		const nodes = [factor()];
		while (isKw(peek(), "and")) {
			next();
			nodes.push(factor());
		}
		return nodes.length === 1 ? nodes[0] : { op: "and", nodes };
	}

	function expr(): Node {
		const nodes = [term()];
		while (isKw(peek(), "or")) {
			next();
			nodes.push(term());
		}
		return nodes.length === 1 ? nodes[0] : { op: "or", nodes };
	}

	function order(): OrderBy[] {
		const out: OrderBy[] = [];
		for (;;) {
			const tok = next();
			if (tok.t !== "word") throw new JqlError(`Expected a field to order by, found ${describe(tok)}.`, tok.pos);
			const name = canonicalField(tok.v);
			if (!name || !(ORDER_FIELDS as readonly string[]).includes(name)) {
				throw new JqlError(`Cannot order by "${tok.v}".`, tok.pos);
			}
			let dir: "asc" | "desc" = "asc";
			if (isKw(peek(), "asc") || isKw(peek(), "desc")) dir = (next() as { v: string }).v.toLowerCase() as "asc" | "desc";
			out.push({ field: name, dir });
			if (peek().t !== ",") break;
			next();
		}
		return out;
	}

	const startsOrder = () => isKw(peek(), "order") && isKw(toks[p + 1], "by");

	let where: Node | null = null;
	if (peek().t !== "end" && !startsOrder()) where = expr();

	let orderBy: OrderBy[] = [];
	if (startsOrder()) {
		next();
		next();
		orderBy = order();
	}
	const tail = peek();
	if (tail.t !== "end") throw new JqlError(`Unexpected ${describe(tail)}. Join clauses with AND or OR.`, tail.pos);

	// one set of value rules for the bar, the parser and the API
	const checked = validateQuery({ where, orderBy }, labelFields);
	if (!checked.ok) throw new JqlError(checked.errors[0].message, 0);
	return checked.query;
}

/** Parse without throwing: for the JQL box, which parses on every keystroke. */
export function tryParseJql(src: string, opts: ParseOptions = {}): { ok: true; query: WorkQuery } | { ok: false; error: string; pos: number } {
	try {
		return { ok: true, query: parseJql(src, opts) };
	} catch (err) {
		if (err instanceof JqlError) return { ok: false, error: err.message, pos: err.pos };
		return { ok: false, error: "That query could not be read.", pos: 0 };
	}
}
