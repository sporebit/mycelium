import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getNutritionTargets } from "@/lib/nutrition/targets";

export const runtime = "nodejs";

function userId(): string | null {
	return process.env.USER_ID ?? null;
}

/**
 * Daily macro targets in force on a date. Accepts ?date=YYYY-MM-DD so the
 * nutrition page can show the targets that applied to the day being viewed
 * rather than today's — otherwise scrolling back through history would
 * measure old days against current targets.
 */
export async function GET(req: NextRequest) {
	const uid = userId();
	if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

	const dateParam = req.nextUrl.searchParams.get("date");
	const onDate =
		dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

	try {
		const supabase = createServerClient();
		const targets = await getNutritionTargets(supabase, uid, onDate);
		return NextResponse.json({ targets });
	} catch (err) {
		console.error("[/api/nutrition/targets GET]", err);
		return NextResponse.json({ error: "fetch failed" }, { status: 500 });
	}
}
