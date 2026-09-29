/**
 * Work — boards and the backlog (claude/spec-work.md §4, §5).
 *
 * A board is a project's tickets dealt into columns. The columns are the
 * project's own (`projects.board_columns`) or, when it has none, derived
 * from the workflows its tickets can use — statuses of the same name in
 * different workflows share a column. Kanban shows the whole project,
 * Scrum the active sprint. A card's place in its column is its rank
 * (`tickets.sort_order`).
 *
 * The column, query and rank logic is pure and tested in ./boards.test.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { londonNow } from "@/lib/tickets/categories";
import { SPRINT_SELECT, summarise, type SprintRow, type SprintSummary } from "@/lib/tickets/sprints";
import { typesOffered } from "./projects";
import { validateQuery, type Node, type StatusCategory, type WorkQuery } from "./query";
import { searchTickets, serializeStatus, STATUS_SELECT } from "./server";
import type { BoardColumn, WorkProject, WorkStatus, WorkTicket, WorkflowMapRow } from "./types";

export const BOARD_CARD_LIMIT = 500;
export const DONE_WINDOW_DAYS = 14;
export const RANK_STEP = 1024;
/** `tickets.sort_order` is a Postgres int. */
const RANK_MAX = 2_000_000_000;

const BACKLOG_RE = /backlog/i;
const CATEGORY_RANK: Record<StatusCategory, number> = { todo: 1, in_progress: 2, done: 3 };

export type BoardType = WorkProject["board_type"];
export type BoardColumnView = { name: string; status_ids: string[]; category: StatusCategory };
export type BoardColumnCards = BoardColumnView & { tickets: WorkTicket[] };

/** A status that belongs to the Backlog page, not to a Kanban board. */
export function isBacklogStatus(name: string): boolean {
	return BACKLOG_RE.test(name);
}

// ---------------------------------------------------------------------
// Which workflows a project's tickets can use
// ---------------------------------------------------------------------

/**
 * The workflow for a project and type — the order 0142's
 * `ticket_workflow_for` resolves in: project + type, project + any type,
 * space + type, the space default. A mapping to an archived workflow
 * (one not in `live`) is passed over.
 */
export function resolveWorkflow(
	map: readonly WorkflowMapRow[],
	projectId: string,
	typeId: string | null,
	defaultId: string | null,
	live: ReadonlySet<string>,
): string | null {
	const pick = (project: string | null, type: string | null): string | null =>
		map.find((m) => m.project_id === project && m.issue_type_id === type && live.has(m.workflow_id))?.workflow_id ?? null;
	return (
		(typeId ? pick(projectId, typeId) : null) ??
		pick(projectId, null) ??
		(typeId ? pick(null, typeId) : null) ??
		defaultId
	);
}

/** Every workflow a ticket of this project can be in, the project's general one first. */
export function workflowsInPlay(
	map: readonly WorkflowMapRow[],
	projectId: string,
	typeIds: readonly string[],
	defaultId: string | null,
	live: ReadonlySet<string>,
): string[] {
	const out: string[] = [];
	const add = (id: string | null) => {
		if (id && !out.includes(id)) out.push(id);
	};
	add(resolveWorkflow(map, projectId, null, defaultId, live));
	for (const t of typeIds) add(resolveWorkflow(map, projectId, t, defaultId, live));
	return out;
}

// ---------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------

/** One category for a column of several statuses. */
export function columnCategory(statuses: ReadonlyArray<Pick<WorkStatus, "category">>): StatusCategory {
	if (statuses.length === 0) return "todo";
	if (statuses.every((s) => s.category === "done")) return "done";
	if (statuses.every((s) => s.category === "todo")) return "todo";
	return "in_progress";
}

/**
 * Columns from workflow statuses: one per status in `sort_order`, statuses
 * of the same name merged into one column. With one workflow the order is
 * its `sort_order` alone; with several, the status category leads, so a
 * Done column never sits left of an In Progress one. A Kanban board leaves
 * the backlog statuses out.
 */
