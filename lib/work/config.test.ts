import { describe, expect, it } from "vitest";
import {
	checkFilter,
	checkLabel,
	checkLabelFieldPatch,
	checkNewLabelField,
	checkNewType,
	checkStatus,
	checkStatusList,
	checkTypePatch,
	checkWorkflow,
	cleanName,
	filterSlug,
	FILTER_SLUG_RE,
	labelFieldSlug,
	labelFieldSlugProblem,
	labelSlug,
	MINIMAL_STATUSES,
	RESERVED_WORDS,
	typeSlug,
	uniqueSlug,
	workflowProblems,
	type StatusValues,
} from "./config";
import { FIELD_KIND } from "./query";

/** Pure: no database. */

const NOW = new Date("2026-09-29T12:00:00.000Z");

function value<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
	if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
	return r.value;
}

function error(r: { ok: true; value: unknown } | { ok: false; error: string }): string {
	if (r.ok) throw new Error("expected a refusal");
	return r.error;
}

describe("workflowProblems", () => {
	const three = [
		{ name: "To Do", category: "todo" },
		{ name: "In Progress", category: "in_progress" },
		{ name: "Done", category: "done" },
	];

	it("passes a workflow with one status in each category", () => {
		expect(workflowProblems(three)).toEqual([]);
	});

	it("passes the statuses a new workflow starts with", () => {
		expect(workflowProblems(MINIMAL_STATUSES.map((s) => ({ name: s.name, category: s.status_category })))).toEqual([]);
	});

	it("names each category that has no status", () => {
		expect(workflowProblems([])).toEqual([
			"A workflow needs at least one To Do status.",
			"A workflow needs at least one In Progress status.",
			"A workflow needs at least one Done status.",
		]);
		expect(workflowProblems(three.filter((s) => s.category !== "in_progress"))).toEqual(["A workflow needs at least one In Progress status."]);
		expect(workflowProblems(three.filter((s) => s.category !== "done"))).toEqual(["A workflow needs at least one Done status."]);
	});

	it("does not take a legacy category for one of the three", () => {
		expect(workflowProblems([...three.slice(1), { name: "Inbox", category: "inbox" }])).toEqual(["A workflow needs at least one To Do status."]);
	});

	it("refuses two statuses of one name, whatever their case or spacing", () => {
		expect(workflowProblems([...three, { name: "in  progress ", category: "in_progress" }])).toEqual(['Two statuses are called "In Progress".']);
	});

	it("reports a name once however often it repeats", () => {
		const problems = workflowProblems([...three, { name: "DONE", category: "done" }, { name: "done", category: "done" }]);
		expect(problems).toEqual(['Two statuses are called "Done".']);
	});
});

