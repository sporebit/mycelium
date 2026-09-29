import { describe, expect, it } from "vitest";
import {
	buildTree,
	checkDocSpace,
	checkPageWrite,
	checkParent,
	checkPosition,
	descendantsOf,
	excerptAround,
	likePattern,
	nextPosition,
	placeAmong,
	slugify,
	type TreeNode,
} from "./docs";

/** Pure: no database. */

type P = { id: string; parent_id: string | null; position: number; title: string };

function page(id: string, parent_id: string | null, position: number, title = id): P {
	return { id, parent_id, position, title };
}

/** The tree as nested ids, which is all most cases need to look at. */
function ids(nodes: Array<TreeNode<P>>): unknown[] {
	return nodes.map((n) => (n.children.length > 0 ? [n.id, ids(n.children)] : n.id));
}

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("buildTree", () => {
	it("is empty for no pages", () => {
		expect(buildTree([])).toEqual([]);
	});

	it("nests children under their parents", () => {
		const tree = buildTree([page("home", null, 0), page("a", "home", 0), page("b", "home", 1), page("a1", "a", 0)]);
		expect(ids(tree)).toEqual([["home", [["a", ["a1"]], "b"]]]);
	});

	it("orders siblings by position, whatever order they arrive in", () => {
		const tree = buildTree([page("c", null, 2), page("a", null, 0), page("b", null, 1)]);
		expect(ids(tree)).toEqual(["a", "b", "c"]);
	});

	it("orders by title when positions tie, without regard to case", () => {
		const tree = buildTree([page("1", null, 0, "pears"), page("2", null, 0, "Apples"), page("3", null, 0, "bananas")]);
		expect(tree.map((n) => n.title)).toEqual(["Apples", "bananas", "pears"]);
	});

	it("puts position before title", () => {
		const tree = buildTree([page("1", null, 1, "Apples"), page("2", null, 0, "Pears")]);
		expect(tree.map((n) => n.title)).toEqual(["Pears", "Apples"]);
	});

	it("orders every level, not just the top", () => {
		const tree = buildTree([page("home", null, 0), page("z", "home", 1), page("y", "home", 0), page("y2", "y", 1), page("y1", "y", 0)]);
		expect(ids(tree)).toEqual([["home", [["y", ["y1", "y2"]], "z"]]]);
	});

	it("makes a root of a page whose parent is not in the list", () => {
		const tree = buildTree([page("home", null, 0), page("orphan", "hidden", 0), page("kid", "orphan", 0)]);
		expect(ids(tree)).toEqual(["home", ["orphan", ["kid"]]]);
	});

	it("orders orphans among the roots like any other page", () => {
		const tree = buildTree([page("home", null, 1), page("late", "hidden", 2), page("early", "hidden", 0)]);
		expect(ids(tree)).toEqual(["early", "home", "late"]);
	});

	it("keeps an orphan's own parent_id, so a caller can tell it is one", () => {
		const [only] = buildTree([page("orphan", "hidden", 0)]);
		expect(only.parent_id).toBe("hidden");
	});

	it("sets has_children from the pages that are there", () => {
		const tree = buildTree([page("home", null, 0), page("a", "home", 0)]);
		expect(tree[0].has_children).toBe(true);
		expect(tree[0].children[0].has_children).toBe(false);
	});

	it("overrides a has_children that came in with the row", () => {
		const [only] = buildTree([{ ...page("a", null, 0), has_children: true }]);
		expect(only.has_children).toBe(false);
	});

	it("keeps the other fields of each page", () => {
		const [only] = buildTree([{ ...page("a", null, 0), restricted: true, updated_at: "2026-09-29T10:00:00Z" }]);
		expect(only.restricted).toBe(true);
		expect(only.updated_at).toBe("2026-09-29T10:00:00Z");
	});

	it("does not change the list it was given", () => {
		const list = [page("b", null, 1), page("a", null, 0)];
		buildTree(list);
		expect(list.map((p) => p.id)).toEqual(["b", "a"]);
		expect(list[0]).not.toHaveProperty("children");
	});

	it("takes a page once when the list holds it twice", () => {
		const tree = buildTree([page("a", null, 0), page("a", null, 0), page("b", "a", 0)]);
		expect(ids(tree)).toEqual([["a", ["b"]]]);
	});

	it("treats a page that names itself as its parent as a root", () => {
		expect(ids(buildTree([page("a", "a", 0)]))).toEqual(["a"]);
	});

	it("opens a loop rather than losing its pages", () => {
		const tree = buildTree([page("home", null, 0), page("a", "b", 1), page("b", "a", 2)]);
		const seen: string[] = [];
		const walk = (nodes: Array<TreeNode<P>>, depth = 0): void => {
			if (depth > 10) throw new Error("the tree loops");
			for (const n of nodes) {
				seen.push(n.id);
				walk(n.children, depth + 1);
			}
		};
		walk(tree);
		expect(seen.sort()).toEqual(["a", "b", "home"]);
	});
});

