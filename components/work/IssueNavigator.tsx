"use client";

/**
 * The issue navigator (claude/spec-work.md §5): the filter bar over a
 * paged list. The query lives in the URL (`?jql=` or `?filter=<slug>`) so
 * a search is a link; the last query and the bar / JQL choice are kept
 * in ui_prefs.work for the next visit with no URL.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { parseJql } from "@/lib/work/jql";
import { toJql, type WorkQuery } from "@/lib/work/query";
import { searchPath, useWorkMeta, useWorkPrefs } from "@/lib/work/client";
import type { SavedFilter, SearchResult, WorkTicket } from "@/lib/work/types";
import { FilterBar, type FilterMode } from "./FilterBar";
import { Empty, ErrorNote, IssueRow, PageHeader } from "./kit";
import { CreateDialog } from "./QuickCreate";

const PAGE = 50;
const NONE: WorkQuery = { where: null, orderBy: [] };

function safeParse(jql: string, labelFields: string[]): WorkQuery | null {
	try {
		return parseJql(jql, { labelFields });
	} catch {
		return null;
	}
}

export function IssueNavigator() {
	const router = useRouter();
	const params = useSearchParams();
	const { meta } = useWorkMeta();
	const { work, setWork, isLoading: prefsLoading } = useWorkPrefs();
	const labelFields = useMemo(() => (meta?.label_fields ?? []).map((f) => f.slug), [meta]);

	const urlJql = params.get("jql");
	const urlFilter = params.get("filter");
	const filter: SavedFilter | null = useMemo(() => (urlFilter && meta ? (meta.filters.find((f) => f.slug === urlFilter || f.id === urlFilter) ?? null) : null), [urlFilter, meta]);

	// the query: the URL first, then the saved filter it names, then the last one used
	const jql = urlJql ?? filter?.jql ?? (urlFilter ? "" : work.issues_jql);
	const query = useMemo<WorkQuery>(() => (meta ? (safeParse(jql, labelFields) ?? NONE) : NONE), [jql, labelFields, meta]);
	// the bar / JQL choice: what was picked here, else the saved preference
	const [modeOverride, setModeOverride] = useState<FilterMode | null>(null);
	const mode: FilterMode = modeOverride ?? work.issues_mode;

	const setQuery = useCallback(
		(q: WorkQuery) => {
			const next = toJql(q);
			const sp = new URLSearchParams();
			if (urlFilter) sp.set("filter", urlFilter);
			if (next) sp.set("jql", next);
			router.replace(`/work/issues${sp.toString() ? `?${sp}` : ""}`);
			void setWork({ issues_jql: next });
		},
		[router, urlFilter, setWork],
	);
	const setFilter = useCallback(
		(f: SavedFilter | null) => {
			router.replace(f ? `/work/issues?filter=${encodeURIComponent(f.slug)}` : "/work/issues");
			void setWork({ issues_jql: f ? f.jql : "" });
		},
		[router, setWork],
	);
	const setMode = useCallback(
		(m: FilterMode) => {
			setModeOverride(m);
			void setWork({ issues_mode: m });
		},
		[setWork],
	);

	// pages loaded so far, reset when the query changes
	const [paging, setPaging] = useState({ jql, pages: 1 });
	const pages = paging.jql === jql ? paging.pages : 1;
	const setPages = (f: (p: number) => number) => setPaging({ jql, pages: f(pages) });
	const [create, setCreate] = useState(false);

	const ready = !!meta && !prefsLoading;
	const first = useApi<SearchResult>(ready ? searchPath(query, PAGE, 0) : null);
	const more = useApi<SearchResult>(ready && pages > 1 ? searchPath(query, PAGE * (pages - 1), PAGE) : null);
	const tickets: WorkTicket[] = useMemo(() => [...(first.data?.tickets ?? []), ...(more.data?.tickets ?? [])], [first.data, more.data]);
	const total = first.data?.total ?? 0;
	const error = first.error ?? more.error;

	return (
		<div className="mx-auto max-w-6xl">
			<PageHeader
				title="Issues"
				sub={first.data ? `${total} ${total === 1 ? "issue" : "issues"}` : undefined}
				actions={
					<Button size="sm" variant="primary" onClick={() => setCreate(true)}>
						<Plus size={14} aria-hidden /> Create
					</Button>
				}
			/>
			<FilterBar query={query} onChange={setQuery} mode={mode} onMode={setMode} filter={filter} onFilter={setFilter} />
			<div className="mt-3 flex flex-col gap-1">
				{error && <ErrorNote>{error instanceof Error ? error.message : "Search failed."}</ErrorNote>}
				{!first.data && !error && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
				{first.data && tickets.length === 0 && (
					<Empty
						title="No issues match"
						action={
							<Button size="sm" variant="primary" onClick={() => setCreate(true)}>
								Create one
							</Button>
						}
					>
						Widen the filter, or clear it to see everything.
					</Empty>
				)}
				{tickets.map((t) => (
					<IssueRow key={t.id} ticket={t} showProject />
				))}
				{first.data && tickets.length < total && (
					<div className="flex justify-center py-2">
						<Button size="sm" loading={more.isLoading} onClick={() => setPages((p) => p + 1)}>
							Show more ({total - tickets.length} left)
						</Button>
					</div>
				)}
			</div>
			<CreateDialog open={create} onClose={() => setCreate(false)} />
		</div>
	);
}