describe("checkStatus", () => {
	it("takes a new status", () => {
		expect(value(checkStatus({ name: "  In   Review ", status_category: "in_progress", colour: "#7AA2F7" }))).toEqual({
			columns: { name: "In Review", status_category: "in_progress", colour: "#7aa2f7" },
			merged: { name: "In Review", status_category: "in_progress", resolution: null, colour: "#7aa2f7" },
		});
	});

	it("reads the category under the name the API returns it by", () => {
		expect(value(checkStatus({ name: "Doing", category: "in_progress" })).columns.status_category).toBe("in_progress");
	});

	it("never writes the legacy category column", () => {
		const w = value(checkStatus({ name: "Doing", category: "in_progress" }));
		expect(Object.keys(w.columns)).not.toContain("category");
	});

	it("needs a name of 1 to 60 characters", () => {
		expect(error(checkStatus({ name: "   ", status_category: "todo" }))).toMatch(/needs a name/);
		expect(error(checkStatus({ status_category: "todo" }))).toMatch(/needs a name/);
		expect(error(checkStatus({ name: "x".repeat(61), status_category: "todo" }))).toMatch(/60 characters/);
		expect(checkStatus({ name: "x".repeat(60), status_category: "todo" }).ok).toBe(true);
	});

	it("takes the three status categories and nothing else", () => {
		for (const c of ["todo", "in_progress", "done"]) expect(checkStatus({ name: "A", status_category: c }).ok).toBe(true);
		for (const c of ["inbox", "doing", "verify", "To Do", "", null, 1]) {
			expect(error(checkStatus({ name: "A", status_category: c }))).toMatch(/todo, in_progress, done/);
		}
		expect(error(checkStatus({ name: "A" }))).toMatch(/todo, in_progress, done/);
	});

	it("allows a resolution on a Done status only", () => {
		expect(value(checkStatus({ name: "Won't do", status_category: "done", resolution: "wont_do" })).merged.resolution).toBe("wont_do");
		expect(error(checkStatus({ name: "Doing", status_category: "in_progress", resolution: "done" }))).toMatch(/Only a Done status/);
		expect(error(checkStatus({ name: "Later", status_category: "todo", resolution: "cancelled" }))).toMatch(/Only a Done status/);
		expect(error(checkStatus({ name: "Done", status_category: "done", resolution: "finished" }))).toMatch(/resolution is one of/);
	});

	it("gives a Done status the resolution done when none is named", () => {
		const w = value(checkStatus({ name: "Done", status_category: "done" }));
		expect(w.merged.resolution).toBe("done");
		expect("resolution" in w.columns).toBe(false);
	});

	it("takes a colour as #rrggbb, or none", () => {
		expect(value(checkStatus({ name: "A", status_category: "todo", colour: null })).merged.colour).toBeNull();
		expect(value(checkStatus({ name: "A", status_category: "todo", colour: "" })).merged.colour).toBeNull();
		for (const c of ["red", "#fff", "#12345g", "7aa2f7", 5]) {
			expect(error(checkStatus({ name: "A", status_category: "todo", colour: c }))).toMatch(/hex colour/);
		}
	});

	describe("as a change", () => {
		const done: StatusValues = { name: "Cancelled", status_category: "done", resolution: "cancelled", colour: "#ff0000" };
		const doing: StatusValues = { name: "Doing", status_category: "in_progress", resolution: null, colour: null };

		it("writes only what was given", () => {
			const w = value(checkStatus({ name: "Dropped" }, done));
			expect(w.columns).toEqual({ name: "Dropped" });
			expect(w.merged).toEqual({ ...done, name: "Dropped" });
		});

		it("clears the resolution when a status leaves Done", () => {
			const w = value(checkStatus({ status_category: "todo" }, done));
			expect(w.columns).toEqual({ status_category: "todo", resolution: null });
			expect(w.merged.resolution).toBeNull();
		});

		it("refuses a resolution on a status that is not Done, and on one leaving Done", () => {
			expect(error(checkStatus({ resolution: "done" }, doing))).toMatch(/Only a Done status/);
			expect(error(checkStatus({ status_category: "todo", resolution: "cancelled" }, done))).toMatch(/Only a Done status/);
		});

		it("takes a resolution with the move into Done", () => {
			const w = value(checkStatus({ status_category: "done", resolution: "duplicate" }, doing));
			expect(w.columns).toEqual({ status_category: "done", resolution: "duplicate" });
			expect(value(checkStatus({ status_category: "done" }, doing)).merged.resolution).toBe("done");
		});

		it("keeps a Done status's resolution when something else changes", () => {
			expect(value(checkStatus({ colour: null }, done)).merged).toEqual({ ...done, colour: null });
		});

		it("has nothing to write for an empty change", () => {
			expect(value(checkStatus({}, doing)).columns).toEqual({});
		});
	});

	it("refuses what is not an object", () => {
		for (const v of [null, "Done", 3, ["Done"]]) expect(checkStatus(v).ok).toBe(false);
	});
});

