import { describe, expect, it } from "vitest";
import { JqlError, parseJql, tryParseJql } from "./jql";
import { barToQuery, queryToBar, toJql, validateQuery, type WorkQuery } from "./query";

/** Pure: no database. The executed side is covered by work.search.test.ts. */

describe("parseJql", () => {
	it("reads the Now filter from the decisions", () => {
		expect(parseJql("Location = home AND Tool = pc")).toEqual({
			where: {
				op: "and",
				nodes: [
					{ field: "location", cmp: "=", value: "home" },
					{ field: "tool", cmp: "=", value: "pc" },
				],
			},
			orderBy: [],
		});
	});

	it("binds NOT tighter than AND, and AND tighter than OR", () => {
		const q = parseJql("status = Inbox OR type = Bug AND NOT assignee = me");
		expect(q.where).toEqual({
			op: "or",
			nodes: [
				{ field: "status", cmp: "=", value: "Inbox" },
				{
					op: "and",
					nodes: [
						{ field: "type", cmp: "=", value: "Bug" },
						{ op: "not", node: { field: "assignee", cmp: "=", value: "me" } },
					],
				},
			],
		});
	});

	it("honours parentheses", () => {
		const q = parseJql("(status = Inbox OR type = Bug) AND project = MYC");
		expect(q.where).toEqual({
			op: "and",
			nodes: [
				{
					op: "or",
					nodes: [
						{ field: "status", cmp: "=", value: "Inbox" },
						{ field: "type", cmp: "=", value: "Bug" },
					],
				},
				{ field: "project", cmp: "=", value: "MYC" },
			],
		});
	});

	it("reads every comparison", () => {
		expect(parseJql("points >= 3").where).toEqual({ field: "points", cmp: ">=", value: 3 });
		expect(parseJql("points < 8").where).toEqual({ field: "points", cmp: "<", value: 8 });
		expect(parseJql("status != Done").where).toEqual({ field: "status", cmp: "!=", value: "Done" });
		expect(parseJql('text ~ "vcard import"').where).toEqual({ field: "text", cmp: "~", value: "vcard import" });
		expect(parseJql("due <= 2026-10-04").where).toEqual({ field: "due", cmp: "<=", value: "2026-10-04" });
		expect(parseJql("created > -7d").where).toEqual({ field: "created", cmp: ">", value: "-7d" });
	});

	it("reads IN, NOT IN, IS EMPTY and IS NOT EMPTY", () => {
		expect(parseJql('status IN (Inbox, "In Progress")').where).toEqual({ field: "status", cmp: "in", value: ["Inbox", "In Progress"] });
		expect(parseJql("type not in (Epic, Sub-task)").where).toEqual({ field: "type", cmp: "not in", value: ["Epic", "Sub-task"] });
		expect(parseJql("assignee IS EMPTY").where).toEqual({ field: "assignee", cmp: "is empty" });
		expect(parseJql("epic is not empty").where).toEqual({ field: "epic", cmp: "is not empty" });
		expect(parseJql("sprint IS NULL").where).toEqual({ field: "sprint", cmp: "is empty" });
	});

	it("reads ORDER BY, alone or after a clause", () => {
		expect(parseJql("ORDER BY due ASC, created DESC")).toEqual({
			where: null,
			orderBy: [
				{ field: "due", dir: "asc" },
				{ field: "created", dir: "desc" },
			],
		});
		expect(parseJql("project = MYC order by key").orderBy).toEqual([{ field: "key", dir: "asc" }]);
	});

	it("is case-insensitive in fields and keywords, and canonicalises them", () => {
		const q = parseJql("STATUSCATEGORY != done and LABELS = garden Order By Updated desc");
		expect(q.where).toEqual({
			op: "and",
			nodes: [
				{ field: "statusCategory", cmp: "!=", value: "done" },
				{ field: "label", cmp: "=", value: "garden" },
			],
		});
		expect(q.orderBy).toEqual([{ field: "updated", dir: "desc" }]);
	});

	it("normalises status categories however they are written", () => {
		expect(parseJql('statusCategory = "To Do"').where).toEqual({ field: "statusCategory", cmp: "=", value: "todo" });
		expect(parseJql('statusCategory in ("In Progress", Done)').where).toEqual({ field: "statusCategory", cmp: "in", value: ["in_progress", "done"] });
	});

	it("accepts a space's own label fields and no others", () => {
		expect(parseJql("room = kitchen", { labelFields: ["room"] }).where).toEqual({ field: "room", cmp: "=", value: "kitchen" });
		expect(() => parseJql("room = kitchen")).toThrow(/Unknown field "room"/);
	});

	it("keeps quotes, escapes and awkward values intact", () => {
		expect(parseJql('text ~ "say \\"hi\\""').where).toEqual({ field: "text", cmp: "~", value: 'say "hi"' });
		expect(parseJql("epic = MYC-12").where).toEqual({ field: "epic", cmp: "=", value: "MYC-12" });
		expect(parseJql("label = 'and'").where).toEqual({ field: "label", cmp: "=", value: "and" });
		expect(parseJql("assignee = \"x') or true --\"").where).toEqual({ field: "assignee", cmp: "=", value: "x') or true --" });
	});

	it("an empty query is every ticket", () => {
		expect(parseJql("")).toEqual({ where: null, orderBy: [] });
		expect(parseJql("   ")).toEqual({ where: null, orderBy: [] });
	});

	it("says what is wrong and where", () => {
		const cases: Array<[string, RegExp, number]> = [
			["status = ", /Expected a value/, 9],
			["nope = 1", /Unknown field "nope"/, 0],
			["status > Done", /does not support >/, 7],
			["text = hello", /does not support =/, 5],
			["points = many", /not a number/, 9],
			["status = Inbox type = Bug", /Join clauses with AND or OR/, 15],
			["(status = Inbox", /Expected "\)"/, 15],
			['text ~ "open', /never closed/, 7],
			["status in Inbox", /Expected "\(" after IN/, 10],
			["order by password", /Cannot order by "password"/, 9],
			["status = Inbox AND", /Expected a field/, 18],
			["status is full", /Expected EMPTY/, 10],
			["status = and", /Put it in quotes/, 9],
			["status = Inbox; drop table tickets", /Unexpected ";"/, 14],
		];
		for (const [src, message, pos] of cases) {
			let err: unknown = null;
			try {
				parseJql(src);
			} catch (e) {
				err = e;
			}
			expect(err, src).toBeInstanceOf(JqlError);
			expect((err as JqlError).message, src).toMatch(message);
			expect((err as JqlError).pos, src).toBe(pos);
		}
	});

	it("rejects a date that is not one", () => {
		expect(() => parseJql("due = soon")).toThrow(/not a date/);
		expect(() => parseJql("due = 2026-02-30")).toThrow(/not a date/);
		expect(parseJql("due = today").where).toEqual({ field: "due", cmp: "=", value: "today" });
	});

	it("tryParseJql never throws", () => {
		expect(tryParseJql("status = Inbox").ok).toBe(true);
		expect(tryParseJql("status =")).toEqual({ ok: false, error: expect.stringMatching(/Expected a value/), pos: 8 });
	});
});

