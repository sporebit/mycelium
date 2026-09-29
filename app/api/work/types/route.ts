import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkNewType, loadTypes, spaceOf, TYPE_SELECT, writeFailure } from "@/lib/work/config";
import { bad } from "@/lib/work/server";
import type { WorkType } from "@/lib/work/types";

export const runtime = "nodejs";

/**
 * /api/work/types (claude/spec-work.md §2.2, §4)
 *
 * GET   a space's issue types. `?space=<uuid>`; `?all=1` includes archived.
 * POST  create `{name, slug?, level?, has_steps?, legacy_kind?, icon?,
 *       colour?, sort_order?}`. The slug is made from the name when absent.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const space = await spaceOf(supabase, uid, sp.get("space"));
		if (!space) return bad("No such space.", 404);
		return NextResponse.json({ types: await loadTypes(supabase, space.id, sp.get("all") === "1") });
	} catch (err) {
		console.error("[/api/work/types GET]", err);
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

		const checked = checkNewType(body);
		if (!checked.ok) return bad(checked.error);
		const existing = await loadTypes(supabase, space.id, true);
		if (existing.some((t) => t.slug === checked.value.slug)) {
			return bad(`There is already an issue type with the slug "${checked.value.slug}".`, 409);
		}
		const sortOrder = checked.value.sort_order ?? existing.reduce((m, t) => Math.max(m, t.sort_order), 0) + 1;

		const { data, error } = await supabase
			.from("issue_types")
			.insert({ ...checked.value, sort_order: sortOrder, space_id: space.id })
			.select(TYPE_SELECT)
			.single();
		if (error || !data) return writeFailure(error, `There is already an issue type with the slug "${checked.value.slug}".`);
		return NextResponse.json({ type: data as unknown as WorkType }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/types POST]", err);
		return bad("create failed", 500);
	}
}