describe("checkStatusList", () => {
	it("takes a sound list in the order given", () => {
		const list = value(
			checkStatusList([
				{ name: "Open", status_category: "todo" },
				{ name: "Doing", status_category: "in_progress" },
				{ name: "Shipped", status_category: "done" },
				{ name: "Dropped", status_category: "done", resolution: "cancelled" },
			]),
		);
		expect(list.map((s) => s.name)).toEqual(["Open", "Doing", "Shipped", "Dropped"]);
		expect(list.map((s) => s.resolution)).toEqual([null, null, "done", "cancelled"]);
	});

	it("refuses a list short of a category, or with a name twice", () => {
		expect(error(checkStatusList([{ name: "Open", status_category: "todo" }, { name: "Shipped", status_category: "done" }]))).toMatch(/In Progress/);
		expect(
			error(
				checkStatusList([
					{ name: "Open", status_category: "todo" },
					{ name: "open", status_category: "in_progress" },
					{ name: "Shipped", status_category: "done" },
				]),
			),
		).toMatch(/Two statuses are called "Open"/);
	});

	it("refuses an empty list, a non-list and a bad status", () => {
		expect(checkStatusList([]).ok).toBe(false);
		expect(checkStatusList("To Do").ok).toBe(false);
		expect(error(checkStatusList([{ name: "Open", status_category: "open" }]))).toMatch(/todo, in_progress, done/);
	});
});

describe("checkWorkflow", () => {
	it("needs a name to create one", () => {
		expect(value(checkWorkflow({ name: " Bugs ", description: " For defects. " }, { partial: false }))).toEqual({ name: "Bugs", description: "For defects." });
		expect(checkWorkflow({}, { partial: false }).ok).toBe(false);
		expect(checkWorkflow({ name: "x".repeat(61) }, { partial: false }).ok).toBe(false);
	});

	it("turns archived into a date, and back", () => {
		expect(value(checkWorkflow({ archived: true }, { partial: true, now: NOW }))).toEqual({ archived_at: NOW.toISOString() });
		expect(value(checkWorkflow({ archived: false }, { partial: true, now: NOW }))).toEqual({ archived_at: null });
		expect(checkWorkflow({ archived: "yes" }, { partial: true }).ok).toBe(false);
	});

	it("does not archive on create", () => {
		expect(value(checkWorkflow({ name: "Bugs", archived: true }, { partial: false }))).toEqual({ name: "Bugs" });
	});
});

