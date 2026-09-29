import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { DOC_SPACE_SELECT, checkDocSpace, docsErrorMessage, docsErrorStatus, pageCount, resolveDocSpace, treeOf, type DocSpace } from "@/lib/work/docs";
import { bad, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };
type Raw = Omit<DocSpace, "page_count">;

/**
 * /api/work/docs/spaces/[key] — one doc space, by key or id.
 *
 * GET     the doc space with its page tree. Archived pages, and the pages
 *         under them, are left out unless `?archived=1`.
 * PATCH   `{name?, description?, icon?, home_page_id?, archived?}`. The key
 *         is in every page's URL and does not change.
 * DELETE  only once every page in it is archived; 409 otherwise.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const found = await resolveDocSpace(supabase, uid, key, sp.get("space"));
		if (!found) return bad("not found", 404);
		const [tree, count] = await Promise.all([treeOf(supabase, found.id, sp.get("archived") === "1"), pageCount(supabase, found.id)]);
		const space: DocSpace = { ...found, page_count: count };
		return NextResponse.json({ space, tree });
	} catch (err) {
		console.error("[/api/work/docs/spaces/:key GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	const checked = checkDocSpace(body, "patch");
	if (!checked.ok) return bad(checked.error);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await resolveDocSpace(supabase, uid, key, req.nextUrl.searchParams.get("space"));
		if (!found) return bad("not found", 404);
		if (typeof body.key === "string" && body.key.trim().toUpperCase() !== found.key) return bad("The key of a doc space cannot be changed.");

		const update: Record<string, unknown> = { ...checked.value };
		if ("home_page_id" in body) {
			if (body.home_page_id === null) {
				update.home_page_id = null;
			} else if (typeof body.home_page_id === "string" && UUID_RE.test(body.home_page_id)) {
				const { data: page } = await supabase.from("doc_pages").select("id, doc_space_id").eq("id", body.home_page_id).maybeSingle();
				if (!page || page.doc_space_id !== found.id) return bad("The home page must be a page in this doc space.");
				update.home_page_id = page.id;
			} else {
				return bad("home_page_id is a page id.");
			}
		}
		if ("archived" in body) {
			if (typeof body.archived !== "boolean") return bad("archived is true or false.");
			if (body.archived !== !!found.archived_at) update.archived_at = body.archived ? new Date().toISOString() : null;
		}
		if (Object.keys(update).length === 0) {
			const same: DocSpace = { ...found, page_count: await pageCount(supabase, found.id) };
			return NextResponse.json({ space: same });
		}
		update.updated_at = new Date().toISOString();

		const { data, error } = await supabase.from("doc_spaces").update(update).eq("id", found.id).select(DOC_SPACE_SELECT);
		if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		if (!data || data.length === 0) return bad("You do not have permission to do that.", 403);
		const space: DocSpace = { ...(data[0] as Raw), page_count: await pageCount(supabase, found.id) };
		return NextResponse.json({ space });
	} catch (err) {
		console.error("[/api/work/docs/spaces/:key PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await resolveDocSpace(supabase, uid, key, req.nextUrl.searchParams.get("space"));
		if (!found) return bad("not found", 404);
		const live = await pageCount(supabase, found.id);
		if (live > 0) {
			return bad(`This doc space still has ${live} ${live === 1 ? "page" : "pages"}. Archive them first, or archive the doc space instead.`, 409, { pages: live });
		}
		const { data, error } = await supabase.from("doc_spaces").delete().eq("id", found.id).select("id");
		if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		if (!data || data.length === 0) return bad("You do not have permission to do that.", 403);
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/docs/spaces/:key DELETE]", err);
		return bad("delete failed", 500);
	}
}
