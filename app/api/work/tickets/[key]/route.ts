import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { removeGoogleEvent } from "@/lib/google/sync";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { bad, resolveWorkRef, statusesOf, workflowFor } from "@/lib/work/server";
import { patchWorkTicket, workTicketDetail } from "@/lib/work/tickets";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

/**
 * /api/work/tickets/[key] — the issue, by key (live or alias) or id.
 *
 * GET     the ticket with children, comments, activity, links, pages,
 *         watchers and the statuses it can move to.
 * PATCH   any Work field (lib/work/server workWriteFromBody).
 * DELETE  resolve as Cancelled — nothing is removed. `?hard=1` deletes the row.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	try {
		const supabase = await createUserClient();
		const detail = await workTicketDetail(supabase, uid, key);
		if (!detail) return bad("not found", 404);
		return NextResponse.json(detail);
	} catch (err) {
		console.error("[/api/work/tickets/:key GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	const body = await readJson(req);
	if (!body) return bad("bad json");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const res = await patchWorkTicket(supabase, uid, key, body);
		if (!res.ok) return bad(res.error, res.status);
		return NextResponse.json({ ticket: res.ticket });
	} catch (err) {
		console.error("[/api/work/tickets/:key PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	const hard = req.nextUrl.searchParams.get("hard") === "1";
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await resolveWorkRef(supabase, key);
		if (!found) return bad("not found", 404);

		if (hard) {
			const { data: existing } = await supabase.from("tickets").select("google_event_id").eq("id", found.id).maybeSingle();
			const { error } = await supabase.from("tickets").delete().eq("id", found.id);
			if (error) return bad(error.message, error.code === "42501" ? 403 : 400);
			if (existing?.google_event_id) removeGoogleEvent(supabase, "tasks", existing.google_event_id as string).catch(() => {});
			return NextResponse.json({ ok: true });
		}

		const wf = await workflowFor(supabase, found.space_id, found.project_id, found.type_id);
		const statuses = wf ? await statusesOf(supabase, wf) : [];
		const cancelled = statuses.find((s) => s.category === "done" && s.resolution === "cancelled") ?? statuses.find((s) => s.category === "done");
		if (!cancelled) return bad("This ticket's workflow has no Done status.", 409);
		const res = await patchWorkTicket(supabase, uid, found.id, { status_id: cancelled.id, resolution: "cancelled" });
		if (!res.ok) return bad(res.error, res.status);
		return NextResponse.json({ ok: true, ticket: res.ticket });
	} catch (err) {
		console.error("[/api/work/tickets/:key DELETE]", err);
		return bad("delete failed", 500);
	}
}