describe("issue types", () => {
	it("makes the slug from the name", () => {
		expect(typeSlug("Change request")).toBe("change-request");
		expect(typeSlug("  Sub-task  ")).toBe("sub-task");
		expect(typeSlug("Défaut / Régression")).toBe("defaut-regression");
		expect(typeSlug("2nd line")).toBe("nd-line");
		expect(typeSlug("???")).toBe("");
	});

	it("keeps a made slug inside 32 characters with no trailing hyphen", () => {
		const slug = typeSlug(`${"a".repeat(31)} b`);
		expect(slug).toBe("a".repeat(31));
		expect(typeSlug("x".repeat(50))).toHaveLength(32);
	});

	it("takes a new type with its defaults", () => {
		expect(value(checkNewType({ name: "Change request" }))).toEqual({
			name: "Change request",
			slug: "change-request",
			level: 0,
			has_steps: false,
			legacy_kind: null,
			icon: null,
			colour: null,
		});
	});

	it("takes a slug that is given, when it has the shape", () => {
		expect(value(checkNewType({ name: "Change request", slug: "cr" })).slug).toBe("cr");
		for (const slug of ["CR", "1st", "-cr", "c r", "c_r", "a".repeat(33)]) {
			expect(error(checkNewType({ name: "Change request", slug }))).toMatch(/slug starts with a letter/);
		}
	});

	it("asks for a slug when the name cannot make one", () => {
		expect(error(checkNewType({ name: "???" }))).toMatch(/give one/);
	});

	it("takes the three levels and nothing else", () => {
		for (const level of [1, 0, -1]) expect(value(checkNewType({ name: "T", level })).level).toBe(level);
		for (const level of [2, -2, 0.5, "1", null]) expect(error(checkNewType({ name: "T", level }))).toMatch(/level is 1/);
	});

	it("takes has_steps as a boolean", () => {
		expect(value(checkNewType({ name: "Checklist", has_steps: true })).has_steps).toBe(true);
		expect(error(checkNewType({ name: "Checklist", has_steps: "yes" }))).toMatch(/has_steps/);
	});

	it("needs a name of 1 to 60 characters", () => {
		expect(checkNewType({ name: "" }).ok).toBe(false);
		expect(checkNewType({ name: "x".repeat(61), slug: "x" }).ok).toBe(false);
	});

	describe("as a change", () => {
		const current = { slug: "bug", level: 0, legacy_kind: null };

		it("changes the name, look, order, steps and archive", () => {
			expect(
				value(checkTypePatch({ name: " Defect ", icon: "bug", colour: "#F87171", sort_order: 4, has_steps: true, archived: true }, current, NOW)),
			).toEqual({ name: "Defect", icon: "bug", colour: "#f87171", sort_order: 4, has_steps: true, archived_at: NOW.toISOString() });
			expect(value(checkTypePatch({ archived: false }, current, NOW))).toEqual({ archived_at: null });
		});

		it("keeps slug, level and legacy_kind fixed", () => {
			expect(error(checkTypePatch({ slug: "defect" }, current))).toMatch(/slug is fixed/);
			expect(error(checkTypePatch({ level: 1 }, current))).toMatch(/level is fixed/);
			expect(error(checkTypePatch({ legacy_kind: "task" }, current))).toMatch(/legacy_kind is fixed/);
		});

		it("lets the whole type come back unchanged", () => {
			expect(value(checkTypePatch({ slug: "bug", level: 0, legacy_kind: null, name: "Bug" }, current))).toEqual({ name: "Bug" });
		});

		it("refuses a sort_order that is not a whole number", () => {
			expect(checkTypePatch({ sort_order: 1.5 }, current).ok).toBe(false);
			expect(checkTypePatch({ sort_order: "2" }, current).ok).toBe(false);
		});
	});
});

describe("label fields", () => {
	it("makes the slug from the name, with underscores", () => {
		expect(labelFieldSlug("Cost centre")).toBe("cost_centre");
		expect(labelFieldSlug(" Customer / Région ")).toBe("customer_region");
		expect(labelFieldSlug("3rd party")).toBe("rd_party");
	});

	it("takes a new field", () => {
		expect(value(checkNewLabelField({ name: "Cost centre" }))).toEqual({ name: "Cost centre", slug: "cost_centre" });
		expect(value(checkNewLabelField({ name: "Cost centre", slug: "cc" }))).toEqual({ name: "Cost centre", slug: "cc" });
	});

	it("refuses a slug of the wrong shape", () => {
		for (const slug of ["Cost", "cost-centre", "1st", "_x", "cost centre", "a".repeat(33)]) {
			expect(labelFieldSlugProblem(slug)).toMatch(/starts with a letter/);
		}
	});

	it("refuses every reserved word", () => {
		expect([...RESERVED_WORDS].sort()).toEqual(["and", "asc", "by", "desc", "empty", "in", "is", "not", "null", "or", "order"]);
		for (const word of RESERVED_WORDS) {
			expect(labelFieldSlugProblem(word)).toMatch(/keeps for itself/);
			expect(checkNewLabelField({ name: "Anything", slug: word }).ok).toBe(false);
		}
	});

	it("refuses a reserved word that came from the name", () => {
		expect(error(checkNewLabelField({ name: "Order" }))).toMatch(/keeps for itself/);
		expect(error(checkNewLabelField({ name: "Not" }))).toMatch(/keeps for itself/);
	});

	it("refuses every fixed JQL field", () => {
		for (const f of Object.keys(FIELD_KIND)) {
			expect(labelFieldSlugProblem(f.toLowerCase())).toMatch(/already a field/);
		}
	});

	it("refuses the aliases and the ORDER BY names too", () => {
		for (const f of ["labels", "category", "duedate", "issuetype", "summary", "title", "rank", "statuscategory"]) {
			expect(labelFieldSlugProblem(f)).toMatch(/already a field/);
		}
		expect(error(checkNewLabelField({ name: "Status" }))).toMatch(/already a field/);
		expect(error(checkNewLabelField({ name: "Issue type", slug: "issuetype" }))).toMatch(/already a field/);
	});

	it("passes a name of the space's own", () => {
		for (const slug of ["customer", "cost_centre", "team2", "ordering", "island"]) expect(labelFieldSlugProblem(slug)).toBeNull();
	});

	it("changes a field's name and order only", () => {
		expect(value(checkLabelFieldPatch({ name: " Where ", sort_order: 2, slug: "where", is_system: false }))).toEqual({ name: "Where", sort_order: 2 });
		expect(checkLabelFieldPatch({ name: "" }).ok).toBe(false);
	});
});

