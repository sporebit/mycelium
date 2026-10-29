import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { DETAIL_SELECT, DETAIL_TTL_MS, fetchDetail, largestImage, pickImage, toDetail, type GoustoRow } from "@/lib/health/gousto";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/i;

/**
 * /api/health/gousto/[slug] (0151) — one Gousto recipe.
 *
 * GET    the row with its detail. A detail that is missing, older than 30
 *        days, or asked for again with `?refresh=1` is fetched from Gousto
 *        and cached on the row; a recipe Gousto no longer serves keeps the
 *        cached copy and says `stale: true`.
 * PATCH  `{is_favourite}` — the heart.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
	const refresh = req.nextUrl.searchParams.get("refresh") === "1";
	try {
		const supabase = await createUserClient();
		const { data, error } = await supabase.from("gousto_recipes").select(DETAIL_SELECT).eq("slug", slug).maybeSingle();
		if (error) throw error;
		if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
		let row = data as unknown as GoustoRow;

		const fetchedAt = row.detail_fetched_at ? Date.parse(row.detail_fetched_at) : 0;
		const wanted = refresh || !row.detail || Date.now() - fetchedAt > DETAIL_TTL_MS;
		let stale = false;
		if (wanted) {
			try {
				const entry = await fetchDetail(slug);
				if (entry) {
					const detail = toDetail(entry);
					const patch = {
						detail,
						detail_fetched_at: new Date().toISOString(),
						description: detail.description,
						cuisine: detail.cuisine ?? row.cuisine,
						categories: detail.categories,
						image_url: pickImage(entry.media, 400) ?? row.image_url,
						image_large_url: largestImage(entry.media) ?? row.image_large_url,
						rating_avg: typeof entry.rating?.average === "number" ? Math.round(entry.rating.average * 100) / 100 : row.rating_avg,
						rating_count: typeof entry.rating?.count === "number" ? entry.rating.count : row.rating_count,
						prep_for_2: typeof entry.prep_times?.for_2 === "number" ? entry.prep_times.for_2 : row.prep_for_2,
						prep_for_4: typeof entry.prep_times?.for_4 === "number" ? entry.prep_times.for_4 : row.prep_for_4,
						updated_at: new Date().toISOString(),
					};
					const { data: after, error: upErr } = await supabase.from("gousto_recipes").update(patch).eq("id", row.id).select(DETAIL_SELECT).maybeSingle();
					if (upErr) throw upErr;
					if (after) row = after as unknown as GoustoRow;
				} else {
					stale = true;
				}
			} catch (err) {
				// Gousto down or changed: the cached copy, if any, still shows
				console.error("[/api/health/gousto/:slug] detail fetch failed:", err);
				stale = true;
			}
		}
		if (!row.detail) return NextResponse.json({ error: "Gousto did not answer for this recipe. Try again in a moment.", recipe: row, stale: true }, { status: 502 });
		return NextResponse.json({ recipe: row, stale });
	} catch (err) {
		console.error("[/api/health/gousto/:slug GET]", err);
		return NextResponse.json({ error: "fetch failed" }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
	const body = (await req.json().catch(() => null)) as { is_favourite?: unknown } | null;
	if (!body || typeof body.is_favourite !== "boolean") return NextResponse.json({ error: "is_favourite is true or false." }, { status: 400 });
	try {
		const supabase = await createUserClient();
		const { data, error } = await supabase
			.from("gousto_recipes")
			.update({ is_favourite: body.is_favourite, favourited_at: body.is_favourite ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
			.eq("slug", slug)
			.select("id, slug, is_favourite, favourited_at")
			.maybeSingle();
		if (error) throw error;
		if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
		return NextResponse.json({ ok: true, recipe: data });
	} catch (err) {
		console.error("[/api/health/gousto/:slug PATCH]", err);
		return NextResponse.json({ error: "update failed" }, { status: 500 });
	}
}
