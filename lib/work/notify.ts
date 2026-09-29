/**
 * Work — the notification writer (claude/spec-work.md §6, W8).
 *
 * One `notifications` row per recipient per event, written by the actor's
 * own client (the insert policy is the space's; only the recipient can read
 * the row back). Delivery to Telegram, email and push happens after the
 * response, as the recipient (lib/system/notifyDeliver.ts).
 *
 *   mention        the people @mentioned in a description, comment or page
 *   assignment     the new assignee
 *   status_change  the watchers and the assignee
 *   comment        the watchers
 * Never the actor. Someone mentioned in a comment gets the mention, not a
 * second row for the comment.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { APP_URL } from "@/lib/tickets/notify";
import { deliverNotifications, type Outgoing } from "@/lib/system/notifyDeliver";
import type { NotificationEvent } from "./types";

export function workUrl(key: string): string {
	return `${APP_URL}/work/browse/${encodeURIComponent(key)}`;
}
export function docUrl(spaceKey: string, pageId: string): string {
	return `${APP_URL}/docs/${encodeURIComponent(spaceKey)}/${pageId}`;
}

export type WorkEvent = {
	event: NotificationEvent;
	recipients: Array<string | null | undefined>;
	title: string;
	body?: string | null;
	url?: string | null;
	ticket_id?: string | null;
	doc_page_id?: string | null;
	comment_id?: string | null;
};

/** Who watches a ticket. */
export async function watchersOf(supabase: SupabaseClient, ticketId: string): Promise<string[]> {
	const { data } = await supabase.from("ticket_watchers").select("watcher_id").eq("ticket_id", ticketId);
	return ((data ?? []) as Array<{ watcher_id: string }>).map((r) => r.watcher_id);
}

/**
 * Write the rows and schedule their delivery. Soft-fails: a notification
 * that cannot be written never fails the write that caused it.
 */
export async function recordEvents(
	supabase: SupabaseClient,
	ctx: { actorId: string | null; spaceId: string },
	events: WorkEvent[],
): Promise<number> {
	const seen = new Set<string>();
	const rows: Array<Record<string, unknown>> = [];
	const out: Outgoing[] = [];
	// mentions first, so a mentioned watcher is not also told about the comment
	const ordered = [...events].sort((a, b) => Number(b.event === "mention") - Number(a.event === "mention"));
	for (const e of ordered) {
		const scope = e.comment_id ?? e.doc_page_id ?? e.ticket_id ?? "";
		for (const r of new Set(e.recipients)) {
			if (!r || r === ctx.actorId) continue;
			const once = e.event === "mention" || e.event === "comment" ? `say:${scope}:${r}` : `${e.event}:${scope}:${r}`;
			if (seen.has(once)) continue;
			seen.add(once);
			const id = crypto.randomUUID();
			const title = e.title.slice(0, 300);
			const body = e.body ? e.body.slice(0, 2000) : null;
			rows.push({
				id,
				space_id: ctx.spaceId,
				recipient_id: r,
				actor_id: ctx.actorId,
				event: e.event,
				ticket_id: e.ticket_id ?? null,
				doc_page_id: e.doc_page_id ?? null,
				comment_id: e.comment_id ?? null,
				title,
				body,
				url: e.url ?? null,
			});
			out.push({ id, recipient_id: r, event: e.event, title, body, url: e.url ?? null });
		}
	}
	if (rows.length === 0) return 0;
	try {
		// no .select(): the actor cannot read another person's notification
		const { error } = await supabase.from("notifications").insert(rows);
		if (error) {
			console.error("[work/notify] write failed:", error.message);
			return 0;
		}
		after(() => deliverNotifications(out));
		return rows.length;
	} catch (err) {
		console.error("[work/notify] write failed:", err);
		return 0;
	}
}
