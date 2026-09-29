import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkDoc } from "@/lib/work/doc";
import { TEMPLATE_SELECT, TITLE_MAX, docsErrorMessage, docsErrorStatus, resolveDocTemplate, toTemplate, type DocTemplate } from "@/lib/work/docs";
import { bad } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * /api/work/docs/templates/[slug] — one page template, by slug or id.
 *
 * GET     the template.
 * PATCH   `{name?, description?, title?, body?, shared?}` — bumps its
 *         version. A repo template edited here becomes a UI one, so the
 *         next sync leaves the edit alone.
 * DELETE  a UI template. A repo template would only come back on the next
 *         sync, so it is refused (409): those are changed in the repository.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	const uid = await principalUid();
	try {
		const supabase = await createUserClient();
		const tpl = await resolveDocTemplate(supabase, uid, slug, req.nextUrl.searchParams.get("space"));
		if (!tpl) return bad("not found", 404);
		return NextResponse.json({ template: toTemplate(tpl) });
	} catch (err) {
		console.error("[/api/work/docs/templates/:slug GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");

	const update: Record<string, unknown> = {};
	if ("name" in body) {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name) return bad("A template needs a name.");
		if (name.length > 120) return bad("A name is at most 120 characters.");
		update.name = name;
	}
	if ("description" in body) {
		if (body.description !== null && typeof body.description !== "string") return bad("description must be text.");
		update.description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null;
	}
	if ("title" in body) {
		if (body.title !== null && typeof body.title !== "string") return bad("title must be text.");
		update.title = typeof body.title === "string" ? body.title.trim().slice(0, TITLE_MAX) || null : null;
	}
	if ("body" in body) {
		const problem = checkDoc(body.body);
		if (problem) return bad(problem);
		update.body = body.body;
	}
	if ("shared" in body) {
		if (typeof body.shared !== "boolean") return bad("shared is true or false.");
		update.shared = body.shared;
	}
	if (Object.keys(update).length === 0) return bad("Nothing to change.");

	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const tpl = await resolveDocTemplate(supabase, uid, slug, req.nextUrl.searchParams.get("space"));
		if (!tpl) return bad("not found", 404);
		update.version = tpl.version + 1;
		update.updated_at = new Date().toISOString();
		// edited in the UI: the UI owns it from now on
		if (tpl.origin === "repo") update.origin = "ui";
		const { data, error } = await supabase.from("doc_templates").update(update).eq("id", tpl.id).select(TEMPLATE_SELECT);
		if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		if (!data || data.length === 0) return bad("You do not have permission to do that.", 403);
		return NextResponse.json({ template: toTemplate(data[0] as unknown as DocTemplate) });
	} catch (err) {
		console.error("[/api/work/docs/templates/:slug PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const tpl = await resolveDocTemplate(supabase, uid, slug, req.nextUrl.searchParams.get("space"));
		if (!tpl) return bad("not found", 404);
		if (tpl.origin === "repo") {
			return bad("This template comes from the repository and would return on the next sync. Repo templates are changed in the repository (docs/docs/templates).", 409);
		}
		const { data, error } = await supabase.from("doc_templates").delete().eq("id", tpl.id).select("id");
		if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		if (!data || data.length === 0) return bad("You do not have permission to do that.", 403);
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/docs/templates/:slug DELETE]", err);
		return bad("delete failed", 500);
	}
}
