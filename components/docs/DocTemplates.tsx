"use client";

/**
 * Page templates (claude/spec-work.md §7): the ones made here and the
 * ones synced from docs/docs/templates. A repo template is changed in the
 * repository; editing it here makes it a UI one.
 */
import { useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { DocView } from "@/components/editor/DocView";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import type { DocTemplate } from "@/lib/work/docs";
import { fmtWhen, workFetch, WorkError } from "@/lib/work/client";
import { Empty, ErrorNote, PageHeader } from "@/components/work/kit";

export function DocTemplates() {
	const { data, error, mutate } = useApi<{ templates: DocTemplate[] }>("/api/work/docs/templates");
	const [open, setOpen] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	async function run(fn: () => Promise<unknown>) {
		setBusy(true);
		setErr(null);
		try {
			await fn();
			await mutate();
		} catch (e) {
			setErr(e instanceof WorkError ? e.message : "Could not save.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto max-w-4xl">
			<PageHeader
				crumbs={[{ label: "Docs", href: "/docs" }]}
				title="Page templates"
				sub="Pick one when a page is created. Templates in the repository under docs/docs/templates are synced here."
				actions={
					<Button size="sm" loading={busy} onClick={() => void run(() => fetch("/api/work/docs/templates?sync=1").then((r) => (r.ok ? r.json() : Promise.reject(new Error("sync failed")))))}>
						<RefreshCw size={14} aria-hidden /> Sync from the repo
					</Button>
				}
			/>
			<ErrorNote>{err ?? (error ? "Could not load templates." : null)}</ErrorNote>
			{!data && !error && <Skeleton className="h-32 w-full" />}
			{data && data.templates.length === 0 && <Empty title="No templates">Sync brings in the repository’s; a page’s menu can save it as one.</Empty>}
			<ul className="flex flex-col gap-2">
				{data?.templates.map((t) => (
					<li key={t.id} className="rounded-v2-lg border border-hairline bg-surface-1 p-3">
						<div className="flex items-center gap-2">
							<button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="min-w-0 flex-1 text-left">
								<span className="block text-sm font-medium text-text-hi">{t.name}</span>
								<span className="block text-xs text-text-lo">
									{t.slug} · {t.origin === "repo" ? "repository" : "made here"} · v{t.version} · {fmtWhen(t.updated_at)}
									{!t.shared ? " · private" : ""}
								</span>
								{t.description && <span className="mt-0.5 block text-xs text-text-mid">{t.description}</span>}
							</button>
							{t.origin === "ui" && (
								<button
									type="button"
									disabled={busy}
									onClick={() => {
										if (window.confirm(`Delete template "${t.name}"?`)) void run(() => workFetch(`/api/work/docs/templates/${encodeURIComponent(t.slug)}`, "DELETE"));
									}}
									aria-label={`Delete ${t.name}`}
									className="text-text-lo hover:text-v2-error"
								>
									<Trash2 size={14} aria-hidden />
								</button>
							)}
						</div>
						{open === t.id && (
							<div className="mt-3 rounded-v2-md border border-hairline bg-surface-0 px-4 py-3">
								{t.title && <p className="mb-2 text-sm font-semibold text-text-hi">{t.title}</p>}
								<DocView doc={t.body} variant="page" />
							</div>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
