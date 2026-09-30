"use client";

/**
 * One doc page (claude/spec-work.md §7): read it, edit it in the one rich
 * editor, and the page's menu — move, restrict, set as home, link a
 * ticket, archive, history. A save writes title and body together; the
 * database versions every change.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { History, Lock, MoreHorizontal } from "lucide-react";
import { DocView } from "@/components/editor/DocView";
import { RichEditor } from "@/components/editor/RichEditor";
import { Button } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { Doc } from "@/lib/work/doc";
import type { DocPage, DocRestriction, DocSpace } from "@/lib/work/docs";
import { docHref, fmtWhen, issueHref, useWorkMeta, workFetch, WorkError } from "@/lib/work/client";
import { ErrorNote, Field, SectionTitle, StatusPill } from "@/components/work/kit";
import { Dialog, Picker } from "@/components/work/pickers";

type Props = {
	page: DocPage;
	space: DocSpace;
	siblings: Array<{ id: string; title: string; depth: number }>;
	onChanged: () => Promise<void>;
	onNewChild: () => void;
};

export function DocPageView({ page, space, siblings, onChanged, onNewChild }: Props) {
	const router = useRouter();
	const { meta } = useWorkMeta();
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState(page.title);
	const [draft, setDraft] = useState<{ doc: Doc; text: string } | null>(null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [menu, setMenu] = useState(false);
	const [moving, setMoving] = useState(false);
	const [parent, setParent] = useState<string | null>(page.parent_id);
	const [linking, setLinking] = useState(false);
	const [ticketKey, setTicketKey] = useState("");
	const [restricting, setRestricting] = useState(false);
	const restriction = useApi<DocRestriction>(restricting ? `/api/work/docs/pages/${page.id}/restrictions` : null);
	const [people, setPeople] = useState<Array<{ id: string; can_edit: boolean }> | null>(null);

	const pageApi = `/api/work/docs/pages/${page.id}`;
	const canEdit = !page.restricted || page.restriction.can_manage || page.restriction.people.some((p) => p.id === meta?.me?.id && p.can_edit);

	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setErr(null);
		try {
			await fn();
			await onChanged();
			return true;
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not save.");
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function save() {
		const body: Record<string, unknown> = {};
		if (title.trim() !== page.title) body.title = title.trim() || "Untitled";
		if (draft) body.body = draft.doc;
		if (Object.keys(body).length === 0) {
			setEditing(false);
			return;
		}
		if (await run(() => workFetch(pageApi, "PATCH", body))) {
			setEditing(false);
			setDraft(null);
		}
	}

	function startEdit() {
		setTitle(page.title);
		setDraft(null);
		setEditing(true);
		setMenu(false);
	}

	return (
		<article className="min-w-0">
			{page.breadcrumbs.length > 0 && (
				<nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-text-lo">
					{page.breadcrumbs.map((b, i) => (
						<span key={b.id} className="inline-flex items-center gap-1">
							{i > 0 && <span aria-hidden>/</span>}
							<Link href={docHref(space.key, b.id)} className="hover:text-text-hi">
								{b.title || "Untitled"}
							</Link>
						</span>
					))}
				</nav>
			)}
			<div className="mb-3 flex items-start justify-between gap-3">
				{editing ? (
					<input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="w-full bg-transparent text-2xl font-semibold text-text-hi focus:outline-none" autoFocus placeholder="Untitled" />
				) : (
					<h2 className="flex min-w-0 items-center gap-2 text-2xl font-semibold text-text-hi">
						<span className="truncate">{page.title || "Untitled"}</span>
						{page.restricted && <Lock size={14} aria-label="Restricted" className="shrink-0 text-text-lo" />}
						{space.home_page_id === page.id && <span className="shrink-0 rounded-v2-sm border border-hairline-strong px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-[0.08em] text-text-lo">Home</span>}
					</h2>
				)}
				<div className="relative flex shrink-0 items-center gap-2">
					{editing ? (
						<>
							<Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
								Save
							</Button>
							<Button size="sm" onClick={() => setEditing(false)}>
								Cancel
							</Button>
						</>
					) : (
						<>
							{canEdit && (
								<Button size="sm" onClick={startEdit}>
									Edit
								</Button>
							)}
							<Link href={`${docHref(space.key, page.id)}/history`} className="inline-flex h-8 items-center gap-1 rounded-v2-md border border-hairline-strong px-3 text-sm text-text-mid hover:text-text-hi" title="History">
								<History size={14} aria-hidden /> v{page.version}
							</Link>
							<button type="button" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Page menu" className="inline-flex h-8 w-8 items-center justify-center rounded-v2-md border border-hairline-strong text-text-mid hover:text-text-hi">
								<MoreHorizontal size={16} aria-hidden />
							</button>
							{menu && (
								<div role="menu" className="absolute right-0 top-9 z-40 w-52 rounded-v2-md border border-hairline-strong bg-surface-2 p-1 text-sm shadow-xl">
									{[
										{ label: "New page under this", run: () => { setMenu(false); onNewChild(); } },
										{ label: "Move…", run: () => { setMenu(false); setParent(page.parent_id); setMoving(true); } },
										{ label: "Link a ticket…", run: () => { setMenu(false); setLinking(true); } },
										{ label: "Who can see this…", run: () => { setMenu(false); setPeople(null); setRestricting(true); } },
										...(space.home_page_id !== page.id ? [{ label: "Make this the home page", run: () => { setMenu(false); void run(() => workFetch(`/api/work/docs/spaces/${encodeURIComponent(space.key)}`, "PATCH", { home_page_id: page.id })); } }] : []),
										{
											label: "Archive",
											run: () => {
												setMenu(false);
												if (window.confirm(`Archive "${page.title || "Untitled"}" and everything under it?`)) {
													void (async () => {
														if (await run(() => workFetch(pageApi, "DELETE"))) router.push(docHref(space.key));
													})();
												}
											},
										},
									].map((item) => (
										<button key={item.label} role="menuitem" type="button" onClick={item.run} className="block w-full rounded-v2-sm px-2 py-1.5 text-left text-text-mid hover:bg-surface-3 hover:text-text-hi">
											{item.label}
										</button>
									))}
								</div>
							)}
						</>
					)}
				</div>
			</div>
			<p className="mb-4 text-[11px] text-text-lo">
				Updated {fmtWhen(page.updated_at)}
				{page.updated_by ? ` by ${page.updated_by.name}` : ""} · created {fmtWhen(page.created_at)}
				{page.created_by ? ` by ${page.created_by.name}` : ""}
			</p>
			<ErrorNote>{err}</ErrorNote>

			{editing ? (
				<RichEditor value={page.body} fallbackText={page.body_text} docKey={`${page.id}-${page.version}`} variant="page" onChange={(doc, text) => setDraft({ doc, text })} onSubmit={() => void save()} placeholder="Write the page. @ mentions someone, # links a ticket." />
			) : (
				<div className="rounded-v2-lg border border-hairline bg-surface-1 px-5 py-4">
					<DocView doc={page.body} text={page.body_text} variant="page" />
					{!page.body_text.trim() && <p className="text-sm text-text-lo">This page is empty.</p>}
				</div>
			)}

			{page.links.tickets.length > 0 && (
				<section className="mt-6">
					<SectionTitle count={page.links.tickets.length}>Tickets</SectionTitle>
					<ul className="flex flex-col gap-1">
						{page.links.tickets.map((t) => (
							<li key={t.id} className="flex items-center gap-2 rounded-v2-md border border-hairline bg-surface-1 px-3 py-1.5 text-sm">
								<Link href={issueHref(t.key, t.id)} className="font-[family-name:var(--font-mono)] text-[11px] text-text-lo hover:text-glow">
									{t.key ?? "—"}
								</Link>
								<Link href={issueHref(t.key, t.id)} className="min-w-0 flex-1 truncate text-text-hi hover:underline">
									{t.title}
								</Link>
								{t.status_name && t.status_category && <StatusPill status={{ name: t.status_name, category: t.status_category }} />}
								<span className="text-[10px] uppercase tracking-[0.08em] text-text-lo">{t.source}</span>
								{t.key && (
									<button type="button" onClick={() => void run(() => workFetch(`${pageApi}/links?ticket=${encodeURIComponent(t.key as string)}`, "DELETE"))} className="text-[11px] text-text-lo hover:text-v2-error" aria-label="Unlink">
										×
									</button>
								)}
							</li>
						))}
					</ul>
				</section>
			)}

			<Dialog
				title="Move page"
				open={moving}
				onClose={() => setMoving(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setMoving(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							variant="primary"
							loading={busy}
							onClick={() => {
								void (async () => {
									if (await run(() => workFetch(pageApi, "PATCH", { parent_id: parent }))) setMoving(false);
								})();
							}}
						>
							Move
						</Button>
					</>
				}
			>
				<Field label="Under" hint="Top level, or another page in this doc space.">
					<Picker
						label="Parent"
						options={siblings.filter((s) => s.id !== page.id).map((s) => ({ value: s.id, label: `${"— ".repeat(s.depth)}${s.title || "Untitled"}` }))}
						value={parent}
						onChange={setParent}
						placeholder="Top level"
						clearable
					/>
				</Field>
			</Dialog>

			<Dialog
				title="Link a ticket"
				open={linking}
				onClose={() => setLinking(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setLinking(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							variant="primary"
							loading={busy}
							disabled={!ticketKey.trim()}
							onClick={() => {
								void (async () => {
									if (await run(() => workFetch(`${pageApi}/links`, "POST", { ticket: ticketKey.trim().toUpperCase() }))) {
										setLinking(false);
										setTicketKey("");
									}
								})();
							}}
						>
							Link
						</Button>
					</>
				}
			>
				<Field label="Ticket key" htmlFor="link-key" hint="A key typed into the page (# in the editor) links it too.">
					<input id="link-key" value={ticketKey} onChange={(e) => setTicketKey(e.target.value.toUpperCase())} placeholder="MYC-12" className="w-full rounded-v2-md border border-hairline-strong bg-surface-0 px-3 py-2 font-[family-name:var(--font-mono)] text-sm uppercase text-text-hi focus:border-glow-dim focus:outline-none" autoFocus />
				</Field>
			</Dialog>

			<Dialog
				title="Who can see this page"
				open={restricting}
				onClose={() => setRestricting(false)}
				footer={
					restriction.data?.can_manage ? (
						<>
							<Button size="sm" onClick={() => setRestricting(false)}>
								Cancel
							</Button>
							<Button
								size="sm"
								variant="primary"
								loading={busy}
								onClick={() => {
									const list = people ?? restriction.data?.people.map((p) => ({ id: p.id, can_edit: p.can_edit })) ?? [];
									void (async () => {
										if (await run(() => workFetch(`${pageApi}/restrictions`, "PUT", { restricted: list.length > 0, people: list }))) setRestricting(false);
									})();
								}}
							>
								Save
							</Button>
						</>
					) : (
						<Button size="sm" onClick={() => setRestricting(false)}>
							Close
						</Button>
					)
				}
			>
				{!restriction.data ? (
					<p className="text-sm text-text-lo">Loading…</p>
				) : (
					<div className="flex flex-col gap-3 text-sm">
						{restriction.data.inherited_from && !restriction.data.restricted && <p className="text-text-mid">Restricted by a page above this one; its list applies here.</p>}
						{!restriction.data.can_manage && <p className="text-text-mid">Only the page’s creator changes who can see it.</p>}
						<p className="text-xs text-text-lo">Nobody listed means everyone in the space can see it. A listed person can always read; tick “edit” to let them change it.</p>
						<ul className="flex flex-col gap-1">
							{(meta?.people ?? [])
								.filter((p) => p.id !== meta?.me?.id)
								.map((p) => {
									const list = people ?? restriction.data?.people.map((x) => ({ id: x.id, can_edit: x.can_edit })) ?? [];
									const row = list.find((x) => x.id === p.id);
									return (
										<li key={p.id} className="flex items-center gap-3">
											<label className="flex flex-1 items-center gap-2 text-text-mid">
												<input type="checkbox" checked={!!row} disabled={!restriction.data?.can_manage} onChange={(e) => setPeople(e.target.checked ? [...list, { id: p.id, can_edit: false }] : list.filter((x) => x.id !== p.id))} />
												{p.name}
											</label>
											{row && (
												<label className="flex items-center gap-1 text-xs text-text-lo">
													<input type="checkbox" checked={row.can_edit} disabled={!restriction.data?.can_manage} onChange={(e) => setPeople(list.map((x) => (x.id === p.id ? { ...x, can_edit: e.target.checked } : x)))} /> edit
												</label>
											)}
										</li>
									);
								})}
							{(meta?.people ?? []).length <= 1 && <li className="text-text-lo">You are the only member of this space.</li>}
						</ul>
					</div>
				)}
			</Dialog>
		</article>
	);
}
