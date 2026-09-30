"use client";

/**
 * Page history (claude/spec-work.md §7): every version, a line diff between
 * any two, and restore, which writes the old content as a new version.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { DiffLine } from "@/lib/work/doc";
import type { DocPage, DocVersion } from "@/lib/work/docs";
import { docHref, fmtWhen, workFetch, WorkError } from "@/lib/work/client";
import { ErrorNote, PageHeader, SectionTitle } from "@/components/work/kit";

type Diff = { from: number; to: number; from_title: string; to_title: string; title_changed: boolean; lines: DiffLine[] };

export function DocHistory({ spaceKey, pageId }: { spaceKey: string; pageId: string }) {
	const router = useRouter();
	const base = `/api/work/docs/pages/${encodeURIComponent(pageId)}`;
	const page = useApi<{ page: DocPage }>(base);
	const { data, error, mutate } = useApi<{ versions: DocVersion[]; current: number }>(`${base}/versions`);
	const [a, setA] = useState<number | null>(null);
	const [b, setB] = useState<number | null>(null);
	const from = a ?? (data ? Math.max(1, data.current - 1) : null);
	const to = b ?? data?.current ?? null;
	const diff = useApi<Diff>(from && to && from !== to ? `${base}/versions?diff=${from}..${to}` : null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function restore(n: number) {
		if (!window.confirm(`Restore version ${n}? The current content stays in the history as its own version.`)) return;
		setBusy(true);
		setErr(null);
		try {
			await workFetch(`${base}/versions`, "POST", { restore: n });
			await mutate();
			router.push(docHref(spaceKey, pageId));
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not restore.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto max-w-5xl">
			<PageHeader
				crumbs={[
					{ label: "Docs", href: "/docs" },
					{ label: spaceKey, href: docHref(spaceKey) },
					{ label: page.data?.page.title || "Page", href: docHref(spaceKey, pageId) },
				]}
				title="History"
				sub={data ? `${data.versions.length} ${data.versions.length === 1 ? "version" : "versions"} · current v${data.current}` : undefined}
			/>
			<ErrorNote>{err ?? (error ? "Could not load the history." : null)}</ErrorNote>
			{!data && !error && <Skeleton className="h-40 w-full" />}
			{data && (
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
					<aside>
						<SectionTitle>Versions</SectionTitle>
						<ul className="flex flex-col gap-1">
							{data.versions.map((v) => (
								<li key={v.version} className={`rounded-v2-md border px-3 py-2 text-sm ${v.version === to ? "border-glow-dim/50 bg-glow-wash" : v.version === from ? "border-hairline-strong bg-surface-2" : "border-hairline bg-surface-1"}`}>
									<div className="flex items-center gap-2">
										<span className="font-[family-name:var(--font-mono)] text-xs text-text-lo">v{v.version}</span>
										<span className="min-w-0 flex-1 truncate text-text-hi">{v.title || "Untitled"}</span>
									</div>
									<div className="text-[11px] text-text-lo">
										{fmtWhen(v.created_at)}
										{v.author ? ` · ${v.author.name}` : ""}
										{v.note ? ` · ${v.note}` : ""}
									</div>
									<div className="mt-1 flex items-center gap-2 text-[11px]">
										<button type="button" onClick={() => setA(v.version)} className="text-text-mid hover:text-text-hi">
											from
										</button>
										<button type="button" onClick={() => setB(v.version)} className="text-text-mid hover:text-text-hi">
											to
										</button>
										{v.version !== data.current && (
											<button type="button" disabled={busy} onClick={() => void restore(v.version)} className="ml-auto text-glow hover:underline disabled:opacity-50">
												Restore
											</button>
										)}
									</div>
								</li>
							))}
						</ul>
					</aside>
					<section className="min-w-0">
						<SectionTitle>
							{from && to && from !== to ? `v${from} → v${to}` : "Pick two versions"}
						</SectionTitle>
						{diff.data?.title_changed && (
							<p className="mb-2 text-xs text-text-mid">
								Title: <s className="text-text-lo">{diff.data.from_title}</s> → {diff.data.to_title}
							</p>
						)}
						{diff.data && diff.data.lines.every((l) => l.kind === "same") && !diff.data.title_changed && <p className="text-sm text-text-lo">No difference in the text.</p>}
						{diff.data && (
							<pre className="overflow-x-auto rounded-v2-md border border-hairline bg-surface-0 p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed">
								{diff.data.lines.map((l, i) => (
									<div key={i} className={l.kind === "add" ? "bg-glow-wash text-glow" : l.kind === "del" ? "bg-v2-error/10 text-v2-error" : "text-text-mid"}>
										<span className="mr-2 inline-block w-3 select-none text-text-lo">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
										{l.text || " "}
									</div>
								))}
							</pre>
						)}
						{from === to && <p className="text-sm text-text-lo">Choose a different “from” and “to”.</p>}
						<div className="mt-3">
							<Link href={docHref(spaceKey, pageId)}>
								<Button size="sm">Back to the page</Button>
							</Link>
						</div>
					</section>
				</div>
			)}
		</div>
	);
}
