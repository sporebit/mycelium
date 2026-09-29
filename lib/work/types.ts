/**
 * Work — the shapes the /api/work routes return (claude/spec-work.md §4).
 * Isomorphic. Nothing here carries the eight GTD categories, the old
 * context columns or `kind` semantics: Work speaks types, statuses in
 * three categories, labels and components.
 */
import type { StatusCategory } from "./query";

export type Ref = { id: string; key: string | null; title: string };

export type WorkType = {
	id: string;
	name: string;
	slug: string;
	/** 1 Epic · 0 standard · -1 Sub-task */
	level: number;
	has_steps: boolean;
	icon: string | null;
	colour: string | null;
	sort_order: number;
	archived_at: string | null;
};

export type WorkStatus = {
	id: string;
	workflow_id: string;
	name: string;
	category: StatusCategory;
	resolution: string | null;
	colour: string | null;
	sort_order: number;
};

export type WorkWorkflow = {
	id: string;
	name: string;
	description: string | null;
	is_default: boolean;
	archived_at: string | null;
	statuses: WorkStatus[];
};

export type WorkflowMapRow = {
	id: string;
	project_id: string | null;
	issue_type_id: string | null;
	workflow_id: string;
};

export type WorkLabel = {
	id: string;
	name: string;
	slug: string;
	colour: string | null;
	/** The label field's slug: labels, location, tool, or a space's own. */
	field: string;
};

export type WorkLabelField = {
	id: string;
	name: string;
	slug: string;
	is_system: boolean;
	sort_order: number;
	labels: Array<Omit<WorkLabel, "field"> & { archived_at: string | null }>;
};

export type WorkComponent = {
	id: string;
	project_id: string;
	name: string;
	description: string | null;
	lead_user_id: string | null;
	sort_order: number;
	archived_at: string | null;
};

export type WorkPerson = { id: string; name: string };

export type ProjectLink = { label: string; url: string };

export type BoardColumn = { name: string; status_ids: string[] };

export type WorkProject = {
	id: string;
	/** The key in URLs and JQL: the prefix, or the space's prefix for the default project. */
	key: string;
	name: string;
	description: string | null;
	status: "active" | "paused" | "done" | "archived";
	colour: string | null;
	is_default: boolean;
	category_id: string | null;
	category_name: string | null;
	lead_user_id: string | null;
	start_on: string | null;
	target_on: string | null;
	links: ProjectLink[];
	board_type: "kanban" | "scrum";
	board_columns: BoardColumn[] | null;
	github_repo: string | null;
	space_id: string;
	created_at: string;
	updated_at: string;
};

export type ProjectProgress = {
	todo: number;
	in_progress: number;
	done: number;
	total: number;
	points_total: number;
	points_done: number;
};

export type WorkTicket = {
	id: string;
	key: string | null;
	key_aliases: string[];
	title: string;
	description: string | null;
	description_doc: unknown | null;
	space_id: string;
	project: { id: string; key: string; name: string; colour: string | null } | null;
	type: Pick<WorkType, "id" | "name" | "slug" | "level" | "has_steps" | "icon" | "colour"> | null;
	status: Pick<WorkStatus, "id" | "name" | "category" | "colour" | "workflow_id"> | null;
	resolution: string | null;
	assignee: WorkPerson | null;
	reporter: WorkPerson | null;
	points: number | null;
	due: string | null;
	scheduled_on: string | null;
	parent: Ref | null;
	epic: Ref | null;
	sprint: { id: string; name: string; status: string } | null;
	labels: WorkLabel[];
	components: Array<{ id: string; name: string }>;
	rank: number;
	created_at: string;
	updated_at: string;
	started_at: string | null;
	resolved_at: string | null;
	/** The steps engine still reads kind; shown so the issue page knows to mount it. */
	kind: string;
};

export type WorkComment = {
	id: string;
	body: string;
	body_doc: unknown | null;
	author: WorkPerson | null;
	created_at: string;
	updated_at: string;
};

export type WorkActivity = {
	id: string;
	action: string;
	field: string | null;
	from_value: string | null;
	to_value: string | null;
	actor: WorkPerson | null;
	created_at: string;
};

export type WorkTicketDetail = {
	ticket: WorkTicket;
	children: WorkTicket[];
	/** For an Epic: the issues that name it. */
	epic_children: WorkTicket[];
	comments: WorkComment[];
	activity: WorkActivity[];
	links: Array<{ id: string; kind: string; ref: string | null; url: string | null; label: string | null; at: string }>;
	docs: Array<{ id: string; title: string; doc_space_key: string; source: string }>;
	watchers: WorkPerson[];
	watching: boolean;
	/** The statuses this ticket can move to: its own workflow's. */
	statuses: WorkStatus[];
};

export type SearchResult = {
	tickets: WorkTicket[];
	total: number;
	limit: number;
	offset: number;
	jql: string;
};

export type SavedFilter = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	jql: string;
	query: unknown;
	shared: boolean;
	is_system: boolean;
	sort_order: number;
	mine: boolean;
};

export type WorkMeta = {
	space_id: string;
	space_prefix: string | null;
	me: WorkPerson | null;
	types: WorkType[];
	workflows: WorkWorkflow[];
	workflow_map: WorkflowMapRow[];
	label_fields: WorkLabelField[];
	projects: Array<Pick<WorkProject, "id" | "key" | "name" | "colour" | "is_default" | "status" | "category_id" | "board_type">>;
	categories: Array<{ id: string; name: string; colour: string | null }>;
	people: WorkPerson[];
	filters: SavedFilter[];
};

export type NotificationEvent = "mention" | "assignment" | "status_change" | "comment";

export type WorkNotification = {
	id: string;
	event: NotificationEvent;
	title: string;
	body: string | null;
	url: string | null;
	ticket_key: string | null;
	actor: WorkPerson | null;
	read_at: string | null;
	created_at: string;
};
