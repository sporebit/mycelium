import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { fetchListingPage, GOUSTO_PAGE, summariseEntry } from "@/lib/health/gousto";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Listing pages fetched per call; the client loops on `next_offset`. */
const PAGES_PER_CALL = 8;

/**
 * POST /api/health/gousto/sync `{offset?}` (0151) — pull a slice of the
 * Gousto listing and upsert it. Only the listing columns are written, so
 * a favourite or a cached detail is never touched by a sync. Returns
 * `{next_offset, total, upserted, done}`; the page calls again with
 * `next_offset` until `done`. Resumable at any offset, idempotent.
 */
export async function POST(req: NextRequest) {
	let offset = 0;
	try {
		const body = (await req.json().catch(() => ({}))) as { offset?: unknown };
		if (typeof body.offset === "number" && Number.isFinite(body.offset) && body.offset >= 0) offset = Math.floor(body.offset);
	} catch {
		/* empty body is fine */
	}
	try {
		const supabase = await createUserClient();
		const started = Date.now();
		let total = 0;
		let upserted = 0;
		let done = false;
		for (let i = 0; i < PAGES_PER_CALL; i += 1) {
			// leave headroom inside the function budget: a slow page ends the call early
			if (Date.now() - started > 40_000) break;
			const page = await fetchListingPage(offset, GOUSTO_PAGE);
			total = page.count;
			const rows = page.entries.filter((e) => e && typeof e.gousto_uid === "string" && typeof e.url === "string").map((e) => summariseEntry(e));
			// one listing can carry a recipe twice (two category urls); keep one per uid
			const byUid = new Map(rows.map((r) => [r.gousto_uid, r]));
			const unique = [...byUid.values()];
			for (let j = 0; j < unique.length; j += 500) {
				const { error } = await supabase.from("gousto_recipes").upsert(unique.slice(j, j + 500), { onConflict: "space_id,gousto_uid" });
				if (error) throw error;
			}
			upserted += unique.length;
			offset += page.entries.length;
			if (page.entries.length < GOUSTO_PAGE || offset >= total) {
				done = true;
				break;
			}
		}
		return NextResponse.json({ ok: true, next_offset: offset, total, upserted, done });
	} catch (err) {
		console.error("[/api/health/gousto/sync]", err);
		const msg = err instanceof Error ? err.message : "sync failed";
		return NextResponse.json({ error: msg.startsWith("Gousto") ? msg : "sync failed", next_offset: offset }, { status: 502 });
	}
}
