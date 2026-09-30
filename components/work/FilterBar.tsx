"use client";

/**
 * The filter bar and the JQL box (claude/spec-work.md §3.1): two views of
 * one query object. The bar is chips over `barToQuery`; the box is text
 * through `parseJql`. A query the bar cannot show (an OR, a NOT, a range)
 * keeps the box open. Saved filters load into either.
 */
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Code2, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui";
import { tryParseJql } from "@/lib/work/jql";
import { barToQuery, queryToBar, toJql, EMPTY_BAR, FIELD_LABEL, ORDER_FIELDS, STATUS_CATEGORY_LABEL, type BarState, type WorkQuery } from "@/lib/work/query";
import { refreshWork, useWorkMeta, workFetch, WorkError } from "@/lib/work/client";
import type { SavedFilter, WorkMeta } from "@/lib/work/types";
import { ErrorNote, TypeIcon } from "./kit";
import { Dialog, Picker, type Option } from "./pickers";

export type FilterMode = "bar" | "jql";

type Props = {
	query: WorkQuery;
	onChange: (q: WorkQuery) => void;
	mode: FilterMode;
	onMode: (m: FilterMode) => void;
	/** Fields the bar should not offer (a board already scoped to its project). */
	hide?: string[];
	/** The saved filter the query came from, if any. */
	filter?: SavedFilter | null;
	onFilter?: (f: SavedFilter | null) => void;
	compact?: boolean;
};

function labelOptions(meta: WorkMeta, slug: string): Option[] {
	const f = meta.label_fields.find((x) => x.slug === slug);
	return (f?.labels ?? []).filter((l) => !l.archived_at).map((l) => ({ value: l.name, label: l.name, colour: l.colour }));
}

function statusOptions(meta: WorkMeta): Option[] {
	const seen = new Map<string, Option>();
	for (const wf of meta.workflows.filter((w) => !w.archived_at)) {
		for (const s of [...wf.statuses].sort((a, b) => a.sort_order - b.sort_order)) {
			if (!seen.has(s.name.toLowerCase())) seen.set(s.name.toLowerCase(), { value: s.name, label: s.name, hint: STATUS_CATEGORY_LABEL[s.category] });
		}
	}
	return [...seen.values()];
}

