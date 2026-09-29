import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkDoc, isDoc } from "@/lib/work/doc";
import { syncRepoDocTemplates, type DocTemplateSync } from "@/lib/work/docTemplates";
import { TEMPLATE_SELECT, TITLE_MAX, docsErrorMessage, docsErrorStatus, pageRow, slugify, toTemplate, type DocTemplate } from "@/lib/work/docs";
import { bad, resolveSpace, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

/**
 * /api/work/docs/templates (claude/spec-work.md §7)
 *
 * GET   the page templates of the space, by name. `?sync=1` first brings
 *       the repo's templates (docs/docs/templates) up to date.
 * POST  `{name, description?, title?, body}` — a template made in the UI —
 *       or `{from_page: id, name, description?}` to make one from a page.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const space = await resolveSpace(supabase, uid, sp.get("space"));
		if (!space) return bad("No such space.", 404);
		let sync: DocTemplateSync | null = null;
		if (sp.get("sync") === "1") {
			if (!uid) return bad("Unauthorized", 401);
			sync = await syncRepoDocTemplates(supabase, space.id);
		}
		const { data, error } = await supabase.from("doc_templates").select(`${TEMPLATE_SELECT}, created_by`).eq("space_id", space.id).order("name").limit(500);
		if (error) throw error;
		const rows = (data ?? []) as unknown as Array<DocTemplate & { created_by: string | null }>;
		const templates = rows.filter((t) => t.shared || t.created_by === uid).map(toTemplate);
		return NextResponse.json(sync ? { templates, sync } : { templates });
	} catch (err) {
		console.error("[/api/work/docs/templates GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function POST(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name) return bad("A template needs a name.");
	if (name.length > 120) return bad("A name is at most 120 characters.");
	if (body.description !== undefined && body.description !== null && typeof body.description !== "string") return bad("description must be text.");
	if (body.title !== undefined && body.title !== null && typeof body.title !== "string") return bad("title must be text.");
	if (body.shared !== undefined && typeof body.shared !== "boolean") return bad("shared is true or false.");
	const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null;
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;

		let title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) || null : null;
		let doc: unknown = body.body;
		let spaceId: string | null = null;
		if (body.from_page !== undefined && body.from_page !== null) {
			if (typeof body.from_page !== "string" || !UUID_RE.test(body.from_page)) return bad("from_page is a page id.");
			const page = await pageRow(supabase, body.from_page);
			if (!page) return bad("No such page.", 404);
			title = title ?? page.title;
			doc = page.body;
			spaceId = page.space_id;
		} else {
			const space = await resolveSpace(supabase, uid, typeof body.space === "string" ? body.space : null);
			if (!space) return bad("No such space.", 404);
			spaceId = space.id;
		}
		if (!isDoc(doc)) return bad("A template needs a body.");
		const problem = checkDoc(doc);
		if (problem) return bad(problem);

		// a slug from the name; a number on the end when it is taken
		const base = slugify(name);
		const { data: taken, error: takenErr } = await supabase.from("doc_templates").select("slug").eq("space_id", spaceId).like("slug", `${base}%`).limit(1000);
		if (takenErr) throw takenErr;
		const used = new Set(((taken ?? []) as Array<{ slug: string }>).map((t) => t.slug));
		let slug = base;
		for (let n = 2; used.has(slug) && n < 1000; n += 1) slug = `${base}-${n}`;

		const { data, error } = await supabase
			.from("doc_templates")
			.insert({ space_id: spaceId, slug, name, description, title, body: doc, origin: "ui", version: 1, shared: body.shared !== false })
			.select(TEMPLATE_SELECT)
			.single();
		if (error || !data) return bad(docsErrorMessage(error), docsErrorStatus(error));
		return NextResponse.json({ template: toTemplate(data as unknown as DocTemplate) }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/docs/templates POST]", err);
		return bad("create failed", 500);
	}
}
