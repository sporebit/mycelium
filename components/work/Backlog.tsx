"use client";

/**
 * The Backlog (claude/spec-work.md §5): the open sprints over everything
 * not yet in one. Sprint planning is a picker on each row (or a drag onto
 * a sprint); the active sprint shows its burndown; start and close go
 * through /api/work/sprints.
 */
import { useState, type DragEvent } from "react";
import { Plus } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { Backlog as BacklogData } from "@/lib/work/boards";
import type { SprintSummary } from "@/lib/tickets/sprints";
import { fmtDay, refreshWork, todayLondon, workFetch, WorkError } from "@/lib/work/client";
import type { WorkTicket } from "@/lib/work/types";
import { Empty, ErrorNote, Field, INPUT, IssueRow, SectionTitle } from "./kit";
import { Dialog, Picker } from "./pickers";
import { ProjectShell, type ProjectPayload } from "./ProjectShell";
import { QuickCreate } from "./QuickCreate";

type BurndownPoint = { date: string; remaining: number; ideal: number };

function plusDays(n: number): string {
	const d = new Date(`${todayLondon()}T00:00:00`);
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

function Burndown({ sprintId }: { sprintId: string }) {
	const { data } = useApi<{ burndown: BurndownPoint[] }>(`/api/work/sprints/${sprintId}`);
	const pts = data?.burndown ?? [];
	if (pts.length < 2) return null;
	const w = 320;
	const h = 80;
	const max = Math.max(1, ...pts.map((p) => Math.max(p.remaining, p.ideal)));
	const x = (i: number) => (i / (pts.length - 1)) * (w - 8) + 4;
	const y = (v: number) => h - 4 - (v / max) * (h - 8);
	const line = (k: "remaining" | "ideal") => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
	return (
		<svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full max-w-xs" role="img" aria-label="Burndown: points remaining against the ideal line">
			<path d={line("ideal")} fill="none" stroke="var(--text-lo)" strokeWidth="1" strokeDasharray="3 3" />
			<path d={line("remaining")} fill="none" stroke="var(--glow)" strokeWidth="1.5" />
		</svg>
	);
}

function SprintBlock({
	entry,
	projectKey,
	sprintOptions,
	onMove,
	onChange,
	dragKey,
	setDragKey,
}: {
	entry: { sprint: SprintSummary; tickets: WorkTicket[]; points: number };
	projectKey: string;
	sprintOptions: Array<{ value: string; label: string }>;
	onMove: (ticket: WorkTicket, sprintId: string | null) => void;
	onChange: () => void;
	dragKey: string | null;
	setDragKey: (k: string | null) => void;
}) {
	const s = entry.sprint;
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [over, setOver] = useState(false);
	const active = s.status === "active";

	async function patch(body: Record<string, unknown>) {
		setBusy(true);
		setErr(null);
		try {
			await workFetch(`/api/work/sprints/${s.id}`, "PATCH", body);
			onChange();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not change the sprint.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<section
			className={`rounded-v2-lg border p-3 ${active ? "border-glow-dim/40 bg-glow-wash" : "border-hairline bg-surface-1"} ${over ? "ring-1 ring-glow-dim" : ""}`}
			onDragOver={(e) => {
				if (!dragKey) return;
				e.preventDefault();
				setOver(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
			}}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				const k = dragKey;
				setDragKey(null);
				if (k) onMove({ key: k, id: k } as WorkTicket, s.id);
			}}
		>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 className="text-sm font-semibold text-text-hi">
						{s.name} <span className="ml-1 text-[10px] font-normal uppercase tracking-[0.08em] text-text-lo">{s.status}</span>
					</h3>
					<p className="text-[11px] text-text-mid">
						{fmtDay(s.starts_on)} – {fmtDay(s.ends_on)}
						{active ? ` · ${s.days_left} days left` : ""} · {s.tickets_done} / {s.tickets_total} done · {s.points_finished} / {entry.points} pts
					</p>
					{s.goal && <p className="mt-1 text-xs text-text-mid">{s.goal}</p>}
				</div>
				<div className="flex items-center gap-2">
					{s.status === "planned" && (
						<Button size="sm" variant="primary" loading={busy} onClick={() => void patch({ status: "active" })}>
							Start sprint
						</Button>
					)}
					{active && (
						<Button
							size="sm"
							loading={busy}
							onClick={() => {
								if (window.confirm(`Close ${s.name}? Unfinished tickets go back to the backlog.`)) void patch({ status: "closed", carry_to: null });
							}}
						>
							Complete sprint
						</Button>
					)}
				</div>
			</div>
			{active && <Burndown sprintId={s.id} />}
			<ErrorNote>{err}</ErrorNote>
			<div className="mt-2 flex flex-col gap-1">
				{entry.tickets.length === 0 && <p className="px-1 py-1 text-xs text-text-lo">Nothing planned yet. Drag issues here from the backlog, or pick this sprint on a row.</p>}
				{entry.tickets.map((t) => (
					<div key={t.id} draggable onDragStart={(e: DragEvent) => { e.dataTransfer.setData("text/plain", t.key ?? t.id); setDragKey(t.key ?? t.id); }} onDragEnd={() => setDragKey(null)} className="cursor-grab">
						<IssueRow ticket={t} dense trailing={<SprintPick value={s.id} options={sprintOptions} onChange={(v) => onMove(t, v)} />} />
					</div>
				))}
				{active && <QuickCreate defaults={{ project: projectKey, sprint_id: s.id }} placeholder="Add to this sprint…" />}
			</div>
		</section>
	);
}

function SprintPick({ value, options, onChange }: { value: string | null; options: Array<{ value: string; label: string }>; onChange: (v: string | null) => void }) {
	return (
		<select
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value || null)}
			onClick={(e) => e.stopPropagation()}
			aria-label="Sprint"
			className="max-w-[9rem] rounded-v2-sm border border-hairline bg-surface-0 px-1.5 py-1 text-[11px] text-text-mid"
		>
			<option value="">Backlog</option>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	);
}

