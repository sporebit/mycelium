import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSql, localStackEnv } from "@/lib/access/introspect";
import { mintUserJwt } from "@/lib/system/jwt";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { parseJql } from "./jql";

/**
 * public.work_search (0147): the query object executed. Every query here
 * goes through PostgREST with a user JWT, exactly as /api/work/tickets
 * does, so RLS is part of what is tested. LOCAL stack; fails, not skips,
 * when it is down.
 */

const TAG = "work-search-test:";
const TESS = "7e0f1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const env = localStackEnv();
const tokens = new Map<string, string>();
let space = "";

async function token(uid: string): Promise<string> {
	let t = tokens.get(uid);
	if (!t) {
		t = await mintUserJwt({ sub: uid, secret: env.jwtSecret, issuer: `${env.apiUrl}/auth/v1` });
		tokens.set(uid, t);
	}
	return t;
}

async function search(uid: string, query: unknown, limit = 200): Promise<{ status: number; ids: string[]; total: number; message: string }> {
	const res = await fetch(`${env.apiUrl}/rest/v1/rpc/work_search`, {
		method: "POST",
		headers: { apikey: env.anonKey, authorization: `Bearer ${await token(uid)}`, "content-type": "application/json" },
		body: JSON.stringify({ p_query: query, p_limit: limit, p_offset: 0, p_space: null }),
	});
	const body = (await res.json()) as unknown;
	const rows = Array.isArray(body) ? (body as Array<{ ticket_id: string; total: number }>) : [];
	return {
		status: res.status,
		ids: rows.map((r) => r.ticket_id),
		total: Number(rows[0]?.total ?? 0),
		message: Array.isArray(body) ? "" : String((body as { message?: string }).message ?? ""),
	};
}

/** Keys of the test's own tickets that a JQL query returns, in order. */
async function keys(jql: string, uid = PHIL_AUTH_UID): Promise<string[]> {
	const where = jql.split(/\border by\b/i)[0].trim();
	const scoped = parseJql(where ? `(${where}) AND text ~ "${TAG}"` : `text ~ "${TAG}"`);
	const order = parseJql(jql).orderBy;
	const r = await search(uid, { where: scoped.where, orderBy: order });
	expect(r.status, r.message).toBe(200);
	if (r.ids.length === 0) return [];
	const rows = localSql(`select id, title from public.tickets where id in (${r.ids.map((i) => `'${i}'`).join(",")})`);
	const title = new Map(rows.map((x) => [x[0], x[1]]));
	return r.ids.map((i) => (title.get(i) ?? "").replace(`${TAG} `, ""));
}

function one(sql: string): string {
	return localSql(sql)[0]?.[0] ?? "";
}

function cleanup() {
	localSql(`delete from public.tickets where title like '${TAG}%'`);
	localSql(`delete from public.projects where name like '${TAG}%'`);
	localSql(`delete from public.labels where name like '${TAG}%'`);
}

beforeAll(() => {
	space = one(`select personal_space_id from public.profiles where id = '${PHIL_AUTH_UID}'`);
	cleanup();
	const project = one(`insert into public.projects (name, space_id, created_by, prefix) values ('${TAG} proj', '${space}', '${PHIL_AUTH_UID}', 'WSR') returning id`);
	const type = (slug: string) => one(`select id from public.issue_types where space_id = '${space}' and slug = '${slug}'`);
	const status = (name: string) => one(`select public.ticket_status_named('${space}', '${name}')`);
	const mk = (name: string, cols: string, vals: string) =>
		one(`insert into public.tickets (title, space_id, created_by, owner${cols}) values ('${TAG} ${name}', '${space}', '${PHIL_AUTH_UID}', '${PHIL_AUTH_UID}'${vals}) returning id`);

	const epic = mk("epic", ", project_id, type_id", `, '${project}', '${type("epic")}'`);
	mk("alpha", ", project_id, type_id, epic_id, points, deadline_on, where_ctx, tools, tags, assignee_id", `, '${project}', '${type("story")}', '${epic}', 3, current_date + 2, 'home', '{pc}', '{${TAG}red}', '${PHIL_AUTH_UID}'`);
	mk("beta", ", project_id, type_id, points, deadline_on, where_ctx, tools, status_id", `, '${project}', '${type("bug")}', 8, current_date + 20, 'home', '{phone}', '${status("In Progress")}'`);
	mk("gamma", ", type_id, points, where_ctx, tools, status_id", `, '${type("task")}', 1, 'out', '{pc,phone}', '${status("Done")}'`);
	mk("delta", ", project_id, status_id", `, '${project}', '${status("Cancelled")}'`);
	mk("habit", ", kind, where_ctx", ", 'habit', 'home'");
	localSql(`update public.tickets set deleted_at = now() where id = '${mk("deleted", ", where_ctx", ", 'home'")}'`);
});

afterAll(() => {
	cleanup();
});

