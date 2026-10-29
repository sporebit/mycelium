"use client";

/**
 * Space-level workflows (claude/spec-work.md §2.1): every workflow of the
 * space with its statuses. Make one (blank or a copy), rename it, make it
 * the space default, archive or delete it; add, rename, re-categorise,
 * recolour, reorder and delete statuses. Which workflow a project or type
 * uses is set on the project's settings page; this page only shows it.
 */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { refreshWork, useWorkMeta, workFetch, WorkError } from "@/lib/work/client";
import { STATUS_CATEGORIES, STATUS_CATEGORY_LABEL, type StatusCategory } from "@/lib/work/query";
import type { WorkflowMapRow, WorkStatus, WorkWorkflow } from "@/lib/work/types";
import { Empty, ErrorNote, Field, INPUT, PageHeader, SectionTitle, StatusPill } from "./kit";
import { Dialog, Picker, type Option } from "./pickers";

const KEY = "/api/work/workflows";

type Payload = { workflows: WorkWorkflow[]; workflow_map: WorkflowMapRow[] };

const CATEGORY_OPTIONS: Option[] = STATUS_CATEGORIES.map((c) => ({ value: c, label: STATUS_CATEGORY_LABEL[c] }));
// the same list as lib/work/config.ts RESOLUTIONS (server-only module)
const RESOLUTIONS = ["done", "cancelled", "duplicate", "wont_do"] as const;
const RESOLUTION_LABEL: Record<(typeof RESOLUTIONS)[number], string> = { done: "Done", cancelled: "Cancelled", duplicate: "Duplicate", wont_do: "Won't do" };
const RESOLUTION_OPTIONS: Option[] = RESOLUTIONS.map((r) => ({ value: r, label: RESOLUTION_LABEL[r] }));

function message(e: unknown, fallback: string): string {
	return e instanceof WorkError ? e.message : fallback;
}

