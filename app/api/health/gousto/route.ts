import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { LISTING_SELECT, type GoustoRow } from "@/lib/health/gousto";

export const runtime = "nodejs";

/**
 * /api/health/gousto (0151) — the stored Gousto cookbook.
 *
 * GET  `q=` (title, trigram-indexed ilike), `favourites=1`, `cuisine=`,
 *      `sort=` popular (default: most ratings first) | rating | newest |
 *      title, `limit=` (60; 200 at most), `offset=`. Answers the page, the
 *      total for the filter, the whole index's size and last sync time,
 *      and the cuisines seen (for the filter chips).
 */
export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q = (sp.get("q") ?? "").trim();
	const favourites = sp.get("favourites") === "1";
	const cuisine = (sp.get("cuisine") ?? "").trim();
	const sort = sp.get("sort") ?? "popular";
	const limit = Math.min(Math.max(Math.floor(Number(sp.get("limit") ?? 60)) || 60, 1), 200);
	const offset = Math.max(Math.floor(Number(sp.get("offset") ?? 0)) || 0, 0);
	try {
		const supabase = await createUserClient();
		let list = supabase.from("gousto_recipes").select(LISTING_SELECT, { count: "exact" });
		if (q) list = list.ilike("title", `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`);
		if (favourites) list = list.eq("is_favourite", true);
		if (cuisine) list = list.eq("cuisine", cuisine);
		if (favourites && sort === "popular") list = list.order("favourited_at", { ascending: false, nullsFirst: false });
		else if (sort === "rating") list = list.order("rating_avg", { ascending: false, nullsFirst: false }).order("rating_count", { ascending: false, nullsFirst: false });
		else if (sort === "newest") list = list.order("first_seen_at", { ascending: false });
		else if (sort === "title") list = list.order("title");
		else list = list.order("rating_count", { ascending: false, nullsFirst: false });
		list = list.order("id").range(offset, offset + limit - 1);

		const [page, total, favCount, cuisines, latest] = await Promise.all([
			list,
			supabase.from("gousto_recipes").select("id", { count: "exact", head: true }),
			supabase.from("gousto_recipes").select("id", { count: "exact", head: true }).eq("is_favourite", true),
			supabase.from("gousto_recipes").select("cuisine").not("cuisine", "is", null).limit(20000),
			supabase.from("gousto_recipes").select("last_seen_at").order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
		]);
		if (page.error) throw page.error;
		const rows = (page.data ?? []) as unknown as GoustoRow[];
		auditListRead(req, rows, "health", "nutrition");

		const seen = new Map<string, number>();
		for (const r of (cuisines.data ?? []) as Array<{ cuisine: string | null }>) {
			if (r.cuisine) seen.set(r.cuisine, (seen.get(r.cuisine) ?? 0) + 1);
		}
		return NextResponse.json({
			recipes: rows,
			matched: page.count ?? rows.length,
			total: total.count ?? 0,
			favourites: favCount.count ?? 0,
			cuisines: [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
			last_synced_at: (latest.data as { last_seen_at?: string } | null)?.last_seen_at ?? null,
		});
	} catch (err) {
		console.error("[/api/health/gousto GET]", err);
		return NextResponse.json({ error: "fetch failed" }, { status: 500 });
	}
}
