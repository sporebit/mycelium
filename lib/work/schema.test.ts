import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql } from "@/lib/access/introspect";
import { PHIL_AUTH_UID } from "@/lib/system/identity";

/**
 * Work schema (0141–0146, claude/spec-work.md §2): the triggers that keep
 * the old write paths and the Work write paths in step. Runs as postgres
 * on the LOCAL stack; fails, not skips, when the stack is down.
 */

const TAG = "work-schema-test:";
let space = "";
let general = "";

function one(sql: string): string {
	return localSql(sql)[0]?.[0] ?? "";
}
function insertTicket(title: string, extra = "", extraValues = ""): string {
	return one(
		`insert into public.tickets (title, space_id, created_by, owner${extra}) values ('${TAG} ${title}', '${space}', '${PHIL_AUTH_UID}', '${PHIL_AUTH_UID}'${extraValues}) returning id`,
	);
}
function typeId(slug: string): string {
	return one(`select id from public.issue_types where space_id = '${space}' and slug = '${slug}'`);
}
function typeOf(id: string): string {
	return one(`select coalesce(it.slug, '-') from public.tickets t left join public.issue_types it on it.id = t.type_id where t.id = '${id}'`);
}
function labelsOf(id: string): string[] {
	return localSql(
		`select f.slug || '=' || l.slug from public.ticket_labels tl join public.labels l on l.id = tl.label_id join public.label_fields f on f.id = l.field_id where tl.ticket_id = '${id}' order by 1`,
	).map((r) => r[0]);
}
function fails(sql: string): boolean {
	try {
		localSql(sql);
		return false;
	} catch {
		return true;
	}
}

function cleanup() {
	localSql(`delete from public.tickets where title like '${TAG}%'`);
	localSql(`delete from public.ticket_workflows where name like '${TAG}%'`);
	localSql(`delete from public.projects where name like '${TAG}%'`);
	localSql(`delete from public.labels where name like '${TAG}%' or slug in ('drill-${TAG}', 'garden')`);
	localSql(`delete from public.doc_pages where title like '${TAG}%'`);
}