describe("work_search", () => {
	it("never returns habits or deleted tickets", async () => {
		expect((await keys("ORDER BY key")).sort()).toEqual(["alpha", "beta", "delta", "epic", "gamma"]);
	});

	it("runs the Now filter from the decisions", async () => {
		expect(await keys("location = home AND tool = pc")).toEqual(["alpha"]);
	});

	it("matches a project by key, name, or the space prefix for the default project", async () => {
		expect((await keys("project = WSR")).sort()).toEqual(["alpha", "beta", "delta", "epic"]);
		expect((await keys("project = wsr")).sort()).toEqual(["alpha", "beta", "delta", "epic"]);
		const prefix = one(`select ticket_prefix from public.spaces where id = '${space}'`);
		expect(await keys(`project = ${prefix}`)).toEqual(["gamma"]);
	});

	it("binds to the three status categories", async () => {
		expect((await keys("statusCategory = Done")).sort()).toEqual(["delta", "gamma"]);
		expect(await keys('statusCategory = "In Progress"')).toEqual(["beta"]);
		expect((await keys('statusCategory = "To Do"')).sort()).toEqual(["alpha", "epic"]);
		expect((await keys("statusCategory != Done")).sort()).toEqual(["alpha", "beta", "epic"]);
	});

	it("handles AND, OR, NOT and parentheses", async () => {
		expect((await keys("type = Bug OR type = Story")).sort()).toEqual(["alpha", "beta"]);
		expect((await keys("(type = Bug OR type = Story) AND points > 3")).sort()).toEqual(["beta"]);
		expect((await keys("NOT (type = Bug OR type = Story)")).sort()).toEqual(["delta", "epic", "gamma"]);
		expect((await keys("type = Bug OR type = Story AND points < 5")).sort()).toEqual(["alpha", "beta"]);
	});

	it("handles IN, NOT IN, IS EMPTY and IS NOT EMPTY", async () => {
		expect((await keys("status IN (Done, Cancelled)")).sort()).toEqual(["delta", "gamma"]);
		expect((await keys("type NOT IN (Epic, Bug)")).sort()).toEqual(["alpha", "delta", "gamma"]);
		expect(await keys("assignee IS NOT EMPTY")).toEqual(["alpha"]);
		expect(await keys("assignee = me")).toEqual(["alpha"]);
		expect((await keys("assignee != me")).sort()).toEqual(["beta", "delta", "epic", "gamma"]);
		expect((await keys("location IS EMPTY")).sort()).toEqual(["delta", "epic"]);
		expect(await keys("epic IS NOT EMPTY")).toEqual(["alpha"]);
	});

	it("compares numbers and London dates, absolute and relative", async () => {
		expect((await keys("points >= 3")).sort()).toEqual(["alpha", "beta"]);
		expect(await keys("due <= +7d")).toEqual(["alpha"]);
		expect((await keys("due > today")).sort()).toEqual(["alpha", "beta"]);
		expect((await keys("due IS EMPTY AND type = Task")).sort()).toEqual(["delta", "gamma"]);
		expect((await keys("created >= today")).length).toBe(5);
		expect((await keys("resolved IS NOT EMPTY")).sort()).toEqual(["delta", "gamma"]);
	});

	it("matches labels, tools and an epic by key", async () => {
		expect(await keys(`label = "${TAG}red"`)).toEqual(["alpha"]);
		expect((await keys("tool IN (phone)")).sort()).toEqual(["beta", "gamma"]);
		const epicKey = one(`select ticket_key from public.tickets where title = '${TAG} epic'`);
		expect(await keys(`epic = ${epicKey}`)).toEqual(["alpha"]);
	});

	it("orders, nulls last", async () => {
		expect(await keys("project = WSR ORDER BY points DESC")).toEqual(["beta", "alpha", expect.any(String), expect.any(String)]);
		expect((await keys("project = WSR ORDER BY due ASC")).slice(0, 2)).toEqual(["alpha", "beta"]);
	});

	it("keeps a hostile value inside its quotes", async () => {
		expect(await keys(`assignee = "x') or true --"`)).toEqual([]);
		expect(await keys(`text ~ "%' or 1=1 --"`)).toEqual([]);
		expect(await keys(`label = "'; drop table public.tickets; --"`)).toEqual([]);
		expect(Number(one(`select count(*) from public.tickets where title like '${TAG}%'`))).toBe(7);
	});

	it("refuses what it does not know", async () => {
		for (const q of [
			{ where: { field: "password", cmp: "=", value: "x" } },
			{ where: { field: "status", cmp: "like", value: "x" } },
			{ where: { field: "due", cmp: "=", value: "soon" } },
			{ where: { field: "points", cmp: "=", value: "1; drop table x" } },
			{ where: { op: "xor", nodes: [{ field: "status", cmp: "=", value: "x" }] } },
			{ orderBy: [{ field: "password", dir: "asc" }] },
			{ orderBy: [{ field: "due", dir: "asc; drop table x" }] },
		]) {
			const r = await search(PHIL_AUTH_UID, q);
			expect(r.status, JSON.stringify(q)).toBe(400);
			expect(r.message).toMatch(/work query/);
		}
	});

	it("shows another person nothing of this space", async () => {
		const tess = one(`select count(*) from auth.users where id = '${TESS}'`);
		if (tess !== "1") return; // the policy tests create Tess; without her there is nobody to be
		localSql(`delete from public.team_members where user_id = '${TESS}'`);
		localSql(`delete from public.user_grants where grantee_id = '${TESS}'`);
		const r = await search(TESS, parseJql(`text ~ "${TAG}"`));
		expect(r.status).toBe(200);
		expect(r.ids).toEqual([]);
		expect(await keys("assignee = me", TESS)).toEqual([]);
	});
});
