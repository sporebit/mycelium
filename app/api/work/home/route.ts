import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { getUiPrefs, workPrefs } from "@/lib/settings/uiPrefs";
import { principalUid } from "@/lib/tickets/server";
import { parseJql } from "@/lib/work/jql";
import { bad, namesFor, searchTickets, ticketsByIds } from "@/lib/work/server";
import type { WorkNotification, WorkTicket } from "@/lib/work/types";

export const runtime = "nodejs";

/**
 * GET /api/work/home — Your work (W12): assigned to me, in progress (mine
 * or nobody's), due soon, recently viewed, mentions. Recently viewed is a preference (ui_prefs.work.recent),
 * written by the issue page.
 */
export async function GET() {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const recentKeys = workPrefs(await getUiPrefs(supabase))
			.recent.filter((k): k is string => typeof k === "string" && /^[A-Z][A-Z0-9]{1,4}-\d+$/.test(k))
			.slice(0, 12);

		const [assigned, underway, due, mentions, recentRows] = await Promise.all([
			searchTickets(supabase, parseJql("assignee = me AND statusCategory != Done ORDER BY due ASC, updated DESC"), { limit: 30 }),
			// in a space of one nothing is assigned: what is under way is "mine" too
			searchTickets(supabase, parseJql('statusCategory = "In Progress" AND (assignee = me OR assignee IS EMPTY) ORDER BY updated DESC'), { limit: 30 }),
			searchTickets(supabase, parseJql("due <= +7d AND statusCategory != Done ORDER BY due ASC"), { limit: 30 }),
			supabase
				.from("notifications")
				.select("id, event, title, body, url, actor_id, read_at, created_at, ticket:tickets(ticket_key)")
				.eq("recipient_id", uid)
				.eq("event", "mention")
				.order("created_at", { ascending: false })
				.limit(15),
			recentKeys.length > 0 ? supabase.from("tickets").select("id, ticket_key").in("ticket_key", recentKeys).is("deleted_at", null) : Promise.resolve({ data: [] as unknown[] }),
		]);

		const idByKey = new Map((((recentRows as { data: unknown[] | null }).data ?? []) as Array<{ id: string; ticket_key: string }>).map((r) => [r.ticket_key, r.id]));
		const recentIds = recentKeys.map((k) => idByKey.get(k)).filter((x): x is string => !!x);
		const recent: WorkTicket[] = await ticketsByIds(supabase, recentIds);

		type N = { id: string; event: WorkNotification["event"]; title: string; body: string | null; url: string | null; actor_id: string | null; read_at: string | null; created_at: string; ticket: unknown };
		const rows = (mentions.data ?? []) as N[];
		const names = await namesFor(supabase, rows.map((r) => r.actor_id));
		const list: WorkNotification[] = rows.map((r) => {
			const t = (Array.isArray(r.ticket) ? r.ticket[0] : r.ticket) as { ticket_key: string | null } | null;
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

		return NextResponse.json({
			assigned: assigned.tickets,
			assigned_total: assigned.total,
			in_progress: underway.tickets,
			in_progress_total: underway.total,
			due_soon: due.tickets,
			due_total: due.total,
			recent,
			mentions: list,
		});
	} catch (err) {
		console.error("[/api/work/home GET]", err);
		return bad("fetch failed", 500);
	}
}
