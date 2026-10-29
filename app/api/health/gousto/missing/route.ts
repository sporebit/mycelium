import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * GET /api/health/gousto/missing?limit= (0151) — slugs whose detail the PC
 * script has not fetched yet (or, with `stale_days=`, fetched longer ago
 * than that), favourites and saved copies first, then the most rated.
 * Answers `{slugs, remaining}`.
 */
export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const limit = Math.min(Math.max(Math.floor(Number(sp.get("limit") ?? 500)) || 500, 1), 2000);
	const staleDays = Math.max(Math.floor(Number(sp.get("stale_days") ?? 0)) || 0, 0);
	try {
		const supabase = await createUserClient();
		const cutoff = staleDays > 0 ? new Date(Date.now() - staleDays * 86400_000).toISOString() : null;
		const filter = cutoff ? `detail_fetched_at.is.null,detail_fetched_at.lt.${cutoff}` : "detail_fetched_at.is.null";
		const [page, count] = await Promise.all([
			supabase
				.from("gousto_recipes")
				.select("slug")
				.or(filter)
				.order("is_favourite", { ascending: false })
				.order("saved_recipe_id", { ascending: false, nullsFirst: false })
				.order("rating_count", { ascending: false, nullsFirst: false })
				.order("slug")
				.limit(limit),
			supabase.from("gousto_recipes").select("id", { count: "exact", head: true }).or(filter),
		]);
		if (page.error) throw page.error;
		return NextResponse.json({ slugs: ((page.data ?? []) as Array<{ slug: string }>).map((r) => r.slug), remaining: count.count ?? 0 });
	} catch (err) {
		console.error("[/api/health/gousto/missing]", err);
		return NextResponse.json({ error: "fetch failed" }, { status: 500 });
	}
}
