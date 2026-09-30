"use client";

/**
 * Project settings (claude/spec-work.md §5): details, the issue types the
 * project offers, which workflow its tickets use (the map), components,
 * and the board's type and columns.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { statusesFor, projectHref, refreshWork, useWorkMeta, workFetch, WorkError } from "@/lib/work/client";
import type { BoardColumn, ProjectLink, WorkComponent, WorkStatus, WorkType } from "@/lib/work/types";
import { Empty, ErrorNote, Field, INPUT, SectionTitle, StatusPill, TypeIcon } from "./kit";
import { Picker, type Option } from "./pickers";
import { ProjectShell, useProject, type ProjectPayload } from "./ProjectShell";

const PROJECT_STATUSES: Option[] = [
	{ value: "active", label: "Active" },
	{ value: "paused", label: "Paused" },
	{ value: "done", label: "Done" },
	{ value: "archived", label: "Archived" },
];

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
	return (
		<section className="rounded-v2-lg border border-hairline bg-surface-1 p-4">
			<SectionTitle>{title}</SectionTitle>
			{hint && <p className="mb-3 text-xs text-text-lo">{hint}</p>}
			{children}
		</section>
	);
}

function Details({ data, reload }: { data: ProjectPayload; reload: () => Promise<unknown> }) {
	const p = data.project;
	const router = useRouter();
	const { meta, reload: reloadMeta } = useWorkMeta();
	const [form, setForm] = useState({
		name: p.name,
		key: p.is_default ? "" : p.key,
		description: p.description ?? "",
		category_id: p.category_id,
		status: p.status,
		colour: p.colour ?? "",
		lead_user_id: p.lead_user_id,
		start_on: p.start_on ?? "",
		target_on: p.target_on ?? "",
		github_repo: p.github_repo ?? "",
		links: p.links,
	});
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

	async function save() {
		setBusy(true);
		setErr(null);
		try {
			const body: Record<string, unknown> = {
				name: form.name.trim(),
				description: form.description.trim() || null,
				category_id: form.category_id,
				status: form.status,
				colour: form.colour.trim() || null,
				lead_user_id: form.lead_user_id,
				start_on: form.start_on || null,
				target_on: form.target_on || null,
				github_repo: form.github_repo.trim() || null,
				links: form.links.filter((l) => l.url.trim()),
			};
			if (!p.is_default && form.key.trim().toUpperCase() !== p.key) body.key = form.key.trim().toUpperCase();
			const res = await workFetch<{ key: string }>(`/api/work/projects/${encodeURIComponent(p.key)}`, "PATCH", body);
			await Promise.all([reload(), reloadMeta()]);
			refreshWork();
			setSaved(true);
			setTimeout(() => setSaved(false), 1500);
			if (res.key !== p.key) router.replace(projectHref(res.key, "settings"));
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not save.");
		} finally {
			setBusy(false);
		}
	}

	const links = form.links.length > 0 ? form.links : [];

	return (
		<Section title="Details">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Field label="Name" htmlFor="p-name">
					<input id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} className={INPUT} />
				</Field>
				<Field label="Key" htmlFor="p-key" hint={p.is_default ? "The default project keeps the space's keys." : "Changing it re-keys every ticket; old keys keep resolving."}>
					<input id="p-key" value={form.key} disabled={p.is_default} onChange={(e) => set("key", e.target.value.toUpperCase())} maxLength={5} className={`${INPUT} font-[family-name:var(--font-mono)] uppercase disabled:opacity-50`} />
				</Field>
				<Field label="Category">
					<Picker label="Category" options={(meta?.categories ?? []).map((c) => ({ value: c.id, label: c.name, colour: c.colour }))} value={form.category_id} onChange={(v) => set("category_id", v)} placeholder="None" clearable />
				</Field>
				<Field label="Status">
					<Picker label="Status" searchable={false} options={PROJECT_STATUSES} value={form.status} onChange={(v) => set("status", (v as typeof form.status) ?? "active")} disabled={p.is_default} />
				</Field>
				<Field label="Lead">
					<Picker label="Lead" options={(meta?.people ?? []).map((x) => ({ value: x.id, label: x.name }))} value={form.lead_user_id} onChange={(v) => set("lead_user_id", v)} placeholder="Nobody" clearable />
				</Field>
				<Field label="Colour" htmlFor="p-colour">
					<div className="flex items-center gap-2">
						<input type="color" value={form.colour || "#84f5b8"} onChange={(e) => set("colour", e.target.value)} aria-label="Pick a colour" className="h-9 w-12 cursor-pointer rounded-v2-sm border border-hairline-strong bg-surface-0" />
						<input id="p-colour" value={form.colour} onChange={(e) => set("colour", e.target.value)} placeholder="#84f5b8" className={`${INPUT} font-[family-name:var(--font-mono)]`} />
					</div>
				</Field>
				<Field label="Start" htmlFor="p-start">
					<input id="p-start" type="date" value={form.start_on} onChange={(e) => set("start_on", e.target.value)} className={INPUT} />
				</Field>
				<Field label="Target" htmlFor="p-target">
					<input id="p-target" type="date" value={form.target_on} onChange={(e) => set("target_on", e.target.value)} className={INPUT} />
				</Field>
				<Field label="GitHub repository" htmlFor="p-repo" hint="owner/name — commit messages naming a key move its ticket to In Review.">
					<input id="p-repo" value={form.github_repo} onChange={(e) => set("github_repo", e.target.value)} className={INPUT} placeholder="owner/repo" />
				</Field>
			</div>
			<div className="mt-3">
				<Field label="Description" htmlFor="p-desc">
					<textarea id="p-desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className={INPUT} />
				</Field>
			</div>
			<div className="mt-3">
				<Field label="Links">
					<div className="flex flex-col gap-2">
						{links.map((l, i) => (
							<div key={i} className="flex gap-2">
								<input value={l.label} onChange={(e) => set("links", links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" aria-label="Link label" className={`${INPUT} w-40`} />
								<input value={l.url} onChange={(e) => set("links", links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" aria-label="Link address" className={INPUT} />
								<button type="button" onClick={() => set("links", links.filter((_, j) => j !== i))} aria-label="Remove link" className="text-text-lo hover:text-v2-error">
									<Trash2 size={14} aria-hidden />
								</button>
							</div>
						))}
						<button type="button" onClick={() => set("links", [...links, { label: "", url: "" } as ProjectLink])} className="self-start text-xs text-text-mid hover:text-glow">
							+ Add a link
						</button>
					</div>
				</Field>
			</div>
			<div className="mt-4 flex items-center gap-3">
				<Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
					Save
				</Button>
				{saved && <span className="text-xs text-glow">Saved</span>}
				<ErrorNote>{err}</ErrorNote>
			</div>
		</Section>
	);
}

function Types({ data, reload }: { data: ProjectPayload; reload: () => Promise<unknown> }) {
	const p = data.project;
	const { meta } = useWorkMeta();
	const all = (meta?.types ?? []).filter((t: WorkType) => !t.archived_at);
	const fromServer = data.types_restricted ? data.type_ids : [];
	const [picked, setPicked] = useState<string[]>(fromServer);
	const [seen, setSeen] = useState(fromServer);
	if (seen !== fromServer && seen.join(",") !== fromServer.join(",")) {
		setSeen(fromServer);
		setPicked(fromServer);
	}
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const every = picked.length === 0;

	async function save(ids: string[]) {
		setBusy(true);
		setErr(null);
		try {
			await workFetch(`/api/work/projects/${encodeURIComponent(p.key)}/types`, "PUT", { type_ids: ids });
			await reload();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not save.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Section title="Issue types" hint="Tick the types this project offers. Nothing ticked means every type in the space.">
			<div className="flex flex-wrap gap-2">
				{all.map((t) => {
					const on = every || picked.includes(t.id);
					return (
						<label key={t.id} className={`inline-flex cursor-pointer items-center gap-2 rounded-v2-md border px-2.5 py-1.5 text-sm ${on ? "border-glow-dim/50 bg-glow-wash text-text-hi" : "border-hairline text-text-mid"}`}>
							<input
								type="checkbox"
								checked={on}
								disabled={busy}
								onChange={(e) => {
									const base = every ? all.map((x) => x.id) : picked;
									const next = e.target.checked ? [...base, t.id] : base.filter((x) => x !== t.id);
									const ids = next.length === all.length ? [] : next;
									setPicked(ids);
									void save(ids);
								}}
								className="sr-only"
							/>
							<TypeIcon type={t} />
							{t.name}
						</label>
					);
				})}
			</div>
			<ErrorNote>{err}</ErrorNote>
		</Section>
	);
}

function Workflows({ data }: { data: ProjectPayload }) {
	const p = data.project;
	const { meta, reload } = useWorkMeta();
	const [busy, setBusy] = useState<string | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const workflows = (meta?.workflows ?? []).filter((w) => !w.archived_at);
	const options: Option[] = workflows.map((w) => ({ value: w.id, label: w.name, hint: w.is_default ? "Space default" : undefined }));
	const map = meta?.workflow_map ?? [];
	const projectRow = map.find((m) => m.project_id === p.id && m.issue_type_id === null);
	const types = data.types_restricted ? data.types : (meta?.types ?? []).filter((t) => !t.archived_at);

	async function assign(typeId: string | null, workflowId: string | null) {
		const k = typeId ?? "project";
		setBusy(k);
		setErr(null);
		try {
			await workFetch("/api/work/workflows/map", "PUT", { project_id: p.id, issue_type_id: typeId, workflow_id: workflowId });
			await reload();
			refreshWork();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not change the workflow.");
		} finally {
			setBusy(null);
		}
	}

	const effective = (typeId: string | null) => statusesFor(meta, p.id, typeId);

	return (
		<Section title="Workflows" hint="Which statuses a ticket moves through: a project-wide choice, and an override per type. Empty means the space default.">
			<div className="flex flex-col gap-2">
				<div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_16rem_minmax(0,1fr)]">
					<span className="text-sm text-text-hi">Whole project</span>
					<Picker label="Workflow" options={options} value={projectRow?.workflow_id ?? null} onChange={(v) => void assign(null, v)} placeholder="Space default" clearable disabled={busy === "project"} />
					<span className="flex flex-wrap gap-1">
						{effective(null).map((s: WorkStatus) => (
							<StatusPill key={s.id} status={s} />
						))}
					</span>
				</div>
				{types.map((t) => {
					const row = map.find((m) => m.project_id === p.id && m.issue_type_id === t.id);
					return (
						<div key={t.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_16rem_minmax(0,1fr)]">
							<span className="inline-flex items-center gap-2 text-sm text-text-mid">
								<TypeIcon type={t} /> {t.name}
							</span>
							<Picker label={`${t.name} workflow`} options={options} value={row?.workflow_id ?? null} onChange={(v) => void assign(t.id, v)} placeholder="Inherit" clearable disabled={busy === t.id} />
							<span className="flex flex-wrap gap-1">
								{row &&
									effective(t.id).map((s: WorkStatus) => (
										<StatusPill key={s.id} status={s} />
									))}
							</span>
						</div>
					);
				})}
			</div>
			<ErrorNote>{err}</ErrorNote>
		</Section>
	);
}

function Components({ data, reload }: { data: ProjectPayload; reload: () => Promise<unknown> }) {
	const p = data.project;
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const base = `/api/work/projects/${encodeURIComponent(p.key)}/components`;

	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setErr(null);
		try {
			await fn();
			await reload();
			refreshWork();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not save.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Section title="Components" hint="Parts of the project a ticket can belong to. Sub-projects became components.">
			<ul className="flex flex-col gap-1">
				{data.components.map((c: WorkComponent) => (
					<li key={c.id} className="flex items-center gap-2 rounded-v2-md border border-hairline px-2 py-1.5 text-sm">
						<input
							defaultValue={c.name}
							aria-label="Component name"
							disabled={busy}
							onBlur={(e) => {
								const v = e.target.value.trim();
								if (v && v !== c.name) void run(() => workFetch(`${base}/${c.id}`, "PATCH", { name: v }));
							}}
							className={`min-w-0 flex-1 bg-transparent text-text-hi focus:outline-none ${c.archived_at ? "line-through text-text-lo" : ""}`}
						/>
						<button type="button" disabled={busy} onClick={() => void run(() => workFetch(`${base}/${c.id}`, "PATCH", { archived: !c.archived_at }))} className="text-[11px] text-text-lo hover:text-text-hi">
							{c.archived_at ? "Restore" : "Archive"}
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								if (window.confirm(`Delete component "${c.name}"? Tickets lose it; nothing else changes.`)) void run(() => workFetch(`${base}/${c.id}`, "DELETE"));
							}}
							aria-label={`Delete ${c.name}`}
							className="text-text-lo hover:text-v2-error"
						>
							<Trash2 size={14} aria-hidden />
						</button>
					</li>
				))}
			</ul>
			<div className="mt-2 flex gap-2">
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && name.trim()) {
							const v = name.trim();
							setName("");
							void run(() => workFetch(base, "POST", { name: v }));
						}
					}}
					placeholder="New component…"
					aria-label="New component"
					className={INPUT}
				/>
				<Button
					size="sm"
					disabled={!name.trim() || busy}
					onClick={() => {
						const v = name.trim();
						setName("");
						void run(() => workFetch(base, "POST", { name: v }));
					}}
				>
					Add
				</Button>
			</div>
			<ErrorNote>{err}</ErrorNote>
		</Section>
	);
}

function BoardSettings({ data, reload }: { data: ProjectPayload; reload: () => Promise<unknown> }) {
	const p = data.project;
	const { meta } = useWorkMeta();
	const [type, setType] = useState<string | null>(p.board_type);
	const [columns, setColumns] = useState<BoardColumn[] | null>(p.board_columns);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// every status a ticket of this project might be in
	const statuses = useMemo(() => {
		const seen = new Map<string, WorkStatus>();
		const typeIds: Array<string | null> = [null, ...(data.types_restricted ? data.types : meta?.types ?? []).map((t) => t.id)];
		for (const tid of typeIds) for (const s of statusesFor(meta, p.id, tid)) seen.set(s.id, s);
		return [...seen.values()];
	}, [meta, p.id, data.types, data.types_restricted]);
	const statusOptions: Option[] = statuses.map((s) => ({ value: s.id, label: s.name, hint: s.category === "todo" ? "To Do" : s.category === "in_progress" ? "In Progress" : "Done" }));

	async function save(body: Record<string, unknown>) {
		setBusy(true);
		setErr(null);
		try {
			await workFetch(`/api/work/boards/${encodeURIComponent(p.key)}`, "PATCH", body);
			await reload();
			refreshWork();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not save the board.");
		} finally {
			setBusy(false);
		}
	}

	const cols = columns ?? [];

	return (
		<Section title="Board" hint="Kanban shows the whole project; Scrum shows the active sprint. Columns follow the workflow unless you lay them out here.">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Field label="Type">
					<Picker
						label="Board type"
						searchable={false}
						options={[
							{ value: "kanban", label: "Kanban" },
							{ value: "scrum", label: "Scrum" },
						]}
						value={type}
						onChange={(v) => {
							setType(v);
							if (v) void save({ board_type: v });
						}}
						disabled={busy}
					/>
				</Field>
			</div>
			<div className="mt-4">
				<div className="mb-2 flex items-center justify-between">
					<span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-lo">Columns</span>
					{columns === null ? (
						<button type="button" onClick={() => setColumns(statuses.map((s) => ({ name: s.name, status_ids: [s.id] })))} className="text-xs text-text-mid hover:text-glow">
							Lay out columns
						</button>
					) : (
						<button
							type="button"
							onClick={() => {
								setColumns(null);
								void save({ board_columns: null });
							}}
							className="text-xs text-text-mid hover:text-glow"
						>
							Back to the workflow’s columns
						</button>
					)}
				</div>
				{columns === null ? (
					<div className="flex flex-wrap gap-1">
						{statuses.map((s) => (
							<StatusPill key={s.id} status={s} />
						))}
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{cols.map((c, i) => (
							<div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
								<input value={c.name} onChange={(e) => setColumns(cols.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Column name" className={INPUT} />
								<Picker label="Statuses" multiple options={statusOptions} value={c.status_ids} onChange={(v) => setColumns(cols.map((x, j) => (j === i ? { ...x, status_ids: v } : x)))} placeholder="No statuses" />
								<span className="flex items-center gap-1">
									<button type="button" disabled={i === 0} onClick={() => setColumns(cols.map((x, j) => (j === i - 1 ? cols[i] : j === i ? cols[i - 1] : x)))} className="text-text-lo hover:text-text-hi disabled:opacity-30" aria-label="Move left">
										←
									</button>
									<button type="button" disabled={i === cols.length - 1} onClick={() => setColumns(cols.map((x, j) => (j === i + 1 ? cols[i] : j === i ? cols[i + 1] : x)))} className="text-text-lo hover:text-text-hi disabled:opacity-30" aria-label="Move right">
										→
									</button>
									<button type="button" onClick={() => setColumns(cols.filter((_, j) => j !== i))} className="text-text-lo hover:text-v2-error" aria-label="Remove column">
										<Trash2 size={14} aria-hidden />
									</button>
								</span>
							</div>
						))}
						<div className="flex items-center gap-3">
							<button type="button" onClick={() => setColumns([...cols, { name: "New column", status_ids: [] }])} className="text-xs text-text-mid hover:text-glow">
								+ Add a column
							</button>
							<Button size="sm" variant="primary" loading={busy} onClick={() => void save({ board_columns: cols })}>
								Save columns
							</Button>
						</div>
					</div>
				)}
			</div>
			<ErrorNote>{err}</ErrorNote>
		</Section>
	);
}

function Danger({ data }: { data: ProjectPayload }) {
	const p = data.project;
	const router = useRouter();
	const { reload } = useWorkMeta();
	const [err, setErr] = useState<string | null>(null);
	if (p.is_default) return null;
	return (
		<Section title="Archive" hint="An archived project keeps its tickets; it leaves the lists and the pickers.">
			<Button
				size="sm"
				variant="danger"
				onClick={() => {
					if (!window.confirm(`Archive ${p.name}?`)) return;
					void (async () => {
						try {
							await workFetch(`/api/work/projects/${encodeURIComponent(p.key)}`, "DELETE");
							await reload();
							refreshWork();
							router.push("/work/projects");
						} catch (e) {
							setErr(e instanceof WorkError ? e.message : "Could not archive.");
						}
					})();
				}}
			>
				Archive project
			</Button>
			<ErrorNote>{err}</ErrorNote>
		</Section>
	);
}

function Body({ data, projectKey }: { data: ProjectPayload; projectKey: string }) {
	const { reload } = useProject(projectKey);
	if (!data) return <Empty title="No project" />;
	return (
		<div className="flex flex-col gap-4">
			<Details data={data} reload={reload} />
			<Types data={data} reload={reload} />
			<Workflows data={data} />
			<Components data={data} reload={reload} />
			<BoardSettings data={data} reload={reload} />
			<Danger data={data} />
		</div>
	);
}

export function ProjectSettings({ projectKey }: { projectKey: string }) {
	return (
		<ProjectShell projectKey={projectKey} tab="settings">
			{(data) => <Body data={data} projectKey={projectKey} />}
		</ProjectShell>
	);
}