export function deriveColumns(
	statuses: readonly WorkStatus[],
	opts: { boardType: BoardType; workflowOrder?: readonly string[] },
): BoardColumnView[] {
	const order = opts.workflowOrder ?? [];
	const rank = (wf: string): number => {
		const i = order.indexOf(wf);
		return i < 0 ? order.length : i;
	};
	const several = new Set(statuses.map((s) => s.workflow_id)).size > 1;
	const sorted = [...statuses].sort(
		(a, b) =>
			(several ? CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] : 0) ||
			a.sort_order - b.sort_order ||
			rank(a.workflow_id) - rank(b.workflow_id) ||
			a.name.localeCompare(b.name),
	);
	const columns = new Map<string, WorkStatus[]>();
	for (const s of sorted) {
		if (opts.boardType === "kanban" && isBacklogStatus(s.name)) continue;
		const k = s.name.trim().toLowerCase();
		const col = columns.get(k);
		if (!col) columns.set(k, [s]);
		else if (!col.some((x) => x.id === s.id)) col.push(s);
	}
	return [...columns.values()].map((statuses) => {
		// the column is named and categorised by the leading workflow's status
		const own = [...statuses].sort((a, b) => rank(a.workflow_id) - rank(b.workflow_id) || a.sort_order - b.sort_order);
		return { name: own[0].name.trim(), status_ids: own.map((s) => s.id), category: own[0].category };
	});
}

/** A project's own columns, without the status ids that no longer exist. */
export function configuredColumns(config: readonly BoardColumn[], known: ReadonlyMap<string, WorkStatus>): BoardColumnView[] {
	const seen = new Set<string>();
	return config.map((c) => {
		const statuses: WorkStatus[] = [];
		for (const id of c.status_ids) {
			const s = known.get(id) ?? known.get(id.toLowerCase());
			if (!s || seen.has(s.id)) continue;
			seen.add(s.id);
			statuses.push(s);
		}
		return { name: c.name, status_ids: statuses.map((s) => s.id), category: columnCategory(statuses) };
	});
}

/** The board's columns: the project's own when it has them, else derived. */
export function boardColumns(
	project: Pick<WorkProject, "board_type" | "board_columns">,
	inPlay: readonly WorkStatus[],
	known: ReadonlyMap<string, WorkStatus>,
	workflowOrder: readonly string[] = [],
): BoardColumnView[] {
	if (project.board_columns && project.board_columns.length > 0) return configuredColumns(project.board_columns, known);
	return deriveColumns(inPlay, { boardType: project.board_type, workflowOrder });
}

/** Deal tickets into columns by status, keeping the order they came in. */
export function dealCards(columns: readonly BoardColumnView[], tickets: readonly WorkTicket[]): BoardColumnCards[] {
	const byStatus = new Map<string, number>();
	columns.forEach((c, i) => {
		for (const id of c.status_ids) if (!byStatus.has(id)) byStatus.set(id, i);
	});
	const out: BoardColumnCards[] = columns.map((c) => ({ ...c, tickets: [] }));
	for (const t of tickets) {
		const i = t.status ? byStatus.get(t.status.id) : undefined;
		if (i !== undefined) out[i].tickets.push(t);
	}
	return out;
}

// ---------------------------------------------------------------------
// The card query
// ---------------------------------------------------------------------

export const QUICK_FILTERS = ["assignee", "type", "epic", "label"] as const;

/** `?assignee=me&type=bug&epic=PW-4&label=urgent` as clauses; a repeated or comma-separated value is an IN. */
export function quickFilters(params: URLSearchParams): Node[] {
	const nodes: Node[] = [];
	for (const field of QUICK_FILTERS) {
		const values = Array.from(
			new Set(
				params
					.getAll(field)
					.flatMap((v) => v.split(","))
					.map((v) => v.trim())
					.filter(Boolean),
			),
		);
		if (values.length === 1) nodes.push({ field, cmp: "=", value: values[0] });
		else if (values.length > 1) nodes.push({ field, cmp: "in", value: values });
	}
	return nodes;
}

const BY_RANK: WorkQuery["orderBy"] = [
	{ field: "rank", dir: "asc" },
	{ field: "created", dir: "asc" },
];

/**
 * The cards of a board. Kanban: the whole project, Done only when resolved
 * in the last 14 days, the backlog statuses left out unless the project's
 * own columns name them. Scrum: the sprint given.
 */
