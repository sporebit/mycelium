/**
 * Work — delivering a notification (claude/spec-work.md §6, W8).
 *
 * The notification row is written by the actor (lib/work/notify.ts). This
 * delivers it to the RECIPIENT's channels: it acts as the recipient through
 * withUser(), so their settings, their push subscriptions and the row's
 * `delivered` stamp are all read and written under their own RLS. The
 * service client is used for one thing only: the recipient's email address,
 * which lives in auth.users.
 *
 * Runs in after(): a failing channel is logged and never fails the request.
 */
import { londonNow } from "@/lib/tickets/categories";
import { sendToPhil } from "@/lib/tickets/notify";
import { sendToUser } from "@/lib/push";
import { isQuiet, mergePrefs, type Channel } from "@/lib/work/notifyPrefs";
import type { NotificationEvent } from "@/lib/work/types";
import { sendEmail } from "./email";
import { createServiceClient } from "./serviceClient";
import { withUser } from "./withUser";

export type Outgoing = {
	id: string;
	recipient_id: string;
	event: NotificationEvent;
	title: string;
	body: string | null;
	url: string | null;
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

async function emailOf(userId: string): Promise<string | null> {
	try {
		const { data } = await createServiceClient().auth.admin.getUserById(userId);
		return data.user?.email ?? null;
	} catch (err) {
		console.error("[notify] email lookup failed:", err);
		return null;
	}
}

async function deliverOne(n: Outgoing): Promise<void> {
	await withUser(n.recipient_id, async (db) => {
		const [{ data: settings }, { data: profile }] = await Promise.all([
			db.from("user_settings").select("notification_prefs").limit(1).maybeSingle(),
			db.from("profiles").select("is_instance_owner").eq("id", n.recipient_id).maybeSingle(),
		]);
		const isOwner = profile?.is_instance_owner === true;
		const prefs = mergePrefs(settings?.notification_prefs, isOwner);
		const want = prefs.grid[n.event];
		const quiet = isQuiet(prefs, londonNow().minutes);
		const delivered: Partial<Record<Channel, string>> = {};
		const stamp = () => new Date().toISOString();
		if (want.in_app) delivered.in_app = stamp();

		if (!quiet) {
			if (want.telegram && isOwner) {
				const text = [`<b>${escapeHtml(n.title)}</b>`, n.body ? escapeHtml(n.body.slice(0, 600)) : null, n.url ? `<a href="${escapeHtml(n.url)}">Open</a>` : null]
					.filter(Boolean)
					.join("\n");
				if (await sendToPhil(text, undefined, "HTML")) delivered.telegram = stamp();
			}
			if (want.email) {
				const to = await emailOf(n.recipient_id);
				if (to) {
					const res = await sendEmail({
						to,
						subject: n.title.slice(0, 200),
						text: [n.body ?? "", n.url ?? ""].filter(Boolean).join("\n\n"),
						html: `<p>${escapeHtml(n.body ?? n.title)}</p>${n.url ? `<p><a href="${escapeHtml(n.url)}">Open in Mycelium</a></p>` : ""}`,
					});
					if (res.delivered) delivered.email = stamp();
				}
			}
			if (want.push) {
				const res = await sendToUser(db, { title: n.title, body: n.body ?? "", url: n.url ?? undefined });
				if (res.sent > 0) delivered.push = stamp();
			}
		}

		const { error } = await db.from("notifications").update({ delivered }).eq("id", n.id).eq("recipient_id", n.recipient_id);
		if (error) console.error("[notify] delivered stamp failed:", error.message);
	});
}

export async function deliverNotifications(list: Outgoing[]): Promise<void> {
	for (const n of list) {
		try {
			await deliverOne(n);
		} catch (err) {
			console.error(`[notify] delivery failed for ${n.id}:`, err);
		}
	}
}
