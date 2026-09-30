"use client";

/**
 * Settings → Notifications (claude/spec-work.md §6): a channel × event
 * grid, quiet hours, and the push subscribe button. Reads and writes
 * /api/work/notifications/settings; the subscription itself goes to
 * /api/push/subscribe as before.
 */
import { useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { workFetch, WorkError } from "@/lib/work/client";
import { CHANNEL_LABEL, CHANNELS, EVENT_LABEL, EVENTS, type Channel, type NotificationPrefs } from "@/lib/work/notifyPrefs";
import type { NotificationEvent } from "@/lib/work/types";
import { ErrorNote } from "./kit";

type Settings = {
	prefs: NotificationPrefs;
	is_owner: boolean;
	channels_available: { telegram: boolean; email: boolean; push: boolean };
	push_subscriptions: number;
	vapid_public_key: string | null;
};

const KEY = "/api/work/notifications/settings";

export function NotificationSettings() {
	const { data, error, mutate } = useApi<Settings>(KEY);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);

	async function patch(body: Record<string, unknown>) {
		setErr(null);
		try {
			const next = await workFetch<Settings>(KEY, "PATCH", body);
			await mutate(next, { revalidate: false });
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not save.");
		}
	}

	async function subscribe() {
		if (!data?.vapid_public_key || busy) return;
		setBusy(true);
		setNote(null);
		setErr(null);
		try {
			if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
				setErr("This browser cannot receive push notifications.");
				return;
			}
			const perm = await Notification.requestPermission();
			if (perm !== "granted") {
				setErr("Permission was not granted.");
				return;
			}
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: data.vapid_public_key });
			const json = sub.toJSON();
			const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
			if (!res.ok) {
				const j = (await res.json().catch(() => ({}))) as { error?: string };
				setErr(j.error ?? "Subscribing failed.");
				return;
			}
			setNote("This device now receives push notifications.");
			await mutate();
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Subscribing failed.");
		} finally {
			setBusy(false);
		}
	}

	if (error) return <ErrorNote>Could not load notification settings.</ErrorNote>;
	if (!data) return <p className="text-xs text-text-lo">Loading…</p>;
	const available = (c: Channel) => c === "in_app" || data.channels_available[c];

	return (
		<div className="flex flex-col gap-4">
			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="text-left text-[10px] uppercase tracking-[0.12em] text-text-lo">
							<th className="py-1 pr-3 font-medium">Event</th>
							{CHANNELS.map((c) => (
								<th key={c} className="py-1 pr-3 font-medium" title={available(c) ? undefined : "Not set up on this instance"}>
									{CHANNEL_LABEL[c]}
									{!available(c) && <span className="ml-1 normal-case tracking-normal text-text-ghost">off</span>}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{EVENTS.map((e: NotificationEvent) => (
							<tr key={e} className="border-t border-hairline">
								<td className="py-2 pr-3 text-text-mid">{EVENT_LABEL[e]}</td>
								{CHANNELS.map((c) => (
									<td key={c} className="py-2 pr-3">
										<input
											type="checkbox"
											aria-label={`${EVENT_LABEL[e]} by ${CHANNEL_LABEL[c]}`}
											checked={data.prefs.grid[e][c]}
											disabled={!available(c)}
											onChange={(ev) => void patch({ grid: { [e]: { [c]: ev.target.checked } } })}
											className="accent-[var(--glow)] disabled:opacity-40"
										/>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
				<span className="w-48 shrink-0 text-xs text-text-mid">Quiet hours (London)</span>
				<div className="flex items-center gap-2 text-xs text-text-mid">
					<input type="time" value={data.prefs.quiet?.from ?? ""} aria-label="Quiet from" onChange={(ev) => void patch({ quiet: ev.target.value ? { from: ev.target.value, to: data.prefs.quiet?.to ?? "07:00" } : null })} className="rounded-v2-sm border border-hairline bg-surface-0 px-2 py-1 text-text-hi" />
					<span>to</span>
					<input type="time" value={data.prefs.quiet?.to ?? ""} aria-label="Quiet until" onChange={(ev) => void patch({ quiet: ev.target.value ? { from: data.prefs.quiet?.from ?? "22:00", to: ev.target.value } : null })} className="rounded-v2-sm border border-hairline bg-surface-0 px-2 py-1 text-text-hi" />
					{data.prefs.quiet && (
						<button type="button" onClick={() => void patch({ quiet: null })} className="text-text-lo hover:text-text-hi">
							clear
						</button>
					)}
				</div>
			</div>
			<p className="text-[11px] text-text-lo">In the quiet window nothing goes to Telegram, email or push; the in-app list still fills.</p>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
				<span className="w-48 shrink-0 text-xs text-text-mid">Push on this device</span>
				<div className="flex items-center gap-3">
					<button type="button" onClick={() => void subscribe()} disabled={!data.channels_available.push || busy} className="rounded-v2-md border border-hairline-strong px-3 py-1.5 text-xs text-text-mid hover:text-text-hi disabled:opacity-40">
						{busy ? "Subscribing…" : "Subscribe this device"}
					</button>
					<span className="text-[11px] text-text-lo">
						{data.push_subscriptions} {data.push_subscriptions === 1 ? "device" : "devices"} subscribed
						{!data.channels_available.push ? " · push is not configured on this instance" : ""}
					</span>
				</div>
			</div>
			{note && <p className="text-xs text-glow">{note}</p>}
			<ErrorNote>{err}</ErrorNote>
		</div>
	);
}
