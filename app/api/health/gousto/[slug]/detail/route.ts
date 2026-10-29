import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { largestImage, pickImage, toDetail, type GoustoDetailEntry } from "@/lib/health/gousto";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/i;

/**
 * PUT /api/health/gousto/[slug]/detail `{entry: <raw Gousto detail entry>}`
 * (0151) — the PC script hands over a recipe's detail payload; the server
 * keeps what the page needs (toDetail) and refreshes the listing-level
 * columns from it. `{entry: null}` records that Gousto no longer serves
 * the recipe (detail_fetched_at is stamped, the cached copy stays).
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
	const body = (await req.json().catch(() => null)) as { entry?: unknown } | null;
	if (!body || !("entry" in body)) return NextResponse.json({ error: "entry is a Gousto detail entry, or null." }, { status: 400 });
	const entry = body.entry as GoustoDetailEntry | null;
	if (entry !== null && (!entry || typeof entry !== "object")) return NextResponse.json({ error: "entry is a Gousto detail entry, or null." }, { status: 400 });
	try {
		const supabase = await createUserClient();
		const now = new Date().toISOString();
		let patch: Record<string, unknown>;
		if (entry === null) {
			patch = { detail_fetched_at: now, updated_at: now };
		} else {
			const detail = toDetail(entry);
			patch = {
				detail,
				detail_fetched_at: now,
				description: detail.description,
				categories: detail.categories,
				updated_at: now,
			};
			if (detail.cuisine) patch.cuisine = detail.cuisine;
			const image = pickImage(entry.media, 400);
			const large = largestImage(entry.media);
			if (image) patch.image_url = image;
			if (large) patch.image_large_url = large;
			if (typeof entry.rating?.average === "number") patch.rating_avg = Math.round(entry.rating.average * 100) / 100;
			if (typeof entry.rating?.count === "number") patch.rating_count = entry.rating.count;
			if (typeof entry.prep_times?.for_2 === "number") patch.prep_for_2 = entry.prep_times.for_2;
			if (typeof entry.prep_times?.for_4 === "number") patch.prep_for_4 = entry.prep_times.for_4;
		}
		const { data, error } = await supabase.from("gousto_recipes").update(patch).eq("slug", slug).select("id, slug, detail_fetched_at").maybeSingle();
		if (error) throw error;
		if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
		return NextResponse.json({ ok: true, recipe: data, has_detail: entry !== null });
	} catch (err) {
		console.error("[/api/health/gousto/:slug/detail PUT]", err);
		return NextResponse.json({ error: "update failed" }, { status: 500 });
	}
}
