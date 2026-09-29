import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { EMPTY_DOC } from "@/lib/work/doc";
import { DOC_SPACE_SELECT, checkDocSpace, docsErrorMessage, docsErrorStatus, withPageCounts, type DocSpace } from "@/lib/work/docs";
import { bad, resolveSpace } from "@/lib/work/server";

export const runtime = "nodejs";

type Raw = Omit<DocSpace, "page_count">;

/**
 * /api/work/docs/spaces (claude/spec-work.md §7)
 *
 * GET   the doc spaces the caller can see, each with its page count.
 *       Archived ones only with `?all=1`; `?space=` narrows to one space.
 * POST  `{key, name, description?, icon?, space?}` — makes the doc space
 *       and its home page, titled as the doc space is named.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const space = sp.get("space") ? await resolveSpace(supabase, uid, sp.get("space")) : null;
		if (sp.get("space") && !space) return bad("No such space.", 404);
		let q = supabase.from("doc_spaces").select(DOC_SPACE_SELECT);
		if (space) q = q.eq("space_id", space.id);
		if (sp.get("all") !== "1") q = q.is("archived_at", null);
		const { data, error } = await q.order("name").limit(500);
		if (error) throw error;
		return NextResponse.json({ spaces: await withPageCounts(supabase, (data ?? []) as Raw[]) });
	} catch (err) {
		console.error("[/api/work/docs/spaces GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function POST(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	const checked = checkDocSpace(body, "create");
	if (!checked.ok) return bad(checked.error);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const space = await resolveSpace(supabase, uid, typeof body.space === "string" ? body.space : null);
		if (!space) return bad("No such space.", 404);

		const { data: taken } = await supabase
			.from("doc_spaces")
			.select("id")
			.eq("space_id", space.id)
			.eq("key", checked.value.key as string)
			.limit(1);
		if (taken && taken.length > 0) return bad(`There is already a doc space with the key ${checked.value.key}.`, 409);

		const { data, error } = await supabase
			.from("doc_spaces")
			.insert({ space_id: space.id, key: checked.value.key, name: checked.value.name, description: checked.value.description ?? null, icon: checked.value.icon ?? null })
			.select(DOC_SPACE_SELECT)
			.single();
		if (error || !data) return bad(docsErrorMessage(error), docsErrorStatus(error));
		const made = data as Raw;

		const { data: home, error: homeErr } = await supabase
			.from("doc_pages")
			.insert({ space_id: space.id, doc_space_id: made.id, title: made.name, body: EMPTY_DOC, body_text: "", position: 0 })
			.select("id")
			.single();
		if (homeErr || !home) {
			// no doc space without its home page
			await supabase.from("doc_spaces").delete().eq("id", made.id);
			return bad(docsErrorMessage(homeErr), docsErrorStatus(homeErr));
		}
		const homeId = home.id as string;
		const { error: linkErr } = await supabase.from("doc_spaces").update({ home_page_id: homeId, updated_at: new Date().toISOString() }).eq("id", made.id);
		if (linkErr) throw linkErr;

		const out: DocSpace = { ...made, home_page_id: homeId, page_count: 1 };
		return NextResponse.json({ space: out }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/docs/spaces POST]", err);
		return bad("create failed", 500);
	}
}
