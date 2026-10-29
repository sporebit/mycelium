import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { DETAIL_SELECT, fetchDetail, toDetail, toRecipeRow, type GoustoRow } from "@/lib/health/gousto";

export const runtime = "nodejs";
// Gousto answers 502 to Vercel's default US region; London is where its site is served from.
export const preferredRegion = "lhr1";

type Ctx = { params: Promise<{ slug: string }> };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,200}$/i;

/**
 * POST /api/health/gousto/[slug]/save (0151) — copy a Gousto recipe into
 * the app's own `recipes` table (ingredients by pack, steps as text, tags
 * from Gousto's categories) so the meal planner and shopping lists can use
 * it. Idempotent: a recipe already saved answers with the existing copy.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
	const { slug } = await ctx.params;
	if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
	try {
		const supabase = await createUserClient();
		const { data, error } = await supabase.from("gousto_recipes").select(DETAIL_SELECT).eq("slug", slug).maybeSingle();
		if (error) throw error;
		if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
		const row = data as unknown as GoustoRow;

		if (row.saved_recipe_id) {
			const { data: existing } = await supabase.from("recipes").select("id").eq("id", row.saved_recipe_id).maybeSingle();
			if (existing) return NextResponse.json({ ok: true, recipe_id: row.saved_recipe_id, already: true });
			// the copy was deleted: fall through and make a new one
		}

		let detail = row.detail;
		if (!detail) {
			const entry = await fetchDetail(slug);
			if (!entry) return NextResponse.json({ error: "Gousto did not answer for this recipe." }, { status: 502 });
			detail = toDetail(entry);
			await supabase.from("gousto_recipes").update({ detail, detail_fetched_at: new Date().toISOString() }).eq("id", row.id);
		}

		const { data: made, error: insErr } = await supabase.from("recipes").insert(toRecipeRow(row, detail)).select("id").single();
		if (insErr || !made) throw insErr ?? new Error("insert failed");
		const recipeId = made.id as string;
		const { error: linkErr } = await supabase.from("gousto_recipes").update({ saved_recipe_id: recipeId, updated_at: new Date().toISOString() }).eq("id", row.id);
		if (linkErr) console.error("[/api/health/gousto/:slug/save] link failed:", linkErr.message);
		return NextResponse.json({ ok: true, recipe_id: recipeId, already: false }, { status: 201 });
	} catch (err) {
		console.error("[/api/health/gousto/:slug/save]", err);
		return NextResponse.json({ error: "save failed" }, { status: 500 });
	}
}