describe("nextPosition", () => {
	it("is 0 for the first page under a parent", () => {
		expect(nextPosition([])).toBe(0);
	});

	it("is one past the last sibling", () => {
		expect(nextPosition([{ position: 0 }, { position: 1 }, { position: 2 }])).toBe(3);
	});

	it("goes past the highest, not the count, when positions have gaps", () => {
		expect(nextPosition([{ position: 7 }, { position: 2 }])).toBe(8);
	});

	it("ignores a position that is not a number", () => {
		expect(nextPosition([{ position: null }, { position: undefined }, { position: 4 }])).toBe(5);
		expect(nextPosition([{ position: null }])).toBe(1);
	});

	it("never goes below 0", () => {
		expect(nextPosition([{ position: -5 }])).toBe(0);
	});
});

describe("placeAmong", () => {
	const siblings = [page("a", "p", 0), page("b", "p", 1), page("c", "p", 2)];

	it("puts a page at the end when no index is given", () => {
		expect(placeAmong(siblings, "new")).toEqual(["a", "b", "c", "new"]);
		expect(placeAmong(siblings, "new", null)).toEqual(["a", "b", "c", "new"]);
	});

	it("puts a page at the index asked for", () => {
		expect(placeAmong(siblings, "new", 0)).toEqual(["new", "a", "b", "c"]);
		expect(placeAmong(siblings, "new", 2)).toEqual(["a", "b", "new", "c"]);
	});

	it("moves a page that is already among them", () => {
		expect(placeAmong(siblings, "c", 0)).toEqual(["c", "a", "b"]);
		expect(placeAmong(siblings, "a", 2)).toEqual(["b", "c", "a"]);
	});

	it("keeps an index inside the list", () => {
		expect(placeAmong(siblings, "new", 99)).toEqual(["a", "b", "c", "new"]);
		expect(placeAmong(siblings, "new", -3)).toEqual(["new", "a", "b", "c"]);
	});
});

describe("descendantsOf", () => {
	const pages = [page("home", null, 0), page("a", "home", 0), page("a1", "a", 0), page("a2", "a", 1), page("b", "home", 1), page("other", null, 1)];

	it("finds everything below a page, at any depth", () => {
		expect(descendantsOf(pages, "home").sort()).toEqual(["a", "a1", "a2", "b"]);
		expect(descendantsOf(pages, "a").sort()).toEqual(["a1", "a2"]);
	});

	it("is empty for a page with nothing under it", () => {
		expect(descendantsOf(pages, "b")).toEqual([]);
		expect(descendantsOf(pages, "nowhere")).toEqual([]);
	});

	it("ends when the pages loop", () => {
		expect(descendantsOf([page("a", "b", 0), page("b", "a", 0)], "a")).toEqual(["b"]);
	});
});

