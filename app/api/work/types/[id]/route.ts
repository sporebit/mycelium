import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkTypePatch, notAllowed, ticketsPhrase, ticketsUsing, TYPE_SELECT, writeFailure } from "@/lib/work/config";
import { bad, UUID_RE } from "@/lib/work/server";
import type { WorkType } from "@/lib/work/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type Row = WorkType & { legacy_kind: string | null; space_id: string };

/**
 * /api/work/types/[id]
 *
 * PATCH   `{name?, icon?, colour?, sort_order?, has_steps?, archived?}`.
 *         `slug`, `level` and `legacy_kind` are fixed once created.
 * DELETE  only a type no ticket has; otherwise archive it.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	if (!UUID_RE.test(id)) return bad("not found", 404);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const { data: found, error: readErr } = await supabase.from("issue_types").select(`${TYPE_SELECT}, legacy_kind, space_id`).eq("id", id).maybeSingle();
		if (readErr) throw readErr;
		if (!found) return bad("not found", 404);
		const current = found as unknown as Row;

		const checked = checkTypePatch(body, current);
		if (!checked.ok) return bad(checked.error);
		const columns = checked.value;
		// archiving twice keeps the first date
		if (columns.archived_at && current.archived_at) delete columns.archived_at;
		if (Object.keys(checked.value).length === 0 && !("archived" in body)) return bad("Nothing to change.");

		if (Object.keys(columns).length > 0) {
			const { data, error } = await supabase
				.from("issue_types")
				.update({ ...columns, updated_at: new Date().toISOString() })
				.eq("id", id)
				.eq("space_id", current.space_id)
				.select(TYPE_SELECT);
			if (error) return writeFailure(error);
			if (!data || data.length === 0) return notAllowed();
			return NextResponse.json({ type: data[0] as unknown as WorkType });
		}
		const type: WorkType = {
			id: current.id,
			name: current.name,
			slug: current.slug,
			level: current.level,
			has_steps: current.has_steps,
			icon: current.icon,
			colour: current.colour,
			sort_order: current.sort_order,
			archived_at: current.archived_at,
		};
		return NextResponse.json({ type });
	} catch (err) {
		console.error("[/api/work/types/:id PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const { data: found, error: readErr } = await supabase.from("issue_types").select("id, name, space_id").eq("id", id).maybeSingle();
		if (readErr) throw readErr;
		if (!found) return bad("not found", 404);

		const used = await ticketsUsing(supabase, "type_id", [id]);
		if (used > 0) {
			return bad(`${ticketsPhrase(used)} ${used === 1 ? "has" : "have"} the type ${found.name as string}. Archive it instead.`, 409, { tickets: used });
		}
		const { data, error } = await supabase.from("issue_types").delete().eq("id", id).eq("space_id", found.space_id as string).select("id");
		if (error) return writeFailure(error);
		if (!data || data.length === 0) return notAllowed();
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/types/:id DELETE]", err);
		return bad("delete failed", 500);
	}
}
