/**
 * Work — boards: the pure parts (workflow resolution, column derivation,
 * dealing, the card query, rank). No database.
 */
import { describe, expect, it } from "vitest";
import {
	backlogQuery,
	boardColumns,
	boardQuery,
	columnCategory,
	configuredColumns,
	dealCards,
	deriveColumns,
	isBacklogStatus,
	placeCard,
	quickFilters,
	rankBetween,
	RANK_STEP,
	resolveWorkflow,
	workflowsInPlay,
} from "./boards";
import { toJql, validateQuery, type StatusCategory } from "./query";
import type { WorkStatus, WorkTicket, WorkflowMapRow } from "./types";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const WF_A = ID(100);
const WF_B = ID(200);
const PROJECT = ID(1);

function status(n: number, name: string, category: StatusCategory, sort_order: number, workflow_id = WF_A): WorkStatus {
	return { id: ID(n), workflow_id, name, category, resolution: category === "done" ? "done" : null, colour: null, sort_order };
}

/** The shape of the seeded workflow (0137 + 0142). */
const SEEDED: WorkStatus[] = [
	status(1, "Inbox", "todo", 10),
	status(2, "Backlog", "todo", 20),
	status(3, "Selected for Development", "todo", 30),
	status(4, "In Progress", "in_progress", 40),
	status(5, "In Review", "in_progress", 50),
	status(6, "Done", "done", 60),
	status(7, "Cancelled", "done", 70),
];

/** A second, shorter workflow with its own numbering. */
const SHORT: WorkStatus[] = [
	status(21, "To Do", "todo", 0, WF_B),
	status(22, "in progress", "in_progress", 1, WF_B),
	status(23, "Done", "done", 2, WF_B),
];

const names = (cols: Array<{ name: string }>) => cols.map((c) => c.name);

describe("resolveWorkflow", () => {
	const row = (n: number, project_id: string | null, issue_type_id: string | null, workflow_id: string): WorkflowMapRow => ({ id: ID(n), project_id, issue_type_id, workflow_id });
	const BUG = ID(31);
	const TASK = ID(32);
	const live = new Set([WF_A, WF_B, ID(300), ID(400)]);

	it("falls back to the space default", () => {
		expect(resolveWorkflow([], PROJECT, TASK, WF_A, live)).toBe(WF_A);
		expect(resolveWorkflow([], PROJECT, null, null, live)).toBeNull();
	});

	it("resolves project + type, then project, then space + type", () => {
		const map = [row(1, null, BUG, ID(300)), row(2, PROJECT, null, WF_B), row(3, PROJECT, BUG, ID(400))];
		expect(resolveWorkflow(map, PROJECT, BUG, WF_A, live)).toBe(ID(400));
		expect(resolveWorkflow(map, PROJECT, TASK, WF_A, live)).toBe(WF_B);
		expect(resolveWorkflow(map.slice(0, 1), PROJECT, BUG, WF_A, live)).toBe(ID(300));
		expect(resolveWorkflow(map.slice(0, 1), PROJECT, TASK, WF_A, live)).toBe(WF_A);
	});

	it("leaves another project's rows alone", () => {
		expect(resolveWorkflow([row(1, ID(2), null, WF_B)], PROJECT, TASK, WF_A, live)).toBe(WF_A);
	});

	it("passes over a mapping to an archived workflow", () => {
		const map = [row(1, PROJECT, BUG, ID(500)), row(2, PROJECT, null, WF_B)];
		expect(resolveWorkflow(map, PROJECT, BUG, WF_A, live)).toBe(WF_B);
	});

	it("workflowsInPlay lists each once, the project's general one first", () => {
		const map = [row(1, null, BUG, WF_B)];
		expect(workflowsInPlay(map, PROJECT, [BUG, TASK], WF_A, live)).toEqual([WF_A, WF_B]);
		expect(workflowsInPlay([], PROJECT, [BUG, TASK], WF_A, live)).toEqual([WF_A]);
		expect(workflowsInPlay([], PROJECT, [], null, live)).toEqual([]);
	});
});