export function boardQuery(opts: {
	projectId: string;
	boardType: BoardType;
	sprintId?: string | null;
	/** The project's own columns' statuses; null when the columns are derived. */
	statusIds?: readonly string[] | null;
	filters?: readonly Node[];
}): WorkQuery {
	const nodes: Node[] = [{ field: "project", cmp: "=", value: opts.projectId }];
	if (opts.boardType === "scrum") {
		if (opts.sprintId) nodes.push({ field: "sprint", cmp: "=", value: opts.sprintId });
		else nodes.push({ field: "sprint", cmp: "=", value: "active" });
	} else {
		nodes.push({
			op: "or",
			nodes: [
				{ field: "statusCategory", cmp: "!=", value: "done" },
				{ field: "resolved", cmp: ">=", value: `-${DONE_WINDOW_DAYS}d` },
			],
		});
		if (!opts.statusIds) nodes.push({ op: "not", node: { field: "status", cmp: "~", value: "backlog" } });
	}
	// a query value list holds a hundred; past that the dealing does the filtering
	if (opts.statusIds && opts.statusIds.length > 0 && opts.statusIds.length <= 100) {
		nodes.push({ field: "status", cmp: "in", value: [...opts.statusIds] });
	}
	nodes.push(...(opts.filters ?? []));
	return { where: { op: "and", nodes }, orderBy: BY_RANK };
}

/** The backlog list: open, in no sprint, no sub-tasks, by rank. */
export function backlogQuery(projectId: string, subtaskTypeIds: readonly string[]): WorkQuery {
	const nodes: Node[] = [
		{ field: "project", cmp: "=", value: projectId },
		{ field: "sprint", cmp: "is empty" },
		{ field: "statusCategory", cmp: "!=", value: "done" },
	];
	if (subtaskTypeIds.length > 0) {
		nodes.push({
			op: "or",
			nodes: [
				{ field: "type", cmp: "is empty" },
				{ field: "type", cmp: "not in", value: subtaskTypeIds.slice(0, 100) },
			],
		});
	}
	return { where: { op: "and", nodes }, orderBy: BY_RANK };
}

export function sprintQuery(projectId: string, sprintId: string): WorkQuery {
	return {
		where: {
			op: "and",
			nodes: [
				{ field: "project", cmp: "=", value: projectId },
				{ field: "sprint", cmp: "=", value: sprintId },
			],
		},
		orderBy: BY_RANK,
	};
}

// ---------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------

export type RankedCard = { id: string; rank: number };

/**
 * A whole number strictly between two neighbours' ranks, or null when
 * there is no room. No neighbour above: a step before the one below; none
 * below: a step after the one above; neither: the first step.
 */
export function rankBetween(above: number | null, below: number | null): number | null {
	if (above === null && below === null) return RANK_STEP;
	if (above === null) return (below as number) - RANK_STEP >= -RANK_MAX ? (below as number) - RANK_STEP : null;
	if (below === null) return above + RANK_STEP <= RANK_MAX ? above + RANK_STEP : null;
	if (below - above < 2) return null;
	return above + Math.floor((below - above) / 2);
}

export type Placement =
	| { ok: true; rank: number; index: number; renumber: RankedCard[] }
	| { ok: false; error: string };

/**
 * Where a card lands in a column and what rank that takes.
 *
 * `column` is the column in order, WITHOUT the card being moved.
 * `before` is the card it is placed before (the one that ends up directly
 * below it); `after` the card it is placed after (directly above it).
 * With both, the card goes between them whichever way round they were
 * given. With neither it goes to the end. When the neighbours leave no
 * gap the column is renumbered in steps of 1024 first; `renumber` lists
 * the cards whose rank has to be written.
 */
export function placeCard(column: readonly RankedCard[], where: { before?: string | null; after?: string | null }): Placement {
	const at = (id: string | null | undefined): number | null => {
		if (!id) return null;
		const i = column.findIndex((c) => c.id === id);
		return i < 0 ? -1 : i;
	};
	const b = at(where.before);
	const a = at(where.after);
	if (b === -1 || a === -1) return { ok: false, error: "That neighbour is not in the column." };

	let index: number;
	if (b !== null && a !== null) index = Math.max(a, b);
	else if (b !== null) index = b;
	else if (a !== null) index = a + 1;
	else index = column.length;

	const direct = rankBetween(column[index - 1]?.rank ?? null, column[index]?.rank ?? null);
	if (direct !== null) return { ok: true, rank: direct, index, renumber: [] };

	const fresh = column.map((c, i) => ({ id: c.id, rank: (i + 1) * RANK_STEP }));
	const rank = rankBetween(fresh[index - 1]?.rank ?? null, fresh[index]?.rank ?? null);
	if (rank === null) return { ok: false, error: "The column is too long to rank." };
	return { ok: true, rank, index, renumber: fresh.filter((c, i) => c.rank !== column[i].rank) };
}

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

