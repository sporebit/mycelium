import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { bad, queryFromRequest, resolveSpace, searchTickets } from "@/lib/work/server";
import { createWorkTicket } from "@/lib/work/tickets";

export const runtime = "nodejs";

/**
 * /api/work/tickets (claude/spec-work.md §4)
 *
 * GET   search. `jql=` or `q=` (the query object as JSON); `limit`, `offset`,
 *       `space`. Both compile to the same object and run through
 *       public.work_search under the caller's RLS.
 * POST  create. `title` required; `project`, `type`, `status`, `epic` and
 *       `parent` take the names people type or ids.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const space = sp.get("space") ? await resolveSpace(supabase, uid, sp.get("space")) : null;
		if (sp.get("space") && !space) return bad("No such space.", 404);
		const parsed = await queryFromRequest(supabase, sp, space?.id ?? null);
		if (!parsed.ok) return parsed.response;
		const result = await searchTickets(supabase, parsed.query, {
			limit: Number(sp.get("limit") ?? 50) || 50,
			offset: Number(sp.get("offset") ?? 0) || 0,
			space: space?.id ?? null,
		});
		return NextResponse.json({ ...result, query: parsed.query });
	} catch (err) {
		const e = err as { code?: string; message?: string };
		// the database checks the query again; its refusals are the caller's to fix
		if (e.code === "22023" || e.code === "22007") return bad(e.message?.replace(/^work query: /, "") ?? "bad query");
		console.error("[/api/work/tickets GET]", err);
		return bad("search failed", 500);
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
		const space = await resolveSpace(supabase, uid, typeof body.space === "string" ? body.space : null);
		if (!space) return bad("No such space.", 404);
		const made = await createWorkTicket(supabase, uid, space.id, body);
		if (!made.ok) return bad(made.error, made.status);
		return NextResponse.json({ ticket: made.ticket, key: made.ticket.key }, { status: 201 });
	} catch (err) {
		console.error("[/api/work/tickets POST]", err);
		return bad("create failed", 500);
	}
}