function BacklogBody({ data }: { data: ProjectPayload }) {
	const p = data.project;
	const key = `/api/work/projects/${encodeURIComponent(p.key)}/backlog`;
	const { data: backlog, error, mutate } = useApi<BacklogData>(key);
	const [create, setCreate] = useState(false);
	const [name, setName] = useState("");
	const [goal, setGoal] = useState("");
	const [starts, setStarts] = useState(todayLondon());
	const [ends, setEnds] = useState(plusDays(13));
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [dragKey, setDragKey] = useState<string | null>(null);
	const [over, setOver] = useState(false);

	const sprintOptions = (backlog?.sprints ?? []).map((s) => ({ value: s.sprint.id, label: s.sprint.name }));

	function changed() {
		void mutate();
		refreshWork();
	}

	async function move(t: WorkTicket, sprintId: string | null) {
		setErr(null);
		try {
			await workFetch(`/api/work/tickets/${encodeURIComponent(t.key ?? t.id)}`, "PATCH", { sprint_id: sprintId });
			changed();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not move the issue.");
		}
	}

	async function createSprint() {
		if (!name.trim() || busy) return;
		setBusy(true);
		setErr(null);
		try {
			await workFetch("/api/work/sprints", "POST", { project_id: p.id, name: name.trim(), goal: goal.trim() || undefined, starts_on: starts, ends_on: ends });
			setCreate(false);
			setName("");
			setGoal("");
			changed();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not create the sprint.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="flex items-center justify-between gap-2">
				<p className="text-xs text-text-lo">{p.board_type === "scrum" ? "Plan the next sprint by moving issues up." : "A Kanban project can still run sprints; the board shows the whole project."}</p>
				<Button size="sm" onClick={() => setCreate(true)}>
					<Plus size={14} aria-hidden /> New sprint
				</Button>
			</div>
			<ErrorNote>{err ?? (error ? "Could not load the backlog." : null)}</ErrorNote>
			{!backlog && !error && <Skeleton className="h-40 w-full" />}
			{backlog?.sprints.map((entry) => (
				<SprintBlock key={entry.sprint.id} entry={entry} projectKey={p.key} sprintOptions={sprintOptions.filter((o) => o.value !== entry.sprint.id)} onMove={move} onChange={changed} dragKey={dragKey} setDragKey={setDragKey} />
			))}
			{backlog && (
				<section
					className={`rounded-v2-lg border border-hairline p-3 ${over ? "ring-1 ring-glow-dim" : ""}`}
					onDragOver={(e) => {
						if (!dragKey) return;
						e.preventDefault();
						setOver(true);
					}}
					onDragLeave={(e) => {
						if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
					}}
					onDrop={(e) => {
						e.preventDefault();
						setOver(false);
						const k = dragKey;
						setDragKey(null);
						if (k) void move({ key: k, id: k } as WorkTicket, null);
					}}
				>
					<SectionTitle count={backlog.backlog_total}>Backlog</SectionTitle>
					<div className="flex flex-col gap-1">
						{backlog.backlog.length === 0 && <Empty title="The backlog is empty">Everything is planned or done.</Empty>}
						{backlog.backlog.map((t) => (
							<div key={t.id} draggable onDragStart={(e: DragEvent) => { e.dataTransfer.setData("text/plain", t.key ?? t.id); setDragKey(t.key ?? t.id); }} onDragEnd={() => setDragKey(null)} className="cursor-grab">
								<IssueRow ticket={t} dense trailing={sprintOptions.length > 0 ? <SprintPick value={null} options={sprintOptions} onChange={(v) => void move(t, v)} /> : undefined} />
							</div>
						))}
						<QuickCreate defaults={{ project: p.key }} placeholder="Add to the backlog…" />
					</div>
				</section>
			)}

			<Dialog
				title="New sprint"
				open={create}
				onClose={() => setCreate(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setCreate(false)}>
							Cancel
						</Button>
						<Button size="sm" variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void createSprint()}>
							Create
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<Field label="Name" htmlFor="sprint-name">
						<input id="sprint-name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} autoFocus placeholder={`Sprint ${(backlog?.sprints.length ?? 0) + 1}`} />
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label="Starts" htmlFor="sprint-starts">
							<input id="sprint-starts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className={INPUT} />
						</Field>
						<Field label="Ends" htmlFor="sprint-ends">
							<input id="sprint-ends" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} className={INPUT} />
						</Field>
					</div>
					<Field label="Goal" htmlFor="sprint-goal">
						<textarea id="sprint-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} className={INPUT} />
					</Field>
					<Field label="Length">
						<Picker
							label="Length"
							searchable={false}
							options={[
								{ value: "7", label: "One week" },
								{ value: "14", label: "Two weeks" },
								{ value: "21", label: "Three weeks" },
							]}
							value={null}
							onChange={(v) => {
								if (!v) return;
								const d = new Date(`${starts}T00:00:00`);
								d.setDate(d.getDate() + Number(v) - 1);
								setEnds(d.toISOString().slice(0, 10));
							}}
							placeholder="Set the end from the start"
						/>
					</Field>
				</div>
			</Dialog>
		</div>
	);
}

export function Backlog({ projectKey }: { projectKey: string }) {
	return (
		<ProjectShell projectKey={projectKey} tab="backlog">
			{(data) => <BacklogBody data={data} />}
		</ProjectShell>
	);
}
