import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { docsErrorMessage, docsErrorStatus, pageRow, pageTickets } from "@/lib/work/docs";
import { bad, resolveWorkRef, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * /api/work/docs/pages/[id]/links — a page's tickets.
 *
 * GET     the tickets linked to the page, with their status.
 * POST    `{ticket: key}` — a link made by hand. A link that was there
 *         because the page mentions the ticket becomes a manual one, so it
 *         stays when the mention goes.
 * DELETE  `?ticket=<key>` — removes the link. A page that still mentions
 *         the ticket gets its mention link back the next time it is saved.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	if (!UUID_RE.test(id)) return bad("not found", 404);
	try {
		const supabase = await createUserClient();
		const page = await pageRow(supabase, id);
		if (!page) return bad("not found", 404);
		return NextResponse.json({ tickets: await pageTickets(supabase, id) });
	} catch (err) {
		console.error("[/api/work/docs/pages/:id/links GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function POST(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	if (typeof body.ticket !== "string" || !body.ticket.trim()) return bad("ticket is a ticket key.");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const page = await pageRow(supabase, id);
		if (!page) return bad("not found", 404);
		const ticket = await resolveWorkRef(supabase, body.ticket.trim());
		if (!ticket || ticket.space_id !== page.space_id) return bad(`No ticket "${body.ticket.trim()}" in this space.`, 404);

		const { data: current, error: readErr } = await supabase.from("doc_page_links").select("source").eq("page_id", id).eq("ticket_id", ticket.id).maybeSingle();
		if (readErr) throw readErr;
		let made = false;
		if (!current) {
			const { error } = await supabase.from("doc_page_links").insert({ space_id: page.space_id, page_id: id, ticket_id: ticket.id, source: "manual" });
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
			made = true;
		} else if (current.source !== "manual") {
			const { data, error } = await supabase.from("doc_page_links").update({ source: "manual" }).eq("page_id", id).eq("ticket_id", ticket.id).select("ticket_id");
			if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
			if (!data || data.length === 0) return bad("You do not have permission to change this page.", 403);
		}
		return NextResponse.json({ tickets: await pageTickets(supabase, id) }, { status: made ? 201 : 200 });
	} catch (err) {
		console.error("[/api/work/docs/pages/:id/links POST]", err);
		return bad("link failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const key = (req.nextUrl.searchParams.get("ticket") ?? "").trim();
	if (!key) return bad("ticket is a ticket key.");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const page = await pageRow(supabase, id);
		if (!page) return bad("not found", 404);
		const ticket = await resolveWorkRef(supabase, key);
		if (!ticket) return bad(`No ticket "${key}".`, 404);
		const { data, error } = await supabase.from("doc_page_links").delete().eq("page_id", id).eq("ticket_id", ticket.id).select("ticket_id");
		if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		if (!data || data.length === 0) return bad("not found", 404);
		return NextResponse.json({ ok: true, tickets: await pageTickets(supabase, id) });
	} catch (err) {
		console.error("[/api/work/docs/pages/:id/links DELETE]", err);
		return bad("unlink failed", 500);
	}
}