describe("checkDocSpace", () => {
	it("upper-cases and trims the key", () => {
		const r = checkDocSpace({ key: " eng ", name: "Engineering" }, "create");
		expect(r).toEqual({ ok: true, value: { key: "ENG", name: "Engineering" } });
	});

	it("takes keys of two to ten letters and digits", () => {
		for (const key of ["AB", "HOME", "A1", "ABCDEFGHIJ", "X9Y8"]) {
			expect(checkDocSpace({ key, name: "n" }, "create").ok, key).toBe(true);
		}
	});

	it("refuses a key of the wrong shape", () => {
		for (const key of ["A", "1AB", "ABCDEFGHIJK", "A-B", "A B", "A_B", "É1", ""]) {
			expect(checkDocSpace({ key, name: "n" }, "create").ok, key).toBe(false);
		}
	});

	it("refuses a key that is not text", () => {
		expect(checkDocSpace({ key: 12, name: "n" }, "create").ok).toBe(false);
		expect(checkDocSpace({ name: "n" }, "create").ok).toBe(false);
	});

	it("needs a name on create", () => {
		expect(checkDocSpace({ key: "ENG" }, "create")).toEqual({ ok: false, error: "A doc space needs a name." });
		expect(checkDocSpace({ key: "ENG", name: "   " }, "create").ok).toBe(false);
	});

	it("refuses a name that is too long", () => {
		expect(checkDocSpace({ key: "ENG", name: "x".repeat(121) }, "create").ok).toBe(false);
		expect(checkDocSpace({ key: "ENG", name: "x".repeat(120) }, "create").ok).toBe(true);
	});

	it("trims the name and the description, and turns an empty one into null", () => {
		const r = checkDocSpace({ key: "ENG", name: "  Engineering ", description: "  ", icon: " book " }, "create");
		expect(r).toEqual({ ok: true, value: { key: "ENG", name: "Engineering", description: null, icon: "book" } });
	});

	it("refuses a description that is not text", () => {
		expect(checkDocSpace({ key: "ENG", name: "n", description: 5 }, "create").ok).toBe(false);
	});

	it("only reads what a patch sends", () => {
		expect(checkDocSpace({ description: "New" }, "patch")).toEqual({ ok: true, value: { description: "New" } });
		expect(checkDocSpace({}, "patch")).toEqual({ ok: true, value: {} });
	});

	it("never takes a key from a patch", () => {
		const r = checkDocSpace({ key: "NEW", name: "Renamed" }, "patch");
		expect(r).toEqual({ ok: true, value: { name: "Renamed" } });
	});

	it("refuses to patch the name away", () => {
		expect(checkDocSpace({ name: "" }, "patch").ok).toBe(false);
		expect(checkDocSpace({ name: null }, "patch").ok).toBe(false);
	});

	it("lets a patch clear the description", () => {
		expect(checkDocSpace({ description: null }, "patch")).toEqual({ ok: true, value: { description: null } });
	});
});

describe("checkPageWrite", () => {
	it("needs a title on create", () => {
		expect(checkPageWrite({}, "create")).toEqual({ ok: false, error: "A page needs a title." });
		expect(checkPageWrite({ title: "   " }, "create").ok).toBe(false);
		expect(checkPageWrite({ title: 7 }, "create").ok).toBe(false);
	});

	it("trims the title", () => {
		const r = checkPageWrite({ title: "  Plan  " }, "create");
		expect(r.ok && r.value.title).toBe("Plan");
	});

	it("takes a title of 300 characters and refuses 301", () => {
		expect(checkPageWrite({ title: "x".repeat(300) }, "create").ok).toBe(true);
		expect(checkPageWrite({ title: "x".repeat(301) }, "create").ok).toBe(false);
	});

	it("gives a new page an empty document when none is sent", () => {
		const r = checkPageWrite({ title: "Plan" }, "create");
		expect(r).toEqual({ ok: true, value: { title: "Plan", body: { type: "doc", content: [] }, body_text: "" } });
	});

	it("derives the text from the document", () => {
		const body = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Goal" }] }, para("Ship it.")] };
		const r = checkPageWrite({ title: "Plan", body }, "create");
		expect(r.ok && r.value.body_text).toBe("## Goal\nShip it.");
	});

	it("ignores any text the client sends", () => {
		const r = checkPageWrite({ body: { type: "doc", content: [para("Real")] }, body_text: "Forged" }, "patch");
		expect(r).toEqual({ ok: true, value: { body: { type: "doc", content: [para("Real")] }, body_text: "Real" } });
	});

	it("refuses a body that is not a document", () => {
		expect(checkPageWrite({ title: "Plan", body: "text" }, "create").ok).toBe(false);
		expect(checkPageWrite({ title: "Plan", body: { type: "paragraph" } }, "create").ok).toBe(false);
		expect(checkPageWrite({ body: [] }, "patch").ok).toBe(false);
	});

	it("refuses a link that is not http", () => {
		const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] };
		expect(checkPageWrite({ body }, "patch").ok).toBe(false);
	});

	it("only reads what a patch sends", () => {
		expect(checkPageWrite({}, "patch")).toEqual({ ok: true, value: {} });
		expect(checkPageWrite({ title: "New" }, "patch")).toEqual({ ok: true, value: { title: "New" } });
	});

	it("refuses to patch the title or the body away", () => {
		expect(checkPageWrite({ title: "" }, "patch").ok).toBe(false);
		expect(checkPageWrite({ title: null }, "patch").ok).toBe(false);
		expect(checkPageWrite({ body: null }, "patch").ok).toBe(false);
	});
});

