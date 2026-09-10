import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { getNutritionTargets } from "@/lib/nutrition/targets";

export const runtime = "nodejs";

/**
 * Daily macro targets in force on a date. Accepts ?date=YYYY-MM-DD so the
 * nutrition page can show the targets that applied to the day being viewed
 * rather than today's — otherwise scrolling back through history would
 * measure old days against current targets.
 */
export async function GET(req: NextRequest) {
	const dateParam = req.nextUrl.searchParams.get("date");
	const onDate =
		dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

	try {
		const supabase = await createUserClient();
		const targets = await getNutritionTargets(supabase, onDate);
		return NextResponse.json({ targets });
	} catch (err) {
		console.error("[/api/nutrition/targets GET]", err);
		return NextResponse.json({ error: "fetch failed" }, { status: 500 });
	}
}
