"use client";

/**
 * The inbox behind the bell (claude/spec-work.md §6): the caller's
 * notifications, newest first, mark read one by one or all at once, and
 * a page at a time (`before=`).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AtSign, CheckCheck, MessageSquare, Shuffle, UserCheck } from "lucide-react";
import { mutate as globalMutate } from "swr";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { fmtWhen, workFetch, WorkError } from "@/lib/work/client";
import { EVENT_LABEL } from "@/lib/work/notifyPrefs";
import type { NotificationEvent, WorkNotification } from "@/lib/work/types";
import { Empty, ErrorNote, PageHeader } from "./kit";
import { UNREAD_KEY } from "./NotificationBell";

const ICON: Record<NotificationEvent, typeof AtSign> = { mention: AtSign, assignment: UserCheck, status_change: Shuffle, comment: MessageSquare };
const PAGE = 50;

type Payload = { notifications: WorkNotification[]; unread: number };

function refreshBell() {
	void globalMutate(UNREAD_KEY);
	void globalMutate((k) => typeof k === "string" && k.startsWith("/api/work/notifications"), undefined, { revalidate: true });
}

export function NotificationsInbox() {
	const router = useRouter();
	const [unreadOnly, setUnreadOnly] = useState(false);
	const [befores, setBefores] = useState<string[]>([]);
	const [err, setErr] = useState<string | null>(null);
	const base = `/api/work/notifications?limit=${PAGE}${unreadOnly ? "&unread=1" : ""}`;
	const first = useApi<Payload>(base);
	const pages = befores.map((b) => `${base}&before=${encodeURIComponent(b)}`);
	// SWR hooks cannot be called in a loop with a varying count, so older pages are loaded one at a time
	const older = useApi<Payload>(pages.length > 0 ? pages[pages.length - 1] : null);
	const [loaded, setLoaded] = useState<WorkNotification[]>([]);
	const [seenOlderKey, setSeenOlderKey] = useState<string | null>(null);
	const olderKey = pages.length > 0 ? pages[pages.length - 1] : null;
	if (older.data && olderKey && seenOlderKey !== olderKey) {
		setSeenOlderKey(olderKey);
		setLoaded((l) => [...l, ...older.data!.notifications]);
	}
	const all = useMemo(() => {
		const seen = new Set<string>();
		return [...(first.data?.notifications ?? []), ...loaded].filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
	}, [first.data, loaded]);
	const lastPageFull = (older.data?.notifications.length ?? first.data?.notifications.length ?? 0) >= PAGE;

	async function markRead(ids: string[], read = true) {
		setErr(null);
		try {
			await workFetch("/api/work/notifications", "PATCH", { ids, read });
			refreshBell();
			setLoaded((l) => l.map((n) => (ids.includes(n.id) ? { ...n, read_at: read ? new Date().toISOString() : null } : n)));
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not update.");
		}
	}
	async function markAll() {
		setErr(null);
		try {
			await workFetch("/api/work/notifications", "PATCH", { all: true, read: true });
			refreshBell();
			setLoaded((l) => l.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not update.");
		}
	}

	function open(n: WorkNotification) {
		if (!n.read_at) void markRead([n.id]);
		if (n.url) router.push(n.url);
	}

	return (
		<div className="mx-auto max-w-3xl">
			<PageHeader
				title="Notifications"
				sub={first.data ? `${first.data.unread} unread` : undefined}
				actions={
					<>
						<label className="flex items-center gap-2 text-xs text-text-mid">
							<input
								type="checkbox"
								checked={unreadOnly}
								onChange={(e) => {
									setUnreadOnly(e.target.checked);
									setBefores([]);
									setLoaded([]);
									setSeenOlderKey(null);
								}}
							/>
							Unread only
						</label>
						<Button size="sm" onClick={() => void markAll()} disabled={!first.data || first.data.unread === 0}>
							<CheckCheck size={14} aria-hidden /> Mark all read
						</Button>
						<Link href="/other/settings" className="text-xs text-text-mid hover:text-text-hi">
							Settings
						</Link>
					</>
				}
			/>
			<ErrorNote>{err ?? (first.error ? "Could not load notifications." : null)}</ErrorNote>
			{!first.data && !first.error && (
				<div className="flex flex-col gap-1">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</div>
			)}
			{first.data && all.length === 0 && <Empty title={unreadOnly ? "Nothing unread" : "Nothing yet"}>Mentions, assignments, status changes and comments on what you watch land here.</Empty>}
			<ul className="flex flex-col gap-1">
				{all.map((n) => {
					const Icon = ICON[n.event] ?? AtSign;
					return (
						<li key={n.id}>
							<div className={`flex items-start gap-3 rounded-v2-md border px-3 py-2 ${n.read_at ? "border-hairline bg-surface-0/40" : "border-hairline-strong bg-surface-1"}`}>
								<span className={`mt-0.5 shrink-0 ${n.read_at ? "text-text-lo" : "text-glow"}`} title={EVENT_LABEL[n.event]}>
									<Icon size={14} aria-hidden />
								</span>
								<button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
									<span className={`block text-sm ${n.read_at ? "text-text-mid" : "text-text-hi"}`}>{n.title}</span>
									{n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-text-lo">{n.body}</span>}
									<span className="mt-0.5 block text-[11px] text-text-lo">
										{n.actor?.name ? `${n.actor.name} · ` : ""}
										{fmtWhen(n.created_at)}
										{n.ticket_key ? ` · ${n.ticket_key}` : ""}
									</span>
								</button>
								<button type="button" onClick={() => void markRead([n.id], !n.read_at)} className="shrink-0 text-[11px] text-text-lo hover:text-text-hi" title={n.read_at ? "Mark unread" : "Mark read"}>
									{n.read_at ? "Unread" : "Read"}
								</button>
							</div>
						</li>
					);
				})}
			</ul>
			{first.data && all.length > 0 && lastPageFull && (
				<div className="flex justify-center py-3">
					<Button size="sm" loading={older.isLoading} onClick={() => setBefores((b) => [...b, all[all.length - 1].created_at])}>
						Older
					</Button>
				</div>
			)}
		</div>
	);
}
