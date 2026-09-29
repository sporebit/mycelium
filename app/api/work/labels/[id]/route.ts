import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkLabel, checkLabelFieldPatch, LABEL_FIELD_SELECT, LABEL_SELECT, notAllowed, writeFailure } from "@/lib/work/config";
import { bad, UUID_RE } from "@/lib/work/server";
import type { WorkLabel, WorkLabelField } from "@/lib/work/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type LabelRow = {
	id: string;
	field_id: string;
	name: string;
	slug: string;
	colour: string | null;
	archived_at: string | null;
	field: { slug: string } | Array<{ slug: string }> | null;
};

function fieldSlug(l: LabelRow): string {
	const f = Array.isArray(l.field) ? l.field[0] : l.field;
	return f?.slug ?? "labels";
}

function serialise(l: LabelRow): WorkLabel & { archived_at: string | null } {
	return { id: l.id, name: l.name, slug: l.slug, colour: l.colour, field: fieldSlug(l), archived_at: l.archived_at };
}

const SELECT = `${LABEL_SELECT}, field:label_fields(slug)`;

/**
 * /api/work/labels/[id] — a label, or with `?kind=field` a label field.
 *
 * PATCH   a label: `{name?, colour?, archived?}`; a new name brings a new
 *         slug, refused (409) when another label of the field has it.
 *         A field: `{name?, sort_order?}` — its slug is a JQL field name
 *         and stays.
 * DELETE  a label, with its place on every ticket. A field, with its
 *         labels — never a system field (Labels, Location, Tool).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const isField = req.nextUrl.searchParams.get("kind") === "field";
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;

		if (isField) {
			const { data: found, error: readErr } = await supabase.from("label_fields").select("id, space_id").eq("id", id).maybeSingle();
			if (readErr) throw readErr;
			if (!found) return bad("not found", 404);
			const checked = checkLabelFieldPatch(body);
			if (!checked.ok) return bad(checked.error);
			if (Object.keys(checked.value).length === 0) return bad("Nothing to change. A label field's name and sort_order can be changed.");
			const { data, error } = await supabase
				.from("label_fields")
				.update({ ...checked.value, updated_at: new Date().toISOString() })
				.eq("id", id)
				.eq("space_id", found.space_id as string)
				.select(LABEL_FIELD_SELECT);
			if (error) return writeFailure(error);
			if (!data || data.length === 0) return notAllowed();
			return NextResponse.json({ field: data[0] as unknown as Omit<WorkLabelField, "labels"> });
		}

		const { data: found, error: readErr } = await supabase.from("labels").select(SELECT).eq("id", id).maybeSingle();
		if (readErr) throw readErr;
		if (!found) return bad("not found", 404);
		const current = found as unknown as LabelRow;

		const checked = checkLabel(body, { partial: true });
		if (!checked.ok) return bad(checked.error);
		const columns = checked.value;
		// archiving twice keeps the first date
		if (columns.archived_at && current.archived_at) delete columns.archived_at;
		if (Object.keys(columns).length === 0) {
			if ("archived" in body) return NextResponse.json({ label: serialise(current) });
			return bad("Nothing to change.");
		}

		if (columns.slug && columns.slug !== current.slug) {
			const { data: clash, error: clashErr } = await supabase
				.from("labels")
				.select("id, name")
				.eq("field_id", current.field_id)
				.eq("slug", columns.slug)
				.neq("id", id)
				.limit(1);
			if (clashErr) throw clashErr;
			if (clash && clash.length > 0) return bad(`This field already has a label called "${clash[0].name as string}".`, 409, { label_id: clash[0].id });
		}

		const { data, error } = await supabase
			.from("labels")
			.update({ ...columns, updated_at: new Date().toISOString() })
			.eq("id", id)
			.eq("field_id", current.field_id)
			.select(SELECT);
		if (error) return writeFailure(error, "This field already has a label of that name.");
		if (!data || data.length === 0) return notAllowed();
		return NextResponse.json({ label: serialise(data[0] as unknown as LabelRow) });
	} catch (err) {
		console.error("[/api/work/labels/:id PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const isField = req.nextUrl.searchParams.get("kind") === "field";
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;

		if (isField) {
			const { data: found, error: readErr } = await supabase.from("label_fields").select("id, name, is_system, space_id").eq("id", id).maybeSingle();
			if (readErr) throw readErr;
			if (!found) return bad("not found", 404);
			if (found.is_system) return bad(`${found.name as string} is a system field and cannot be deleted.`, 409);
			const { data, error } = await supabase.from("label_fields").delete().eq("id", id).eq("space_id", found.space_id as string).select("id");
			if (error) return writeFailure(error);
			if (!data || data.length === 0) return notAllowed();
			return NextResponse.json({ ok: true });
		}

		const { data: found, error: readErr } = await supabase.from("labels").select("id, field_id").eq("id", id).maybeSingle();
		if (readErr) throw readErr;
		if (!found) return bad("not found", 404);
		// its ticket_labels rows go with it (cascade)
		const { data, error } = await supabase.from("labels").delete().eq("id", id).eq("field_id", found.field_id as string).select("id");
		if (error) return writeFailure(error);
		if (!data || data.length === 0) return notAllowed();
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/labels/:id DELETE]", err);
		return bad("delete failed", 500);
	}
}
