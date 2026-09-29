import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { chainOf, docsErrorMessage, docsErrorStatus, restrictionOf } from "@/lib/work/docs";
import { bad, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * /api/work/docs/pages/[id]/restrictions — who may see and edit a page.
 *
 * GET  `{restricted, inherited_from, people, can_manage}`. A restricted
 *      page hides itself and everything under it from everyone but its
 *      creator and the people listed.
 * PUT  `{restricted, people: [{id, can_edit}]}` — replaces the list. The
 *      page's creator only. Each person must be someone the caller can see.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!UUID_RE.test(id)) return bad("not found", 404);
	try {
		const supabase = await createUserClient();
		const chain = await chainOf(supabase, id);
		if (chain.length === 0) return bad("not found", 404);
		return NextResponse.json(await restrictionOf(supabase, uid, chain));
	} catch (err) {
		console.error("[/api/work/docs/pages/:id/restrictions GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PUT(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	if (typeof body.restricted !== "boolean") return bad("restricted is true or false.");
	if (!Array.isArray(body.people)) return bad("people is a list.");
	if (body.people.length > 200) return bad("That is too many people for one page.");

	const wanted = new Map<string, boolean>();
	for (const p of body.people as unknown[]) {
		const person = p as { id?: unknown; can_edit?: unknown } | null;
		if (!person || typeof person !== "object" || typeof person.id !== "string" || !UUID_RE.test(person.id)) return bad("Each person needs an id.");
		if (person.can_edit !== undefined && typeof person.can_edit !== "boolean") return bad("can_edit is true or false.");
		wanted.set(person.id.toLowerCase(), person.can_edit === true);
	}
	// the creator always sees and edits their own page
	wanted.delete(uid.toLowerCase());

	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const { data: page, error: pageErr } = await supabase.from("doc_pages").select("id, space_id, restricted, created_by").eq("id", id).maybeSingle();
		if (pageErr) throw pageErr;
		if (!page) return bad("not found", 404);
		if (page.created_by !== uid) return bad("Only the person who made a page can say who sees it.", 403);

		const ids = [...wanted.keys()];
		if (ids.length > 0) {
			const { data: known, error: knownErr } = await supabase.from("profiles").select("id").in("id", ids);
			if (knownErr) throw knownErr;
			const seen = new Set(((known ?? []) as Array<{ id: string }>).map((p) => p.id.toLowerCase()));
			const missing = ids.filter((p) => !seen.has(p));
			if (missing.length > 0) return bad("One of those people is not someone you can share with.", 400, { unknown: missing });
		}

		const { data: current, error: curErr } = await supabase.from("doc_page_restrictions").select("grantee_id").eq("page_id", id);
		if (curErr) throw curErr;
		const drop = ((current ?? []) as Array<{ grantee_id: string }>).map((r) => r.grantee_id).filter((g) => !wanted.has(g.toLowerCase()));

		// the list before the switch when closing a page, the switch before the list when opening one:
		// at no point is the page restricted with a list that is not the one asked for
		if (!body.restricted && page.restricted) {
			const { error } = await supabase.from("doc_pages").update({ restricted: false }).eq("id", id);
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		}
		if (ids.length > 0) {
			const { error } = await supabase
				.from("doc_page_restrictions")
				.upsert(ids.map((grantee_id) => ({ space_id: page.space_id as string, page_id: id, grantee_id, can_edit: wanted.get(grantee_id) === true })), { onConflict: "page_id,grantee_id" });
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		}
		for (let i = 0; i < drop.length; i += 100) {
			const { error } = await supabase
				.from("doc_page_restrictions")
				.delete()
				.eq("page_id", id)
				.in("grantee_id", drop.slice(i, i + 100));
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		}
		if (body.restricted && !page.restricted) {
			const { error } = await supabase.from("doc_pages").update({ restricted: true }).eq("id", id);
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		}

		return NextResponse.json(await restrictionOf(supabase, uid, await chainOf(supabase, id)));
	} catch (err) {
		console.error("[/api/work/docs/pages/:id/restrictions PUT]", err);
		return bad("update failed", 500);
	}
}
