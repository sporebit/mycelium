"use client";

/**
 * The frame every project page shares: name, key, the Overview / Board /
 * Backlog / Settings tabs, and the project loaded once for all of them.
 */
import type { ReactNode } from "react";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { ProjectProgress, WorkComponent, WorkPerson, WorkProject, WorkType } from "@/lib/work/types";
import type { SprintSummary } from "@/lib/tickets/sprints";
import { projectHref } from "@/lib/work/client";
import { ErrorNote, PageHeader, TabLinks } from "./kit";
import { CreateDialog } from "./QuickCreate";

export type ProjectPayload = {
	project: WorkProject;
	progress: ProjectProgress;
	lead: WorkPerson | null;
	components: WorkComponent[];
	types: WorkType[];
	type_ids: string[];
	types_restricted: boolean;
	sprints: { active: SprintSummary | null; planned: SprintSummary[] };
};

export const projectKey = (key: string) => `/api/work/projects/${encodeURIComponent(key)}`;

export function useProject(key: string) {
	const { data, error, isLoading, mutate } = useApi<ProjectPayload>(projectKey(key));
	return { data: data ?? null, error, isLoading, reload: mutate };
}

export function ProjectShell({ projectKey: key, tab, children, actions, wide = false }: { projectKey: string; tab: "" | "board" | "backlog" | "settings"; children: (p: ProjectPayload) => ReactNode; actions?: ReactNode; wide?: boolean }) {
	const { data, error, isLoading } = useProject(key);
	const [create, setCreate] = useState(false);

	if (error) {
		return (
			<div className="mx-auto max-w-3xl">
				<ErrorNote>{(error as { status?: number }).status === 404 ? `No project "${key}".` : "Could not load this project."}</ErrorNote>
			</div>
		);
	}
	if (isLoading || !data) {
		return (
			<div className={`mx-auto ${wide ? "" : "max-w-6xl"}`}>
				<Skeleton className="mb-3 h-7 w-64" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	}
	const p = data.project;
	const tabs = [
		{ key: "", label: "Overview", href: projectHref(p.key) },
		{ key: "board", label: "Board", href: projectHref(p.key, "board") },
		{ key: "backlog", label: "Backlog", href: projectHref(p.key, "backlog") },
		{ key: "settings", label: "Settings", href: projectHref(p.key, "settings") },
	];
	return (
		<div className={`mx-auto ${wide ? "" : "max-w-6xl"}`}>
			<PageHeader
				crumbs={[{ label: "Projects", href: "/work/projects" }, ...(p.category_name ? [{ label: p.category_name }] : [])]}
				title={
					<span className="inline-flex items-center gap-2">
						<span aria-hidden className="h-3 w-3 rounded-full" style={{ background: p.colour ?? "var(--text-lo)" }} />
						{p.name}
						<span className="font-[family-name:var(--font-mono)] text-xs font-normal text-text-lo">{p.key}</span>
						{p.status !== "active" && <span className="rounded-v2-sm border border-hairline-strong px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-[0.08em] text-text-mid">{p.status}</span>}
					</span>
				}
				actions={
					<>
						{actions}
						<Button size="sm" variant="primary" onClick={() => setCreate(true)}>
							<Plus size={14} aria-hidden /> Create
						</Button>
					</>
				}
			/>
			<TabLinks tabs={tabs} active={tab} />
			{children(data)}
			<CreateDialog open={create} onClose={() => setCreate(false)} defaults={{ project: p.key, sprint_id: tab === "board" && p.board_type === "scrum" ? (data.sprints.active?.id ?? null) : null }} />
		</div>
	);
}
