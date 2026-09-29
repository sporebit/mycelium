import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { checkDoc, diffLines, docToText } from "@/lib/work/doc";
import { docsErrorMessage, docsErrorStatus, loadDocPage, pageRow, syncPageLinks, TITLE_MAX, type DocVersion } from "@/lib/work/docs";
import { bad, namesFor, UUID_RE } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
type Row = { version: number; title: string; note: string | null; created_at: string; created_by: string | null; body?: unknown; body_text?: string };

const LIST = "version, title, note, created_at, created_by";
const FULL = `${LIST}, body, body_text`;

function numberOf(v: string | null): number | null {
	if (!v || !/^\d{1,9}$/.test(v)) return null;
	const n = Number(v);
	return n >= 1 ? n : null;
}

/**
 * /api/work/docs/pages/[id]/versions — a page's history.
 *
 * GET   the versions, newest first, without their bodies (`limit`, default
 *       200; `before=<version>` for the ones older than that).
 *       `?version=N` — that one version, with its body and text.
 *       `?diff=A..B` — the text of version A against version B, line by
 *       line: `{from, to, title_changed, lines}`.
 * POST  `{restore: N}` — writes version N's title and body back onto the
 *       page. That is a change like any other, so it makes a NEW version;
 *       nothing in the history is rewritten.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
	const { id } = await ctx.params;
	if (!UUID_RE.test(id)) return bad("not found", 404);
	const sp = req.nextUrl.searchParams;
	try {
		const supabase = await createUserClient();
		const page = await pageRow(supabase, id);
		if (!page) return bad("not found", 404);

		const person = (names: Map<string, string>, p: string | null) => (p ? { id: p, name: names.get(p) ?? p.slice(0, 8) } : null);
		const shape = (r: Row, names: Map<string, string>, full: boolean): DocVersion => ({
			version: r.version,
			title: r.title,
			note: r.note,
			created_at: r.created_at,
			author: person(names, r.created_by),
			...(full ? { body: r.body ?? null, body_text: r.body_text ?? "" } : {}),
		});

		if (sp.get("diff") !== null) {
			const m = /^(\d{1,9})\.\.(\d{1,9})$/.exec((sp.get("diff") ?? "").trim());
			if (!m) return bad("diff takes two version numbers, as in 3..5.");
			const from = Number(m[1]);
			const to = Number(m[2]);
			const { data, error } = await supabase.from("doc_page_versions").select("version, title, body_text").eq("page_id", id).in("version", [from, to]);
			if (error) throw error;
			const rows = (data ?? []) as Array<{ version: number; title: string; body_text: string }>;
			const a = rows.find((r) => r.version === from);
			const b = rows.find((r) => r.version === to);
			if (!a) return bad(`This page has no version ${from}.`, 404);
			if (!b) return bad(`This page has no version ${to}.`, 404);
			return NextResponse.json({
				from,
				to,
				from_title: a.title,
				to_title: b.title,
				title_changed: a.title !== b.title,
				lines: diffLines(a.body_text ?? "", b.body_text ?? ""),
			});
		}

		if (sp.get("version") !== null) {
			const n = numberOf(sp.get("version"));
			if (!n) return bad("version is a version number.");
			const { data, error } = await supabase.from("doc_page_versions").select(FULL).eq("page_id", id).eq("version", n).maybeSingle();
			if (error) throw error;
			if (!data) return bad(`This page has no version ${n}.`, 404);
			const row = data as Row;
			return NextResponse.json({ version: shape(row, await namesFor(supabase, [row.created_by]), true), current: page.version });
		}

		const limit = Math.min(Math.max(Number(sp.get("limit") ?? 200) || 200, 1), 1000);
		let q = supabase.from("doc_page_versions").select(LIST).eq("page_id", id);
		const before = numberOf(sp.get("before"));
		if (sp.get("before") !== null && !before) return bad("before is a version number.");
		if (before) q = q.lt("version", before);
		const { data, error } = await q.order("version", { ascending: false }).limit(limit);
		if (error) throw error;
		const rows = (data ?? []) as Row[];
		const names = await namesFor(supabase, rows.map((r) => r.created_by));
		return NextResponse.json({ versions: rows.map((r) => shape(r, names, false)), current: page.version });
	} catch (err) {
		console.error("[/api/work/docs/pages/:id/versions GET]", err);
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
	const n = typeof body.restore === "number" && Number.isInteger(body.restore) && body.restore >= 1 ? body.restore : null;
	if (!n) return bad("restore is the number of the version to bring back.");
	try {
		const supabase = await createUserClient();
		const limited = await ticketWriteGate(supabase, uid);
		if (limited) return limited;
		const page = await pageRow(supabase, id);
		if (!page) return bad("not found", 404);
		const { data: old, error: readErr } = await supabase.from("doc_page_versions").select("version, title, body").eq("page_id", id).eq("version", n).maybeSingle();
		if (readErr) throw readErr;
		if (!old) return bad(`This page has no version ${n}.`, 404);
		const version = old as { version: number; title: string; body: unknown };
		const problem = checkDoc(version.body);
		if (problem) return bad(`Version ${n} cannot be restored: ${problem}`, 409);

		const { data, error } = await supabase
			.from("doc_pages")
			.update({ title: version.title.slice(0, TITLE_MAX), body: version.body, body_text: docToText(version.body) })
			.eq("id", id)
			.select("id, version");
		if (error) return bad(docsErrorMessage(error), docsErrorStatus(error));
		if (!data || data.length === 0) return bad("You do not have permission to change this page.", 403);
		const now = (data[0] as { version: number }).version;
		const changed = now !== page.version;

		if (changed) {
			// say where the new version came from; the old ones are left as they were
			const { error: noteErr } = await supabase.from("doc_page_versions").update({ note: `Restored from version ${n}` }).eq("page_id", id).eq("version", now);
			if (noteErr) console.error("[/api/work/docs/pages/:id/versions POST] note failed:", noteErr.message);
			await syncPageLinks(supabase, { id, space_id: page.space_id }, version.body);
		}
		const fresh = await loadDocPage(supabase, uid, id);
		if (!fresh) return bad("not found", 404);
		return NextResponse.json({ page: fresh, restored: n, version: now, changed }, { status: changed ? 201 : 200 });
	} catch (err) {
		console.error("[/api/work/docs/pages/:id/versions POST]", err);
		return bad("restore failed", 500);
	}
}
