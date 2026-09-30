"use client";

/**
 * The bell (claude/spec-work.md §6): the unread count, refreshed every
 * minute and whenever the tab comes back, linking to the inbox.
 */
import Link from "next/link";
import { Bell } from "lucide-react";
import { useApi } from "@/lib/data/useApi";

export const UNREAD_KEY = "/api/work/notifications?unread=1&limit=1";

export function useUnreadCount(): number {
	const { data } = useApi<{ unread: number }>(UNREAD_KEY, { refreshInterval: 60_000, revalidateOnFocus: true });
	return data?.unread ?? 0;
}

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
	const unread = useUnreadCount();
	const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
	return (
		<Link
			href="/work/notifications"
			title={label}
			aria-label={label}
			className={`relative inline-flex items-center justify-center rounded-v2-md text-text-mid transition-colors hover:bg-surface-2 hover:text-text-hi ${collapsed ? "h-9 w-9" : "h-9 w-9"}`}
		>
			<Bell size={18} aria-hidden />
			{unread > 0 && (
				<span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-glow px-1 text-center font-[family-name:var(--font-mono)] text-[10px] font-semibold leading-[1.1rem] text-surface-0">
					{unread > 99 ? "99+" : unread}
				</span>
			)}
		</Link>
	);
}
