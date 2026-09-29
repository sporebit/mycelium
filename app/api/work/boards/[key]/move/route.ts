import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { boardShape, columnRanks, placeCard } from "@/lib/work/boards";
import { bad, resolveProject, resolveWorkRef, UUID_RE, workflowFor, writeErrorMessage } from "@/lib/work/server";
import { patchWorkTicket } from "@/lib/work/tickets";
import type { WorkStatus } from "@/lib/work/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

type Neighbour = { given: boolean; ref: string | null; error: string | null };

function neighbour(body: Record<string, unknown>, field: "before" | "after"): Neighbour {
	const v = body[field];
	if (v === undefined || v === null || v === "") return { given: false, ref: null, error: null };
	if (typeof v !== "string") return { given: false, ref: null, error: `${field} is a ticket key.` };
	return { given: true, ref: v.trim(), error: null };
}

/**
 * POST /api/work/boards/[key]/move — `{ticket, status_id, before?, after?}`
 *
 * Moves a card to a status and ranks it among its neighbours. The status
 * change goes through the one Work write path, so the activity log, the
 * notifications and the workflow rules all apply.
 *
 * `before` is the key of the card it is placed BEFORE (the one that ends
 * up directly below it); `after` the key of the card it is placed AFTER
 * (directly above it). With both, it goes between them. With neither, it
 * goes to the end of the column. When the neighbours' ranks leave no gap,
 * the column is renumbered in steps of 1024 first.
 *
 * A column can hold statuses of several workflows under one name: a
 * status id from another workflow lands the card on its own workflow's
 * status of that name, or of that column.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");

	const ticketRef = typeof body.ticket === "string" ? body.ticket.trim() : "";
	if (!ticketRef) return bad("ticket is the key of the card to move.");
	const statusId = typeof body.status_id === "string" ? body.status_id.trim().toLowerCase() : "";
	if (!UUID_RE.test(statusId)) return bad("status_id is a status id.");
	const before = neighbour(body, "before");
	const after = neighbour(body, "after");
	if (before.error ?? after.error) return bad((before.error ?? after.error) as string);

	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;

		const project = await resolveProject(supabase, key);
		if (!project) return bad("not found", 404);
		const ticket = await resolveWorkRef(supabase, ticketRef);
		if (!ticket) return bad(`No ticket "${ticketRef}".`, 404);
		if (ticket.project_id !== project.id) return bad(`${ticket.key ?? ticketRef} is not in this project.`, 409);

		const shape = await boardShape(supabase, project);
		const target = shape.known.get(statusId);
		if (!target) return bad("No such status.", 404);
		const column = shape.columns.find((c) => c.status_ids.includes(target.id)) ?? null;

		// the status the card can actually take: its own workflow's
		const workflow = await workflowFor(supabase, ticket.space_id, ticket.project_id, ticket.type_id);
		const own = [...shape.known.values()].filter((s) => s.workflow_id === workflow);
		const landing: WorkStatus | null =
			own.find((s) => s.id === target.id) ??
			own.find((s) => s.name.trim().toLowerCase() === target.name.trim().toLowerCase()) ??
			own.find((s) => column?.status_ids.includes(s.id)) ??
			null;
		if (!landing) {
			return bad(`"${target.name}" is not a status in this ticket's workflow (${own.map((s) => s.name).join(", ")}).`, 400);
		}

		const ids: Array<string | null> = [];
		for (const n of [before, after]) {
			if (!n.given || !n.ref) {
				ids.push(null);
				continue;
			}
			const found = await resolveWorkRef(supabase, n.ref);
			if (!found) return bad(`No ticket "${n.ref}".`, 404);
			if (found.id === ticket.id) return bad("A card cannot be its own neighbour.");
			ids.push(found.id);
		}

		const statusIds = Array.from(new Set([...(column?.status_ids ?? []), landing.id]));
		const cards = await columnRanks(supabase, project.id, statusIds, ticket.id);
		const placed = placeCard(cards, { before: ids[0], after: ids[1] });
		if (!placed.ok) return bad(placed.error, 409);

		// the neighbours first: should the card's own write fail, the column
		// keeps its order and nothing is half moved
		for (let i = 0; i < placed.renumber.length; i += 10) {
			const results = await Promise.all(
				placed.renumber.slice(i, i + 10).map((c) => supabase.from("tickets").update({ sort_order: c.rank }).eq("id", c.id)),
			);
			const failed = results.find((r) => r.error);
			if (failed?.error) return bad(writeErrorMessage(failed.error), failed.error.code === "42501" ? 403 : 400);
		}

		const change: Record<string, unknown> = { rank: placed.rank };
		if (landing.id !== ticket.status_id) change.status_id = landing.id;
		const res = await patchWorkTicket(supabase, uid, ticket.id, change);
		if (!res.ok) return bad(res.error, res.status);
		return NextResponse.json({ ticket: res.ticket, rank: placed.rank, index: placed.index, renumbered: placed.renumber.length });
	} catch (err) {
		console.error("[/api/work/boards/:key/move POST]", err);
		return bad("move failed", 500);
	}
}
