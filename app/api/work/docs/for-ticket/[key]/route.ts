import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { docSpaceKeys, type LinkSource } from "@/lib/work/docs";
import { bad, resolveWorkRef } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };
type PageRef = { id: string; title: string; doc_space_id: string; archived_at: string | null; updated_at: string };
type Row = { source: LinkSource; page: PageRef | PageRef[] | null };

/**
 * GET /api/work/docs/for-ticket/[key] — the pages linked to a ticket, the
 * other way round from a page's tickets. Archived pages are left out, and
 * so is any page the caller cannot see.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	try {
		const supabase = await createUserClient();
		const ticket = await resolveWorkRef(supabase, key);
		if (!ticket) return bad("not found", 404);
		const { data, error } = await supabase
			.from("doc_page_links")
			.select("source, page:doc_pages(id, title, doc_space_id, archived_at, updated_at)")
			.eq("ticket_id", ticket.id)
			.limit(500);
		if (error) throw error;
		const found: Array<{ source: LinkSource; page: PageRef }> = [];
		for (const r of (data ?? []) as unknown as Row[]) {
			const page = Array.isArray(r.page) ? (r.page[0] ?? null) : r.page;
			if (page && !page.archived_at) found.push({ source: r.source, page });
		}
		const keys = await docSpaceKeys(supabase, found.map((f) => f.page.doc_space_id));
		const pages = found
			.map((f) => ({ id: f.page.id, title: f.page.title, doc_space_key: keys.get(f.page.doc_space_id) ?? "", source: f.source, updated_at: f.page.updated_at }))
			.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
		return NextResponse.json({ pages });
	} catch (err) {
		console.error("[/api/work/docs/for-ticket/:key GET]", err);
		return bad("fetch failed", 500);
	}
}