export type BoardShape = {
	columns: BoardColumnView[];
	/** The statuses of the workflows in play, for the column settings. */
	statuses: WorkStatus[];
	/** Every status of the space, by id. */
	known: Map<string, WorkStatus>;
	workflowOrder: string[];
	configured: boolean;
};

type BoardProject = Pick<WorkProject, "id" | "space_id" | "board_type" | "board_columns">;

/** The columns of a project's board, without its cards. */
export async function boardShape(supabase: SupabaseClient, project: BoardProject): Promise<BoardShape> {
	const [workflows, map, statuses, offered] = await Promise.all([
		supabase.from("ticket_workflows").select("id, is_default, archived_at").eq("space_id", project.space_id).limit(500),
		supabase
			.from("ticket_workflow_map")
			.select("id, project_id, issue_type_id, workflow_id")
			.eq("space_id", project.space_id)
			.or(`project_id.is.null,project_id.eq.${project.id}`)
			.limit(1000),
		supabase.from("ticket_statuses").select(STATUS_SELECT).eq("space_id", project.space_id).order("sort_order").limit(1000),
		typesOffered(supabase, project),
	]);
	if (workflows.error) throw workflows.error;
	if (map.error) throw map.error;
	if (statuses.error) throw statuses.error;

	const wfRows = (workflows.data ?? []) as Array<{ id: string; is_default: boolean; archived_at: string | null }>;
	const live = new Set(wfRows.filter((w) => !w.archived_at).map((w) => w.id));
	const defaultId = wfRows.find((w) => w.is_default)?.id ?? null;
	const all = ((statuses.data ?? []) as unknown as Array<Parameters<typeof serializeStatus>[0]>).map(serializeStatus);
	const known = new Map(all.map((s) => [s.id, s]));

	const workflowOrder = workflowsInPlay(
		(map.data ?? []) as WorkflowMapRow[],
		project.id,
		offered.types.map((t) => t.id),
		defaultId,
		live,
	);
	const inPlay = all.filter((s) => workflowOrder.includes(s.workflow_id));
	return {
		columns: boardColumns(project, inPlay, known, workflowOrder),
		statuses: inPlay,
		known,
		workflowOrder,
		configured: !!project.board_columns && project.board_columns.length > 0,
	};
}

/** The project's sprints that are not closed, the active one first. */
export async function openSprints(supabase: SupabaseClient, projectId: string): Promise<SprintSummary[]> {
	const { data, error } = await supabase
		.from("sprints")
		.select(SPRINT_SELECT)
		.eq("project_id", projectId)
		.in("status", ["active", "planned"])
		.order("starts_on")
		.order("sort_order")
		.limit(50);
	if (error) throw error;
	const today = londonNow().date;
	const rows = (data ?? []) as SprintRow[];
	rows.sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
	return Promise.all(rows.map((s) => summarise(supabase, s, today)));
}

export type Board = {
	project: WorkProject;
	board_type: BoardType;
	columns: BoardColumnCards[];
	sprint: SprintSummary | null;
	statuses: WorkStatus[];
	/** How many cards matched; more than the cap means the board is cut short. */
	total: number;
	truncated: boolean;
};

export type BoardResult = { ok: true; board: Board } | { ok: false; status: number; error: string };

