"use client";

/**
 * Work — create a ticket. Two forms of the same thing: `QuickCreate` is the
 * one-line box at the foot of a board column, a backlog or a list (title,
 * Enter, next); `CreateDialog` is the full form behind the "Create" button.
 * Both post to /api/work/tickets and refresh every Work list.
 */
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { refreshWork, statusesFor, useWorkMeta, workFetch } from "@/lib/work/client";
import type { WorkTicket } from "@/lib/work/types";
import { ErrorNote, Field, INPUT, TypeIcon } from "./kit";
import { Dialog, Picker, type Option } from "./pickers";

export type CreateDefaults = {
	project?: string | null;
	type?: string | null;
	status_id?: string | null;
	epic?: string | null;
	parent?: string | null;
	sprint_id?: string | null;
	assignee_id?: string | null;
};

function bodyFrom(title: string, d: CreateDefaults, extra: Record<string, unknown> = {}): Record<string, unknown> {
	const body: Record<string, unknown> = { title, ...extra };
	if (d.project) body.project = d.project;
	if (d.type) body.type = d.type;
	if (d.status_id) body.status_id = d.status_id;
	if (d.epic) body.epic = d.epic;
	if (d.parent) body.parent = d.parent;
	if (d.sprint_id) body.sprint_id = d.sprint_id;
	if (d.assignee_id) body.assignee_id = d.assignee_id;
	return body;
}

export function QuickCreate({
	defaults = {},
	placeholder = "What needs doing?",
	onCreated,
}: {
	defaults?: CreateDefaults;
	placeholder?: string;
	onCreated?: (t: WorkTicket) => void;
}) {
	const [title, setTitle] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit() {
		const t = title.trim();
		if (!t || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await workFetch<{ ticket: WorkTicket }>("/api/work/tickets", "POST", bodyFrom(t, defaults));
			setTitle("");
			refreshWork();
			onCreated?.(res.ticket);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not create the ticket.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div>
			<div className="flex items-center gap-2 rounded-v2-md border border-dashed border-hairline-strong bg-surface-1 px-2 focus-within:border-glow-dim">
				<Plus size={14} aria-hidden className="shrink-0 text-text-lo" />
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void submit();
						}
					}}
					disabled={busy}
					placeholder={placeholder}
					aria-label="New ticket title"
					className="min-w-0 flex-1 bg-transparent py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none"
				/>
				{title.trim() && (
					<button type="button" onClick={() => void submit()} disabled={busy} className="shrink-0 text-xs text-glow hover:underline disabled:opacity-50">
						{busy ? "Adding…" : "Add"}
					</button>
				)}
			</div>
			{error && (
				<div className="mt-1">
					<ErrorNote>{error}</ErrorNote>
				</div>
			)}
		</div>
	);
}

export function CreateDialog({
	open,
	onClose,
	defaults = {},
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	defaults?: CreateDefaults;
	onCreated?: (t: WorkTicket) => void;
}) {
	const { meta } = useWorkMeta();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [project, setProject] = useState<string | null>(defaults.project ?? null);
	const [type, setType] = useState<string | null>(defaults.type ?? null);
	const [status, setStatus] = useState<string | null>(defaults.status_id ?? null);
	const [assignee, setAssignee] = useState<string | null>(defaults.assignee_id ?? null);
	const [points, setPoints] = useState<string | null>(null);
	const [due, setDue] = useState("");
	const [another, setAnother] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const projects = useMemo<Option[]>(() => (meta?.projects ?? []).filter((p) => p.status !== "archived").map((p) => ({ value: p.key, label: p.name, hint: p.key, colour: p.colour })), [meta]);
	const projectKey = project ?? meta?.projects.find((p) => p.is_default)?.key ?? null;
	const projectId = meta?.projects.find((p) => p.key === projectKey)?.id ?? null;
	const types = useMemo<Option[]>(
		() =>
			(meta?.types ?? [])
				.filter((t) => !t.archived_at && (defaults.parent ? t.level === -1 : t.level !== -1))
				.map((t) => ({ value: t.id, label: t.name, icon: <TypeIcon type={t} /> })),
		[meta, defaults.parent],
	);
	const typeId = type && types.some((t) => t.value === type) ? type : (meta?.types.find((t) => t.slug === (defaults.parent ? "subtask" : "task"))?.id ?? null);
	const statuses = useMemo<Option[]>(() => statusesFor(meta, projectId, typeId).map((s) => ({ value: s.id, label: s.name })), [meta, projectId, typeId]);
	const statusId = status && statuses.some((s) => s.value === status) ? status : null;
	const people = useMemo<Option[]>(() => (meta?.people ?? []).map((p) => ({ value: p.id, label: p.name })), [meta]);

	async function submit() {
		const t = title.trim();
		if (!t || busy) return;
		setBusy(true);
		setError(null);
		try {
			const extra: Record<string, unknown> = {};
			if (description.trim()) extra.description = description.trim();
			if (points) extra.points = Number(points);
			if (due) extra.due = due;
			const res = await workFetch<{ ticket: WorkTicket }>(
				"/api/work/tickets",
				"POST",
				bodyFrom(t, { ...defaults, project: projectKey, type: typeId, status_id: statusId, assignee_id: assignee }, extra),
			);
			refreshWork();
			onCreated?.(res.ticket);
			setTitle("");
			setDescription("");
			if (!another) onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not create the ticket.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog
			title={defaults.parent ? `New sub-task of ${defaults.parent}` : "New ticket"}
			open={open}
			onClose={onClose}
			footer={
				<>
					<label className="mr-auto flex items-center gap-2 text-xs text-text-mid">
						<input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} />
						Create another
					</label>
					<Button size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button size="sm" variant="primary" loading={busy} disabled={!title.trim()} onClick={() => void submit()}>
						Create
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<Field label="Title" htmlFor="work-create-title">
					<input
						id="work-create-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
						}}
						className={INPUT}
						placeholder="A short summary"
					/>
				</Field>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{!defaults.parent && (
						<Field label="Project">
							<Picker label="Project" options={projects} value={projectKey} onChange={setProject} />
						</Field>
					)}
					<Field label="Type">
						<Picker label="Type" options={types} value={typeId} onChange={setType} />
					</Field>
					<Field label="Status">
						<Picker label="Status" options={statuses} value={statusId} onChange={setStatus} placeholder="Inbox" clearable />
					</Field>
					<Field label="Assignee">
						<Picker label="Assignee" options={people} value={assignee} onChange={setAssignee} placeholder="Unassigned" clearable />
					</Field>
					<Field label="Points">
						<Picker label="Points" options={[1, 2, 3, 5, 8, 13].map((n) => ({ value: String(n), label: String(n) }))} value={points} onChange={setPoints} placeholder="None" clearable searchable={false} />
					</Field>
					<Field label="Due" htmlFor="work-create-due">
						<input id="work-create-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={INPUT} />
					</Field>
				</div>
				<Field label="Description" htmlFor="work-create-description" hint="Plain text here; the ticket page has the full editor.">
					<textarea id="work-create-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={INPUT} />
				</Field>
				<ErrorNote>{error}</ErrorNote>
			</div>
		</Dialog>
	);
}
