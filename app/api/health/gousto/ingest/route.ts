import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { summariseEntry, type GoustoListingEntry } from "@/lib/health/gousto";

export const runtime = "nodejs";

const MAX_ENTRIES = 1000;

/**
 * POST /api/health/gousto/ingest `{entries: <raw Gousto listing entries>}`
 * (0151) — the PC script posts each listing page it fetched; the server
 * shapes the rows (never trusting the payload beyond the fields it reads)
 * and upserts them. Only listing columns are written, so a favourite or a
 * cached detail is never touched. Answers `{upserted, total}` where total
 * is the index size after the write.
 */
export async function POST(req: NextRequest) {
	const body = (await req.json().catch(() => null)) as { entries?: unknown } | null;
	const entries = Array.isArray(body?.entries) ? (body!.entries as unknown[]) : null;
	if (!entries) return NextResponse.json({ error: "entries is a list of Gousto listing entries." }, { status: 400 });
	if (entries.length > MAX_ENTRIES) return NextResponse.json({ error: `At most ${MAX_ENTRIES} entries per call.` }, { status: 400 });
	try {
		const supabase = await createUserClient();
		const rows = entries
			.filter((e): e is GoustoListingEntry => !!e && typeof e === "object" && typeof (e as GoustoListingEntry).gousto_uid === "string" && typeof (e as GoustoListingEntry).url === "string" && typeof (e as GoustoListingEntry).title === "string")
			.map((e) => summariseEntry(e));
		// a listing can carry a recipe twice (two category urls); one per uid
		const unique = [...new Map(rows.map((r) => [r.gousto_uid, r])).values()].filter((r) => r.slug);
		for (let i = 0; i < unique.length; i += 500) {
			const { error } = await supabase.from("gousto_recipes").upsert(unique.slice(i, i + 500), { onConflict: "space_id,gousto_uid" });
			if (error) throw error;
		}
		const { count } = await supabase.from("gousto_recipes").select("id", { count: "exact", head: true });
		return NextResponse.json({ ok: true, upserted: unique.length, total: count ?? 0 });
	} catch (err) {
		console.error("[/api/health/gousto/ingest]", err);
		return NextResponse.json({ error: "ingest failed" }, { status: 500 });
	}
}
