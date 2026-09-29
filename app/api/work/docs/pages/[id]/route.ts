import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import {
	chainOf,
	checkPageWrite,
	checkParent,
	checkPosition,
	docSpaceKeys,
	docsErrorMessage,
	docsErrorStatus,
	loadDocPage,
	mentionEvents,
	pageRow,
	renumberSiblings,
	setArchived,
	syncPageLinks,
} from "@/lib/work/docs";
import { docUrl, recordEvents } from "@/lib/work/notify";
import { bad, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * /api/work/docs/pages/[id] — one page.
 *
 * GET     the page: body, breadcrumbs, its tickets, its restriction.
 * PATCH   `{title?, body?, parent_id?, position?, restricted?, archived?}`.
 *         The plain text is derived from the body here. A change of title
 *         or body makes a version (the database does that). New ticket
 *         keys in the body become links; people newly @mentioned are told.
 *         `restricted` is the creator's alone to change. A move renumbers
 *         the pages it lands among 0..n.
 * DELETE  archives the page and everything under it. `?hard=1` deletes the
 *         row; the pages under it move to the top of the tree.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!UUID_RE.test(id)) return bad("not found", 404);
	try {
		const supabase = await createUserClient();
		const page = await loadDocPage(supabase, uid, id);
		if (!page) return bad("not found", 404);
		return NextResponse.json({ page });
	} catch (err) {
		console.error("[/api/work/docs/pages/:id GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const body = await readJson(req);
	if (!body) return bad("bad json");

	const checked = checkPageWrite(body, "patch");
	if (!checked.ok) return bad(checked.error);
	if ("parent_id" in body && body.parent_id !== null && !(typeof body.parent_id === "string" && UUID_RE.test(body.parent_id))) return bad("parent_id is a page id, or null for the top of the tree.");
	let index: number | null = null;
	if ("position" in body && body.position !== null && body.position !== undefined) {
		const p = checkPosition(body.position);
		if (!p.ok) return bad(p.error);
		index = p.value;
	}
	if ("restricted" in body && typeof body.restricted !== "boolean") return bad("restricted is true or false.");
	if ("archived" in body && typeof body.archived !== "boolean") return bad("archived is true or false.");

	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const row = await pageRow(supabase, id);
		if (!row) return bad("not found", 404);

		const columns: Record<string, unknown> = {};
		if (checked.value.title !== undefined) columns.title = checked.value.title;
		if (checked.value.body !== undefined) {
			columns.body = checked.value.body;
			columns.body_text = checked.value.body_text ?? "";
		}
		if (typeof body.restricted === "boolean" && body.restricted !== row.restricted) {
			if (row.created_by !== uid) return bad("Only the person who made a page can restrict it or open it up.", 403);
			columns.restricted = body.restricted;
		}

		const parentId = "parent_id" in body ? ((body.parent_id as string | null) ?? null) : row.parent_id;
		const reparented = parentId !== row.parent_id;
		if (reparented && parentId) {
			const problem = checkParent(await chainOf(supabase, parentId), row.id, parentId, row.doc_space_id);
			if (problem) return bad(problem);
		}
		if (reparented) columns.parent_id = parentId;

		if (Object.keys(columns).length > 0) {
			const { data, error } = await supabase.from("doc_pages").update(columns).eq("id", row.id).select("id");
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
			if (!data || data.length === 0) return bad("You do not have permission to change this page.", 403);
		}

		if (reparented || index !== null) {
			await renumberSiblings(supabase, { docSpaceId: row.doc_space_id, parentId, pageId: row.id, index });
			// close the gap the page left behind
			if (reparented) await renumberSiblings(supabase, { docSpaceId: row.doc_space_id, parentId: row.parent_id });
		}

		if (typeof body.archived === "boolean" && body.archived !== !!row.archived_at) {
			const changed = await setArchived(supabase, { id: row.id, doc_space_id: row.doc_space_id, parent_id: parentId, archived_at: row.archived_at }, body.archived);
			if (changed === 0) return bad("You do not have permission to change this page.", 403);
		}

		if (checked.value.body !== undefined) {
			await syncPageLinks(supabase, { id: row.id, space_id: row.space_id }, checked.value.body);
			const keys = await docSpaceKeys(supabase, [row.doc_space_id]);
			const events = await mentionEvents(supabase, {
				actorId: uid,
				pageId: row.id,
				title: checked.value.title ?? row.title,
				url: docUrl(keys.get(row.doc_space_id) ?? row.doc_space_id, row.id),
				before: row.body,
				after: checked.value.body,
			});
			await recordEvents(supabase, { actorId: uid, spaceId: row.space_id }, events);
		}

		const page = await loadDocPage(supabase, uid, row.id);
		if (!page) return bad("not found", 404);
		return NextResponse.json({ page });
	} catch (err) {
		const e = err as { code?: string; message?: string };
		if (e.code === "P0001" || e.code === "42501") return bad(docsErrorMessage(e), docsErrorStatus(e));
		console.error("[/api/work/docs/pages/:id PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const hard = req.nextUrl.searchParams.get("hard") === "1";
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const row = await pageRow(supabase, id);
		if (!row) return bad("not found", 404);

		if (hard) {
			const { data, error } = await supabase.from("doc_pages").delete().eq("id", row.id).select("id");
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
			if (!data || data.length === 0) return bad("You do not have permission to delete this page.", 403);
			return NextResponse.json({ ok: true, deleted: true });
		}

		if (row.archived_at) return NextResponse.json({ ok: true, archived: 0 });
		const changed = await setArchived(supabase, row, true);
		if (changed === 0) return bad("You do not have permission to archive this page.", 403);
		return NextResponse.json({ ok: true, archived: changed });
	} catch (err) {
		console.error("[/api/work/docs/pages/:id DELETE]", err);
		return bad("delete failed", 500);
	}
}
