"use client";

/**
 * Projects (claude/spec-work.md §5): every project under its category,
 * each with its progress by status category, and the create dialog.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { ProjectGroup, ProjectWithProgress } from "@/lib/work/projects";
import { projectHref, refreshWork, useWorkMeta, workFetch, WorkError } from "@/lib/work/client";
import { Empty, ErrorNote, Field, INPUT, PageHeader, ProgressBar, SectionTitle } from "./kit";
import { Dialog, Picker } from "./pickers";

type Payload = { categories: Array<ProjectGroup<ProjectWithProgress>>; uncategorised: ProjectWithProgress[]; projects: ProjectWithProgress[] };

function ProjectCard({ p }: { p: ProjectWithProgress }) {
	const pr = p.progress;
	return (
		<Link href={projectHref(p.key)} className="flex flex-col gap-2 rounded-v2-lg border border-hairline bg-surface-1 p-4 transition-colors hover:border-hairline-strong hover:bg-surface-2">
			<div className="flex items-center gap-2">
				<span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.colour ?? "var(--text-lo)" }} />
				<span className="min-w-0 flex-1 truncate text-sm font-medium text-text-hi">{p.name}</span>
				<span className="font-[family-name:var(--font-mono)] text-[10px] text-text-lo">{p.key}</span>
			</div>
			{p.description && <p className="line-clamp-2 text-xs text-text-mid">{p.description}</p>}
			<ProgressBar todo={pr.todo} inProgress={pr.in_progress} done={pr.done} />
			<div className="flex items-center justify-between text-[11px] text-text-lo">
				<span>
					{pr.done} / {pr.total} done
				</span>
				<span>
					{p.status !== "active" && <span className="mr-2 uppercase tracking-[0.08em]">{p.status}</span>}
					{p.board_type === "scrum" ? "Scrum" : "Kanban"}
				</span>
			</div>
		</Link>
	);
}

export function ProjectsList() {
	const { data, error, isLoading } = useApi<Payload>("/api/work/projects");
	const { meta, reload } = useWorkMeta();
	const [create, setCreate] = useState(false);
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [category, setCategory] = useState<string | null>(null);
	const [board, setBoard] = useState<string | null>("kanban");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const categories = useMemo(() => (meta?.categories ?? []).map((c) => ({ value: c.id, label: c.name, colour: c.colour })), [meta]);

	async function submit() {
		const n = name.trim();
		if (!n || busy) return;
		setBusy(true);
		setErr(null);
		try {
			const body: Record<string, unknown> = { name: n, board_type: board ?? "kanban" };
			if (key.trim()) body.key = key.trim().toUpperCase();
			if (category) body.category_id = category;
			await workFetch("/api/work/projects", "POST", body);
			refreshWork();
			await reload();
			setCreate(false);
			setName("");
			setKey("");
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not create the project.");
		} finally {
			setBusy(false);
		}
	}

	const groups = data ? [...data.categories, ...(data.uncategorised.length > 0 ? [{ id: "none", name: "No category", colour: null, projects: data.uncategorised }] : [])] : [];

	return (
		<div className="mx-auto max-w-6xl">
			<PageHeader
				title="Projects"
				actions={
					<Button size="sm" variant="primary" onClick={() => setCreate(true)}>
						<Plus size={14} aria-hidden /> New project
					</Button>
				}
			/>
			{error && <ErrorNote>Could not load projects.</ErrorNote>}
			{isLoading && !data && (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-28 w-full" />
					))}
				</div>
			)}
			{data && data.projects.length === 0 && <Empty title="No projects yet">Every ticket lives in a project. The default one, General, is made for you.</Empty>}
			<div className="flex flex-col gap-6">
				{groups.map((g) => (
					<section key={g.id}>
						<SectionTitle count={g.projects.length}>
							<span className="inline-flex items-center gap-2">
								{g.colour && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: g.colour }} />}
								{g.name}
							</span>
						</SectionTitle>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{g.projects.map((p) => (
								<ProjectCard key={p.id} p={p} />
							))}
						</div>
					</section>
				))}
			</div>

			<Dialog
				title="New project"
				open={create}
				onClose={() => setCreate(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setCreate(false)}>
							Cancel
						</Button>
						<Button size="sm" variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void submit()}>
							Create
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<Field label="Name" htmlFor="project-name">
						<input id="project-name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} autoFocus />
					</Field>
					<Field label="Key" htmlFor="project-key" hint="Two to five letters; ticket keys are KEY-1, KEY-2… Leave empty to keep the space's own keys.">
						<input id="project-key" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} maxLength={5} className={`${INPUT} font-[family-name:var(--font-mono)] uppercase`} />
					</Field>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<Field label="Category">
							<Picker label="Category" options={categories} value={category} onChange={setCategory} placeholder="None" clearable />
						</Field>
						<Field label="Board">
							<Picker
								label="Board"
								searchable={false}
								options={[
									{ value: "kanban", label: "Kanban", hint: "whole project" },
									{ value: "scrum", label: "Scrum", hint: "sprints" },
								]}
								value={board}
								onChange={setBoard}
							/>
						</Field>
					</div>
					<ErrorNote>{err}</ErrorNote>
				</div>
			</Dialog>
		</div>
	);
}
