/**
 * Work — projects: the pure parts (field whitelist, progress tally,
 * grouping, issue type picks, component fields). No database.
 */
import { describe, expect, it } from "vitest";
import {
	componentWriteFromBody,
	dedupeColumns,
	emptyProgress,
	groupByCategory,
	isIsoDate,
	offeredTypes,
	prefixOf,
	projectWriteFromBody,
	tallyProgress,
	typeIdsFromBody,
} from "./projects";
import type { WorkProject, WorkType } from "./types";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function project(over: Partial<WorkProject> = {}): WorkProject {
	return {
		id: ID(1),
		key: "DSA",
		name: "DropShipAuto",
		description: null,
		status: "active",
		colour: null,
		is_default: false,
		category_id: null,
		category_name: null,
		lead_user_id: null,
		start_on: null,
		target_on: null,
		links: [],
		board_type: "kanban",
		board_columns: null,
		github_repo: null,
		space_id: ID(9),
		created_at: "2026-09-01T00:00:00Z",
		updated_at: "2026-09-01T00:00:00Z",
		...over,
	};
}

const general = () => project({ id: ID(2), key: "PW", name: "General", is_default: true });

describe("projectWriteFromBody — create", () => {
	it("needs a name", () => {
		expect(projectWriteFromBody({}, null).error).toMatch(/name/);
		expect(projectWriteFromBody({ name: "   " }, null).error).toMatch(/name/);
		expect(projectWriteFromBody({ name: 42 }, null).error).toMatch(/name/);
	});

	it("takes a name alone, tidied", () => {
		const w = projectWriteFromBody({ name: "  zz-test   board  " }, null);
		expect(w.error).toBeNull();
		expect(w.columns).toEqual({ name: "zz-test board" });
	});

	it("maps key → prefix, upper-cased, and category_id → area_id", () => {
		const w = projectWriteFromBody({ name: "x", key: " zzt1 ", category_id: ID(5) }, null);
		expect(w.error).toBeNull();
		expect(w.columns.prefix).toBe("ZZT1");
		expect(w.columns.area_id).toBe(ID(5));
		expect("key" in w.columns).toBe(false);
		expect("category_id" in w.columns).toBe(false);
	});

	it("leaves an empty key out", () => {
		expect(projectWriteFromBody({ name: "x", key: "" }, null).columns).toEqual({ name: "x" });
		expect(projectWriteFromBody({ name: "x", key: null }, null).columns).toEqual({ name: "x" });
	});

	it.each(["A", "1AB", "TOOLONG", "AB-C", "AB C", "ÀB"])("refuses the key %s", (key) => {
		const w = projectWriteFromBody({ name: "x", key }, null);
		expect(w.error).toMatch(/project key/);
		expect(w.status).toBe(400);
		expect(w.columns).toEqual({});
	});

	it.each(["AB", "A1", "ABCDE", "Z9Z9Z"])("takes the key %s", (key) => {
		expect(projectWriteFromBody({ name: "x", key }, null).columns.prefix).toBe(key);
	});

	it("never writes is_default or anything off the list", () => {
		const w = projectWriteFromBody({ name: "x", is_default: true, space_id: ID(3), id: ID(4), next_seq: 9, parent_id: ID(5), sort_order: 3 }, null);
		expect(w.error).toBeNull();
		expect(Object.keys(w.columns)).toEqual(["name"]);
	});
});