export async function loadBoard(supabase: SupabaseClient, project: WorkProject, filters: readonly Node[] = []): Promise<BoardResult> {
	const shape = await boardShape(supabase, project);
	const empty = (sprint: SprintSummary | null): Board => ({
		project,
		board_type: project.board_type,
		columns: dealCards(shape.columns, []),
		sprint,
		statuses: shape.statuses,
		total: 0,
		truncated: false,
	});

	let sprint: SprintSummary | null = null;
	if (project.board_type === "scrum") {
		sprint = (await openSprints(supabase, project.id)).find((s) => s.status === "active") ?? null;
		// a Scrum board with nothing running has no cards to show
		if (!sprint) return { ok: true, board: empty(null) };
	}

	const statusIds = shape.configured ? shape.columns.flatMap((c) => c.status_ids) : null;
	if (statusIds && statusIds.length === 0) return { ok: true, board: empty(sprint) };

	const checked = validateQuery(boardQuery({ projectId: project.id, boardType: project.board_type, sprintId: sprint?.id ?? null, statusIds, filters }));
	if (!checked.ok) return { ok: false, status: 400, error: checked.errors[0].message };
	const found = await searchTickets(supabase, checked.query, { limit: BOARD_CARD_LIMIT, space: project.space_id });

	let columns = shape.columns;
	if (!shape.configured) {
		// a ticket can sit in a status of a workflow its project has since
		// left; it still gets a column, merged by name like the rest
		const inPlay = new Set(shape.statuses.map((s) => s.id));
		const strays: WorkStatus[] = [];
		for (const t of found.tickets) {
			if (!t.status || inPlay.has(t.status.id)) continue;
			inPlay.add(t.status.id);
			strays.push(shape.known.get(t.status.id) ?? { id: t.status.id, workflow_id: t.status.workflow_id, name: t.status.name, category: t.status.category, resolution: null, colour: t.status.colour, sort_order: 0 });
		}
		if (strays.length > 0) columns = deriveColumns([...shape.statuses, ...strays], { boardType: project.board_type, workflowOrder: shape.workflowOrder });
	}

	return {
		ok: true,
		board: {
			project,
			board_type: project.board_type,
			columns: dealCards(columns, found.tickets),
			sprint,
			statuses: shape.statuses,
			total: found.total,
			truncated: found.total > found.tickets.length,
		},
	};
}

export type Backlog = {
	project: WorkProject;
	sprints: Array<{ sprint: SprintSummary; tickets: WorkTicket[]; points: number }>;
	backlog: WorkTicket[];
	backlog_total: number;
};

const pointsOf = (tickets: readonly WorkTicket[]): number => tickets.reduce((n, t) => n + (t.points ?? 0), 0);

/** The Backlog page: the open sprints over everything not yet in one. */
export async function loadBacklog(supabase: SupabaseClient, project: WorkProject): Promise<Backlog> {
	const [sprints, subtasks] = await Promise.all([
		openSprints(supabase, project.id),
		supabase.from("issue_types").select("id").eq("space_id", project.space_id).eq("level", -1).limit(100),
	]);
	if (subtasks.error) throw subtasks.error;
	const subtaskIds = ((subtasks.data ?? []) as Array<{ id: string }>).map((r) => r.id);

	const [backlog, ...inSprints] = await Promise.all([
		searchTickets(supabase, backlogQuery(project.id, subtaskIds), { limit: 1000, space: project.space_id }),
		...sprints.map((s) => searchTickets(supabase, sprintQuery(project.id, s.id), { limit: BOARD_CARD_LIMIT, space: project.space_id })),
	]);
	return {
		project,
		sprints: sprints.map((sprint, i) => ({ sprint, tickets: inSprints[i].tickets, points: pointsOf(inSprints[i].tickets) })),
		backlog: backlog.tickets,
		backlog_total: backlog.total,
	};
}

/** A column's cards in rank order, for placing a moved card among them. */
export async function columnRanks(
	supabase: SupabaseClient,
	projectId: string,
	statusIds: readonly string[],
	withoutTicketId: string,
): Promise<Array<RankedCard & { key: string | null }>> {
	const out: Array<RankedCard & { key: string | null }> = [];
	if (statusIds.length === 0) return out;
	const PAGE = 1000;
	for (let from = 0; from < 20_000; from += PAGE) {
		const { data, error } = await supabase
			.from("tickets")
			.select("id, ticket_key, sort_order")
			.eq("project_id", projectId)
			.in("status_id", statusIds.slice(0, 100))
			.is("deleted_at", null)
			.neq("kind", "habit")
			.neq("id", withoutTicketId)
			.order("sort_order")
			.order("created_at")
			.order("id")
			.range(from, from + PAGE - 1);
		if (error) throw error;
		const page = (data ?? []) as Array<{ id: string; ticket_key: string | null; sort_order: number | null }>;
		for (const r of page) out.push({ id: r.id, key: r.ticket_key, rank: r.sort_order ?? 0 });
		if (page.length < PAGE) break;
	}
	return out;
}