/** One status row: name, category, resolution (Done only), colour, order, delete. */
function StatusRow({
	status,
	index,
	count,
	workflow,
	onChanged,
	setErr,
}: {
	status: WorkStatus;
	index: number;
	count: number;
	workflow: WorkWorkflow;
	onChanged: () => Promise<unknown>;
	setErr: (s: string | null) => void;
}) {
	const [name, setName] = useState(status.name);
	const [busy, setBusy] = useState(false);
	const [moveTo, setMoveTo] = useState<{ tickets: number; target: string | null } | null>(null);
	const base = `${KEY}/${workflow.id}/statuses`;

	async function patch(body: Record<string, unknown>) {
		setBusy(true);
		setErr(null);
		try {
			await workFetch(`${base}/${status.id}`, "PATCH", body);
			await onChanged();
		} catch (e) {
			setErr(message(e, "Could not change the status."));
			setName(status.name);
		} finally {
			setBusy(false);
		}
	}

	async function reorder(to: number) {
		const order = workflow.statuses.map((s) => s.id);
		const [id] = order.splice(index, 1);
		order.splice(to, 0, id);
		setBusy(true);
		setErr(null);
		try {
			await workFetch(base, "PUT", { order });
			await onChanged();
		} catch (e) {
			setErr(message(e, "Could not reorder."));
		} finally {
			setBusy(false);
		}
	}

	async function remove(target: string | null) {
		setBusy(true);
		setErr(null);
		try {
			await workFetch(`${base}/${status.id}${target ? `?move_to=${encodeURIComponent(target)}` : ""}`, "DELETE");
			setMoveTo(null);
			await onChanged();
		} catch (e) {
			// tickets sit in the status: the route says how many and asks where they go
			const tickets = e instanceof WorkError ? e.body?.tickets : undefined;
			if (typeof tickets === "number" && tickets > 0 && !target) setMoveTo({ tickets, target: null });
			else setErr(message(e, "Could not delete the status."));
		} finally {
			setBusy(false);
		}
	}

	const others: Option[] = workflow.statuses.filter((s) => s.id !== status.id).map((s) => ({ value: s.id, label: s.name, hint: STATUS_CATEGORY_LABEL[s.category] }));

	return (
		<li className="grid grid-cols-1 items-center gap-2 rounded-v2-md border border-hairline bg-surface-0/40 px-2 py-1.5 sm:grid-cols-[1.25rem_minmax(0,1fr)_9rem_8rem_auto]">
			<input
				type="color"
				value={status.colour ?? "#888888"}
				onChange={(e) => void patch({ colour: e.target.value })}
				disabled={busy}
				aria-label={`${status.name} colour`}
				title={status.colour ? "Colour" : "No colour set"}
				className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
			/>
			<input
				value={name}
				onChange={(e) => setName(e.target.value)}
				onBlur={() => {
					const next = name.trim();
					if (next && next !== status.name) void patch({ name: next });
					else setName(status.name);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") (e.target as HTMLInputElement).blur();
					if (e.key === "Escape") setName(status.name);
				}}
				disabled={busy}
				aria-label="Status name"
				className={INPUT}
			/>
			<Picker label="Category" options={CATEGORY_OPTIONS} value={status.category} onChange={(v) => v && void patch({ status_category: v })} disabled={busy} />
			<span>
				{status.category === "done" ? (
					<Picker label="Resolution" options={RESOLUTION_OPTIONS} value={status.resolution ?? "done"} onChange={(v) => v && void patch({ resolution: v })} disabled={busy} />
				) : (
					<span className="text-[11px] text-text-lo">—</span>
				)}
			</span>
			<span className="flex items-center justify-end gap-0.5">
				<button type="button" onClick={() => void reorder(index - 1)} disabled={busy || index === 0} aria-label="Move up" title="Move up" className="p-1 text-text-lo hover:text-text-hi disabled:opacity-30">
					<ArrowUp size={12} aria-hidden />
				</button>
				<button type="button" onClick={() => void reorder(index + 1)} disabled={busy || index === count - 1} aria-label="Move down" title="Move down" className="p-1 text-text-lo hover:text-text-hi disabled:opacity-30">
					<ArrowDown size={12} aria-hidden />
				</button>
				<button type="button" onClick={() => void remove(null)} disabled={busy} aria-label={`Delete ${status.name}`} title="Delete" className="p-1 text-text-lo hover:text-danger disabled:opacity-30">
					<Trash2 size={12} aria-hidden />
				</button>
			</span>
			<Dialog
				title={`Delete ${status.name}`}
				open={!!moveTo}
				onClose={() => setMoveTo(null)}
				footer={
					<>
						<Button size="sm" onClick={() => setMoveTo(null)}>
							Cancel
						</Button>
						<Button size="sm" variant="danger" loading={busy} disabled={!moveTo?.target} onClick={() => void remove(moveTo?.target ?? null)}>
							Move and delete
						</Button>
					</>
				}
			>
				<p className="mb-3 text-sm text-text-mid">
					{moveTo?.tickets === 1 ? "One ticket is" : `${moveTo?.tickets ?? 0} tickets are`} in {status.name}. Where should {moveTo?.tickets === 1 ? "it" : "they"} go?
				</p>
				<Field label="Move to">
					<Picker label="Move to" options={others} value={moveTo?.target ?? null} onChange={(v) => setMoveTo((m) => (m ? { ...m, target: v } : m))} placeholder="Pick a status" />
				</Field>
			</Dialog>
		</li>
	);
}

/** Add a status to the end of a workflow. */
function AddStatus({ workflow, onChanged, setErr }: { workflow: WorkWorkflow; onChanged: () => Promise<unknown>; setErr: (s: string | null) => void }) {
	const [name, setName] = useState("");
	const [category, setCategory] = useState<StatusCategory>("todo");
	const [busy, setBusy] = useState(false);

	async function add() {
		const n = name.trim();
		if (!n || busy) return;
		setBusy(true);
		setErr(null);
		try {
			await workFetch(`${KEY}/${workflow.id}/statuses`, "POST", { name: n, status_category: category });
			setName("");
			await onChanged();
		} catch (e) {
			setErr(message(e, "Could not add the status."));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mt-2 grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
			<input
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") void add();
				}}
				placeholder="New status"
				aria-label="New status name"
				disabled={busy}
				className={INPUT}
			/>
			<Picker label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => v && setCategory(v as StatusCategory)} disabled={busy} />
			<Button size="sm" loading={busy} disabled={!name.trim()} onClick={() => void add()}>
				<Plus size={14} aria-hidden /> Add
			</Button>
		</div>
	);
}

