"use client";

/**
 * A project's Overview (claude/spec-work.md §5): description, links, key
 * dates, lead, progress by category, components, sprints, and what
 * changed lately.
 */
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useApi } from "@/lib/data/useApi";
import { fmtDay, issuesHref, projectHref, searchPath } from "@/lib/work/client";
import type { SearchResult } from "@/lib/work/types";
import { IssueRow, ProgressBar, SectionTitle } from "./kit";
import { ProjectShell, type ProjectPayload } from "./ProjectShell";

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
	const inner = (
		<>
			<span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-lo">{label}</span>
			<span className="block text-lg font-semibold text-text-hi">{value}</span>
		</>
	);
	return href ? (
		<Link href={href} className="rounded-v2-md border border-hairline bg-surface-1 px-3 py-2 hover:border-hairline-strong">
			{inner}
		</Link>
	) : (
		<div className="rounded-v2-md border border-hairline bg-surface-1 px-3 py-2">{inner}</div>
	);
}

function Body({ data }: { data: ProjectPayload }) {
	const p = data.project;
	const pr = data.progress;
	const recent = useApi<SearchResult>(searchPath(`project = ${p.key} ORDER BY updated DESC`, 8));
	const scope = `project = ${p.key}`;
	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
			<div className="flex min-w-0 flex-col gap-6">
				{p.description ? <p className="whitespace-pre-wrap text-sm text-text-mid">{p.description}</p> : <p className="text-sm text-text-lo">No description. Add one in Settings.</p>}
				<section>
					<SectionTitle>Progress</SectionTitle>
					<ProgressBar todo={pr.todo} inProgress={pr.in_progress} done={pr.done} />
					<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
						<Stat label="To do" value={pr.todo} href={issuesHref(`${scope} AND statusCategory = "To Do"`)} />
						<Stat label="In progress" value={pr.in_progress} href={issuesHref(`${scope} AND statusCategory = "In Progress"`)} />
						<Stat label="Done" value={pr.done} href={issuesHref(`${scope} AND statusCategory = Done ORDER BY resolved DESC`)} />
						<Stat label="Points" value={`${pr.points_done} / ${pr.points_total}`} />
					</div>
				</section>
				<section>
					<SectionTitle action={<Link href={issuesHref(`${scope} ORDER BY updated DESC`)} className="text-xs text-text-mid hover:text-glow">All issues →</Link>}>Recently updated</SectionTitle>
					<div className="flex flex-col gap-1">
						{(recent.data?.tickets ?? []).map((t) => (
							<IssueRow key={t.id} ticket={t} dense />
						))}
						{recent.data && recent.data.tickets.length === 0 && <p className="text-sm text-text-lo">No issues yet.</p>}
					</div>
				</section>
			</div>
			<aside className="flex min-w-0 flex-col gap-5 text-sm">
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
					<dt className="text-text-lo">Lead</dt>
					<dd className="text-text-hi">{data.lead?.name ?? "—"}</dd>
					<dt className="text-text-lo">Start</dt>
					<dd className="text-text-hi">{p.start_on ? fmtDay(p.start_on) : "—"}</dd>
					<dt className="text-text-lo">Target</dt>
					<dd className="text-text-hi">{p.target_on ? fmtDay(p.target_on) : "—"}</dd>
					<dt className="text-text-lo">Board</dt>
					<dd className="text-text-hi">
						<Link href={projectHref(p.key, "board")} className="hover:text-glow">
							{p.board_type === "scrum" ? "Scrum" : "Kanban"}
						</Link>
					</dd>
					{p.github_repo && (
						<>
							<dt className="text-text-lo">Repo</dt>
							<dd className="truncate text-text-hi">{p.github_repo}</dd>
						</>
					)}
				</dl>
				{p.links.length > 0 && (
					<section>
						<SectionTitle>Links</SectionTitle>
						<ul className="flex flex-col gap-1">
							{p.links.map((l, i) => (
								<li key={`${l.url}-${i}`}>
									<a href={l.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-text-mid hover:text-glow">
										<ExternalLink size={12} aria-hidden /> {l.label || l.url}
									</a>
								</li>
							))}
						</ul>
					</section>
				)}
				<section>
					<SectionTitle>Sprints</SectionTitle>
					{data.sprints.active ? (
						<Link href={projectHref(p.key, "backlog")} className="block rounded-v2-md border border-glow-dim/40 bg-glow-wash px-3 py-2 hover:border-glow-dim">
							<span className="block text-text-hi">{data.sprints.active.name}</span>
							<span className="text-[11px] text-text-mid">
								{data.sprints.active.days_left} days left · {data.sprints.active.points_finished} / {data.sprints.active.points_total} pts
							</span>
						</Link>
					) : (
						<p className="text-text-lo">No active sprint.</p>
					)}
					{data.sprints.planned.length > 0 && <p className="mt-1 text-[11px] text-text-lo">{data.sprints.planned.length} planned</p>}
				</section>
				<section>
					<SectionTitle>Components</SectionTitle>
					{data.components.filter((c) => !c.archived_at).length === 0 ? (
						<p className="text-text-lo">None.</p>
					) : (
						<ul className="flex flex-wrap gap-1">
							{data.components
								.filter((c) => !c.archived_at)
								.map((c) => (
									<li key={c.id}>
										<Link href={issuesHref(`${scope} AND component = "${c.name.replace(/"/g, '\\"')}"`)} className="inline-block rounded-full border border-hairline-strong px-2 py-0.5 text-[11px] text-text-mid hover:text-text-hi">
											{c.name}
										</Link>
									</li>
								))}
						</ul>
					)}
				</section>
				<section>
					<SectionTitle>Issue types</SectionTitle>
					<p className="text-[11px] text-text-lo">{data.types_restricted ? data.types.map((t) => t.name).join(", ") : "Every type in the space"}</p>
				</section>
			</aside>
		</div>
	);
}

export function ProjectOverview({ projectKey }: { projectKey: string }) {
	return (
		<ProjectShell projectKey={projectKey} tab="">
			{(data) => <Body data={data} />}
		</ProjectShell>
	);
}
