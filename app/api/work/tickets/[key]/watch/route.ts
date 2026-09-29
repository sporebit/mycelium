import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";
import { bad, resolveWorkRef, watch } from "@/lib/work/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ key: string }> };

/** POST = start watching, DELETE = stop. Always the caller: nobody watches for someone else. */
export async function POST(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const found = await resolveWorkRef(supabase, key);
		if (!found) return bad("not found", 404);
		await watch(supabase, found, [uid]);
		return NextResponse.json({ watching: true });
	} catch (err) {
		console.error("[/api/work/tickets/:key/watch POST]", err);
		return bad("watch failed", 500);
	}
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
	const { key } = await ctx.params;
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const found = await resolveWorkRef(supabase, key);
		if (!found) return bad("not found", 404);
		const { error } = await supabase.from("ticket_watchers").delete().eq("ticket_id", found.id).eq("watcher_id", uid);
		if (error) return bad(error.message, 400);
		return NextResponse.json({ watching: false });
	} catch (err) {
		console.error("[/api/work/tickets/:key/watch DELETE]", err);
		return bad("unwatch failed", 500);
	}
}