function WorkflowCard({ workflow, usedBy, onChanged, canDefault }: { workflow: WorkWorkflow; usedBy: string[]; onChanged: () => Promise<unknown>; canDefault: boolean }) {
	const [name, setName] = useState(workflow.name);
	const [description, setDescription] = useState(workflow.description ?? "");
	const [busy, setBusy] = useState<string | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const archived = !!workflow.archived_at;

	async function run(key: string, fn: () => Promise<unknown>, fallback: string) {
		setBusy(key);
		setErr(null);
		try {
			await fn();
			await onChanged();
		} catch (e) {
			setErr(message(e, fallback));
		} finally {
			setBusy(null);
		}
	}

	const patch = (body: Record<string, unknown>, fallback = "Could not change the workflow.") => run("patch", () => workFetch(`${KEY}/${workflow.id}`, "PATCH", body), fallback);

	return (
		<section className={`rounded-v2-lg border border-hairline bg-surface-1 p-4 ${archived ? "opacity-70" : ""}`}>
			<div className="mb-3 flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							onBlur={() => {
								const next = name.trim();
								if (next && next !== workflow.name) void patch({ name: next });
								else setName(workflow.name);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") (e.target as HTMLInputElement).blur();
								if (e.key === "Escape") setName(workflow.name);
							}}
							disabled={busy !== null}
							aria-label="Workflow name"
							className={`${INPUT} max-w-xs font-medium`}
						/>
						{workflow.is_default && (
							<span className="inline-flex shrink-0 items-center gap-1 rounded-v2-sm border border-glow-dim/40 bg-glow-wash px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-glow">
								<Star size={10} aria-hidden /> Space default
							</span>
						)}
						{archived && <span className="shrink-0 rounded-v2-sm border border-hairline px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-text-lo">Archived</span>}
					</div>
					<textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						onBlur={() => {
							const next = description.trim();
							if (next !== (workflow.description ?? "")) void patch({ description: next || null });
						}}
						disabled={busy !== null}
						rows={1}
						placeholder="What this workflow is for"
						aria-label="Workflow description"
						className={`${INPUT} mt-1 max-w-xl resize-y text-xs`}
					/>
					<p className="mt-1 text-[11px] text-text-lo">{usedBy.length > 0 ? `Used by ${usedBy.join(", ")}.` : workflow.is_default ? "Used by everything not mapped elsewhere." : "Not mapped to any project or type."}</p>
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-1">
					{!workflow.is_default && !archived && canDefault && (
						<Button size="sm" loading={busy === "default"} onClick={() => void run("default", () => workFetch(`${KEY}/map`, "POST", { default_workflow_id: workflow.id }), "Could not make this the default.")}>
							Make default
						</Button>
					)}
					{!workflow.is_default && (
						<Button size="sm" loading={busy === "patch"} onClick={() => void patch({ archived: !archived })}>
							{archived ? "Restore" : "Archive"}
						</Button>
					)}
					{!workflow.is_default && (
						<Button size="sm" variant="danger" loading={busy === "delete"} onClick={() => setConfirmDelete(true)}>
							<Trash2 size={14} aria-hidden /> Delete
						</Button>
					)}
				</div>
			</div>
			<ul className="flex flex-col gap-1">
				{workflow.statuses.map((s, i) => (
					<StatusRow key={s.id} status={s} index={i} count={workflow.statuses.length} workflow={workflow} onChanged={onChanged} setErr={setErr} />
				))}
			</ul>
			{!archived && <AddStatus workflow={workflow} onChanged={onChanged} setErr={setErr} />}
			<ErrorNote>{err}</ErrorNote>
			<Dialog
				title={`Delete ${workflow.name}?`}
				open={confirmDelete}
				onClose={() => setConfirmDelete(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setConfirmDelete(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							variant="danger"
							loading={busy === "delete"}
							onClick={() => {
								setConfirmDelete(false);
								void run("delete", () => workFetch(`${KEY}/${workflow.id}`, "DELETE"), "Could not delete the workflow.");
							}}
						>
							Delete
						</Button>
					</>
				}
			>
				<p className="text-sm text-text-mid">Its statuses go with it. A workflow that tickets still use is refused; archive it instead.</p>
			</Dialog>
		</section>
	);
}