describe("toJql", () => {
	const round = [
		"location = home AND tool = pc",
		"status = Inbox OR type = Bug AND NOT assignee = me",
		"(status = Inbox OR type = Bug) AND project = MYC",
		'status IN (Inbox, "In Progress") AND assignee IS EMPTY ORDER BY due ASC, created DESC',
		'text ~ "vcard import" AND points >= 3',
		"NOT (status = Done OR status = Cancelled)",
		'statusCategory != Done AND label = "two words"',
		"ORDER BY key DESC",
	];
	for (const src of round) {
		it(`round-trips: ${src}`, () => {
			const q = parseJql(src);
			expect(toJql(q)).toBe(src);
			expect(parseJql(toJql(q))).toEqual(q);
		});
	}

	it("quotes a value that would read as a keyword", () => {
		const q: WorkQuery = { where: { field: "label", cmp: "=", value: "and" }, orderBy: [] };
		expect(toJql(q)).toBe('label = "and"');
		expect(parseJql(toJql(q))).toEqual(q);
	});
});

describe("the filter bar", () => {
	it("emits the same object the parser compiles to", () => {
		const bar = { values: { project: ["MYC"], status: ["Inbox", "Backlog"] }, text: "vcard", orderBy: [{ field: "due", dir: "asc" as const }] };
		expect(barToQuery(bar)).toEqual(parseJql("project = MYC AND status IN (Inbox, Backlog) AND text ~ vcard ORDER BY due ASC"));
	});

	it("reads a simple query back, and declines one it cannot show", () => {
		const q = parseJql("project = MYC AND status IN (Inbox, Backlog) AND text ~ vcard");
		expect(queryToBar(q)).toEqual({ values: { project: ["MYC"], status: ["Inbox", "Backlog"] }, text: "vcard", orderBy: [] });
		expect(queryToBar(parseJql("project = MYC OR project = DSA"))).toBeNull();
		expect(queryToBar(parseJql("NOT project = MYC"))).toBeNull();
		expect(queryToBar(parseJql("points > 3"))).toBeNull();
		expect(queryToBar(parseJql(""))).toEqual({ values: {}, text: "", orderBy: [] });
	});
});

describe("validateQuery", () => {
	it("accepts what the parser produces", () => {
		const q = parseJql("status IN (Inbox, Backlog) AND NOT points > 5 ORDER BY due");
		expect(validateQuery(q)).toEqual({ ok: true, query: q });
	});

	it("rejects shapes the database would refuse", () => {
		const bad: unknown[] = [
			"status = Inbox",
			{ where: { field: "password", cmp: "=", value: "x" } },
			{ where: { field: "status", cmp: "like", value: "x" } },
			{ where: { op: "xor", nodes: [] } },
			{ where: { op: "and", nodes: [] } },
			{ where: { field: "status", cmp: "=" } },
			{ where: { field: "status", cmp: "=", value: { $ne: null } } },
			{ where: { field: "points", cmp: "=", value: "1; drop table x" } },
			{ orderBy: [{ field: "password", dir: "asc" }] },
			{ orderBy: [{ field: "due", dir: "sideways" }] },
		];
		for (const b of bad) expect(validateQuery(b).ok, JSON.stringify(b)).toBe(false);
	});

	it("caps depth", () => {
		let n: unknown = { field: "status", cmp: "=", value: "Inbox" };
		for (let i = 0; i < 20; i += 1) n = { op: "not", node: n };
		expect(validateQuery({ where: n }).ok).toBe(false);
	});
});
