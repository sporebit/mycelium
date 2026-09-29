import { describe, expect, it } from "vitest";
import { mayAdvance, pickStatus, TARGET_DONE, TARGET_IN_REVIEW } from "./automation";

/** Pure: no database. */

const wf = "w";
const st = (id: string, name: string, status_category: "todo" | "in_progress" | "done", category: string, sort_order: number, is_category_default = true) => ({
	id,
	name,
	status_category,
	category,
	workflow_id: wf,
	sort_order,
	is_category_default,
});

const twelve = [
	st("inbox", "Inbox", "todo", "inbox", 1),
	st("sel", "Selected for Development", "todo", "next", 2),
	st("prog", "In Progress", "in_progress", "doing", 3),
	st("rev", "In Review", "in_progress", "verify", 4),
	st("test", "Testing", "in_progress", "verify", 5, false),
	st("wait", "Waiting on 3rd Party", "in_progress", "waiting", 6),
	st("done", "Done", "done", "done", 9),
	st("closed", "Closed", "done", "done", 10, false),
	st("cancel", "Cancelled", "done", "cancelled", 12),
];

describe("pickStatus", () => {
	it("finds In Review and Done by name in the twelve", () => {
		expect(pickStatus(twelve, TARGET_IN_REVIEW)?.id).toBe("rev");
		expect(pickStatus(twelve, TARGET_DONE)?.id).toBe("done");
	});

	it("matches the name whatever its case", () => {
		expect(pickStatus([st("a", "in review", "in_progress", "doing", 1)], TARGET_IN_REVIEW)?.id).toBe("a");
	});

	it("ignores a status of that name in the wrong category", () => {
		const odd = [st("a", "Done", "in_progress", "doing", 1), st("b", "Shipped", "done", "done", 2)];
		expect(pickStatus(odd, TARGET_DONE)?.id).toBe("b");
	});

	it("falls back by category in a workflow with its own names", () => {
		const bugs = [
			st("r", "Reported", "todo", "next", 1),
			st("f", "Fixing", "in_progress", "doing", 2),
			st("q", "QA", "in_progress", "verify", 3),
			st("x", "Rejected", "done", "cancelled", 4),
			st("s", "Shipped", "done", "done", 5),
		];
		expect(pickStatus(bugs, TARGET_IN_REVIEW)?.id).toBe("q");
		expect(pickStatus(bugs, TARGET_DONE)?.id).toBe("s");
	});

	it("never resolves Done to a cancelled status while a done one exists", () => {
		const w = [st("x", "Cancelled", "done", "cancelled", 1), st("s", "Finished", "done", "done", 2)];
		expect(pickStatus(w, TARGET_DONE)?.id).toBe("s");
	});

	it("is null when the workflow has nothing in the category", () => {
		expect(pickStatus([st("a", "Open", "todo", "next", 1)], TARGET_DONE)).toBeNull();
	});
});

describe("mayAdvance", () => {
	const by = (id: string) => twelve.find((s) => s.id === id)!;
	it("moves forward", () => {
		expect(mayAdvance(by("sel"), by("rev")).ok).toBe(true);
		expect(mayAdvance(by("prog"), by("rev")).ok).toBe(true);
		expect(mayAdvance(by("rev"), by("done")).ok).toBe(true);
		expect(mayAdvance(null, by("rev")).ok).toBe(true);
	});
	it("never leaves a resolved status, never goes back, never moves to itself", () => {
		expect(mayAdvance(by("done"), by("rev")).ok).toBe(false);
		expect(mayAdvance(by("cancel"), by("done")).ok).toBe(false);
		expect(mayAdvance(by("rev"), by("rev")).ok).toBe(false);
		expect(mayAdvance(by("prog"), by("sel")).ok).toBe(false);
	});
});