describe("deriveColumns", () => {
	it("one column per status in sort order, whatever order they arrive in", () => {
		const cols = deriveColumns([...SEEDED].reverse(), { boardType: "scrum" });
		expect(names(cols)).toEqual(["Inbox", "Backlog", "Selected for Development", "In Progress", "In Review", "Done", "Cancelled"]);
		expect(cols[0]).toEqual({ name: "Inbox", status_ids: [ID(1)], category: "todo" });
		expect(cols[5].category).toBe("done");
	});

	it("a Kanban board leaves the backlog statuses out", () => {
		const cols = deriveColumns([...SEEDED, status(8, "Product backlog", "todo", 25)], { boardType: "kanban" });
		expect(names(cols)).toEqual(["Inbox", "Selected for Development", "In Progress", "In Review", "Done", "Cancelled"]);
		expect(cols.flatMap((c) => c.status_ids)).not.toContain(ID(2));
	});

	it("a Scrum board keeps them", () => {
		expect(names(deriveColumns(SEEDED, { boardType: "scrum" }))).toContain("Backlog");
	});

	it("merges statuses of the same name across workflows, case and spaces aside", () => {
		const cols = deriveColumns([...SEEDED, ...SHORT], { boardType: "kanban", workflowOrder: [WF_A, WF_B] });
		const inProgress = cols.find((c) => c.name === "In Progress");
		const done = cols.find((c) => c.name === "Done");
		expect(inProgress?.status_ids).toEqual([ID(4), ID(22)]);
		expect(done?.status_ids).toEqual([ID(6), ID(23)]);
		expect(cols.filter((c) => c.name.toLowerCase() === "in progress")).toHaveLength(1);
		// every status lands in exactly one column
		const ids = cols.flatMap((c) => c.status_ids);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toHaveLength(SEEDED.length + SHORT.length - 1);
	});

	it("with several workflows the category leads, so Done never sits left of In Progress", () => {
		const cols = deriveColumns([...SEEDED, ...SHORT], { boardType: "kanban", workflowOrder: [WF_A, WF_B] });
		expect(names(cols)).toEqual(["To Do", "Inbox", "Selected for Development", "In Progress", "In Review", "Done", "Cancelled"]);
		const ranks = cols.map((c) => ({ todo: 1, in_progress: 2, done: 3 })[c.category]);
		expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
	});

	it("with one workflow the sort order alone decides", () => {
		const odd = [status(1, "Review", "in_progress", 1), status(2, "Ready", "todo", 2), status(3, "Shipped", "done", 3)];
		expect(names(deriveColumns(odd, { boardType: "kanban" }))).toEqual(["Review", "Ready", "Shipped"]);
	});

	it("the workflow order breaks a tie", () => {
		const a = status(1, "Alpha", "todo", 5, WF_A);
		const b = status(2, "Beta", "todo", 5, WF_B);
		expect(names(deriveColumns([a, b], { boardType: "kanban", workflowOrder: [WF_B, WF_A] }))).toEqual(["Beta", "Alpha"]);
		expect(names(deriveColumns([b, a], { boardType: "kanban", workflowOrder: [WF_A, WF_B] }))).toEqual(["Alpha", "Beta"]);
	});

	it("nothing in, nothing out", () => {
		expect(deriveColumns([], { boardType: "kanban" })).toEqual([]);
	});
});