export function Workflows() {
	const { data, error, mutate } = useApi<Payload>(KEY);
	const { meta, reload: reloadMeta } = useWorkMeta();
	const [create, setCreate] = useState(false);
	const [showArchived, setShowArchived] = useState(false);
	const [form, setForm] = useState({ name: "", description: "", copy_from: null as string | null });
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function changed() {
		await Promise.all([mutate(), reloadMeta()]);
		refreshWork();
	}

	async function createWorkflow() {
		const n = form.name.trim();
		if (!n || busy) return;
		setBusy(true);
		setErr(null);
		try {
			await workFetch(KEY, "POST", { name: n, description: form.description.trim() || undefined, copy_from: form.copy_from ?? undefined });
			setCreate(false);
			setForm({ name: "", description: "", copy_from: null });
			await changed();
		} catch (e) {
			setErr(message(e, "Could not create the workflow."));
		} finally {
			setBusy(false);
		}
	}

	// who uses each workflow, in words, from the map and the meta's names
	const usedBy = useMemo(() => {
		const out = new Map<string, string[]>();
		if (!data) return out;
		const projects = new Map((meta?.projects ?? []).map((p) => [p.id, p.name]));
		const types = new Map((meta?.types ?? []).map((t) => [t.id, t.name]));
		for (const m of data.workflow_map) {
			const project = m.project_id ? (projects.get(m.project_id) ?? "a project") : null;
			const type = m.issue_type_id ? (types.get(m.issue_type_id) ?? "a type") : null;
			const label = project && type ? `${project} · ${type}` : (project ?? (type ? `every ${type}` : null));
			if (!label) continue;
			out.set(m.workflow_id, [...(out.get(m.workflow_id) ?? []), label]);
		}
		return out;
	}, [data, meta]);

	const live = (data?.workflows ?? []).filter((w) => !w.archived_at);
	const archivedCount = (data?.workflows ?? []).length - live.length;
	const shown = showArchived ? (data?.workflows ?? []) : live;
	const copyOptions: Option[] = live.map((w) => ({ value: w.id, label: w.name, hint: w.is_default ? "Space default" : undefined }));

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader
				crumbs={[{ label: "Work", href: "/work" }, { label: "Projects", href: "/work/projects" }]}
				title="Workflows"
				sub="The statuses a ticket moves through. Which workflow a project or type uses is set in that project's settings."
				actions={
					<>
						{archivedCount > 0 && (
							<label className="flex items-center gap-2 text-xs text-text-mid">
								<input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
								Show archived ({archivedCount})
							</label>
						)}
						<Button size="sm" variant="primary" onClick={() => setCreate(true)}>
							<Plus size={14} aria-hidden /> New workflow
						</Button>
					</>
				}
			/>
			{error && <ErrorNote>Could not load workflows.</ErrorNote>}
			{!data && !error && (
				<div className="flex flex-col gap-3">
					{[0, 1].map((i) => (
						<Skeleton key={i} className="h-40 w-full" />
					))}
				</div>
			)}
			{data && shown.length === 0 && <Empty title="No workflows">Every space starts with one. Make one to get going.</Empty>}
			<div className="flex flex-col gap-3">
				{shown.map((w) => (
					<WorkflowCard key={w.id} workflow={w} usedBy={usedBy.get(w.id) ?? []} onChanged={changed} canDefault={live.length > 1} />
				))}
			</div>
			{data && (
				<div className="mt-6">
					<SectionTitle>Categories</SectionTitle>
					<p className="text-xs text-text-lo">
						Every workflow needs at least one status in each of the three categories. The board, Your work and the webhooks read the category, not the name:{" "}
						{STATUS_CATEGORIES.map((c, i) => (
							<span key={c}>
								{i > 0 && ", "}
								<StatusPill status={{ name: STATUS_CATEGORY_LABEL[c], category: c }} />
							</span>
						))}
						.
					</p>
				</div>
			)}

			<Dialog
				title="New workflow"
				open={create}
				onClose={() => setCreate(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setCreate(false)}>
							Cancel
						</Button>
						<Button size="sm" variant="primary" loading={busy} disabled={!form.name.trim()} onClick={() => void createWorkflow()}>
							Create
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<Field label="Name" htmlFor="wf-name">
						<input
							id="wf-name"
							value={form.name}
							onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
							onKeyDown={(e) => {
								if (e.key === "Enter") void createWorkflow();
							}}
							className={INPUT}
							autoFocus
							placeholder="Bugs"
						/>
					</Field>
					<Field label="Description" htmlFor="wf-desc">
						<input id="wf-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={INPUT} placeholder="Optional" />
					</Field>
					<Field label="Start from" hint="Copy another workflow's statuses, or start with To Do, In Progress, Done.">
						<Picker label="Copy from" options={copyOptions} value={form.copy_from} onChange={(v) => setForm((f) => ({ ...f, copy_from: v }))} placeholder="To Do · In Progress · Done" clearable />
					</Field>
					<ErrorNote>{err}</ErrorNote>
				</div>
			</Dialog>
		</div>
	);
}
