import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkFilter, FILTER_SELECT, loadFilters, serializeFilter, spaceOf, uniqueSlug, writeFailure, type RawFilter } from "@/lib/work/config";
import { bad, labelFieldSlugs } from "@/lib/work/server";

export const runtime = "nodejs";

/**
 * /api/work/filters (claude/spec-work.md §2.5, §4)
 *
 * GET   the shared filters of a space plus the caller's own. `?space=<uuid>`.
 * POST  create `{name, jql, description?, shared?}`. The JQL is parsed with
 *       the space's label fields and stored beside the query object it
 *       compiles to. A JQL that does not parse is a 400 with the parser's
 *       message and `pos`.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const space = await spaceOf(supabase, uid, req.nextUrl.searchParams.get("space"));
		if (!space) return bad("No such space.", 404);
		return NextResponse.json({ filters: await loadFilters(supabase, space.id, uid) });
	} catch (err) {
		console.error("[/api/work/filters GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function POST(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const wanted = req.nextUrl.searchParams.get("space") ?? (typeof body.space === "string" ? body.space : null);
		const space = await spaceOf(supabase, uid, wanted);
		if (!space) return bad("No such space.", 404);

		const checked = checkFilter(body, await labelFieldSlugs(supabase, space.id), { partial: false });
		if (!checked.ok) return bad(checked.error, 400, checked.pos === undefined ? {} : { pos: checked.pos });
		const columns = checked.value;
		const base = columns.slug as string;

		const { data: rows, error: readErr } = await supabase.from("saved_filters").select("slug, sort_order").eq("space_id", space.id);
		if (readErr) throw readErr;
		const seen = (rows ?? []) as Array<{ slug: string; sort_order: number }>;
		const taken = new Set(seen.map((r) => r.slug));
		const sortOrder = columns.sort_order ?? seen.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;

		// Someone else's private filter may hold the slug unseen: on a clash, step to the next.
		for (let attempt = 0; attempt < 6; attempt += 1) {
			const slug = uniqueSlug(base, taken);
			const { data, error } = await supabase
				.from("saved_filters")
				.insert({
					space_id: space.id,
					name: columns.name,
					slug,
					description: columns.description ?? null,
					jql: columns.jql,
					query: columns.query,
					shared: columns.shared ?? true,
					is_system: false,
					sort_order: sortOrder,
				})
				.select(FILTER_SELECT)
				.single();
			if (!error && data) return NextResponse.json({ filter: serializeFilter(data as unknown as RawFilter, uid) }, { status: 201 });
			if (error?.code !== "23505") return writeFailure(error);
			taken.add(slug);
		}
		return bad("No free slug could be found for that name. Try another name.", 409);
	} catch (err) {
		console.error("[/api/work/filters POST]", err);
		return bad("create failed", 500);
	}
}