describe("projectWriteFromBody — patch", () => {
	it("writes only what was sent", () => {
		const w = projectWriteFromBody({ description: " Hello " }, project());
		expect(w.columns).toEqual({ description: "Hello" });
	});

	it("an empty name is refused, a missing one is not", () => {
		expect(projectWriteFromBody({ name: "" }, project()).error).toMatch(/name/);
		expect(projectWriteFromBody({ colour: null }, project()).error).toBeNull();
	});

	it("the key a project already has is nothing to write", () => {
		expect(projectWriteFromBody({ key: "dsa" }, project()).columns).toEqual({});
		// a project with no prefix answers to its id
		expect(projectWriteFromBody({ key: ID(1) }, project({ key: ID(1) })).columns).toEqual({});
	});

	it("a new key is written for the database check to rule on", () => {
		expect(projectWriteFromBody({ key: "dsb" }, project()).columns).toEqual({ prefix: "DSB" });
	});

	it("clearing a key writes null only when there is one", () => {
		expect(projectWriteFromBody({ key: null }, project()).columns).toEqual({ prefix: null });
		expect(projectWriteFromBody({ key: null }, project({ key: ID(1) })).columns).toEqual({});
	});

	it("the default project cannot be given a key", () => {
		const w = projectWriteFromBody({ key: "GEN" }, general());
		expect(w.error).toMatch(/default project/);
		expect(w.status).toBe(409);
	});

	it("the default project may be sent the space key it answers to", () => {
		expect(projectWriteFromBody({ key: "PW", name: "General" }, general()).columns).toEqual({ name: "General" });
		expect(projectWriteFromBody({ key: null }, general()).columns).toEqual({});
	});

	it("the default project cannot be archived, but can be paused", () => {
		const w = projectWriteFromBody({ status: "archived" }, general());
		expect(w.error).toMatch(/cannot be archived/);
		expect(w.status).toBe(409);
		expect(projectWriteFromBody({ status: "paused" }, general()).columns).toEqual({ status: "paused" });
	});

	it("is_default is never writable", () => {
		expect(projectWriteFromBody({ is_default: true }, project()).columns).toEqual({});
		expect(projectWriteFromBody({ is_default: false }, general()).columns).toEqual({});
	});

	it("checks status, colour, board type and repo", () => {
		expect(projectWriteFromBody({ status: "completed" }, project()).error).toMatch(/status/);
		expect(projectWriteFromBody({ colour: "red" }, project()).error).toMatch(/colour/);
		expect(projectWriteFromBody({ colour: "#ABCDEF" }, project()).columns).toEqual({ colour: "#abcdef" });
		expect(projectWriteFromBody({ colour: "" }, project()).columns).toEqual({ colour: null });
		expect(projectWriteFromBody({ board_type: "list" }, project()).error).toMatch(/board_type/);
		expect(projectWriteFromBody({ board_type: "scrum" }, project()).columns).toEqual({ board_type: "scrum" });
		expect(projectWriteFromBody({ github_repo: "not a repo" }, project()).error).toMatch(/github_repo/);
		expect(projectWriteFromBody({ github_repo: "phil/mycelium" }, project()).columns).toEqual({ github_repo: "phil/mycelium" });
	});

	it("checks ids", () => {
		expect(projectWriteFromBody({ category_id: "life" }, project()).error).toMatch(/category_id/);
		expect(projectWriteFromBody({ lead_user_id: "phil" }, project()).error).toMatch(/lead_user_id/);
		expect(projectWriteFromBody({ category_id: null, lead_user_id: null }, project()).columns).toEqual({ area_id: null, lead_user_id: null });
	});

	it("checks dates, and their order against what is stored", () => {
		expect(projectWriteFromBody({ start_on: "01/10/2026" }, project()).error).toMatch(/start_on/);
		expect(projectWriteFromBody({ target_on: "2026-02-30" }, project()).error).toMatch(/target_on/);
		expect(projectWriteFromBody({ start_on: "2026-10-01", target_on: "2026-09-01" }, project()).error).toMatch(/before the start/);
		expect(projectWriteFromBody({ target_on: "2026-09-01" }, project({ start_on: "2026-10-01" })).error).toMatch(/before the start/);
		expect(projectWriteFromBody({ start_on: null, target_on: "2026-09-01" }, project({ start_on: "2026-10-01" })).error).toBeNull();
		expect(projectWriteFromBody({ start_on: "2026-10-01", target_on: "2026-10-01" }, project()).columns).toEqual({ start_on: "2026-10-01", target_on: "2026-10-01" });
	});

	it("cleans links and refuses one without a web address", () => {
		expect(projectWriteFromBody({ links: "https://example.com" }, project()).error).toMatch(/links/);
		expect(projectWriteFromBody({ links: [{ label: "x", url: "ftp://example.com" }] }, project()).error).toMatch(/http/);
		expect(projectWriteFromBody({ links: [{ label: " Repo ", url: " https://example.com/r " }, { url: "http://example.com" }] }, project()).columns).toEqual({
			links: [
				{ label: "Repo", url: "https://example.com/r" },
				{ label: "http://example.com", url: "http://example.com" },
			],
		});
		expect(projectWriteFromBody({ links: [] }, project()).columns).toEqual({ links: [] });
	});

	it("board columns: null and an empty list reset, a nameless column is refused", () => {
		expect(projectWriteFromBody({ board_columns: null }, project()).columns).toEqual({ board_columns: null });
		expect(projectWriteFromBody({ board_columns: [] }, project()).columns).toEqual({ board_columns: null });
		expect(projectWriteFromBody({ board_columns: "To Do" }, project()).error).toMatch(/board_columns/);
		expect(projectWriteFromBody({ board_columns: [{ name: "", status_ids: [ID(1)] }] }, project()).error).toMatch(/name/);
	});

	it("board columns: a status stays in the first column that names it, junk ids go", () => {
		const w = projectWriteFromBody(
			{
				board_columns: [
					{ name: "To Do", status_ids: [ID(1), ID(2), "nope", 7] },
					{ name: "Doing", status_ids: [ID(2), ID(3)] },
				],
			},
			project(),
		);
		expect(w.error).toBeNull();
		expect(w.columns.board_columns).toEqual([
			{ name: "To Do", status_ids: [ID(1), ID(2)] },
			{ name: "Doing", status_ids: [ID(3)] },
		]);
	});
});

