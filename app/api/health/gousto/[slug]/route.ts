import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { DETAIL_SELECT, type GoustoRow } from "@/lib/health/gousto";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/i;

/**
 * /api/health/gousto/[slug] (0151) — one Gousto recipe.
 *
 * GET    the row with its cached detail, or `detail: null` with
 *        `needs_detail: true` when the PC sync has not fetched it yet
 *        (the server cannot reach Gousto; see lib/health/gousto.ts).
 * PATCH  `{is_favourite}` — the heart.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
	try {
		const supabase = await createUserClient();
		const { data, error } = await supabase.from("gousto_recipes").select(DETAIL_SELECT).eq("slug", slug).maybeSingle();
		if (error) throw error;
		if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
		const row = data as unknown as GoustoRow;
		return NextResponse.json({ recipe: row, needs_detail: !row.detail });
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