describe("labels", () => {
	it("slugs as public.work_label_slug does: lower-cased, trimmed, whitespace runs to one space", () => {
		expect(labelSlug("Home")).toBe("home");
		expect(labelSlug("  Home   Office  ")).toBe("home office");
		expect(labelSlug("Home\t\n Office")).toBe("home office");
		expect(labelSlug("PC")).toBe("pc");
		expect(labelSlug("Needs-Review")).toBe("needs-review");
		expect(labelSlug("   ")).toBe("");
	});

	it("trims spaces only at the ends, as btrim does", () => {
		// btrim(name) removes spaces; a tab at the end is then a run of whitespace
		expect(labelSlug("\tHome")).toBe(" home");
		expect(labelSlug("Home\n")).toBe("home ");
	});

	it("cleans a name so that both rules give one slug", () => {
		for (const raw of ["\tHome  Office\n", "  home\toffice ", "HOME OFFICE"]) {
			expect(value(checkLabel({ name: raw }, { partial: false })).slug).toBe("home office");
		}
		expect(cleanName("\tHome  Office\n")).toBe("Home Office");
	});

	it("takes a new label, the name as typed", () => {
		expect(value(checkLabel({ name: " Deep  Work ", colour: "#ABCDEF" }, { partial: false }))).toEqual({
			name: "Deep Work",
			slug: "deep work",
			colour: "#abcdef",
		});
	});

	it("needs a name of 1 to 80 characters", () => {
		expect(error(checkLabel({}, { partial: false }))).toMatch(/needs a name/);
		expect(error(checkLabel({ name: " \t " }, { partial: false }))).toMatch(/needs a name/);
		expect(error(checkLabel({ name: "x".repeat(81) }, { partial: false }))).toMatch(/80 characters/);
		expect(checkLabel({ name: "x".repeat(80) }, { partial: false }).ok).toBe(true);
	});

	it("brings a new slug with a new name, and leaves it alone otherwise", () => {
		expect(value(checkLabel({ name: "Office" }, { partial: true }))).toEqual({ name: "Office", slug: "office" });
		expect(value(checkLabel({ colour: null }, { partial: true }))).toEqual({ colour: null });
		expect(value(checkLabel({ archived: true }, { partial: true, now: NOW }))).toEqual({ archived_at: NOW.toISOString() });
	});
});

