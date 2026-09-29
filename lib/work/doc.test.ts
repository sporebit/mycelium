import { describe, expect, it } from "vitest";
import { checkDoc, diffLines, docToText, isDoc, newRefs, refsIn, textToDoc, type Doc } from "./doc";

/** Pure: no database. */

const USER = "f218ed69-6cbf-49ea-908a-8826f2f1178a";
const PERSON = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

const p = (...content: Doc["content"]): Doc["content"][number] => ({ type: "paragraph", content });
const text = (t: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const doc = (...content: Doc["content"]): Doc => ({ type: "doc", content });

describe("docToText", () => {
	it("renders paragraphs, chips and breaks", () => {
		const d = doc(
			p(text("Ask "), { type: "mention", attrs: { kind: "user", id: USER, label: "Phil" } }, text(" about "), { type: "ticketKey", attrs: { key: "MYC-12" } }, text(".")),
			p(text("Line one"), { type: "hardBreak" }, text("line two")),
		);
		expect(docToText(d)).toBe("Ask @Phil about MYC-12.\nLine one\nline two");
	});

	it("renders headings, lists, tasks, quotes, code and rules", () => {
		const d = doc(
			{ type: "heading", attrs: { level: 2 }, content: [text("Plan")] },
			{ type: "bulletList", content: [{ type: "listItem", content: [p(text("one"))] }, { type: "listItem", content: [p(text("two"))] }] },
			{ type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(text("three"))] }] },
			{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(text("done"))] }, { type: "taskItem", attrs: { checked: false }, content: [p(text("to do"))] }] },
			{ type: "blockquote", content: [p(text("quoted"))] },
			{ type: "codeBlock", content: [text("a = 1\nb = 2")] },
			{ type: "horizontalRule" },
		);
		expect(docToText(d)).toBe(["## Plan", "- one", "- two", "3. three", "[x] done", "[ ] to do", "> quoted", "    a = 1", "    b = 2", "---"].join("\n"));
	});

	it("is empty for anything that is not a document", () => {
		expect(docToText(null)).toBe("");
		expect(docToText({ type: "paragraph" })).toBe("");
		expect(docToText("hello")).toBe("");
	});
});

describe("textToDoc", () => {
	it("round-trips plain text", () => {
		const t = "first line\nsecond line\n\nafter a gap";
		expect(docToText(textToDoc(t))).toBe(t);
		expect(isDoc(textToDoc(""))).toBe(true);
		expect(textToDoc(null).content).toEqual([]);
	});
});

describe("refsIn", () => {
	it("separates users from people and collects ticket keys", () => {
		const d = doc(
			p(
				{ type: "mention", attrs: { kind: "user", id: USER, label: "Phil" } },
				{ type: "mention", attrs: { kind: "person", id: PERSON, label: "Tess" } },
				{ type: "mention", attrs: { kind: "user", id: USER.toUpperCase(), label: "Phil again" } },
				{ type: "ticketKey", attrs: { key: "myc-12" } },
				{ type: "ticketKey", attrs: { key: "not a key" } },
				{ type: "mention", attrs: { kind: "user", id: "nope", label: "x" } },
			),
		);
		expect(refsIn(d)).toEqual({ users: [USER], people: [PERSON], tickets: ["MYC-12"] });
	});

	it("newRefs is what an edit added", () => {
		const before = doc(p({ type: "mention", attrs: { kind: "user", id: USER, label: "Phil" } }));
		const after = doc(p({ type: "mention", attrs: { kind: "user", id: USER, label: "Phil" } }, { type: "mention", attrs: { kind: "user", id: PERSON, label: "T" } }, { type: "ticketKey", attrs: { key: "PW-1" } }));
		expect(newRefs(before, after)).toEqual({ users: [PERSON], people: [], tickets: ["PW-1"] });
		expect(newRefs(null, before).users).toEqual([USER]);
	});
});

describe("checkDoc", () => {
	it("accepts an ordinary document", () => {
		expect(checkDoc(doc(p(text("hello", [{ type: "link", attrs: { href: "https://example.com" } }]))))).toBeNull();
		expect(checkDoc(doc())).toBeNull();
	});

	it("refuses what is not a document, a script link, depth and size", () => {
		expect(checkDoc({ type: "paragraph" })).toMatch(/not a document/);
		expect(checkDoc(doc(p(text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))))).toMatch(/link/);
		let deep: Doc["content"][number] = p(text("x"));
		for (let i = 0; i < 60; i += 1) deep = { type: "blockquote", content: [deep] };
		expect(checkDoc(doc(deep))).toMatch(/nested/);
		expect(checkDoc(doc(p(text("x".repeat(2000)))), 1000)).toMatch(/too large/);
	});
});

describe("diffLines", () => {
	it("marks what was added and removed", () => {
		expect(diffLines("a\nb\nc", "a\nc\nd")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "del", text: "b" },
			{ kind: "same", text: "c" },
			{ kind: "add", text: "d" },
		]);
	});

	it("is all same for equal text and handles an empty side", () => {
		expect(diffLines("x\ny", "x\ny").every((l) => l.kind === "same")).toBe(true);
		expect(diffLines("", "new")).toEqual([
			{ kind: "del", text: "" },
			{ kind: "add", text: "new" },
		]);
	});
});
