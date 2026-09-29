/**
 * Work — per-user notification settings (claude/spec-work.md §6, W8).
 * Stored in user_settings.notification_prefs (0145). Isomorphic.
 *
 * A grid: event × channel. Anything the user has not set falls back to the
 * default for their kind of account — Telegram for the instance owner
 * (the bot only knows that chat), email for everyone else.
 */
import type { NotificationEvent } from "./types";

export const EVENTS: readonly NotificationEvent[] = ["mention", "assignment", "status_change", "comment"];
export const CHANNELS = ["in_app", "telegram", "email", "push"] as const;
export type Channel = (typeof CHANNELS)[number];

export const EVENT_LABEL: Record<NotificationEvent, string> = {
	mention: "Someone mentions me",
	assignment: "A ticket is assigned to me",
	status_change: "A ticket I watch or own changes status",
	comment: "Someone comments on a ticket I watch",
};
export const CHANNEL_LABEL: Record<Channel, string> = {
	in_app: "In the app",
	telegram: "Telegram",
	email: "Email",
	push: "Push",
};

export type NotificationPrefs = {
	grid: Record<NotificationEvent, Record<Channel, boolean>>;
	/** No Telegram, email or push between these London times ("22:00"–"07:00"); null = never quiet. */
	quiet: { from: string; to: string } | null;
};

export function defaultPrefs(isOwner: boolean): NotificationPrefs {
	const row = (): Record<Channel, boolean> => ({ in_app: true, telegram: isOwner, email: !isOwner, push: true });
	return {
		grid: { mention: row(), assignment: row(), status_change: { ...row(), email: false, telegram: false }, comment: row() },
		quiet: null,
	};
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Stored settings over the defaults. Unknown keys and malformed values are dropped. */
export function mergePrefs(stored: unknown, isOwner: boolean): NotificationPrefs {
	const out = defaultPrefs(isOwner);
	if (!stored || typeof stored !== "object") return out;
	const s = stored as { grid?: unknown; quiet?: unknown };
	if (s.grid && typeof s.grid === "object") {
		for (const e of EVENTS) {
			const r = (s.grid as Record<string, unknown>)[e];
			if (!r || typeof r !== "object") continue;
			for (const c of CHANNELS) {
				const v = (r as Record<string, unknown>)[c];
				if (typeof v === "boolean") out.grid[e][c] = v;
			}
		}
	}
	if (s.quiet && typeof s.quiet === "object") {
		const q = s.quiet as { from?: unknown; to?: unknown };
		if (typeof q.from === "string" && typeof q.to === "string" && TIME_RE.test(q.from) && TIME_RE.test(q.to) && q.from !== q.to) {
			out.quiet = { from: q.from, to: q.to };
		}
	}
	return out;
}

/** Is `minutes` (since London midnight) inside the quiet window? The window may cross midnight. */
export function isQuiet(prefs: NotificationPrefs, minutes: number): boolean {
	if (!prefs.quiet) return false;
	const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
	const from = m(prefs.quiet.from);
	const to = m(prefs.quiet.to);
	return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}
