import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkFilter, FILTER_SELECT, loadFilter, notAllowed, serializeFilter, spaceOf, writeFailure, type RawFilter } from "@/lib/work/config";
import { bad, labelFieldSlugs, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** The filter a request names: by id, or by slug in `?space=` (default: the caller's own space). */
async function find(req: NextRequest, uid: string, ref: string, supabase: SupabaseClient): Promise<RawFilter | null> {
	if (UUID_RE.test(ref)) return loadFilter(supabase, ref, null);
	const space = await spaceOf(supabase, uid, req.nextUrl.searchParams.get("space"));
	if (!space) return null;
	return loadFilter(supabase, ref, space.id);
}

/**
 * /api/work/filters/[id] — a saved filter, by id or by slug.
 *
 * GET     the filter.
 * PATCH   `{name?, jql?, description?, shared?, sort_order?}`. The slug
 *         stays, so links to it keep landing.
 * DELETE  the filter. A system filter can be edited but not deleted.
 *
 * A filter that is not shared is its creator's alone: nobody else can see,
 * change or delete it. Only the creator can make a filter private.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const found = await find(req, uid, id, supabase);
		if (!found || (!found.shared && found.created_by !== uid)) return bad("not found", 404);
		return NextResponse.json({ filter: serializeFilter(found, uid) });
	} catch (err) {
		console.error("[/api/work/filters/:id GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await find(req, uid, id, supabase);
		if (!found) return bad("not found", 404);
		if (!found.shared && found.created_by !== uid) return bad("Only its creator can change a filter that is not shared.", 403);

		const checked = checkFilter(body, await labelFieldSlugs(supabase, found.space_id), { partial: true });
		if (!checked.ok) return bad(checked.error, 400, checked.pos === undefined ? {} : { pos: checked.pos });
		const columns = checked.value;
		if (Object.keys(columns).length === 0) return bad("Nothing to change.");
		if (columns.shared === false && found.shared && found.created_by !== uid) {
			return bad("Only its creator can make a filter private.", 403);
		}

		const { data, error } = await supabase
			.from("saved_filters")
			.update({ ...columns, updated_at: new Date().toISOString() })
			.eq("id", found.id)
			.eq("space_id", found.space_id)
			.select(FILTER_SELECT);
		if (error) return writeFailure(error);
		if (!data || data.length === 0) return notAllowed();
		return NextResponse.json({ filter: serializeFilter(data[0] as unknown as RawFilter, uid) });
	} catch (err) {
		console.error("[/api/work/filters/:id PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await find(req, uid, id, supabase);
		if (!found) return bad("not found", 404);
		if (!found.shared && found.created_by !== uid) return bad("Only its creator can delete a filter that is not shared.", 403);
		if (found.is_system) return bad(`${found.name} is a system filter: it can be edited but not deleted.`, 409);

		const { data, error } = await supabase.from("saved_filters").delete().eq("id", found.id).eq("space_id", found.space_id).select("id");
		if (error) return writeFailure(error);
		if (!data || data.length === 0) return notAllowed();
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/filters/:id DELETE]", err);
		return bad("delete failed", 500);
	}
}
