"use client";

/**
 * A doc space (claude/spec-work.md §7): the page tree on the left, one page
 * on the right. With no page in the URL the space's home page shows. The
 * page itself is DocPageView; the tree is where pages are made, moved and
 * found.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Plus } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { DocPage, DocSpace, DocTemplate, DocTreeNode } from "@/lib/work/docs";
import { docHref, useWorkPrefs, workFetch, WorkError } from "@/lib/work/client";
import { Empty, ErrorNote, Field, INPUT, PageHeader } from "@/components/work/kit";
import { Dialog, Picker } from "@/components/work/pickers";
import { DocPageView } from "./DocPageView";

type SpacePayload = { space: DocSpace; tree: DocTreeNode[] };

export const spaceKeyOf = (key: string) => `/api/work/docs/spaces/${encodeURIComponent(key)}`;
export const pageKeyOf = (id: string) => `/api/work/docs/pages/${encodeURIComponent(id)}`;

function TreeNode({ node, spaceKey, activeId, depth, open, toggle }: { node: DocTreeNode; spaceKey: string; activeId: string | null; depth: number; open: Set<string>; toggle: (id: string) => void }) {
	const isOpen = open.has(node.id);
	const active = node.id === activeId;
	return (
		<li>
			<div className={`flex items-center gap-1 rounded-v2-sm pr-1 ${active ? "bg-glow-wash text-text-hi" : "text-text-mid hover:bg-surface-2 hover:text-text-hi"}`} style={{ paddingLeft: depth * 12 }}>
				{node.children.length > 0 ? (
					<button type="button" onClick={() => toggle(node.id)} aria-label={isOpen ? "Collapse" : "Expand"} className="shrink-0 p-1 text-text-lo hover:text-text-hi">
						{isOpen ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
					</button>
				) : (
					<span className="w-5 shrink-0" />
				)}
				<Link href={docHref(spaceKey, node.id)} aria-current={active ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-1 truncate py-1 text-[13px]">
					<span className="truncate">{node.title || "Untitled"}</span>
					{node.restricted && <Lock size={10} aria-label="Restricted" className="shrink-0 text-text-lo" />}
				</Link>
			</div>
			{isOpen && node.children.length > 0 && (
				<ul>
					{node.children.map((c) => (
						<TreeNode key={c.id} node={c} spaceKey={spaceKey} activeId={activeId} depth={depth + 1} open={open} toggle={toggle} />
					))}
				</ul>
			)}
		</li>
	);
}

function pathTo(tree: DocTreeNode[], id: string): string[] | null {
	for (const n of tree) {
		if (n.id === id) return [n.id];
		const p = pathTo(n.children, id);
		if (p) return [n.id, ...p];
	}
	return null;
}

function flatten(tree: DocTreeNode[], depth = 0): Array<{ id: string; title: string; depth: number }> {
	return tree.flatMap((n) => [{ id: n.id, title: n.title, depth }, ...flatten(n.children, depth + 1)]);
}

export function DocSpaceView({ spaceKey, pageId }: { spaceKey: string; pageId: string | null }) {
	const router = useRouter();
	const { data, error, mutate } = useApi<SpacePayload>(spaceKeyOf(spaceKey));
	const { work, setWork, isLoading: prefsLoading } = useWorkPrefs();
	const activeId = pageId ?? data?.space.home_page_id ?? null;
	const { data: pageData, error: pageError, mutate: mutatePage } = useApi<{ page: DocPage }>(activeId ? pageKeyOf(activeId) : null);

	// the last doc space opened (ui_prefs.work.doc_space)
	useEffect(() => {
		if (!prefsLoading && data && work.doc_space !== data.space.key) void setWork({ doc_space: data.space.key });
		// only when the space changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.space.key, prefsLoading]);

	const [open, setOpen] = useState<Set<string>>(new Set());
	const [openedFor, setOpenedFor] = useState<string | null>(null);
	// open the branch that holds the active page
	if (data && activeId && openedFor !== activeId) {
		setOpenedFor(activeId);
		const p = pathTo(data.tree, activeId);
		if (p) setOpen((o) => new Set([...o, ...p]));
	}
	const toggle = (id: string) =>
		setOpen((o) => {
			const n = new Set(o);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});

	const [create, setCreate] = useState<{ parent: string | null } | null>(null);
	const [title, setTitle] = useState("");
	const [template, setTemplate] = useState<string | null>(null);
	const templates = useApi<{ templates: DocTemplate[] }>(create ? "/api/work/docs/templates" : null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function createPage() {
		if (!create || busy || !data) return;
		setBusy(true);
		setErr(null);
		try {
			const res = await workFetch<{ page: DocPage }>("/api/work/docs/pages", "POST", { doc_space: data.space.key, parent_id: create.parent, title: title.trim() || undefined, template: template ?? undefined });
			await mutate();
			setCreate(null);
			setTitle("");
			setTemplate(null);
			router.push(docHref(data.space.key, res.page.id));
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not create the page.");
		} finally {
			setBusy(false);
		}
	}

	const flat = useMemo(() => (data ? flatten(data.tree) : []), [data]);

	if (error) {
		return (
			<div className="mx-auto max-w-3xl">
				<Link href="/docs" className="text-xs text-text-mid hover:text-glow">
					← Docs
				</Link>
				<ErrorNote>{(error as { status?: number }).status === 404 ? `No doc space "${spaceKey}".` : "Could not load this doc space."}</ErrorNote>
			</div>
		);
	}
	if (!data) {
		return (
			<div className="mx-auto max-w-6xl">
				<Skeleton className="mb-3 h-7 w-56" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-6xl">
			<PageHeader
				crumbs={[{ label: "Docs", href: "/docs" }]}
				title={
					<span className="inline-flex items-center gap-2">
						{data.space.name}
						<span className="font-[family-name:var(--font-mono)] text-xs font-normal text-text-lo">{data.space.key}</span>
					</span>
				}
				sub={data.space.description ?? undefined}
				actions={
					<Button size="sm" variant="primary" onClick={() => setCreate({ parent: activeId })}>
						<Plus size={14} aria-hidden /> New page
					</Button>
				}
			/>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
				<aside className="min-w-0">
					<nav aria-label="Pages" className="rounded-v2-lg border border-hairline bg-surface-1 p-2">
						{data.tree.length === 0 ? (
							<p className="px-2 py-2 text-xs text-text-lo">No pages yet.</p>
						) : (
							<ul className="flex flex-col gap-0.5">
								{data.tree.map((n) => (
									<TreeNode key={n.id} node={n} spaceKey={data.space.key} activeId={activeId} depth={0} open={open} toggle={toggle} />
								))}
							</ul>
						)}
						<button type="button" onClick={() => setCreate({ parent: null })} className="mt-1 flex w-full items-center gap-1 rounded-v2-sm px-2 py-1.5 text-left text-xs text-text-lo hover:bg-surface-2 hover:text-text-hi">
							<Plus size={12} aria-hidden /> Top-level page
						</button>
					</nav>
				</aside>
				<div className="min-w-0">
					{!activeId && (
						<Empty
							title="No home page"
							action={
								<Button size="sm" variant="primary" onClick={() => setCreate({ parent: null })}>
									Create the first page
								</Button>
							}
						>
							A doc space opens on its home page. Make one, then pick it as home from the page’s menu.
						</Empty>
					)}
					{activeId && pageError && <ErrorNote>{(pageError as { status?: number }).status === 404 ? "No such page, or it is restricted." : "Could not load the page."}</ErrorNote>}
					{activeId && !pageData && !pageError && <Skeleton className="h-64 w-full" />}
					{pageData && (
						<DocPageView
							page={pageData.page}
							space={data.space}
							siblings={flat}
							onChanged={async () => {
								await Promise.all([mutatePage(), mutate()]);
							}}
							onNewChild={() => setCreate({ parent: pageData.page.id })}
						/>
					)}
				</div>
			</div>

			<Dialog
				title={create?.parent ? "New page under this one" : "New page"}
				open={!!create}
				onClose={() => setCreate(null)}
				footer={
					<>
						<Button size="sm" onClick={() => setCreate(null)}>
							Cancel
						</Button>
						<Button size="sm" variant="primary" loading={busy} onClick={() => void createPage()}>
							Create
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<Field label="Title" htmlFor="page-title">
						<input
							id="page-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") void createPage();
							}}
							className={INPUT}
							autoFocus
							placeholder="Untitled"
						/>
					</Field>
					<Field label="Template" hint="A template fills the title and body you leave empty.">
						<Picker label="Template" options={(templates.data?.templates ?? []).map((t) => ({ value: t.slug, label: t.name, hint: t.origin === "repo" ? "repo" : undefined }))} value={template} onChange={setTemplate} placeholder="Blank page" clearable />
					</Field>
					<ErrorNote>{err}</ErrorNote>
				</div>
			</Dialog>
		</div>
	);
}