describe("saved filters", () => {
	it("makes the slug from the name", () => {
		expect(filterSlug("My open work")).toBe("my-open-work");
		expect(filterSlug("  Due: this week!  ")).toBe("due-this-week");
		expect(filterSlug("2026 plan")).toBe("2026-plan");
		expect(filterSlug("Café bugs")).toBe("cafe-bugs");
		expect(filterSlug("!!!")).toBe("");
	});

	it("keeps a made slug inside the shape the table checks", () => {
		const slug = filterSlug(`${"a".repeat(63)} b c`);
		expect(slug).toBe("a".repeat(63));
		expect(FILTER_SLUG_RE.test(filterSlug("x".repeat(100)))).toBe(true);
	});

	it("finds the next free slug", () => {
		expect(uniqueSlug("bugs", [])).toBe("bugs");
		expect(uniqueSlug("bugs", ["bugs"])).toBe("bugs-2");
		expect(uniqueSlug("bugs", ["bugs", "bugs-2", "bugs-3"])).toBe("bugs-4");
		const long = uniqueSlug("a".repeat(64), ["a".repeat(64)]);
		expect(long).toBe(`${"a".repeat(62)}-2`);
		expect(FILTER_SLUG_RE.test(long)).toBe(true);
	});

	it("stores the JQL as typed beside the query it parses to", () => {
		const f = value(checkFilter({ name: "Home, at the PC", jql: "  Location = home AND Tool = pc ORDER BY due  " }, [], { partial: false }));
		expect(f).toEqual({
			name: "Home, at the PC",
			slug: "home-at-the-pc",
			jql: "Location = home AND Tool = pc ORDER BY due",
			query: {
				where: {
					op: "and",
					nodes: [
						{ field: "location", cmp: "=", value: "home" },
						{ field: "tool", cmp: "=", value: "pc" },
					],
				},
				orderBy: [{ field: "due", dir: "asc" }],
			},
		});
	});

	it("reads the space's own label fields", () => {
		expect(checkFilter({ name: "Acme", jql: "customer = Acme" }, [], { partial: false }).ok).toBe(false);
		const f = value(checkFilter({ name: "Acme", jql: "customer = Acme" }, ["customer"], { partial: false }));
		expect(f.query).toEqual({ where: { field: "customer", cmp: "=", value: "Acme" }, orderBy: [] });
	});

	it("hands back the parser's message and position", () => {
		const r = checkFilter({ name: "Broken", jql: "status = Inbox AND nonsense = 1" }, [], { partial: false });
		expect(r).toEqual({ ok: false, error: 'Unknown field "nonsense".', pos: 19 });
		const open = checkFilter({ name: "Broken", jql: 'status = "Inbox' }, [], { partial: false });
		expect(open.ok).toBe(false);
		if (!open.ok) expect(open.pos).toBe(9);
	});

	it("takes an empty JQL: every ticket", () => {
		expect(value(checkFilter({ name: "Everything", jql: "" }, [], { partial: false })).query).toEqual({ where: null, orderBy: [] });
	});

	it("needs a name and a JQL to create one", () => {
		expect(error(checkFilter({ jql: "status = Inbox" }, [], { partial: false }))).toMatch(/needs a name/);
		expect(error(checkFilter({ name: "Inbox" }, [], { partial: false }))).toMatch(/jql must be text/);
		expect(error(checkFilter({ name: "!!!", jql: "" }, [], { partial: false }))).toMatch(/letter or digit/);
		expect(error(checkFilter({ name: "x".repeat(81), jql: "" }, [], { partial: false }))).toMatch(/80 characters/);
	});

	it("keeps the slug when a filter is renamed", () => {
		expect(value(checkFilter({ name: "Renamed" }, [], { partial: true }))).toEqual({ name: "Renamed" });
	});

	it("changes the JQL and its query together", () => {
		const f = value(checkFilter({ jql: "type = Bug" }, [], { partial: true }));
		expect(f).toEqual({ jql: "type = Bug", query: { where: { field: "type", cmp: "=", value: "Bug" }, orderBy: [] } });
	});

	it("takes shared, description and sort_order", () => {
		expect(value(checkFilter({ shared: false, description: " Mine. ", sort_order: 3 }, [], { partial: true }))).toEqual({
			shared: false,
			description: "Mine.",
			sort_order: 3,
		});
		expect(value(checkFilter({ description: "" }, [], { partial: true }))).toEqual({ description: null });
		expect(checkFilter({ shared: "no" }, [], { partial: true }).ok).toBe(false);
	});
});
