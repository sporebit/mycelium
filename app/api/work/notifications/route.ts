import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { EVENTS, mergePrefs } from "@/lib/work/notifyPrefs";
import { bad, namesFor, UUID_RE } from "@/lib/work/server";
import type { NotificationEvent, WorkNotification } from "@/lib/work/types";

export const runtime = "nodejs";

type Row = {
	id: string;
	event: NotificationEvent;
	title: string;
	body: string | null;
	url: string | null;
	actor_id: string | null;
	read_at: string | null;
	created_at: string;
	ticket: { ticket_key: string | null } | Array<{ ticket_key: string | null }> | null;
};

/** The events the caller wants to see in the app. */
async function inAppEvents(supabase: SupabaseClient, uid: string): Promise<NotificationEvent[]> {
	const [{ data: settings }, { data: profile }] = await Promise.all([
		supabase.from("user_settings").select("notification_prefs").limit(1).maybeSingle(),
		supabase.from("profiles").select("is_instance_owner").eq("id", uid).maybeSingle(),
	]);
	const prefs = mergePrefs(settings?.notification_prefs ?? null, profile?.is_instance_owner === true);
	return EVENTS.filter((e) => prefs.grid[e].in_app);
}

/**
 * /api/work/notifications (claude/spec-work.md §6) — the caller's own.
 *
 * GET     newest first: `unread=1`, `limit` (50; 200 at most), `before=`
 *         (an ISO timestamp) for the next page. `unread` in the answer is
 *         the caller's whole unread count, not the page's. Events switched
 *         off for the in-app channel are left out of both.
 * PATCH   `{ids, read}` or `{all: true, read: true}` — mark read or unread.
 * DELETE  `?id=` — removes one.
 * Every read and write is filtered by recipient, as well as walled by RLS.
 */
export async function GET(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const sp = req.nextUrl.searchParams;
	const limit = Math.min(Math.max(Math.floor(Number(sp.get("limit") ?? 50)) || 50, 1), 200);
	const before = sp.get("before");
	if (before !== null && Number.isNaN(Date.parse(before))) return bad("before is a timestamp.");
	try {
		const supabase = await createUserClient();
		const events = await inAppEvents(supabase, uid);
		if (events.length === 0) return NextResponse.json({ notifications: [], unread: 0 });

		let q = supabase
			.from("notifications")
			.select("id, event, title, body, url, actor_id, read_at, created_at, ticket:tickets(ticket_key)")
			.eq("recipient_id", uid)
			.in("event", events);
		if (sp.get("unread") === "1") q = q.is("read_at", null);
		if (before !== null) q = q.lt("created_at", new Date(before).toISOString());
		const [list, count] = await Promise.all([
			q.order("created_at", { ascending: false }).order("id").limit(limit),
			supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", uid).in("event", events).is("read_at", null),
		]);
		if (list.error) throw list.error;
		if (count.error) throw count.error;

		const rows = (list.data ?? []) as unknown as Row[];
		const names = await namesFor(supabase, rows.map((r) => r.actor_id));
		const notifications: WorkNotification[] = rows.map((r) => {
			const t = Array.isArray(r.ticket) ? (r.ticket[0] ?? null) : r.ticket;
			return {
				id: r.id,
				event: r.event,
				title: r.title,
				body: r.body,
				url: r.url,
				ticket_key: t?.ticket_key ?? null,
				actor: r.actor_id ? { id: r.actor_id, name: names.get(r.actor_id) ?? r.actor_id.slice(0, 8) } : null,
				read_at: r.read_at,
				created_at: r.created_at,
			};
		});
		return NextResponse.json({ notifications, unread: count.count ?? 0 });
	} catch (err) {
		console.error("[/api/work/notifications GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	if (typeof body.read !== "boolean") return bad("read is true or false.");
	const stamp = body.read ? new Date().toISOString() : null;
	try {
		const supabase = await createUserClient();
		if (body.all === true) {
			if (!body.read) return bad("Everything can be marked read, not unread.");
			const { data, error } = await supabase.from("notifications").update({ read_at: stamp }).eq("recipient_id", uid).is("read_at", null).select("id");
			if (error) throw error;
			return NextResponse.json({ ok: true, changed: (data ?? []).length });
		}
		if (!Array.isArray(body.ids) || body.ids.length === 0) return bad("ids is a list of notification ids, or send all: true.");
		if (body.ids.length > 500) return bad("That is too many at once: 500 at most.");
		const ids = Array.from(new Set((body.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x))));
		if (ids.length !== new Set(body.ids as unknown[]).size) return bad("ids is a list of notification ids.");
		let changed = 0;
		for (let i = 0; i < ids.length; i += 100) {
			let q = supabase
				.from("notifications")
				.update({ read_at: stamp })
				.eq("recipient_id", uid)
				.in("id", ids.slice(i, i + 100));
			// keep the time something was first read
			q = body.read ? q.is("read_at", null) : q.not("read_at", "is", null);
			const { data, error } = await q.select("id");
			if (error) throw error;
			changed += (data ?? []).length;
		}
		return NextResponse.json({ ok: true, changed });
	} catch (err) {
		console.error("[/api/work/notifications PATCH]", err);
		return bad("update failed", 500);
	}
}

export async function DELETE(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const id = req.nextUrl.searchParams.get("id") ?? "";
	if (!UUID_RE.test(id)) return bad("id required");
	try {
		const supabase = await createUserClient();
		const { data, error } = await supabase.from("notifications").delete().eq("id", id).eq("recipient_id", uid).select("id");
		if (error) throw error;
		if (!data || data.length === 0) return bad("not found", 404);
		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("[/api/work/notifications DELETE]", err);
		return bad("delete failed", 500);
	}
}