describe("configured columns", () => {
	const known = new Map(SEEDED.map((s) => [s.id, s]));

	it("drops status ids that no longer exist and keeps the column", () => {
		const cols = configuredColumns(
			[
				{ name: "Next", status_ids: [ID(3), ID(999)] },
				{ name: "Gone", status_ids: [ID(998)] },
				{ name: "Finished", status_ids: [ID(6), ID(7)] },
			],
			known,
		);
		expect(cols).toEqual([
			{ name: "Next", status_ids: [ID(3)], category: "todo" },
			{ name: "Gone", status_ids: [], category: "todo" },
			{ name: "Finished", status_ids: [ID(6), ID(7)], category: "done" },
		]);
	});

	it("a status named twice stays in the first column", () => {
		const cols = configuredColumns(
			[
				{ name: "A", status_ids: [ID(4)] },
				{ name: "B", status_ids: [ID(4), ID(5)] },
			],
			known,
		);
		expect(cols.map((c) => c.status_ids)).toEqual([[ID(4)], [ID(5)]]);
	});

	it("columnCategory", () => {
		expect(columnCategory([])).toBe("todo");
		expect(columnCategory([SEEDED[0], SEEDED[1]])).toBe("todo");
		expect(columnCategory([SEEDED[5], SEEDED[6]])).toBe("done");
		expect(columnCategory([SEEDED[2], SEEDED[3]])).toBe("in_progress");
		expect(columnCategory([SEEDED[4], SEEDED[5]])).toBe("in_progress");
	});

	it("boardColumns uses the project's own columns when it has them, the backlog included", () => {
		const own = boardColumns({ board_type: "kanban", board_columns: [{ name: "Later", status_ids: [ID(2)] }] }, SEEDED, known);
		expect(own).toEqual([{ name: "Later", status_ids: [ID(2)], category: "todo" }]);
	});

	it("boardColumns derives when there are none", () => {
		expect(names(boardColumns({ board_type: "kanban", board_columns: null }, SEEDED, known))).not.toContain("Backlog");
		expect(names(boardColumns({ board_type: "scrum", board_columns: [] }, SEEDED, known))).toContain("Backlog");
	});
});

describe("dealCards", () => {
	const card = (n: number, s: WorkStatus | null): WorkTicket =>
		({ id: ID(n), key: `PW-${n}`, status: s ? { id: s.id, name: s.name, category: s.category, colour: null, workflow_id: s.workflow_id } : null }) as unknown as WorkTicket;

	it("puts each card in its status's column, in the order given", () => {
		const cols = deriveColumns([...SEEDED, ...SHORT], { boardType: "kanban", workflowOrder: [WF_A, WF_B] });
		const dealt = dealCards(cols, [card(1, SEEDED[3]), card(2, SHORT[1]), card(3, SEEDED[5]), card(4, SEEDED[3])]);
		expect(dealt.find((c) => c.name === "In Progress")?.tickets.map((t) => t.key)).toEqual(["PW-1", "PW-2", "PW-4"]);
		expect(dealt.find((c) => c.name === "Done")?.tickets.map((t) => t.key)).toEqual(["PW-3"]);
		expect(dealt.find((c) => c.name === "Inbox")?.tickets).toEqual([]);
	});

	it("leaves out a card whose status has no column", () => {
		const cols = deriveColumns(SEEDED, { boardType: "kanban" });
		const dealt = dealCards(cols, [card(1, SEEDED[1]), card(2, null)]);
		expect(dealt.flatMap((c) => c.tickets)).toEqual([]);
	});

	it("does not touch the columns it was given", () => {
		const cols = deriveColumns(SEEDED, { boardType: "kanban" });
		dealCards(cols, [card(1, SEEDED[3])]);
		expect("tickets" in cols[0]).toBe(false);
	});
});

