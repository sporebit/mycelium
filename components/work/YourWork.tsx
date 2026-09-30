"use client";

/**
 * Your work (claude/spec-work.md §5, W12): what is assigned to me, what is
 * under way, what is due soon, what I opened lately, and where I was
 * mentioned. One call: /api/work/home.
 */
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { filterHref, fmtWhen, issuesHref, projectHref, useWorkMeta } from "@/lib/work/client";
import type { WorkNotification, WorkTicket } from "@/lib/work/types";
import { Empty, ErrorNote, IssueRow, PageHeader, SectionTitle } from "./kit";
import { CreateDialog } from "./QuickCreate";

type Home = {
	assigned: WorkTicket[];
	assigned_total: number;
	in_progress: WorkTicket[];
	in_progress_total: number;
	due_soon: WorkTicket[];
	due_total: number;
	recent: WorkTicket[];
	mentions: WorkNotification[];
};

function List({ tickets, more, moreHref, empty }: { tickets: WorkTicket[]; more?: number; moreHref?: string; empty: string }) {
	if (tickets.length === 0) return <p className="px-1 py-2 text-sm text-text-lo">{empty}</p>;
	return (
		<div className="flex flex-col gap-1">
			{tickets.map((t) => (
				<IssueRow key={t.id} ticket={t} showProject dense />
			))}
			{more != null && moreHref && more > tickets.length && (
				<Link href={moreHref} className="px-1 pt-1 text-xs text-text-mid hover:text-glow">
					All {more} →
				</Link>
			)}
		</div>
	);
}

export function YourWork() {
	const { data, error, isLoading } = useApi<Home>("/api/work/home");
	const { meta } = useWorkMeta();
	const [create, setCreate] = useState(false);
	const projects = (meta?.projects ?? []).filter((p) => p.status === "active");

	return (
		<div className="mx-auto max-w-5xl">
			<PageHeader
				title="Your work"
				actions={
					<>
						<Link href={filterHref("inbox")} className="text-sm text-text-mid hover:text-text-hi">
							Inbox
						</Link>
						<Link href="/work/issues" className="text-sm text-text-mid hover:text-text-hi">
							Issues
						</Link>
						<Link href="/work/projects" className="text-sm text-text-mid hover:text-text-hi">
							Projects
						</Link>
						<Button size="sm" variant="primary" onClick={() => setCreate(true)}>
							<Plus size={14} aria-hidden /> Create
						</Button>
					</>
				}
			/>
			{error && <ErrorNote>Could not load your work.</ErrorNote>}
			{isLoading && !data && (
				<div className="flex flex-col gap-2">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			)}
			{data && (
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
					<div className="flex min-w-0 flex-col gap-6">
						<section>
							<SectionTitle count={data.in_progress_total}>In progress</SectionTitle>
							<List tickets={data.in_progress} more={data.in_progress_total} moreHref={issuesHref('statusCategory = "In Progress" ORDER BY updated DESC')} empty="Nothing is under way." />
						</section>
						<section>
							<SectionTitle count={data.assigned_total}>Assigned to me</SectionTitle>
							<List tickets={data.assigned} more={data.assigned_total} moreHref={filterHref("my-open-work")} empty="Nothing is assigned to you." />
						</section>
						<section>
							<SectionTitle count={data.due_total}>Due in the next week</SectionTitle>
							<List tickets={data.due_soon} more={data.due_total} moreHref={filterHref("due-this-week")} empty="Nothing is due soon." />
						</section>
					</div>
					<aside className="flex min-w-0 flex-col gap-6">
						<section>
							<SectionTitle>Projects</SectionTitle>
							{projects.length === 0 ? (
								<p className="text-sm text-text-lo">No active projects.</p>
							) : (
								<ul className="flex flex-col gap-1">
									{projects.slice(0, 8).map((p) => (
										<li key={p.id}>
											<Link href={projectHref(p.key, "board")} className="flex items-center gap-2 rounded-v2-md px-2 py-1.5 text-sm text-text-mid hover:bg-surface-2 hover:text-text-hi">
												<span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.colour ?? "var(--text-lo)" }} />
												<span className="min-w-0 flex-1 truncate">{p.name}</span>
												<span className="font-[family-name:var(--font-mono)] text-[10px] text-text-lo">{p.key}</span>
											</Link>
										</li>
									))}
								</ul>
							)}
						</section>
						<section>
							<SectionTitle>Recently viewed</SectionTitle>
							{data.recent.length === 0 ? (
								<p className="text-sm text-text-lo">Open an issue and it will be listed here.</p>
							) : (
								<ul className="flex flex-col gap-0.5">
									{data.recent.map((t) => (
										<li key={t.id}>
											<Link href={`/work/browse/${encodeURIComponent(t.key ?? t.id)}`} className="flex items-center gap-2 rounded-v2-md px-2 py-1 text-sm text-text-mid hover:bg-surface-2 hover:text-text-hi">
												<span className="font-[family-name:var(--font-mono)] text-[10px] text-text-lo">{t.key}</span>
												<span className="min-w-0 flex-1 truncate">{t.title}</span>
											</Link>
										</li>
									))}
								</ul>
							)}
						</section>
						<section>
							<SectionTitle>Mentions</SectionTitle>
							{data.mentions.length === 0 ? (
								<p className="text-sm text-text-lo">Nobody has mentioned you yet.</p>
							) : (
								<ul className="flex flex-col gap-0.5">
									{data.mentions.slice(0, 8).map((n) => (
										<li key={n.id}>
											<Link href={n.url ?? "/work/notifications"} className={`block rounded-v2-md px-2 py-1 text-sm hover:bg-surface-2 ${n.read_at ? "text-text-mid" : "text-text-hi"}`}>
												<span className="block truncate">{n.title}</span>
												<span className="text-[11px] text-text-lo">{fmtWhen(n.created_at)}</span>
											</Link>
										</li>
									))}
								</ul>
							)}
						</section>
					</aside>
				</div>
			)}
			{data && data.in_progress.length + data.assigned.length + data.due_soon.length === 0 && (
				<div className="mt-6">
					<Empty title="A clear desk" action={<Button size="sm" variant="primary" onClick={() => setCreate(true)}>Create a ticket</Button>}>
						Nothing assigned, under way or due. The Inbox and the issue navigator have the rest.
					</Empty>
				</div>
			)}
			<CreateDialog open={create} onClose={() => setCreate(false)} />
		</div>
	);
}
