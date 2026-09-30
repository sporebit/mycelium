"use client";

/**
 * The board (claude/spec-work.md §5): Kanban shows the whole project,
 * Scrum the active sprint. Columns come from the workflow or the board
 * settings; a card dragged to a column goes through
 * /api/work/boards/[key]/move, which sets status and rank in one write.
 * Quick filters live in the URL; the swimlane choice in ui_prefs.work.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { Board as BoardData, BoardColumnCards } from "@/lib/work/boards";
import { issueHref, projectHref, refreshWork, useWorkMeta, useWorkPrefs, workFetch, WorkError } from "@/lib/work/client";
import type { WorkTicket } from "@/lib/work/types";
import { Avatar, CATEGORY_TONE, DueChip, Empty, ErrorNote, LabelChip, Points, TypeIcon } from "./kit";
import { Picker } from "./pickers";
import { ProjectShell, type ProjectPayload } from "./ProjectShell";
import { QuickCreate } from "./QuickCreate";

type Swimlane = "none" | "epic" | "assignee";

function Card({ t, dragging, onDragStart, onDragEnd }: { t: WorkTicket; dragging: boolean; onDragStart: (e: DragEvent, t: WorkTicket) => void; onDragEnd: () => void }) {
	return (
		<div
			draggable
			data-key={t.key ?? t.id}
			onDragStart={(e) => onDragStart(e, t)}
			onDragEnd={onDragEnd}
			className={`group flex cursor-grab flex-col gap-1.5 rounded-v2-md border border-hairline bg-surface-1 px-2.5 py-2 hover:border-hairline-strong active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}
		>
			<Link href={issueHref(t.key, t.id)} className="text-sm leading-snug text-text-hi hover:underline">
				{t.title}
			</Link>
			{(t.labels.length > 0 || t.epic) && (
				<div className="flex flex-wrap items-center gap-1">
					{t.epic && (
						<span className="max-w-full truncate rounded-v2-sm border border-hairline-strong px-1.5 py-0.5 text-[10px] text-text-mid" title={`Epic: ${t.epic.title}`}>
							{t.epic.title}
						</span>
					)}
					{t.labels.slice(0, 3).map((l) => (
						<LabelChip key={l.id} label={l} />
					))}
				</div>
			)}
			<div className="flex items-center gap-1.5">
				<TypeIcon type={t.type} size={12} />
				<span className="font-[family-name:var(--font-mono)] text-[10px] text-text-lo">{t.key}</span>
				<span className="ml-auto inline-flex items-center gap-1.5">
					<DueChip ticket={t} />
					<Points value={t.points} />
					<Avatar person={t.assignee} size={18} />
				</span>
			</div>
		</div>
	);
}

function Column({
	column,
	tickets,
	projectKey,
	sprintId,
	dragKey,
	onDragStart,
	onDragEnd,
	onDrop,
}: {
	column: BoardColumnCards;
	tickets: WorkTicket[];
	projectKey: string;
	sprintId: string | null;
	dragKey: string | null;
	onDragStart: (e: DragEvent, t: WorkTicket) => void;
	onDragEnd: () => void;
	onDrop: (column: BoardColumnCards, before: string | null, after: string | null) => void;
}) {
	const [over, setOver] = useState(false);
	const list = useRef<HTMLDivElement | null>(null);

	function neighbours(y: number): { before: string | null; after: string | null } {
		const cards = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-key]") ?? []).filter((el) => el.dataset.key !== dragKey);
		let after: string | null = null;
		for (const el of cards) {
			const r = el.getBoundingClientRect();
			if (y < r.top + r.height / 2) return { before: el.dataset.key ?? null, after };
			after = el.dataset.key ?? null;
		}
		return { before: null, after };
	}

	return (
		<section
			className={`flex w-72 shrink-0 flex-col rounded-v2-lg border ${over ? "border-glow-dim bg-glow-wash" : "border-hairline bg-surface-0/60"}`}
			onDragOver={(e) => {
				if (!dragKey) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				if (!over) setOver(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
			}}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				const n = neighbours(e.clientY);
				onDrop(column, n.before, n.after);
			}}
		>
			<header className="flex items-center gap-2 px-3 py-2">
				<span className={`rounded-v2-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${CATEGORY_TONE[column.category]}`}>{column.name}</span>
				<span className="text-[11px] text-text-lo">{tickets.length}</span>
				{column.category === "done" && <span className="ml-auto text-[10px] text-text-lo">last 14 days</span>}
			</header>
			<div ref={list} className="flex min-h-[4rem] flex-1 flex-col gap-1.5 px-2 pb-2">
				{tickets.map((t) => (
					<Card key={t.id} t={t} dragging={dragKey === (t.key ?? t.id)} onDragStart={onDragStart} onDragEnd={onDragEnd} />
				))}
				{column.category !== "done" && column.status_ids[0] && (
					<QuickCreate defaults={{ project: projectKey, status_id: column.status_ids[0], sprint_id: sprintId }} placeholder="Add a card…" />
				)}
			</div>
		</section>
	);
}

function laneOf(t: WorkTicket, lane: Swimlane): { id: string; label: string } {
	if (lane === "epic") return t.epic ? { id: t.epic.id, label: t.epic.title } : { id: "none", label: "No epic" };
	if (lane === "assignee") return t.assignee ? { id: t.assignee.id, label: t.assignee.name } : { id: "none", label: "Unassigned" };
	return { id: "all", label: "" };
}

function BoardBody({ data }: { data: ProjectPayload }) {
	const p = data.project;
	const params = useSearchParams();
	const router = useRouter();
	const { meta } = useWorkMeta();
	const { work, setWork } = useWorkPrefs();
	const lane: Swimlane = work.board[p.key]?.swimlane ?? "none";

	const qs = useMemo(() => {
		const sp = new URLSearchParams();
		for (const k of ["assignee", "type", "epic", "label"]) {
			const v = params.get(k);
			if (v) sp.set(k, v);
		}
		return sp.toString();
	}, [params]);
	const key = `/api/work/boards/${encodeURIComponent(p.key)}${qs ? `?${qs}` : ""}`;
	const { data: board, error, mutate } = useApi<BoardData>(key);
	const [dragKey, setDragKey] = useState<string | null>(null);
	const [moveError, setMoveError] = useState<string | null>(null);

	function setParam(name: string, value: string | null) {
		const sp = new URLSearchParams(params.toString());
		if (value) sp.set(name, value);
		else sp.delete(name);
		router.replace(`${projectHref(p.key, "board")}${sp.toString() ? `?${sp}` : ""}`);
	}

	const onDragStart = useCallback((e: DragEvent, t: WorkTicket) => {
		const k = t.key ?? t.id;
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", k);
		setDragKey(k);
	}, []);
	const onDragEnd = useCallback(() => setDragKey(null), []);

	async function onDrop(column: BoardColumnCards, before: string | null, after: string | null) {
		const k = dragKey;
		setDragKey(null);
		if (!k || !board) return;
		const statusId = column.status_ids[0];
		if (!statusId) return;
		setMoveError(null);
		// optimistic: move the card between columns now, let the server settle the rank
		const moving = board.columns.flatMap((c) => c.tickets).find((t) => (t.key ?? t.id) === k);
		if (moving) {
			const next: BoardData = {
				...board,
				columns: board.columns.map((c) => {
					const rest = c.tickets.filter((t) => t.id !== moving.id);
					if (c !== column && c.name !== column.name) return { ...c, tickets: rest };
					const idx = before ? rest.findIndex((t) => (t.key ?? t.id) === before) : -1;
					const placed = [...rest];
					placed.splice(idx < 0 ? rest.length : idx, 0, moving);
					return { ...c, tickets: placed };
				}),
			};
			void mutate(next, { revalidate: false });
		}
		try {
			await workFetch(`/api/work/boards/${encodeURIComponent(p.key)}/move`, "POST", { ticket: k, status_id: statusId, before, after });
			await mutate();
			refreshWork();
		} catch (err) {
			setMoveError(err instanceof WorkError ? err.message : "Could not move the card.");
			await mutate();
		}
	}

	const epics = useMemo(() => {
		const seen = new Map<string, string>();
		for (const t of board?.columns.flatMap((c) => c.tickets) ?? []) if (t.epic) seen.set(t.epic.key ?? t.epic.id, t.epic.title);
		return [...seen.entries()].map(([value, label]) => ({ value, label }));
	}, [board]);

	const lanes = useMemo(() => {
		if (!board) return [];
		if (lane === "none") return [{ id: "all", label: "", columns: board.columns }];
		const map = new Map<string, { id: string; label: string; columns: BoardColumnCards[] }>();
		for (const c of board.columns) {
			for (const t of c.tickets) {
				const l = laneOf(t, lane);
				let row = map.get(l.id);
				if (!row) {
					row = { id: l.id, label: l.label, columns: board.columns.map((col) => ({ ...col, tickets: [] })) };
					map.set(l.id, row);
				}
				row.columns.find((col) => col.name === c.name)?.tickets.push(t);
			}
		}
		return [...map.values()].sort((a, b) => (a.id === "none" ? 1 : b.id === "none" ? -1 : a.label.localeCompare(b.label)));
	}, [board, lane]);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<Picker
					label="Assignee"
					variant="chip"
					searchable={false}
					options={[{ value: "me", label: "Me" }, ...(meta?.people ?? []).filter((x) => x.id !== meta?.me?.id).map((x) => ({ value: x.id, label: x.name }))]}
					value={params.get("assignee")}
					onChange={(v) => setParam("assignee", v)}
					clearable
				/>
				<Picker label="Type" variant="chip" options={(meta?.types ?? []).filter((t) => !t.archived_at).map((t) => ({ value: t.slug, label: t.name, icon: <TypeIcon type={t} /> }))} value={params.get("type")} onChange={(v) => setParam("type", v)} clearable />
				{epics.length > 0 && <Picker label="Epic" variant="chip" options={epics} value={params.get("epic")} onChange={(v) => setParam("epic", v)} clearable />}
				<Picker
					label="Label"
					variant="chip"
					options={(meta?.label_fields.find((f) => f.slug === "labels")?.labels ?? []).filter((l) => !l.archived_at).map((l) => ({ value: l.name, label: l.name, colour: l.colour }))}
					value={params.get("label")}
					onChange={(v) => setParam("label", v)}
					clearable
				/>
				<span className="ml-auto inline-flex items-center gap-2">
					{board?.sprint && (
						<Link href={projectHref(p.key, "backlog")} className="text-xs text-text-mid hover:text-text-hi">
							{board.sprint.name} · {board.sprint.days_left} days left
						</Link>
					)}
					<Picker
						label="Swimlanes"
						variant="chip"
						searchable={false}
						options={[
							{ value: "none", label: "None" },
							{ value: "epic", label: "By epic" },
							{ value: "assignee", label: "By assignee" },
						]}
						value={lane}
						onChange={(v) => void setWork({ board: { ...work.board, [p.key]: { ...(work.board[p.key] ?? {}), swimlane: (v as Swimlane) ?? "none" } } })}
						align="right"
					/>
				</span>
			</div>
			<ErrorNote>{moveError ?? (error ? "Could not load the board." : null)}</ErrorNote>
			{!board && !error && <Skeleton className="h-64 w-full" />}
			{board && board.board_type === "scrum" && !board.sprint && (
				<Empty
					title="No active sprint"
					action={
						<Link href={projectHref(p.key, "backlog")} className="text-sm text-glow hover:underline">
							Plan one in the Backlog →
						</Link>
					}
				>
					A Scrum board shows the sprint that is running.
				</Empty>
			)}
			{board && (board.board_type !== "scrum" || board.sprint) && (
				<div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
					<div className="flex min-w-max flex-col gap-4">
						{lanes.map((row) => (
							<div key={row.id}>
								{row.label && <h3 className="mb-1.5 text-xs font-semibold text-text-mid">{row.label}</h3>}
								<div className="flex items-start gap-3">
									{row.columns.map((c) => (
										<Column key={c.name} column={c} tickets={c.tickets} projectKey={p.key} sprintId={board.sprint?.id ?? null} dragKey={dragKey} onDragStart={onDragStart} onDragEnd={onDragEnd} onDrop={onDrop} />
									))}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
			{board?.truncated && <p className="text-[11px] text-text-lo">Showing the first {board.columns.reduce((n, c) => n + c.tickets.length, 0)} of {board.total} cards. Narrow the board with a quick filter.</p>}
		</div>
	);
}

export function Board({ projectKey }: { projectKey: string }) {
	return (
		<ProjectShell projectKey={projectKey} tab="board" wide>
			{(data) => <BoardBody data={data} />}
		</ProjectShell>
	);
}