describe("the card query", () => {
	it("Kanban: the project, Done for fourteen days, no backlog", () => {
		const q = boardQuery({ projectId: PROJECT, boardType: "kanban" });
		expect(validateQuery(q).ok).toBe(true);
		expect(toJql(q)).toBe(`project = ${PROJECT} AND (statusCategory != Done OR resolved >= -14d) AND NOT status ~ backlog ORDER BY rank ASC, created ASC`);
	});

	it("Kanban with its own columns: those statuses, the backlog if named", () => {
		const q = boardQuery({ projectId: PROJECT, boardType: "kanban", statusIds: [ID(2), ID(4)] });
		expect(validateQuery(q).ok).toBe(true);
		expect(toJql(q)).toBe(`project = ${PROJECT} AND (statusCategory != Done OR resolved >= -14d) AND status IN (${ID(2)}, ${ID(4)}) ORDER BY rank ASC, created ASC`);
	});

	it("Scrum: the sprint, everything in it", () => {
		const q = boardQuery({ projectId: PROJECT, boardType: "scrum", sprintId: ID(50) });
		expect(validateQuery(q).ok).toBe(true);
		expect(toJql(q)).toBe(`project = ${PROJECT} AND sprint = ${ID(50)} ORDER BY rank ASC, created ASC`);
	});

	it("quick filters are ANDed on", () => {
		const filters = quickFilters(new URLSearchParams("assignee=me&type=bug,story&epic=PW-4&label=urgent&label=&other=x"));
		expect(filters).toEqual([
			{ field: "assignee", cmp: "=", value: "me" },
			{ field: "type", cmp: "in", value: ["bug", "story"] },
			{ field: "epic", cmp: "=", value: "PW-4" },
			{ field: "label", cmp: "=", value: "urgent" },
		]);
		const q = boardQuery({ projectId: PROJECT, boardType: "scrum", sprintId: ID(50), filters });
		expect(validateQuery(q).ok).toBe(true);
		expect(toJql(q)).toContain("AND assignee = me AND type IN (bug, story) AND epic = PW-4 AND label = urgent");
	});

	it("no quick filters, no clauses", () => {
		expect(quickFilters(new URLSearchParams(""))).toEqual([]);
		expect(quickFilters(new URLSearchParams("assignee=&type=%20"))).toEqual([]);
	});

	it("the backlog: open, in no sprint, no sub-tasks", () => {
		const q = backlogQuery(PROJECT, [ID(40)]);
		expect(validateQuery(q).ok).toBe(true);
		expect(toJql(q)).toBe(`project = ${PROJECT} AND sprint IS EMPTY AND statusCategory != Done AND (type IS EMPTY OR type NOT IN (${ID(40)})) ORDER BY rank ASC, created ASC`);
		expect(toJql(backlogQuery(PROJECT, []))).toBe(`project = ${PROJECT} AND sprint IS EMPTY AND statusCategory != Done ORDER BY rank ASC, created ASC`);
	});

	it("isBacklogStatus", () => {
		expect(isBacklogStatus("Backlog")).toBe(true);
		expect(isBacklogStatus("product BACKLOG")).toBe(true);
		expect(isBacklogStatus("Back log")).toBe(false);
		expect(isBacklogStatus("Inbox")).toBe(false);
	});
});

describe("rankBetween", () => {
	it("the middle of a gap", () => {
		expect(rankBetween(1024, 2048)).toBe(1536);
		expect(rankBetween(0, 2)).toBe(1);
		expect(rankBetween(-10, -2)).toBe(-6);
		expect(rankBetween(-3, 4)).toBe(0);
	});

	it("null when there is no room", () => {
		expect(rankBetween(5, 6)).toBeNull();
		expect(rankBetween(5, 5)).toBeNull();
		expect(rankBetween(0, 0)).toBeNull();
	});

	it("a step clear of a single neighbour", () => {
		expect(rankBetween(null, 2048)).toBe(1024);
		expect(rankBetween(null, 0)).toBe(-RANK_STEP);
		expect(rankBetween(4096, null)).toBe(5120);
		expect(rankBetween(null, null)).toBe(RANK_STEP);
	});

	it("stays inside a Postgres int", () => {
		expect(rankBetween(2_000_000_000, null)).toBeNull();
		expect(rankBetween(null, -2_000_000_000)).toBeNull();
	});

	it("is always strictly between", () => {
		for (const [a, b] of [[0, 1024], [7, 9], [-2048, -1024], [100, 103]] as const) {
			const r = rankBetween(a, b);
			expect(r).not.toBeNull();
			expect(r as number).toBeGreaterThan(a);
			expect(r as number).toBeLessThan(b);
			expect(Number.isInteger(r)).toBe(true);
		}
	});
});