describe("helpers", () => {
	it("prefixOf", () => {
		expect(prefixOf(project())).toBe("DSA");
		expect(prefixOf(project({ key: ID(1) }))).toBeNull();
		expect(prefixOf(general())).toBeNull();
	});

	it("isIsoDate", () => {
		expect(isIsoDate("2026-09-30")).toBe(true);
		expect(isIsoDate("2026-09-31")).toBe(false);
		expect(isIsoDate("2026-9-3")).toBe(false);
		expect(isIsoDate(20260930)).toBe(false);
	});

	it("dedupeColumns passes null through", () => {
		expect(dedupeColumns(null)).toBeNull();
	});
});

describe("tallyProgress", () => {
	it("counts by status category and adds up points", () => {
		const out = tallyProgress(
			[
				{ project_id: ID(1), points: 3, category: "todo" },
				{ project_id: ID(1), points: null, category: "todo" },
				{ project_id: ID(1), points: 5, category: "in_progress" },
				{ project_id: ID(1), points: 8, category: "done" },
				{ project_id: ID(1), points: 2, category: "done" },
				{ project_id: ID(2), points: 1, category: null },
				{ project_id: null, points: 13, category: "done" },
			],
			[ID(1), ID(2), ID(3)],
		);
		expect(out.get(ID(1))).toEqual({ todo: 2, in_progress: 1, done: 2, total: 5, points_total: 18, points_done: 10 });
		// no status counts as To Do
		expect(out.get(ID(2))).toEqual({ todo: 1, in_progress: 0, done: 0, total: 1, points_total: 1, points_done: 0 });
		// a project with no tickets still has a row
		expect(out.get(ID(3))).toEqual(emptyProgress());
		expect(out.size).toBe(3);
	});

	it("gives each project its own counts", () => {
		const out = tallyProgress([], [ID(1), ID(2)]);
		expect(out.get(ID(1))).not.toBe(out.get(ID(2)));
	});
});

