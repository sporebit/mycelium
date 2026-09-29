import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkLabel, checkNewLabelField, LABEL_FIELD_SELECT, LABEL_SELECT, loadLabelFields, notAllowed, spaceOf, writeFailure } from "@/lib/work/config";
import { bad } from "@/lib/work/server";
import type { WorkLabel, WorkLabelField } from "@/lib/work/types";

export const runtime = "nodejs";

type LabelRow = { id: string; field_id: string; name: string; slug: string; colour: string | null; archived_at: string | null };

/**
 * /api/work/labels (claude/spec-work.md §2.4, §4)
 *
 * GET   a space's label fields with their labels. `?space=<uuid>`;
 *       `?field=<slug>` narrows to one field; `?q=` keeps the labels whose
 *       name contains it; `?all=1` includes archived labels.
 * POST  `{field, name, colour?}` creates a label in the field with that
 *       slug — or returns the one already there (200, not 201).
 *       `{new_field: {name, slug?}}` creates a label field.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const space = await spaceOf(supabase, uid, sp.get("space"));
		if (!space) return bad("No such space.", 404);
		const fields = await loadLabelFields(supabase, space.id, { field: sp.get("field"), q: sp.get("q"), all: sp.get("all") === "1" });
		if (sp.get("field") && fields.length === 0) return bad(`No label field "${sp.get("field")}".`, 404);
		return NextResponse.json({ fields });
	} catch (err) {
		console.error("[/api/work/labels GET]", err);
		return bad("fetch failed", 500);
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
		const wanted = req.nextUrl.searchParams.get("space") ?? (typeof body.space === "string" ? body.space : null);
		const space = await spaceOf(supabase, uid, wanted);
		if (!space) return bad("No such space.", 404);

		if ("new_field" in body) {
			const checked = checkNewLabelField(body.new_field);
			if (!checked.ok) return bad(checked.error);
			const existing = await loadLabelFields(supabase, space.id, { all: true });
			if (existing.some((f) => f.slug === checked.value.slug)) return bad(`There is already a label field with the slug "${checked.value.slug}".`, 409);
			const { data, error } = await supabase
				.from("label_fields")
				.insert({
					space_id: space.id,
					name: checked.value.name,
					slug: checked.value.slug,
					is_system: false,
					sort_order: existing.reduce((m, f) => Math.max(m, f.sort_order), 0) + 1,
				})
				.select(LABEL_FIELD_SELECT)
				.single();
			if (error || !data) return writeFailure(error, `There is already a label field with the slug "${checked.value.slug}".`);
			const field: WorkLabelField = { ...(data as unknown as Omit<WorkLabelField, "labels">), labels: [] };
			return NextResponse.json({ field }, { status: 201 });
		}

		const slug = typeof body.field === "string" ? body.field.trim().toLowerCase() : "";
		if (!slug) return bad("field is the slug of a label field (labels, location, tool…).");
		const { data: fieldRow, error: fieldErr } = await supabase.from("label_fields").select("id, slug").eq("space_id", space.id).eq("slug", slug).maybeSingle();
		if (fieldErr) throw fieldErr;
		if (!fieldRow) return bad(`No label field "${slug}".`, 404);
		const fieldId = fieldRow.id as string;

		const checked = checkLabel(body, { partial: false });
		if (!checked.ok) return bad(checked.error);
		const columns = checked.value;
		const serialise = (l: LabelRow): WorkLabel & { archived_at: string | null } => ({
			id: l.id,
			name: l.name,
			slug: l.slug,
			colour: l.colour,
			field: slug,
			archived_at: l.archived_at,
		});

		const existing = async (): Promise<LabelRow | null> => {
			const { data, error } = await supabase.from("labels").select(LABEL_SELECT).eq("field_id", fieldId).eq("slug", columns.slug as string).maybeSingle();
			if (error) throw error;
			return (data as unknown as LabelRow | null) ?? null;
		};

		let found = await existing();
		if (!found) {
			const { data, error } = await supabase
				.from("labels")
				.insert({ space_id: space.id, field_id: fieldId, name: columns.name, slug: columns.slug, colour: columns.colour ?? null })
				.select(LABEL_SELECT)
				.single();
			if (!error && data) return NextResponse.json({ label: serialise(data as unknown as LabelRow), created: true }, { status: 201 });
			// someone made it between the read and the write
			if (error?.code !== "23505") return writeFailure(error);
			found = await existing();
			if (!found) return writeFailure(error);
		}

		// asking for an archived label again brings it back
		if (found.archived_at) {
			const { data, error } = await supabase
				.from("labels")
				.update({ archived_at: null, updated_at: new Date().toISOString() })
				.eq("id", found.id)
				.eq("field_id", fieldId)
				.select(LABEL_SELECT);
			if (error) return writeFailure(error);
			if (!data || data.length === 0) return notAllowed();
			found = data[0] as unknown as LabelRow;
		}
		return NextResponse.json({ label: serialise(found), created: false });
	} catch (err) {
		console.error("[/api/work/labels POST]", err);
		return bad("create failed", 500);
	}
}
