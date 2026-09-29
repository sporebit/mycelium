import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { updateUserSettings } from "@/lib/settings/userSettingsRow";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { CHANNELS, EVENTS, mergePrefs, type Channel, type NotificationPrefs } from "@/lib/work/notifyPrefs";
import { bad } from "@/lib/work/server";
import type { NotificationEvent } from "@/lib/work/types";

export const runtime = "nodejs";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Settings = {
	prefs: NotificationPrefs;
	is_owner: boolean;
	channels_available: { telegram: boolean; email: boolean; push: boolean };
	push_subscriptions: number;
	vapid_public_key: string | null;
};

async function stored(supabase: SupabaseClient, uid: string): Promise<{ prefs: unknown; isOwner: boolean }> {
	const [{ data: settings, error }, { data: profile }] = await Promise.all([
		supabase.from("user_settings").select("notification_prefs").limit(1).maybeSingle(),
		supabase.from("profiles").select("is_instance_owner").eq("id", uid).maybeSingle(),
	]);
	if (error) throw error;
	return { prefs: settings?.notification_prefs ?? null, isOwner: profile?.is_instance_owner === true };
}

/**
 * What the settings page shows. The environment is only ever reported as
 * "is it set": the one value that leaves is the VAPID public key, which a
 * browser needs in order to subscribe and is public by design.
 */
async function answer(supabase: SupabaseClient, prefs: NotificationPrefs, isOwner: boolean): Promise<Settings> {
	const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
	const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
	return {
		prefs,
		is_owner: isOwner,
		channels_available: {
			telegram: isOwner && !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_USER_ID,
			email: !!process.env.RESEND_API_KEY,
			push: !!vapidPublic && !!process.env.VAPID_PRIVATE_KEY,
		},
		push_subscriptions: count ?? 0,
		vapid_public_key: vapidPublic,
	};
}

/**
 * /api/work/notifications/settings (claude/spec-work.md §6)
 *
 * GET    the caller's settings over the defaults for their kind of
 *        account, the channels this instance can deliver on, and how many
 *        push subscriptions they have. Subscribing is POST
 *        /api/push/subscribe, as before.
 * PATCH  `{grid?, quiet?}` — `grid` is event × channel, and only the cells
 *        sent are changed; `quiet` is `{from, to}` ("22:00") or null.
 */
export async function GET() {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	try {
		const supabase = await createUserClient();
		const { prefs, isOwner } = await stored(supabase, uid);
		return NextResponse.json(await answer(supabase, mergePrefs(prefs, isOwner), isOwner));
	} catch (err) {
		console.error("[/api/work/notifications/settings GET]", err);
		return bad("fetch failed", 500);
	}
}

export async function PATCH(req: NextRequest) {
	const uid = await principalUid();
	if (!uid) return bad("Unauthorized", 401);
	const body = await readJson(req);
	if (!body) return bad("bad json");
	if (!("grid" in body) && !("quiet" in body)) return bad("Nothing to change: send grid, quiet or both.");

	const cells: Array<[NotificationEvent, Channel, boolean]> = [];
	if ("grid" in body) {
		if (!body.grid || typeof body.grid !== "object" || Array.isArray(body.grid)) return bad("grid is an object of events.");
		for (const [event, row] of Object.entries(body.grid as Record<string, unknown>)) {
			if (!(EVENTS as readonly string[]).includes(event)) return bad(`Unknown event "${event}". Events are ${EVENTS.join(", ")}.`);
			if (!row || typeof row !== "object" || Array.isArray(row)) return bad(`${event} is an object of channels.`);
			for (const [channel, on] of Object.entries(row as Record<string, unknown>)) {
				if (!(CHANNELS as readonly string[]).includes(channel)) return bad(`Unknown channel "${channel}". Channels are ${CHANNELS.join(", ")}.`);
				if (typeof on !== "boolean") return bad(`${event}.${channel} is true or false.`);
				cells.push([event as NotificationEvent, channel as Channel, on]);
			}
		}
	}
	let quiet: { from: string; to: string } | null | undefined;
	if ("quiet" in body) {
		if (body.quiet === null) {
			quiet = null;
		} else {
			const q = body.quiet as { from?: unknown; to?: unknown };
			if (!q || typeof q !== "object" || typeof q.from !== "string" || typeof q.to !== "string" || !TIME_RE.test(q.from) || !TIME_RE.test(q.to)) {
				return bad("quiet is two times, as in 22:00 and 07:00, or null.");
			}
			if (q.from === q.to) return bad("Quiet hours need a start and an end that differ.");
			quiet = { from: q.from, to: q.to };
		}
	}

	try {
		const supabase = await createUserClient();
		const { prefs: before, isOwner } = await stored(supabase, uid);
		const next = mergePrefs(before, isOwner);
		for (const [event, channel, on] of cells) next.grid[event][channel] = on;
		if (quiet !== undefined) next.quiet = quiet;
		// through mergePrefs once more: what is stored is exactly what will be read back
		const clean = mergePrefs(next, isOwner);
		const { error } = await updateUserSettings(supabase, { notification_prefs: clean }, { select: "id" });
		if (error) return bad(error.message, 400);
		return NextResponse.json(await answer(supabase, clean, isOwner));
	} catch (err) {
		console.error("[/api/work/notifications/settings PATCH]", err);
		return bad("update failed", 500);
	}
}
