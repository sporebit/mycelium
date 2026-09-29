import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { EMPTY_DOC } from "@/lib/work/doc";
import {
	PAGE_SUMMARY_SELECT,
	chainOf,
	checkPageWrite,
	checkParent,
	docSpaceKeys,
	docsErrorMessage,
	docsErrorStatus,
	excerptAround,
	likePattern,
	loadDocPage,
	mentionEvents,
	nextPosition,
	resolveDocSpace,
	resolveDocTemplate,
	syncPageLinks,
	toSummary,
	type DocSearchHit,
	type RawSummary,
} from "@/lib/work/docs";
import { docUrl, recordEvents } from "@/lib/work/notify";
import { bad, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Found = RawSummary & { body_text: string };

/**
 * /api/work/docs/pages (claude/spec-work.md §7)
 *
 * GET   `?q=` — pages whose title or text contains it, whatever the case,
 *       newest first, thirty at most, each with a short excerpt around the
 *       match. `doc_space=` (key or id) narrows it; archived pages are left
 *       out unless `archived=1`. Only pages the caller can see.
 * POST  `{doc_space, parent_id?, title?, body?, template?}` — a new page at
 *       the end of its siblings. A template (by slug) gives the title and
 *       the body the caller did not.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	const sp = req.nextUrl.searchParams;
	const q = (sp.get("q") ?? "").trim().slice(0, 200);
	if (!q) return NextResponse.json({ pages: [], q: "" });
	try {
		const supabase = await createUserClient();
		let docSpaceId: string | null = null;
		if (sp.get("doc_space")) {
			const ds = await resolveDocSpace(supabase, uid, sp.get("doc_space") as string, sp.get("space"));
			if (!ds) return bad("No such doc space.", 404);
			docSpaceId = ds.id;
		}
		const pattern = likePattern(q);
		const run = (column: "title" | "body_text") => {
			let query = supabase.from("doc_pages").select(`${PAGE_SUMMARY_SELECT}, body_text`).ilike(column, pattern);
			if (docSpaceId) query = query.eq("doc_space_id", docSpaceId);
			if (sp.get("archived") !== "1") query = query.is("archived_at", null);
			return query.order("updated_at", { ascending: false }).limit(30);
		};
		const [byTitle, byText] = await Promise.all([run("title"), run("body_text")]);
		if (byTitle.error) throw byTitle.error;
		if (byText.error) throw byText.error;

		const seen = new Map<string, Found>();
		for (const r of [...((byTitle.data ?? []) as Found[]), ...((byText.data ?? []) as Found[])]) seen.set(r.id, r);
		const rows = [...seen.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 30);
		if (rows.length === 0) return NextResponse.json({ pages: [], q });

		const ids = rows.map((r) => r.id);
		const [keys, kids] = await Promise.all([
			docSpaceKeys(supabase, rows.map((r) => r.doc_space_id)),
			supabase.from("doc_pages").select("parent_id").in("parent_id", ids).is("archived_at", null).limit(1000),
		]);
		if (kids.error) throw kids.error;
		const parents = new Set(((kids.data ?? []) as Array<{ parent_id: string | null }>).map((k) => k.parent_id));
		const pages: DocSearchHit[] = rows.map((r) => ({
			...toSummary(r, parents.has(r.id)),
			doc_space_key: keys.get(r.doc_space_id) ?? "",
			excerpt: excerptAround(r.body_text, q),
		}));
		return NextResponse.json({ pages, q });
	} catch (err) {
		console.error("[/api/work/docs/pages GET]", err);
		return bad("search failed", 500);
	}
}

export async function POST(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	if (typeof body.doc_space !== "string" || !body.doc_space.trim()) return bad("A page needs a doc space.");
	if (body.parent_id !== undefined && body.parent_id !== null && !(typeof body.parent_id === "string" && UUID_RE.test(body.parent_id))) return bad("parent_id is a page id.");
	if (body.template !== undefined && body.template !== null && typeof body.template !== "string") return bad("template is a template's slug.");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const docSpace = await resolveDocSpace(supabase, uid, body.doc_space, typeof body.space === "string" ? body.space : null);
		if (!docSpace) return bad("No such doc space.", 404);
		if (docSpace.archived_at) return bad("This doc space is archived.", 409);

		const given: Record<string, unknown> = { title: body.title, body: body.body };
		if (typeof body.template === "string" && body.template.trim()) {
			const tpl = await resolveDocTemplate(supabase, uid, body.template, docSpace.space_id);
			if (!tpl) return bad(`No template "${body.template}".`);
			if (typeof given.title !== "string" || !given.title.trim()) given.title = tpl.title ?? tpl.name;
			if (given.body === undefined || given.body === null) given.body = tpl.body;
		}
		const checked = checkPageWrite(given, "create");
		if (!checked.ok) return bad(checked.error);

		const parentId = typeof body.parent_id === "string" ? body.parent_id : null;
		if (parentId) {
			const chain = await chainOf(supabase, parentId);
			const problem = checkParent(chain, null, parentId, docSpace.id);
			if (problem) return bad(problem);
			if (chain.some((p) => p.archived_at)) return bad("The parent page is archived.", 409);
		}

		let siblings = supabase.from("doc_pages").select("position").eq("doc_space_id", docSpace.id);
		siblings = parentId ? siblings.eq("parent_id", parentId) : siblings.is("parent_id", null);
		const { data: last, error: lastErr } = await siblings.order("position", { ascending: false }).limit(1);
		if (lastErr) throw lastErr;

		const { data, error } = await supabase
			.from("doc_pages")
			.insert({
				space_id: docSpace.space_id,
				doc_space_id: docSpace.id,
				parent_id: parentId,
				title: checked.value.title,
				body: checked.value.body ?? EMPTY_DOC,
				body_text: checked.value.body_text ?? "",
				position: nextPosition((last ?? []) as Array<{ position: number }>),
			})
			.select("id, title")
			.single();
		if (error || !data) return bad(docsErrorMessage(error), docsErrorStatus(error));
		const made = data as { id: string; title: string };

		await syncPageLinks(supabase, { id: made.id, space_id: docSpace.space_id }, checked.value.body);
		const events = await mentionEvents(supabase, {
			actorId: uid,
			pageId: made.id,
			title: made.title,
			url: docUrl(docSpace.key, made.id),
			before: EMPTY_DOC,
			after: checked.value.body,
		});
		await recordEvents(supabase, { actorId: uid, spaceId: docSpace.space_id }, events);

		const page = await loadDocPage(supabase, uid, made.id);
		if (!page) return bad("The page was made but cannot be read back.", 500);
		return NextResponse.json({ page }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/docs/pages POST]", err);
		return bad("create failed", 500);
	}
}