describe("placeCard", () => {
	const spaced = [
		{ id: "a", rank: 1024 },
		{ id: "b", rank: 2048 },
		{ id: "c", rank: 3072 },
	];
	const flat = [
		{ id: "a", rank: 0 },
		{ id: "b", rank: 0 },
		{ id: "c", rank: 0 },
	];

	it("before a card: directly above it", () => {
		expect(placeCard(spaced, { before: "b" })).toEqual({ ok: true, rank: 1536, index: 1, renumber: [] });
		expect(placeCard(spaced, { before: "a" })).toEqual({ ok: true, rank: 0, index: 0, renumber: [] });
	});

	it("after a card: directly below it", () => {
		expect(placeCard(spaced, { after: "b" })).toEqual({ ok: true, rank: 2560, index: 2, renumber: [] });
		expect(placeCard(spaced, { after: "c" })).toEqual({ ok: true, rank: 4096, index: 3, renumber: [] });
	});

	it("between two, whichever way round they are named", () => {
		expect(placeCard(spaced, { after: "a", before: "b" })).toMatchObject({ ok: true, rank: 1536, index: 1 });
		expect(placeCard(spaced, { after: "b", before: "a" })).toMatchObject({ ok: true, rank: 1536, index: 1 });
	});

	it("no neighbour: the end of the column", () => {
		expect(placeCard(spaced, {})).toEqual({ ok: true, rank: 4096, index: 3, renumber: [] });
		expect(placeCard(spaced, { before: null, after: null })).toMatchObject({ rank: 4096 });
		expect(placeCard([], {})).toEqual({ ok: true, rank: RANK_STEP, index: 0, renumber: [] });
	});

	it("no gap: the column is renumbered in steps of 1024 first", () => {
		const p = placeCard(flat, { before: "b" });
		expect(p).toEqual({
			ok: true,
			rank: 1536,
			index: 1,
			renumber: [
				{ id: "a", rank: 1024 },
				{ id: "b", rank: 2048 },
				{ id: "c", rank: 3072 },
			],
		});
	});

	it("renumbering writes only the ranks that change", () => {
		const tight = [
			{ id: "a", rank: 1024 },
			{ id: "b", rank: 2048 },
			{ id: "c", rank: 2049 },
		];
		const p = placeCard(tight, { after: "b" });
		expect(p).toEqual({ ok: true, rank: 2560, index: 2, renumber: [{ id: "c", rank: 3072 }] });
	});

	it("the order of the column survives a renumbering", () => {
		const p = placeCard(flat, { after: "c", before: null });
		// the end of a flat column has room: no renumbering needed
		expect(p).toEqual({ ok: true, rank: 1024, index: 3, renumber: [] });
		const q = placeCard(flat, { after: "a" });
		if (!q.ok) throw new Error(q.error);
		const after = [...q.renumber, { id: "moved", rank: q.rank }].sort((x, y) => x.rank - y.rank).map((c) => c.id);
		expect(after).toEqual(["a", "moved", "b", "c"]);
	});

	it("repeated drops into one gap renumber when it runs out, and never collide", () => {
		let column = [
			{ id: "top", rank: 1024 },
			{ id: "bottom", rank: 2048 },
		];
		let renumbered = 0;
		for (let i = 0; i < 40; i++) {
			const p = placeCard(column, { after: "top" });
			if (!p.ok) throw new Error(p.error);
			if (p.renumber.length > 0) renumbered += 1;
			const ranks = new Map(p.renumber.map((c) => [c.id, c.rank]));
			column = column.map((c) => ({ id: c.id, rank: ranks.get(c.id) ?? c.rank }));
			column.splice(p.index, 0, { id: `n${i}`, rank: p.rank });
			const sorted = [...column].sort((x, y) => x.rank - y.rank);
			expect(sorted.map((c) => c.id)).toEqual(column.map((c) => c.id));
			expect(new Set(column.map((c) => c.rank)).size).toBe(column.length);
		}
		expect(renumbered).toBeGreaterThan(0);
		expect(column[0].id).toBe("top");
		expect(column[1].id).toBe("n39");
	});

	it("refuses a neighbour that is not in the column", () => {
		expect(placeCard(spaced, { before: "zz" })).toEqual({ ok: false, error: "That neighbour is not in the column." });
		expect(placeCard(spaced, { after: "a", before: "zz" }).ok).toBe(false);
	});
});