beforeAll(() => {
	space = one(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`);
	general = one(`select id from public.projects where space_id = '${space}' and is_default`);
	cleanup();
});

afterAll(() => {
	cleanup();
});

describe("seeds", () => {
	it("every space has the ten issue types, a default project, three label fields, five filters and a doc space", () => {
		const rows = localSql(
			`select s.id,
				(select count(*) from public.issue_types t where t.space_id = s.id),
				(select count(*) from public.projects p where p.space_id = s.id and p.is_default),
				(select count(*) from public.label_fields f where f.space_id = s.id and f.is_system),
				(select count(*) from public.saved_filters f where f.space_id = s.id and f.is_system),
				(select count(*) from public.doc_spaces d where d.space_id = s.id)
			from public.spaces s`,
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) expect(r.slice(1)).toEqual(["10", "1", "3", "5", "1"]);
	});

	it("the default project has no prefix, so its tickets keep the space's keys", () => {
		expect(general).not.toBe("");
		expect(one(`select coalesce(prefix, '-') from public.projects where id = '${general}'`)).toBe("-");
	});

	it("every status has a status category, and resolution only on done", () => {
		expect(one(`select count(*) from public.ticket_statuses where status_category is null`)).toBe("0");
		expect(one(`select count(*) from public.ticket_statuses where (status_category = 'done') <> (resolution is not null)`)).toBe("0");
		expect(one(`select resolution from public.ticket_statuses where space_id = '${space}' and name = 'Cancelled'`)).toBe("cancelled");
	});
});

describe("a ticket written the old way", () => {
	let id = "";

	it("lands in the default project, typed Task, in Inbox, with a space key", () => {
		id = insertTicket("plain");
		const r = localSql(
			`select t.project_id, st.name, st.status_category, split_part(t.ticket_key, '-', 1) = (select ticket_prefix from public.spaces where id = t.space_id) from public.tickets t join public.ticket_statuses st on st.id = t.status_id where t.id = '${id}'`,
		)[0];
		expect(r[0]).toBe(general);
		expect(r[1]).toBe("Inbox");
		expect(r[2]).toBe("todo");
		expect(r[3]).toBe("t");
		expect(typeOf(id)).toBe("task");
	});

	it("takes its type from its kind, and Sub-task from a parent", () => {
		localSql(`update public.tickets set kind = 'test' where id = '${id}'`);
		expect(typeOf(id)).toBe("test");
		localSql(`update public.tickets set kind = 'task' where id = '${id}'`);
		expect(typeOf(id)).toBe("task");
		const child = insertTicket("child", ", parent_task_id", `, '${id}'`);
		expect(typeOf(child)).toBe("subtask");
	});

	it("mirrors where_ctx, tools and tags into labels, by delta", () => {
		localSql(`update public.tickets set where_ctx = 'home', tools = '{pc,phone}', tags = '{garden}' where id = '${id}'`);
		expect(labelsOf(id)).toEqual(["labels=garden", "location=home", "tool=pc", "tool=phone"]);
		// a label added in Work survives an old-path write that never mentioned it
		const extra = one(`select public.work_label('${space}', 'tool', 'drill-${TAG}', '${PHIL_AUTH_UID}')`);
		localSql(`insert into public.ticket_labels (space_id, created_by, ticket_id, label_id) values ('${space}', '${PHIL_AUTH_UID}', '${id}', '${extra}')`);
		localSql(`update public.tickets set where_ctx = 'anywhere', tools = '{phone}' where id = '${id}'`);
		expect(labelsOf(id)).toEqual(["labels=garden", `tool=drill-${TAG}`, "tool=phone"]);
		localSql(`update public.tickets set tools = '{none}', tags = '{}' where id = '${id}'`);
		expect(labelsOf(id)).toEqual([`tool=drill-${TAG}`]);
	});

	it("a text-only description write clears the stale document", () => {
		localSql(`update public.tickets set description = 'one', description_doc = '{"type":"doc"}'::jsonb where id = '${id}'`);
		expect(one(`select description_doc is not null from public.tickets where id = '${id}'`)).toBe("t");
		localSql(`update public.tickets set description = 'two' where id = '${id}'`);
		expect(one(`select description_doc is null from public.tickets where id = '${id}'`)).toBe("t");
	});

	it("a habit is never typed, projected or labelled", () => {
		const habit = insertTicket("habit", ", kind, where_ctx", ", 'habit', 'home'");
		expect(typeOf(habit)).toBe("-");
		expect(one(`select project_id is null from public.tickets where id = '${habit}'`)).toBe("t");
		expect(labelsOf(habit)).toEqual([]);
	});
});

describe("a ticket written by Work", () => {
	let id = "";
	let epic = "";

	it("sets kind from the chosen type", () => {
		id = insertTicket("typed", ", type_id", `, '${typeId("runbook")}'`);
		expect(one(`select kind from public.tickets where id = '${id}'`)).toBe("runbook");
		localSql(`update public.tickets set type_id = '${typeId("bug")}' where id = '${id}'`);
		expect(one(`select kind from public.tickets where id = '${id}'`)).toBe("task");
		expect(typeOf(id)).toBe("bug");
	});

	it("links to an Epic in the same project only", () => {
		epic = insertTicket("epic", ", type_id", `, '${typeId("epic")}'`);
		localSql(`update public.tickets set epic_id = '${epic}' where id = '${id}'`);
		expect(one(`select epic_id from public.tickets where id = '${id}'`)).toBe(epic);
		const plain = insertTicket("not an epic");
		expect(fails(`update public.tickets set epic_id = '${plain}' where id = '${id}'`)).toBe(true);
		expect(fails(`update public.tickets set epic_id = '${id}' where id = '${epic}'`)).toBe(true);
	});

	it("drops the epic link when the ticket moves to another project", () => {
		const other = one(
			`insert into public.projects (name, space_id, created_by, prefix) values ('${TAG} other', '${space}', '${PHIL_AUTH_UID}', 'WST') returning id`,
		);
		const key = one(`select ticket_key from public.tickets where id = '${id}'`);
		localSql(`update public.tickets set project_id = '${other}' where id = '${id}'`);
		expect(one(`select epic_id is null from public.tickets where id = '${id}'`)).toBe("t");
		// 0135 still applies: a space-keyed ticket takes its first project key, the old one becomes an alias
		expect(one(`select ticket_key like 'WST-%' and '${key}' = any(key_aliases) from public.tickets where id = '${id}'`)).toBe("t");
	});

	it("stamps resolution and resolved_at on a Done-category status and clears them on reopening", () => {
		const cancelled = one(`select public.ticket_status_for('${space}', 'cancelled')`);
		const next = one(`select public.ticket_status_for('${space}', 'next')`);
		localSql(`update public.tickets set status_id = '${cancelled}' where id = '${id}'`);
		expect(localSql(`select resolution, resolved_at is not null from public.tickets where id = '${id}'`)[0]).toEqual(["cancelled", "t"]);
		localSql(`update public.tickets set status_id = '${next}' where id = '${id}'`);
		expect(localSql(`select coalesce(resolution, '-'), resolved_at is null from public.tickets where id = '${id}'`)[0]).toEqual(["-", "t"]);
	});

	it("an edit that is not a status change never invents a start date", () => {
		const t = insertTicket("no start");
		const doing = one(`select public.ticket_status_for('${space}', 'doing')`);
		// a ticket In Progress with no recorded start, as the pre-logging rows are
		localSql(`alter table public.tickets disable trigger user`);
		localSql(`update public.tickets set status_id = '${doing}', status = 'in_progress', started_at = null where id = '${t}'`);
		localSql(`alter table public.tickets enable trigger user`);
		localSql(`update public.tickets set kind = 'guide' where id = '${t}'`);
		expect(typeOf(t)).toBe("guide");
		expect(one(`select started_at is null from public.tickets where id = '${t}'`)).toBe("t");
	});
});

describe("workflows", () => {
	it("a Work-made status derives its legacy category, and the reverse", () => {
		const wf = one(
			`insert into public.ticket_workflows (name, space_id, created_by) values ('${TAG} bugs', '${space}', '${PHIL_AUTH_UID}') returning id`,
		);
		const rows = localSql(
			`insert into public.ticket_statuses (space_id, created_by, workflow_id, name, status_category, sort_order) values
				('${space}', '${PHIL_AUTH_UID}', '${wf}', 'Reported', 'todo', 1),
				('${space}', '${PHIL_AUTH_UID}', '${wf}', 'Fixing', 'in_progress', 2),
				('${space}', '${PHIL_AUTH_UID}', '${wf}', 'In Review', 'in_progress', 3),
				('${space}', '${PHIL_AUTH_UID}', '${wf}', 'Fixed', 'done', 4)
			returning name, category, coalesce(resolution, '-')`,
		);
		// psql prints the command tag after the returned rows
		expect(rows.slice(0, 4)).toEqual([
			["Reported", "next", "-"],
			["Fixing", "doing", "-"],
			["In Review", "verify", "-"],
			["Fixed", "done", "done"],
		]);
		const old = localSql(
			`insert into public.ticket_statuses (space_id, created_by, workflow_id, name, category, sort_order) values ('${space}', '${PHIL_AUTH_UID}', '${wf}', 'Parked', 'waiting', 5) returning status_category`,
		);
		expect(old[0][0]).toBe("in_progress");
	});

	it("a ticket's status is re-homed into the workflow its type maps to", () => {
		const wf = one(`select id from public.ticket_workflows where name = '${TAG} bugs'`);
		localSql(
			`insert into public.ticket_workflow_map (space_id, created_by, issue_type_id, workflow_id) values ('${space}', '${PHIL_AUTH_UID}', '${typeId("bug")}', '${wf}')`,
		);
		const t = insertTicket("bug", ", type_id", `, '${typeId("bug")}'`);
		// inserted with the default workflow's Inbox → the bug workflow's To Do status
		expect(one(`select st.name from public.tickets t join public.ticket_statuses st on st.id = t.status_id where t.id = '${t}'`)).toBe("Reported");
		// an old path moves it by category, resolving in the DEFAULT workflow (as tix and the webhooks do)
		localSql(`update public.tickets set status_id = public.ticket_status_for('${space}', 'verify') where id = '${t}'`);
		expect(localSql(`select st.name, st.workflow_id = '${wf}' from public.tickets t join public.ticket_statuses st on st.id = t.status_id where t.id = '${t}'`)[0]).toEqual(["In Review", "t"]);
		localSql(`update public.tickets set status_id = public.ticket_status_for('${space}', 'done') where id = '${t}'`);
		expect(one(`select st.name from public.tickets t join public.ticket_statuses st on st.id = t.status_id where t.id = '${t}'`)).toBe("Fixed");
		// changing the type takes it back to the default workflow, same category
		localSql(`update public.tickets set type_id = '${typeId("task")}' where id = '${t}'`);
		expect(localSql(`select st.name, w.is_default from public.tickets t join public.ticket_statuses st on st.id = t.status_id join public.ticket_workflows w on w.id = st.workflow_id where t.id = '${t}'`)[0]).toEqual(["Done", "t"]);
	});

	it("work_rehome moves tickets at once when the map changes (0148)", () => {
		const wf = one(`select id from public.ticket_workflows where name = '${TAG} bugs'`);
		const t = insertTicket("story", ", type_id", `, '${typeId("story")}'`);
		expect(one(`select st.name from public.tickets t join public.ticket_statuses st on st.id = t.status_id where t.id = '${t}'`)).toBe("Inbox");
		localSql(
			`insert into public.ticket_workflow_map (space_id, created_by, issue_type_id, workflow_id) values ('${space}', '${PHIL_AUTH_UID}', '${typeId("story")}', '${wf}')`,
		);
		// nothing moves until someone asks, or the ticket is next written
		expect(one(`select st.name from public.tickets t join public.ticket_statuses st on st.id = t.status_id where t.id = '${t}'`)).toBe("Inbox");
		expect(Number(one(`select public.work_rehome('${space}')`))).toBeGreaterThanOrEqual(1);
		expect(localSql(`select st.name, st.workflow_id = '${wf}' from public.tickets t join public.ticket_statuses st on st.id = t.status_id where t.id = '${t}'`)[0]).toEqual(["Reported", "t"]);
		expect(one(`select public.work_rehome('${space}')`)).toBe("0");
	});

	it("a status that changes category takes its tickets with it, without inventing a start (0148)", () => {
		const wf = one(`select id from public.ticket_workflows where name = '${TAG} bugs'`);
		const fixing = one(`select id from public.ticket_statuses where workflow_id = '${wf}' and name = 'Fixing'`);
		const t = insertTicket("recategorised", ", type_id", `, '${typeId("bug")}'`);
		localSql(`update public.tickets set status_id = '${fixing}' where id = '${t}'`);
		const started = one(`select started_at::text from public.tickets where id = '${t}'`);
		expect(started).not.toBe("");

		localSql(`update public.ticket_statuses set status_category = 'done' where id = '${fixing}'`);
		expect(localSql(`select resolution, resolved_at is not null, completed_at is not null, status, started_at::text from public.tickets where id = '${t}'`)[0]).toEqual(["done", "t", "t", "completed", started]);

		localSql(`update public.ticket_statuses set status_category = 'todo' where id = '${fixing}'`);
		expect(localSql(`select coalesce(resolution, '-'), resolved_at is null, completed_at is null, status, started_at::text from public.tickets where id = '${t}'`)[0]).toEqual(["-", "t", "t", "new", started]);
	});

	it("a new ticket gets a status even when its workflow has no Inbox (0148)", () => {
		// the bug workflow has no inbox-category status: Reported is its first To Do
		expect(one(`select st.name from public.ticket_statuses st where st.id = public.ticket_default_status('${space}', null, '${typeId("bug")}')`)).toBe("Reported");
		expect(one(`select st.name from public.ticket_statuses st where st.id = public.ticket_default_status('${space}', null, '${typeId("task")}')`)).toBe("Inbox");
	});
});

describe("projects", () => {
	it("refuses a new sub-project and a key that shadows the space prefix", () => {
		const prefix = one(`select ticket_prefix from public.spaces where id = '${space}'`);
		expect(fails(`insert into public.projects (name, space_id, created_by, parent_id) values ('${TAG} sub', '${space}', '${PHIL_AUTH_UID}', '${general}')`)).toBe(true);
		expect(fails(`insert into public.projects (name, space_id, created_by, prefix) values ('${TAG} shadow', '${space}', '${PHIL_AUTH_UID}', '${prefix}')`)).toBe(true);
	});
});

describe("docs", () => {
	it("writes a version on every change of title or body, and only then", () => {
		const ds = one(`select id from public.doc_spaces where space_id = '${space}' limit 1`);
		const page = one(
			`insert into public.doc_pages (space_id, created_by, doc_space_id, title) values ('${space}', '${PHIL_AUTH_UID}', '${ds}', '${TAG} page') returning id`,
		);
		const versions = () => one(`select count(*) from public.doc_page_versions where page_id = '${page}'`);
		expect(versions()).toBe("1");
		localSql(`update public.doc_pages set body_text = 'x', body = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb where id = '${page}'`);
		expect(versions()).toBe("2");
		localSql(`update public.doc_pages set position = 3 where id = '${page}'`);
		expect(versions()).toBe("2");
		expect(one(`select version from public.doc_pages where id = '${page}'`)).toBe("2");
		// a caller cannot set the version number
		localSql(`update public.doc_pages set version = 40 where id = '${page}'`);
		expect(one(`select version from public.doc_pages where id = '${page}'`)).toBe("2");
	});

	it("refuses a page under itself or under a page of another doc space", () => {
		const ds = one(`select id from public.doc_spaces where space_id = '${space}' limit 1`);
		const a = one(`insert into public.doc_pages (space_id, created_by, doc_space_id, title) values ('${space}', '${PHIL_AUTH_UID}', '${ds}', '${TAG} a') returning id`);
		const b = one(`insert into public.doc_pages (space_id, created_by, doc_space_id, title, parent_id) values ('${space}', '${PHIL_AUTH_UID}', '${ds}', '${TAG} b', '${a}') returning id`);
		expect(fails(`update public.doc_pages set parent_id = '${b}' where id = '${a}'`)).toBe(true);
	});
});