export function FilterBar({ query, onChange, mode, onMode, hide = [], filter = null, onFilter, compact = false }: Props) {
	const { meta, reload } = useWorkMeta();
	const bar = useMemo(() => queryToBar(query), [query]);
	const jql = useMemo(() => toJql(query), [query]);
	const [text, setText] = useState(jql);
	const [jqlError, setJqlError] = useState<{ message: string; pos: number } | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveName, setSaveName] = useState("");
	const [saveShared, setSaveShared] = useState(true);
	const [busy, setBusy] = useState(false);

	// the box follows the query when the bar or a saved filter changed it
	const [seenJql, setSeenJql] = useState(jql);
	if (seenJql !== jql) {
		setSeenJql(jql);
		setText(jql);
		setJqlError(null);
	}
	// a query the bar cannot show forces the box
	useEffect(() => {
		if (!bar && mode === "bar") onMode("jql");
	}, [bar, mode, onMode]);

	const labelSlugs = useMemo(() => (meta?.label_fields ?? []).map((f) => f.slug).filter((s) => !["labels", "location", "tool"].includes(s)), [meta]);

	function setBar(next: BarState) {
		onChange(barToQuery(next));
	}
	function setValues(field: string, values: string[]) {
		const b = bar ?? EMPTY_BAR;
		const nextValues = { ...b.values };
		if (values.length === 0) delete nextValues[field];
		else nextValues[field] = values;
		setBar({ ...b, values: nextValues });
	}

	function runJql() {
		const r = tryParseJql(text, { labelFields: labelSlugs });
		if (!r.ok) {
			setJqlError({ message: r.error, pos: r.pos });
			return;
		}
		setJqlError(null);
		onChange(r.query);
	}

	async function save(asNew: boolean) {
		if (!meta) return;
		setBusy(true);
		setSaveError(null);
		try {
			if (asNew || !filter) {
				const name = saveName.trim();
				if (!name) {
					setSaveError("A filter needs a name.");
					return;
				}
				const res = await workFetch<{ filter: SavedFilter }>("/api/work/filters", "POST", { name, jql, shared: saveShared });
				await reload();
				onFilter?.(res.filter);
			} else {
				const res = await workFetch<{ filter: SavedFilter }>(`/api/work/filters/${filter.id}`, "PATCH", { jql });
				await reload();
				onFilter?.(res.filter);
			}
			setSaving(false);
			setSaveName("");
			refreshWork();
		} catch (err) {
			setSaveError(err instanceof WorkError ? err.message : "Could not save the filter.");
		} finally {
			setBusy(false);
		}
	}

	const b = bar ?? EMPTY_BAR;
	const show = (f: string) => !hide.includes(f);
	const dirty = !!filter && filter.jql.trim() !== jql.trim();
	const orderField = b.orderBy[0]?.field ?? "";
	const orderDir = b.orderBy[0]?.dir ?? "desc";

	const filterOptions: Option[] = (meta?.filters ?? []).map((f) => ({ value: f.id, label: f.name, hint: f.is_system ? "System" : f.shared ? "Shared" : "Mine", group: f.is_system ? "Built in" : "Saved" }));

	return (
		<div className={`flex flex-col gap-2 ${compact ? "" : "rounded-v2-lg border border-hairline bg-surface-1 p-3"}`}>
			<div className="flex flex-wrap items-center gap-2">
				{onFilter && (
					<Picker
						label="Filter"
						variant="chip"
						options={filterOptions}
						value={filter?.id ?? null}
						onChange={(id) => onFilter((meta?.filters ?? []).find((f) => f.id === id) ?? null)}
						placeholder="Saved filters"
						clearable
					/>
				)}
				{filter && (
					<span className="inline-flex items-center gap-1 text-xs text-text-mid">
						<Bookmark size={12} aria-hidden />
						{filter.name}
						{dirty && <span className="text-text-lo">· edited</span>}
					</span>
				)}
				<span className="ml-auto inline-flex items-center gap-1">
					<button
						type="button"
						onClick={() => onMode("bar")}
						disabled={!bar}
						aria-pressed={mode === "bar"}
						title={bar ? "Filter with chips" : "This query needs the JQL box"}
						className={`inline-flex h-7 items-center gap-1 rounded-v2-sm px-2 text-xs ${mode === "bar" ? "bg-surface-3 text-text-hi" : "text-text-mid hover:text-text-hi"} disabled:opacity-40`}
					>
						<SlidersHorizontal size={12} aria-hidden /> Basic
					</button>
					<button
						type="button"
						onClick={() => onMode("jql")}
						aria-pressed={mode === "jql"}
						className={`inline-flex h-7 items-center gap-1 rounded-v2-sm px-2 text-xs ${mode === "jql" ? "bg-surface-3 text-text-hi" : "text-text-mid hover:text-text-hi"}`}
					>
						<Code2 size={12} aria-hidden /> JQL
					</button>
					{(query.where || query.orderBy.length > 0) && (
						<button
							type="button"
							onClick={() => {
								onChange({ where: null, orderBy: [] });
								onFilter?.(null);
							}}
							className="inline-flex h-7 items-center gap-1 rounded-v2-sm px-2 text-xs text-text-lo hover:text-text-hi"
						>
							<X size={12} aria-hidden /> Clear
						</button>
					)}
				</span>
			</div>

			{mode === "bar" && meta && (
				<div className="flex flex-wrap items-center gap-1.5">
					<input
						value={b.text}
						onChange={(e) => setBar({ ...b, text: e.target.value })}
						placeholder="Search text…"
						aria-label="Search text"
						className="h-8 w-44 rounded-full border border-hairline-strong bg-surface-0 px-3 text-xs text-text-hi placeholder:text-text-lo focus:border-glow-dim focus:outline-none"
					/>
					{show("project") && (
						<Picker label="Project" variant="chip" multiple options={meta.projects.map((p) => ({ value: p.key, label: p.name, hint: p.key, colour: p.colour }))} value={b.values.project ?? []} onChange={(v) => setValues("project", v)} />
					)}
					{show("type") && (
						<Picker label="Type" variant="chip" multiple options={meta.types.filter((t) => !t.archived_at).map((t) => ({ value: t.slug, label: t.name, icon: <TypeIcon type={t} /> }))} value={b.values.type ?? []} onChange={(v) => setValues("type", v)} />
					)}
					{show("status") && <Picker label="Status" variant="chip" multiple options={statusOptions(meta)} value={b.values.status ?? []} onChange={(v) => setValues("status", v)} />}
					{show("statusCategory") && (
						<Picker
							label="Category"
							variant="chip"
							multiple
							searchable={false}
							options={(["todo", "in_progress", "done"] as const).map((c) => ({ value: STATUS_CATEGORY_LABEL[c], label: STATUS_CATEGORY_LABEL[c] }))}
							value={b.values.statusCategory ?? []}
							onChange={(v) => setValues("statusCategory", v)}
						/>
					)}
					{show("assignee") && (
						<Picker
							label="Assignee"
							variant="chip"
							multiple
							options={[{ value: "me", label: "Me" }, ...meta.people.filter((p) => p.id !== meta.me?.id).map((p) => ({ value: p.id, label: p.name }))]}
							value={b.values.assignee ?? []}
							onChange={(v) => setValues("assignee", v)}
						/>
					)}
					{show("label") && <Picker label="Labels" variant="chip" multiple options={labelOptions(meta, "labels")} value={b.values.label ?? []} onChange={(v) => setValues("label", v)} />}
					{show("location") && <Picker label="Location" variant="chip" multiple options={labelOptions(meta, "location")} value={b.values.location ?? []} onChange={(v) => setValues("location", v)} />}
					{show("tool") && <Picker label="Tool" variant="chip" multiple options={labelOptions(meta, "tool")} value={b.values.tool ?? []} onChange={(v) => setValues("tool", v)} />}
					{labelSlugs.map((slug) => (
						<Picker key={slug} label={meta.label_fields.find((f) => f.slug === slug)?.name ?? slug} variant="chip" multiple options={labelOptions(meta, slug)} value={b.values[slug] ?? []} onChange={(v) => setValues(slug, v)} />
					))}
					<span className="ml-auto inline-flex items-center gap-1">
						<Picker
							label="Order"
							variant="chip"
							options={ORDER_FIELDS.map((f) => ({ value: f, label: FIELD_LABEL[f] ?? (f === "rank" ? "Rank" : "Title") }))}
							value={orderField || null}
							onChange={(f) => setBar({ ...b, orderBy: f ? [{ field: f, dir: orderDir }] : [] })}
							placeholder="Default"
							clearable
							align="right"
						/>
						{orderField && (
							<button type="button" onClick={() => setBar({ ...b, orderBy: [{ field: orderField, dir: orderDir === "asc" ? "desc" : "asc" }] })} className="h-7 rounded-full border border-hairline-strong px-2 text-[11px] text-text-mid hover:text-text-hi" title="Flip the order">
								{orderDir === "asc" ? "↑ asc" : "↓ desc"}
							</button>
						)}
					</span>
				</div>
			)}

			{mode === "jql" && (
				<div className="flex flex-col gap-1">
					<div className="flex items-start gap-2">
						<textarea
							value={text}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									runJql();
								}
							}}
							rows={2}
							spellCheck={false}
							aria-label="JQL"
							placeholder="project = MYC AND statusCategory != Done ORDER BY updated DESC"
							className="min-h-[2.5rem] flex-1 resize-y rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-text-hi placeholder:text-text-lo focus:border-glow-dim focus:outline-none"
						/>
						<Button size="sm" variant="primary" onClick={runJql}>
							Run
						</Button>
					</div>
					{jqlError && (
						<p role="alert" className="text-xs text-v2-error">
							{jqlError.message} <span className="text-text-lo">(at {jqlError.pos + 1})</span>
						</p>
					)}
					<p className="text-[11px] text-text-lo">
						Fields: project, type, status, statusCategory, assignee, reporter, label, location, tool, component, epic, sprint, points, created, updated, started, resolved, due, text, key. Values: <code>me</code>, <code>today</code>, <code>-7d</code>, <code>+2w</code>.
					</p>
				</div>
			)}

			{onFilter && (query.where || query.orderBy.length > 0) && (
				<div className="flex flex-wrap items-center gap-2 text-xs">
					{filter && dirty && (
						<button type="button" disabled={busy} onClick={() => void save(false)} className="text-glow hover:underline disabled:opacity-50">
							Update “{filter.name}”
						</button>
					)}
					<button type="button" disabled={busy} onClick={() => setSaving(true)} className="text-text-mid hover:text-text-hi disabled:opacity-50">
						Save as…
					</button>
				</div>
			)}

			<Dialog
				title="Save filter"
				open={saving}
				onClose={() => setSaving(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setSaving(false)}>
							Cancel
						</Button>
						<Button size="sm" variant="primary" loading={busy} onClick={() => void save(true)}>
							Save
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-lo">Name</span>
						<input value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus className="rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-2 text-sm text-text-hi focus:border-glow-dim focus:outline-none" />
					</label>
					<p className="rounded-v2-md bg-surface-2 px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-text-mid">{jql || "(everything)"}</p>
					<label className="flex items-center gap-2 text-sm text-text-mid">
						<input type="checkbox" checked={saveShared} onChange={(e) => setSaveShared(e.target.checked)} />
						Shared with the space
					</label>
					<ErrorNote>{saveError}</ErrorNote>
				</div>
			</Dialog>
		</div>
	);
}
