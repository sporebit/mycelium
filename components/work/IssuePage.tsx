"use client";

/**
 * The issue page (claude/spec-work.md §5, D9): the full page for one
 * ticket, by key or id. Every write goes to /api/work/tickets/[key] and
 * revalidates this key and the Work lists. Steps stay on the old engine
 * (/api/tickets/[key]/steps); links and evidence on /api/tickets/[key]/links.
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Plus } from "lucide-react";
import { DocView } from "@/components/editor/DocView";
import { RichEditor } from "@/components/editor/RichEditor";
import { StepsSection } from "@/components/tickets/StepsSection";
import { Button, Skeleton } from "@/components/ui";
import { ApiError, useApi } from "@/lib/data/useApi";
import { RUNBOOK_KINDS } from "@/lib/tickets/categories";
import type { SprintSummary } from "@/lib/tickets/sprints";
import type { Doc } from "@/lib/work/doc";
import { docHref, fmtDay, fmtWhen, issueHref, projectHref, refreshWork, useWorkMeta, useWorkPrefs, withRecent, workFetch, WorkError } from "@/lib/work/client";
import { STATUS_CATEGORY_LABEL } from "@/lib/work/query";
import type { WorkTicketDetail } from "@/lib/work/types";
import { Avatar, ErrorNote, IssueRow, KeyLink, LabelChip, SectionTitle, StatusPill, TypeIcon } from "./kit";
import { Picker, type Option } from "./pickers";
import { CreateDialog, QuickCreate } from "./QuickCreate";

function Side({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-1">
			<span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-lo">{label}</span>
			<div className="min-w-0">{children}</div>
		</div>
	);
}

export function IssuePage() {
	const params = useParams<{ key: string }>();
	const urlKey = params.key;
	const router = useRouter();
	const apiKey = `/api/work/tickets/${encodeURIComponent(urlKey)}`;
	const { data, error, mutate } = useApi<WorkTicketDetail>(apiKey);
	const { meta, reload: reloadMeta } = useWorkMeta();
	const { work, setWork, isLoading: prefsLoading } = useWorkPrefs();
	const t = data?.ticket ?? null;

	// an old key (an alias) still resolves; settle the URL on the live one
	useEffect(() => {
		if (t?.key && t.key !== urlKey.toUpperCase()) router.replace(issueHref(t.key));
	}, [t?.key, urlKey, router]);
	// recently viewed (ui_prefs.work.recent)
	const liveKey = t?.key ?? null;
	useEffect(() => {
		if (!liveKey || prefsLoading) return;
		if (work.recent[0] === liveKey) return;
		void setWork({ recent: withRecent(work.recent, liveKey) });
		// only when the key changes, not on every prefs echo
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [liveKey, prefsLoading]);

	const [saving, setSaving] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [editingDesc, setEditingDesc] = useState(false);
	const [descDraft, setDescDraft] = useState<{ doc: Doc; text: string } | null>(null);
	const [comment, setComment] = useState<{ doc: Doc; text: string } | null>(null);
	const [commentKey, setCommentKey] = useState(0);
	const [subtask, setSubtask] = useState(false);

	const sprints = useApi<{ sprints: SprintSummary[] }>(t?.project ? `/api/work/sprints?project=${t.project.id}` : null);
	const docsList = useApi<{ pages: Array<{ id: string; title: string; doc_space_key: string; source: string }> }>(t ? `/api/work/docs/for-ticket/${encodeURIComponent(t.key ?? t.id)}` : null);

	async function run(fn: () => Promise<unknown>, opts: { lists?: boolean } = {}) {
		setSaving(true);
		setErr(null);
		try {
			await fn();
			await mutate();
			if (opts.lists !== false) refreshWork();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : e instanceof Error ? e.message : "Something failed.");
		} finally {
			setSaving(false);
		}
	}
	const patch = (fields: Record<string, unknown>) => run(() => workFetch(apiKey, "PATCH", fields));
	const oldKey = t ? `/api/tickets/${encodeURIComponent(t.key ?? t.id)}` : "";

	const typeOptions = useMemo<Option[]>(() => (meta?.types ?? []).filter((x) => !x.archived_at && (t?.parent ? x.level === -1 : x.level !== -1)).map((x) => ({ value: x.id, label: x.name, icon: <TypeIcon type={x} /> })), [meta, t?.parent]);
	const people = useMemo<Option[]>(() => (meta?.people ?? []).map((p) => ({ value: p.id, label: p.name })), [meta]);
	const projectOptions = useMemo<Option[]>(() => (meta?.projects ?? []).map((p) => ({ value: p.key, label: p.name, hint: p.key, colour: p.colour })), [meta]);
	const epics = useApi<{ tickets: Array<{ id: string; key: string | null; title: string }> }>(t?.project && t.type?.level !== 1 ? `/api/work/tickets?jql=${encodeURIComponent(`project = ${t.project.key} AND type = epic AND statusCategory != Done ORDER BY title ASC`)}&limit=100` : null);
	const componentOptions = useApi<{ components: Array<{ id: string; name: string }> }>(t?.project ? `/api/work/projects/${encodeURIComponent(t.project.key)}/components` : null);

	if (error) {
		const status = error instanceof ApiError ? error.status : 0;
		return (
			<div className="mx-auto max-w-3xl">
				<Link href="/work" className="text-xs text-text-mid hover:text-glow">
					← Your work
				</Link>
				<ErrorNote>{status === 404 ? `No issue "${urlKey}" in your spaces.` : "Could not load this issue."}</ErrorNote>
			</div>
		);
	}
	if (!data || !t) {
		return (
			<div className="mx-auto max-w-5xl">
				<Skeleton className="mb-2 h-4 w-40" />
				<Skeleton className="mb-4 h-8 w-2/3" />
				<Skeleton className="h-40 w-full" />
			</div>
		);
	}

	const done = t.status?.category === "done";
	const hasSteps = !!t.type?.has_steps || (RUNBOOK_KINDS as readonly string[]).includes(t.kind);
	const labelFields = meta?.label_fields ?? [];
	const labelsOf = (slug: string) => t.labels.filter((l) => l.field === slug).map((l) => l.name);
	const sprintList = (sprints.data?.sprints ?? []).filter((s) => s.status !== "closed" || s.id === t.sprint?.id);

	return (
		<div className="mx-auto max-w-5xl">
			<nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-text-lo">
				<Link href="/work/projects" className="hover:text-text-hi">
					Projects
				</Link>
				{t.project && (
					<>
						<span aria-hidden>/</span>
						<Link href={projectHref(t.project.key)} className="hover:text-text-hi">
							{t.project.name}
						</Link>
					</>
				)}
				{t.epic && (
					<>
						<span aria-hidden>/</span>
						<Link href={issueHref(t.epic.key, t.epic.id)} className="hover:text-text-hi">
							{t.epic.title}
						</Link>
					</>
				)}
				{t.parent && (
					<>
						<span aria-hidden>/</span>
						<Link href={issueHref(t.parent.key, t.parent.id)} className="hover:text-text-hi">
							{t.parent.key ?? t.parent.title}
						</Link>
					</>
				)}
				<span aria-hidden>/</span>
				<span className="inline-flex items-center gap-1 font-[family-name:var(--font-mono)] text-text-mid">
					<TypeIcon type={t.type} size={12} />
					{t.key ?? "—"}
				</span>
				{t.key_aliases.length > 0 && <span title="Earlier keys, still resolving">formerly {t.key_aliases.join(", ")}</span>}
				{saving && <span className="ml-2">saving…</span>}
			</nav>

			<input
				key={t.id + t.title}
				defaultValue={t.title}
				aria-label="Title"
				className="mb-3 w-full bg-transparent text-2xl font-semibold text-text-hi focus:outline-none"
				onBlur={(e) => {
					const v = e.target.value.trim();
					if (v && v !== t.title) void patch({ title: v });
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") (e.target as HTMLInputElement).blur();
				}}
			/>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<Picker
					label="Status"
					variant="chip"
					searchable={false}
					options={data.statuses.map((s) => ({ value: s.id, label: s.name, hint: STATUS_CATEGORY_LABEL[s.category] }))}
					value={t.status?.id ?? null}
					onChange={(v) => v && void patch({ status_id: v })}
					placeholder="No status"
				/>
				{t.status && <StatusPill status={t.status} />}
				{t.resolution && <span className="text-[11px] uppercase tracking-[0.08em] text-text-lo">{t.resolution.replace("_", " ")}</span>}
				<span className="ml-auto inline-flex items-center gap-2">
					<Button size="sm" onClick={() => run(() => workFetch(`${apiKey}/watch`, data.watching ? "DELETE" : "POST"), { lists: false })} title={data.watching ? "Stop watching" : "Watch: be told of comments and status changes"}>
						{data.watching ? <BellOff size={14} aria-hidden /> : <Bell size={14} aria-hidden />}
						{data.watching ? "Watching" : "Watch"}
					</Button>
					{!t.parent && t.type?.level !== -1 && (
						<Button size="sm" onClick={() => setSubtask(true)}>
							<Plus size={14} aria-hidden /> Sub-task
						</Button>
					)}
					{!done ? (
						<Button
							size="sm"
							variant="danger"
							onClick={() => {
								if (window.confirm(`Cancel ${t.key ?? "this ticket"}? It resolves as Cancelled; nothing is removed.`)) void run(() => workFetch(apiKey, "DELETE"));
							}}
						>
							Cancel
						</Button>
					) : (
						data.statuses.find((s) => s.category === "todo") && (
							<Button size="sm" onClick={() => void patch({ status_id: data.statuses.find((s) => s.category === "todo")?.id })}>
								Reopen
							</Button>
						)
					)}
				</span>
			</div>
			<ErrorNote>{err}</ErrorNote>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
				<div className="flex min-w-0 flex-col gap-6">
					<section>
						<SectionTitle
							action={
								!editingDesc ? (
									<button type="button" onClick={() => { setDescDraft(null); setEditingDesc(true); }} className="text-xs text-text-mid hover:text-glow">
										{t.description || t.description_doc ? "Edit" : "Add"}
									</button>
								) : undefined
							}
						>
							Description
						</SectionTitle>
						{editingDesc ? (
							<div className="flex flex-col gap-2">
								<RichEditor value={t.description_doc} fallbackText={t.description} docKey={`${t.id}-${t.updated_at}`} onChange={(doc, text) => setDescDraft({ doc, text })} onSubmit={() => void saveDesc()} autoFocus placeholder="Describe the work. @ mentions someone, # links a ticket." />
								<div className="flex items-center gap-2">
									<Button size="sm" variant="primary" loading={saving} onClick={() => void saveDesc()}>
										Save
									</Button>
									<Button size="sm" onClick={() => setEditingDesc(false)}>
										Cancel
									</Button>
									<span className="text-[11px] text-text-lo">Ctrl+Enter saves</span>
								</div>
							</div>
						) : (
							<DocView doc={t.description_doc} text={t.description} />
						)}
						{!editingDesc && !t.description && !t.description_doc && <p className="text-sm text-text-lo">No description.</p>}
					</section>

					{hasSteps && (
						<section>
							<SectionTitle>Steps</SectionTitle>
							<StepsSection apiKey={oldKey} kind={t.kind} title={t.title} />
						</section>
					)}

					{t.type?.level === 1 && (
						<section>
							<SectionTitle count={data.epic_children.length}>In this epic</SectionTitle>
							<div className="flex flex-col gap-1">
								{data.epic_children.map((c) => (
									<IssueRow key={c.id} ticket={c} dense />
								))}
								<QuickCreate defaults={{ project: t.project?.key ?? null, epic: t.key ?? t.id }} placeholder="Add an issue to this epic…" />
							</div>
						</section>
					)}

					{!t.parent && t.type?.level !== -1 && (
						<section>
							<SectionTitle count={data.children.length}>Sub-tasks</SectionTitle>
							<div className="flex flex-col gap-1">
								{data.children.map((c) => (
									<IssueRow key={c.id} ticket={c} dense />
								))}
								<QuickCreate defaults={{ project: t.project?.key ?? null, parent: t.key ?? t.id, type: meta?.types.find((x) => x.slug === "subtask")?.id ?? null }} placeholder="Add a sub-task…" />
							</div>
						</section>
					)}

					<section>
						<SectionTitle count={data.links.length}>Links &amp; evidence</SectionTitle>
						<ul className="flex flex-col gap-1 text-sm">
							{data.links.map((l) => (
								<li key={l.id} className="flex items-center gap-2">
									<span className="w-16 shrink-0 text-[10px] uppercase tracking-[0.1em] text-text-lo">{l.kind}</span>
									{l.url ? (
										<a href={l.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-text-mid hover:text-glow">
											{l.label ?? l.url}
										</a>
									) : (
										<span className="min-w-0 flex-1 truncate text-text-mid">{l.label ?? l.ref}</span>
									)}
									<span className="shrink-0 text-[11px] text-text-lo">{fmtDay(l.at)}</span>
									<button type="button" onClick={() => run(() => workFetch(`${oldKey}/links?id=${l.id}`, "DELETE"), { lists: false })} className="text-[11px] text-text-lo hover:text-v2-error" aria-label="Remove link">
										×
									</button>
								</li>
							))}
						</ul>
						<LinkAdder onAdd={(url, label) => run(() => workFetch(`${oldKey}/links`, "POST", { url, label }), { lists: false })} />
					</section>

					{(docsList.data?.pages.length ?? 0) > 0 && (
						<section>
							<SectionTitle count={docsList.data?.pages.length}>Pages</SectionTitle>
							<ul className="flex flex-col gap-1 text-sm">
								{docsList.data?.pages.map((p) => (
									<li key={p.id}>
										<Link href={docHref(p.doc_space_key, p.id)} className="text-text-mid hover:text-glow">
											{p.title}
										</Link>
										<span className="ml-2 text-[11px] text-text-lo">{p.doc_space_key}</span>
									</li>
								))}
							</ul>
						</section>
					)}

					<section>
						<SectionTitle count={data.comments.length}>Comments</SectionTitle>
						<ul className="flex flex-col gap-2">
							{data.comments.map((c) => (
								<li key={c.id} className="rounded-v2-md border border-hairline bg-surface-1 px-3 py-2">
									<div className="mb-1 flex items-center gap-2 text-[11px] text-text-lo">
										<Avatar person={c.author} size={16} />
										<span className="text-text-mid">{c.author?.name ?? "Someone"}</span>
										<span title={c.created_at}>{fmtWhen(c.created_at)}</span>
										{c.author && meta?.me?.id === c.author.id && (
											<button
												type="button"
												onClick={() => {
													if (window.confirm("Delete this comment?")) void run(() => workFetch(`${apiKey}/comments?id=${c.id}`, "DELETE"), { lists: false });
												}}
												className="ml-auto hover:text-v2-error"
											>
												Delete
											</button>
										)}
									</div>
									<DocView doc={c.body_doc} text={c.body} variant="comment" />
								</li>
							))}
						</ul>
						<div className="mt-2 flex flex-col gap-2">
							<RichEditor value={null} docKey={String(commentKey)} variant="comment" placeholder="Add a comment. @ mentions someone, # links a ticket. Ctrl+Enter posts." onChange={(doc, text) => setComment({ doc, text })} onSubmit={() => void postComment()} />
							<div>
								<Button size="sm" variant="primary" loading={saving} disabled={!comment?.text.trim()} onClick={() => void postComment()}>
									Comment
								</Button>
							</div>
						</div>
					</section>

					{data.activity.length > 0 && (
						<section>
							<SectionTitle>Activity</SectionTitle>
							<ul className="flex flex-col gap-0.5 text-xs text-text-lo">
								{data.activity.slice(0, 40).map((a) => (
									<li key={a.id}>
										<span className="text-text-mid">{a.actor?.name ?? "Someone"}</span> {a.action}
										{a.field ? ` · ${a.field}` : ""}
										{a.from_value || a.to_value ? ` · ${a.from_value ?? "—"} → ${a.to_value ?? "—"}` : ""} · {fmtWhen(a.created_at)}
									</li>
								))}
							</ul>
						</section>
					)}
				</div>

				<aside className="flex min-w-0 flex-col divide-y divide-hairline rounded-v2-lg border border-hairline bg-surface-1 px-3 py-1 text-sm">
					<Side label="Type">
						<Picker label="Type" options={typeOptions} value={t.type?.id ?? null} onChange={(v) => v && void patch({ type_id: v })} />
					</Side>
					<Side label="Project">
						<Picker label="Project" options={projectOptions} value={t.project?.key ?? null} onChange={(v) => v && void patch({ project: v })} />
					</Side>
					<Side label="Assignee">
						<Picker label="Assignee" options={people} value={t.assignee?.id ?? null} onChange={(v) => void patch({ assignee_id: v })} placeholder="Unassigned" clearable />
					</Side>
					<Side label="Reporter">
						<span className="inline-flex items-center gap-2 text-text-mid">
							<Avatar person={t.reporter} size={18} /> {t.reporter?.name ?? "—"}
						</span>
					</Side>
					<Side label="Points">
						<Picker label="Points" searchable={false} options={[1, 2, 3, 5, 8, 13].map((n) => ({ value: String(n), label: String(n) }))} value={t.points == null ? null : String(t.points)} onChange={(v) => void patch({ points: v ? Number(v) : null })} placeholder="None" clearable />
					</Side>
					<Side label="Due">
						<input type="date" value={t.due ?? ""} onChange={(e) => void patch({ due: e.target.value || null })} aria-label="Due date" className="w-full rounded-v2-sm border border-hairline bg-surface-0 px-2 py-1 text-sm text-text-hi" />
					</Side>
					<Side label="Scheduled">
						<input type="date" value={t.scheduled_on ?? ""} onChange={(e) => void patch({ scheduled_on: e.target.value || null })} aria-label="Scheduled date" className="w-full rounded-v2-sm border border-hairline bg-surface-0 px-2 py-1 text-sm text-text-hi" />
					</Side>
					{(sprintList.length > 0 || t.sprint) && (
						<Side label="Sprint">
							<Picker label="Sprint" options={sprintList.map((s) => ({ value: s.id, label: s.name, hint: s.status }))} value={t.sprint?.id ?? null} onChange={(v) => void patch({ sprint_id: v })} placeholder="None" clearable />
						</Side>
					)}
					{t.type?.level !== 1 && !t.parent && (
						<Side label="Epic">
							<Picker label="Epic" options={(epics.data?.tickets ?? []).map((e) => ({ value: e.key ?? e.id, label: e.title, hint: e.key ?? undefined }))} value={t.epic ? (t.epic.key ?? t.epic.id) : null} onChange={(v) => void patch({ epic: v })} placeholder="None" clearable />
						</Side>
					)}
					{labelFields.map((f) => (
						<Side key={f.id} label={f.name}>
							<Picker
								label={f.name}
								multiple
								options={f.labels.filter((l) => !l.archived_at || labelsOf(f.slug).includes(l.name)).map((l) => ({ value: l.name, label: l.name, colour: l.colour }))}
								value={labelsOf(f.slug)}
								onChange={(v) => void patch({ labels: { [f.slug]: v } })}
								onCreate={async (text) => {
									await patch({ labels: { [f.slug]: [...labelsOf(f.slug), text] } });
									await reloadMeta();
								}}
								placeholder="None"
							/>
						</Side>
					))}
					{t.project && (componentOptions.data?.components.length ?? 0) > 0 && (
						<Side label="Components">
							<Picker label="Components" multiple options={(componentOptions.data?.components ?? []).map((c) => ({ value: c.id, label: c.name }))} value={t.components.map((c) => c.id)} onChange={(v) => void patch({ components: v })} placeholder="None" />
						</Side>
					)}
					{t.labels.length > 0 && (
						<div className="flex flex-wrap gap-1 py-2">
							{t.labels.map((l) => (
								<LabelChip key={l.id} label={l} />
							))}
						</div>
					)}
					<Side label="Watchers">
						<span className="flex flex-wrap gap-1">
							{data.watchers.length === 0 ? <span className="text-text-lo">Nobody</span> : data.watchers.map((w) => <Avatar key={w.id} person={w} size={18} />)}
						</span>
					</Side>
					<div className="py-2 text-[11px] text-text-lo">
						<div>Created {fmtWhen(t.created_at)}</div>
						<div>Updated {fmtWhen(t.updated_at)}</div>
						{t.started_at && <div>Started {fmtWhen(t.started_at)}</div>}
						{t.resolved_at && <div>Resolved {fmtWhen(t.resolved_at)}</div>}
						{t.parent && (
							<div>
								Sub-task of <KeyLink ticket={{ id: t.parent.id, key: t.parent.key }} />
							</div>
						)}
					</div>
				</aside>
			</div>

			<CreateDialog open={subtask} onClose={() => setSubtask(false)} defaults={{ project: t.project?.key ?? null, parent: t.key ?? t.id, type: meta?.types.find((x) => x.slug === "subtask")?.id ?? null }} />
		</div>
	);

	async function saveDesc() {
		if (!descDraft) {
			setEditingDesc(false);
			return;
		}
		await patch({ description: descDraft.text || null, description_doc: descDraft.text ? descDraft.doc : null });
		setEditingDesc(false);
	}

	async function postComment() {
		if (!comment?.text.trim()) return;
		const body = comment;
		await run(() => workFetch(`${apiKey}/comments`, "POST", { body_doc: body.doc }), { lists: false });
		setComment(null);
		setCommentKey((k) => k + 1);
	}
}

function LinkAdder({ onAdd }: { onAdd: (url: string, label?: string) => Promise<void> }) {
	const [url, setUrl] = useState("");
	const [label, setLabel] = useState("");
	const ok = /^https?:\/\//i.test(url.trim());
	return (
		<div className="mt-2 flex flex-wrap gap-2">
			<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Link address" className="min-w-[12rem] flex-1 rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-1.5 text-sm text-text-hi placeholder:text-text-lo focus:border-glow-dim focus:outline-none" />
			<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" aria-label="Link label" className="w-36 rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-1.5 text-sm text-text-hi placeholder:text-text-lo focus:border-glow-dim focus:outline-none" />
			<Button
				size="sm"
				disabled={!ok}
				onClick={() => {
					const u = url.trim();
					const l = label.trim() || undefined;
					setUrl("");
					setLabel("");
					void onAdd(u, l);
				}}
			>
				Add
			</Button>
		</div>
	);
}