describe("groupByCategory", () => {
	const cats = [
		{ id: ID(10), name: "Technical", colour: "#7aa2f7", archived_at: null },
		{ id: ID(11), name: "Life", colour: null, archived_at: null },
		{ id: ID(12), name: "Old", colour: null, archived_at: "2026-01-01T00:00:00Z" },
		{ id: ID(13), name: "Old but used", colour: null, archived_at: "2026-01-01T00:00:00Z" },
	];

	it("groups in category order and keeps the rest apart", () => {
		const a = { id: "a", category_id: ID(11) };
		const b = { id: "b", category_id: ID(10) };
		const c = { id: "c", category_id: null };
		const d = { id: "d", category_id: ID(99) };
		const e = { id: "e", category_id: ID(13) };
		const f = { id: "f", category_id: ID(11) };
		const out = groupByCategory([a, b, c, d, e, f], cats);
		expect(out.categories.map((g) => [g.name, g.projects.map((p) => p.id)])).toEqual([
			["Technical", ["b"]],
			["Life", ["a", "f"]],
			["Old but used", ["e"]],
		]);
		expect(out.uncategorised.map((p) => p.id)).toEqual(["c", "d"]);
	});

	it("keeps a live category that is empty", () => {
		expect(groupByCategory([], cats).categories.map((g) => g.name)).toEqual(["Technical", "Life"]);
	});
});

describe("issue types a project offers", () => {
	const type = (n: number, name: string, over: Partial<WorkType> = {}): WorkType => ({
		id: ID(n),
		name,
		slug: name.toLowerCase(),
		level: 0,
		has_steps: false,
		icon: null,
		colour: null,
		sort_order: n,
		archived_at: null,
		...over,
	});
	const all = [type(3, "Bug"), type(1, "Epic", { level: 1 }), type(2, "Task"), type(4, "Gone", { archived_at: "2026-01-01T00:00:00Z" })];

	it("no picks = every unarchived type, in order", () => {
		const out = offeredTypes(all, []);
		expect(out.restricted).toBe(false);
		expect(out.type_ids).toEqual([]);
		expect(out.types.map((t) => t.name)).toEqual(["Epic", "Task", "Bug"]);
	});

	it("picks narrow the list; an archived or unknown pick offers nothing", () => {
		const out = offeredTypes(all, [ID(3), ID(4), ID(77), ID(3)]);
		expect(out.restricted).toBe(true);
		expect(out.type_ids).toEqual([ID(3), ID(4)]);
		expect(out.types.map((t) => t.name)).toEqual(["Bug"]);
	});

	it("typeIdsFromBody", () => {
		expect(typeIdsFromBody({}).error).toMatch(/type_ids/);
		expect(typeIdsFromBody({ type_ids: "all" }).error).toMatch(/type_ids/);
		expect(typeIdsFromBody({ type_ids: [ID(1), "task"] }).error).toMatch(/type_ids/);
		expect(typeIdsFromBody({ type_ids: [] })).toEqual({ ids: [], error: null });
		expect(typeIdsFromBody({ type_ids: [ID(1), ID(2), ID(1).toUpperCase()] })).toEqual({ ids: [ID(1), ID(2)], error: null });
	});
});

describe("componentWriteFromBody", () => {
	const now = new Date("2026-09-30T10:00:00Z");

	it("create needs a name and takes no rank or archive flag", () => {
		expect(componentWriteFromBody({}, true).error).toMatch(/name/);
		expect(componentWriteFromBody({ name: " zz-test  API ", description: "", sort_order: 4, archived: true }, true, now)).toEqual({
			columns: { name: "zz-test API", description: null },
			error: null,
		});
	});

	it("patch writes what was sent", () => {
		expect(componentWriteFromBody({ archived: true }, false, now).columns).toEqual({ archived_at: "2026-09-30T10:00:00.000Z" });
		expect(componentWriteFromBody({ archived: false }, false, now).columns).toEqual({ archived_at: null });
		expect(componentWriteFromBody({ sort_order: 2.6, lead_user_id: ID(1) }, false, now).columns).toEqual({ sort_order: 3, lead_user_id: ID(1) });
		expect(componentWriteFromBody({}, false, now).columns).toEqual({});
	});

	it("patch refuses what it cannot read", () => {
		expect(componentWriteFromBody({ name: "" }, false).error).toMatch(/name/);
		expect(componentWriteFromBody({ archived: "yes" }, false).error).toMatch(/archived/);
		expect(componentWriteFromBody({ sort_order: "first" }, false).error).toMatch(/sort_order/);
		expect(componentWriteFromBody({ lead_user_id: "phil" }, false).error).toMatch(/lead_user_id/);
		expect(componentWriteFromBody({ description: 5 }, false).error).toMatch(/description/);
	});
});
