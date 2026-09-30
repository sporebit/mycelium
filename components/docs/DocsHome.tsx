"use client";

/**
 * Docs home (claude/spec-work.md §7): the doc spaces the caller can see,
 * a search over every page, and the create dialog for a new doc space.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { DocSearchHit, DocSpace } from "@/lib/work/docs";
import { docHref, fmtWhen, workFetch, WorkError } from "@/lib/work/client";
import { Empty, ErrorNote, Field, INPUT, PageHeader, SectionTitle } from "@/components/work/kit";
import { Dialog } from "@/components/work/pickers";

export function DocsHome() {
	const { data, error, mutate } = useApi<{ spaces: DocSpace[] }>("/api/work/docs/spaces");
	const [q, setQ] = useState("");
	const [debounced, setDebounced] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setDebounced(q.trim()), 250);
		return () => clearTimeout(t);
	}, [q]);
	const search = useApi<{ pages: DocSearchHit[] }>(debounced ? `/api/work/docs/pages?q=${encodeURIComponent(debounced)}` : null);

	const [create, setCreate] = useState(false);
	const [key, setKey] = useState("");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function submit() {
		if (busy) return;
		setBusy(true);
		setErr(null);
		try {
			const res = await workFetch<{ space: DocSpace }>("/api/work/docs/spaces", "POST", { key: key.trim().toUpperCase(), name: name.trim(), description: description.trim() || undefined });
			await mutate();
			setCreate(false);
			setKey("");
			setName("");
			setDescription("");
			window.location.assign(docHref(res.space.key));
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not create the doc space.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto max-w-5xl">
			<PageHeader
				title="Docs"
				actions={
					<>
						<Link href="/docs/templates" className="text-sm text-text-mid hover:text-text-hi">
							Templates
						</Link>
						<Button size="sm" variant="primary" onClick={() => setCreate(true)}>
							<Plus size={14} aria-hidden /> New doc space
						</Button>
					</>
				}
			/>
			<div className="mb-5 flex items-center gap-2 rounded-v2-md border border-hairline-strong bg-surface-0 px-3 focus-within:border-glow-dim">
				<Search size={14} aria-hidden className="shrink-0 text-text-lo" />
				<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every page…" aria-label="Search pages" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-text-hi placeholder:text-text-lo focus:outline-none" />
			</div>
			{debounced && (
				<section className="mb-6">
					<SectionTitle count={search.data?.pages.length ?? null}>Results</SectionTitle>
					{!search.data && !search.error && <Skeleton className="h-10 w-full" />}
					{search.data && search.data.pages.length === 0 && <p className="text-sm text-text-lo">No page mentions “{debounced}”.</p>}
					<ul className="flex flex-col gap-1">
						{search.data?.pages.map((p) => (
							<li key={p.id}>
								<Link href={docHref(p.doc_space_key, p.id)} className="block rounded-v2-md border border-hairline bg-surface-1 px-3 py-2 hover:border-hairline-strong">
									<span className="block text-sm text-text-hi">{p.title}</span>
									<span className="block text-xs text-text-lo">
										{p.doc_space_key} · {fmtWhen(p.updated_at)}
									</span>
									{p.excerpt && <span className="mt-1 block text-xs text-text-mid">{p.excerpt}</span>}
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}
			{error && <ErrorNote>Could not load doc spaces.</ErrorNote>}
			{!data && !error && (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
			)}
			{data && data.spaces.length === 0 && <Empty title="No doc spaces">Every space starts with one called Home.</Empty>}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{data?.spaces.map((s) => (
					<Link key={s.id} href={docHref(s.key)} className="flex flex-col gap-1 rounded-v2-lg border border-hairline bg-surface-1 p-4 hover:border-hairline-strong hover:bg-surface-2">
						<span className="flex items-center gap-2">
							<BookOpen size={14} aria-hidden className="text-text-lo" />
							<span className="min-w-0 flex-1 truncate text-sm font-medium text-text-hi">{s.name}</span>
							<span className="font-[family-name:var(--font-mono)] text-[10px] text-text-lo">{s.key}</span>
						</span>
						{s.description && <span className="line-clamp-2 text-xs text-text-mid">{s.description}</span>}
						<span className="text-[11px] text-text-lo">
							{s.page_count} {s.page_count === 1 ? "page" : "pages"} · updated {fmtWhen(s.updated_at)}
						</span>
					</Link>
				))}
			</div>

			<Dialog
				title="New doc space"
				open={create}
				onClose={() => setCreate(false)}
				footer={
					<>
						<Button size="sm" onClick={() => setCreate(false)}>
							Cancel
						</Button>
						<Button size="sm" variant="primary" loading={busy} disabled={!key.trim() || !name.trim()} onClick={() => void submit()}>
							Create
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<Field label="Key" htmlFor="ds-key" hint="Two to ten letters or digits, starting with a letter. It is in every page's address and does not change.">
						<input id="ds-key" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} maxLength={10} className={`${INPUT} font-[family-name:var(--font-mono)] uppercase`} autoFocus />
					</Field>
					<Field label="Name" htmlFor="ds-name">
						<input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
					</Field>
					<Field label="Description" htmlFor="ds-desc">
						<textarea id="ds-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={INPUT} />
					</Field>
					<ErrorNote>{err}</ErrorNote>
				</div>
			</Dialog>
		</div>
	);
}
