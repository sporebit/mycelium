import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkDoc, docToText, refsIn } from "@/lib/work/doc";
import { recordEvents, watchersOf, workUrl, type WorkEvent } from "@/lib/work/notify";
import { bad, namesFor, resolveWorkRef, watch } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };
type Row = { id: string; body: string; body_doc: unknown; created_by: string | null; created_at: string; updated_at: string };

/**
 * /api/work/tickets/[key]/comments
 *
 * GET     the comments, oldest first.
 * POST    `{body_doc}` (the editor's document) or `{body}` (plain text). The
 *         text is derived from the document. The commenter and everyone
 *         mentioned start watching; watchers are told, mentions are told as
 *         mentions.
 * DELETE  `?id=` — your own comment only.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	try {
		const supabase = await createUserClient();
		const found = await resolveWorkRef(supabase, key);
		if (!found) return bad("not found", 404);
		const { data, error } = await supabase
			.from("ticket_comments")
			.select("id, body, body_doc, created_by, created_at, updated_at")
			.eq("ticket_id", found.id)
			.order("created_at");
		if (error) throw error;
		const rows = (data ?? []) as Row[];
		const names = await namesFor(supabase, rows.map((r) => r.created_by));
		return NextResponse.json({
			comments: rows.map((c) => ({
				id: c.id,
				body: c.body,
				body_doc: c.body_doc ?? null,
				author: c.created_by ? { id: c.created_by, name: names.get(c.created_by) ?? c.created_by.slice(0, 8) } : null,
				created_at: c.created_at,
				updated_at: c.updated_at,
			})),
		});
	} catch (err) {
		console.error("[/api/work/tickets/:key/comments GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function POST(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");

	let doc: unknown = null;
	let text = "";
	if (body.body_doc !== undefined && body.body_doc !== null) {
		const problem = checkDoc(body.body_doc, 100_000);
		if (problem) return bad(problem);
		doc = body.body_doc;
		text = docToText(doc);
	} else if (typeof body.body === "string") {
		text = body.body.trim().slice(0, 20_000);
	}
	if (!text) return bad("A comment needs some text.");

	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const found = await resolveWorkRef(supabase, key);
		if (!found) return bad("not found", 404);

		const { data, error } = await supabase
			.from("ticket_comments")
			.insert({ ticket_id: found.id, space_id: found.space_id, body: text, body_doc: doc })
			.select("id, body, body_doc, created_by, created_at, updated_at")
			.single();
		if (error || !data) return bad(error?.message ?? "comment failed", error?.code === "42501" ? 403 : 400);
		const row = data as Row;

		await supabase.from("ticket_activity").insert({ ticket_id: found.id, space_id: found.space_id, action: "commented", field: null, from_value: null, to_value: text.slice(0, 200) });
		await supabase.from("tickets").update({ updated_at: new Date().toISOString() }).eq("id", found.id);

		const refs = refsIn(doc);
		const before = await watchersOf(supabase, found.id);
		await watch(supabase, found, [uid, ...refs.users]);

		const k = found.key ?? found.id;
		const names = await namesFor(supabase, [uid]);
		const who = names.get(uid) ?? "Someone";
		const events: WorkEvent[] = [];
		if (refs.users.length > 0) {
			events.push({ event: "mention", recipients: refs.users, title: `${who} mentioned you in ${k}`, body: text.slice(0, 400), url: workUrl(k), ticket_id: found.id, comment_id: row.id });
		}
		events.push({ event: "comment", recipients: [...before, found.assignee_id], title: `${who} commented on ${k}`, body: text.slice(0, 400), url: workUrl(k), ticket_id: found.id, comment_id: row.id });
		await recordEvents(supabase, { actorId: uid, spaceId: found.space_id }, events);

		return NextResponse.json(
			{ comment: { id: row.id, body: row.body, body_doc: row.body_doc ?? null, author: { id: uid, name: who }, created_at: row.created_at, updated_at: row.updated_at } },
			{ status: 201 },
		);
	} catch (err) {
		console.error("[/api/work/tickets/:key/comments POST]", err);
		return bad("comment failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const id = req.nextUrl.searchParams.get("id") ?? "";
	if (!/^[0-9a-f-]{36}$/i.test(id)) return bad("id required");
	try {
		const supabase = await createUserClient();
		const found = await resolveWorkRef(supabase, key);
		if (!found) return bad("not found", 404);
		const { data, error } = await supabase.from("ticket_comments").delete().eq("id", id).eq("ticket_id", found.id).eq("created_by", uid).select("id");
		if (error) return bad(error.message, 400);
		if (!data || data.length === 0) return bad("not found", 404);
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/tickets/:key/comments DELETE]", err);
		return bad("delete failed", 500);
	}
}