describe("checkParent", () => {
	const pages = [
		{ id: "home", parent_id: null, doc_space_id: "ds1" },
		{ id: "a", parent_id: "home", doc_space_id: "ds1" },
		{ id: "a1", parent_id: "a", doc_space_id: "ds1" },
		{ id: "b", parent_id: "home", doc_space_id: "ds1" },
		{ id: "far", parent_id: null, doc_space_id: "ds2" },
	];

	it("lets a page go to the top of the tree", () => {
		expect(checkParent(pages, "a1", null, "ds1")).toBeNull();
	});

	it("lets a page go under another branch", () => {
		expect(checkParent(pages, "a1", "b", "ds1")).toBeNull();
		expect(checkParent(pages, "b", "a1", "ds1")).toBeNull();
	});

	it("lets a new page go under any page of its doc space", () => {
		expect(checkParent(pages, null, "a1", "ds1")).toBeNull();
	});

	it("refuses a page as its own parent", () => {
		expect(checkParent(pages, "a", "a", "ds1")).toBe("A page cannot be its own parent.");
	});

	it("refuses a page under its child", () => {
		expect(checkParent(pages, "a", "a1", "ds1")).toBe("A page cannot be moved under one of its own descendants.");
	});

	it("refuses a page under a descendant further down", () => {
		expect(checkParent(pages, "home", "a1", "ds1")).toBe("A page cannot be moved under one of its own descendants.");
	});

	it("refuses a parent in another doc space", () => {
		expect(checkParent(pages, "a", "far", "ds1")).toBe("A page and its parent must be in the same doc space.");
		expect(checkParent(pages, null, "far", "ds1")).toBe("A page and its parent must be in the same doc space.");
	});

	it("refuses a parent that is not there", () => {
		expect(checkParent(pages, "a", "gone", "ds1")).toBe("No such parent page.");
	});

	it("ends when the pages above already loop", () => {
		const loop = [
			{ id: "x", parent_id: "y", doc_space_id: "ds1" },
			{ id: "y", parent_id: "x", doc_space_id: "ds1" },
		];
		expect(checkParent(loop, "z", "x", "ds1")).toBeNull();
	});
});

describe("checkPosition", () => {
	it("takes whole numbers from 0", () => {
		expect(checkPosition(0)).toEqual({ ok: true, value: 0 });
		expect(checkPosition(12)).toEqual({ ok: true, value: 12 });
	});

	it("refuses anything else", () => {
		for (const v of [-1, 1.5, "2", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 100_001]) {
			expect(checkPosition(v).ok, String(v)).toBe(false);
		}
	});
});

describe("slugify", () => {
	it("makes a slug the database will take", () => {
		for (const name of ["Meeting notes", "  Q3 — Review!  ", "Café résumé", "UPPER_case", "x".repeat(200), "!!!", ""]) {
			expect(slugify(name), name).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
		}
	});

	it("reads as the name does", () => {
		expect(slugify("Meeting notes")).toBe("meeting-notes");
		expect(slugify("  Q3 — Review!  ")).toBe("q3-review");
		expect(slugify("Café résumé")).toBe("cafe-resume");
	});

	it("falls back when nothing is left", () => {
		expect(slugify("!!!")).toBe("template");
	});

	it("does not end on a hyphen when it is cut short", () => {
		expect(slugify(`${"x".repeat(47)} yz`)).toBe("x".repeat(47));
	});
});

describe("excerptAround", () => {
	const text = `${"before ".repeat(30)}the NEEDLE is here ${"after ".repeat(30)}`;

	it("cuts around the match, whatever the case", () => {
		const e = excerptAround(text, "needle", 20);
		expect(e).toContain("NEEDLE");
		expect(e.startsWith("…")).toBe(true);
		expect(e.endsWith("…")).toBe(true);
		expect(e.length).toBeLessThan(60);
	});

	it("has no ellipsis at an end it reaches", () => {
		expect(excerptAround("needle in a short text", "needle")).toBe("needle in a short text");
	});

	it("gives the opening of the text when the match was in the title", () => {
		const e = excerptAround("x".repeat(500), "needle", 40);
		expect(e).toBe(`${"x".repeat(80)}…`);
	});

	it("folds line breaks into spaces", () => {
		expect(excerptAround("one\n\ntwo\tthree", "two")).toBe("one two three");
	});

	it("is empty for an empty page", () => {
		expect(excerptAround("", "needle")).toBe("");
		expect(excerptAround("  \n ", "needle")).toBe("");
	});
});

describe("likePattern", () => {
	it("wraps the text for a contains search", () => {
		expect(likePattern("plan")).toBe("%plan%");
	});

	it("escapes what LIKE would read as a wildcard", () => {
		expect(likePattern("100%")).toBe("%100\\%%");
		expect(likePattern("a_b")).toBe("%a\\_b%");
		expect(likePattern("a\\b")).toBe("%a\\\\b%");
	});

	it("does not let a star through as a wildcard", () => {
		expect(likePattern("a*b")).toBe("%a b%");
	});
});
