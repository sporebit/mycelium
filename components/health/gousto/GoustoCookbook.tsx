"use client";

/**
 * The Gousto cookbook (0151): every Gousto recipe, searchable, with a
 * heart per card. The index is filled by `npm run gousto:sync` on the PC
 * (Gousto refuses cloud egress, so there is no sync button here). The
 * detail page is GoustoRecipePage.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { apiWrite, jsonBody, reportApiError } from "@/lib/data/apiWrite";
import { RECIPES_INPUT_CLS } from "@/lib/health/recipes";
import type { GoustoRow } from "@/lib/health/gousto";

type Payload = {
	recipes: GoustoRow[];
	matched: number;
	total: number;
	favourites: number;
	cuisines: Array<{ name: string; count: number }>;
	/** Gousto's categories, filled as the PC sync pulls details (0154). */
	categories: Array<{ name: string; count: number }>;
	last_synced_at: string | null;
};

const PAGE = 60;
const SORTS = [
	{ value: "popular", label: "Popular" },
	{ value: "rating", label: "Top rated" },
	{ value: "newest", label: "Newest" },
	{ value: "title", label: "A–Z" },
] as const;

function useDebounced<T>(value: T, ms: number): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return v;
}

export function listKey(opts: { q: string; favourites: boolean; cuisine: string; category: string; sort: string; offset: number }) {
	const sp = new URLSearchParams();
	if (opts.q) sp.set("q", opts.q);
	if (opts.favourites) sp.set("favourites", "1");
	if (opts.cuisine) sp.set("cuisine", opts.cuisine);
	if (opts.category) sp.set("category", opts.category);
	if (opts.sort !== "popular") sp.set("sort", opts.sort);
	sp.set("limit", String(PAGE));
	if (opts.offset) sp.set("offset", String(opts.offset));
	return `/api/health/gousto?${sp.toString()}`;
}

export function Heart({ on, onToggle, size = 16, className = "" }: { on: boolean; onToggle: () => void; size?: number; className?: string }) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onToggle();
			}}
			aria-pressed={on}
			aria-label={on ? "Remove from favourites" : "Add to favourites"}
			title={on ? "Favourited" : "Favourite"}
			className={`inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${on ? "text-[#f5b56d]" : "text-ink-3 hover:text-[#f5b56d]"} ${className}`}
		>
			<svg width={size} height={size} viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
				<path d="M12 21s-7-4.6-9.3-9A5.2 5.2 0 0 1 12 6.3 5.2 5.2 0 0 1 21.3 12C19 16.4 12 21 12 21z" />
			</svg>
		</button>
	);
}

export function Stars({ avg, count }: { avg: number | null; count: number | null }) {
	if (avg == null) return null;
	return (
		<span className="inline-flex items-center gap-1 text-[10px] text-ink-3 font-[family-name:var(--font-mono)]" title={count != null ? `${avg} from ${count} ratings` : `${avg}`}>
			<span className="text-[#f5b56d]">★</span>
			{avg.toFixed(1)}
			{count != null && <span className="text-ink-3/70">({count.toLocaleString()})</span>}
		</span>
	);
}

export function GoustoCookbook() {
	const [search, setSearch] = useState("");
	const q = useDebounced(search.trim(), 250);
	const [favourites, setFavourites] = useState(false);
	const [cuisine, setCuisine] = useState("");
	const [category, setCategory] = useState("");
	const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("popular");
	const [offset, setOffset] = useState(0);
	// a filter change starts again from the first page
	const withReset =
		<T,>(set: (v: T) => void) =>
		(v: T) => {
			set(v);
			setOffset(0);
		};
	const changeSearch = withReset(setSearch);
	const changeFavourites = withReset(setFavourites);
	const changeCuisine = withReset(setCuisine);
	const changeCategory = withReset(setCategory);
	const changeSort = withReset(setSort);

	const key = listKey({ q, favourites, cuisine, category, sort, offset });
	const { data, isLoading, mutate } = useApi<Payload>(key);
	const recipes = data?.recipes ?? [];

	async function toggle(r: GoustoRow) {
		const next = !r.is_favourite;
		await mutate((cur) => (cur ? { ...cur, favourites: cur.favourites + (next ? 1 : -1), recipes: cur.recipes.map((x) => (x.id === r.id ? { ...x, is_favourite: next } : x)) } : cur), { revalidate: false });
		try {
			await apiWrite(`/api/health/gousto/${encodeURIComponent(r.slug)}`, { method: "PATCH", ...jsonBody({ is_favourite: next }) });
			if (favourites) await mutate();
		} catch (e) {
			reportApiError(e, "Could not update the favourite");
			await mutate();
		}
	}

	const cuisines = useMemo(() => data?.cuisines ?? [], [data]);
	const categories = useMemo(() => data?.categories ?? [], [data]);
	const empty = !isLoading && data && data.total === 0;
	const pages = data ? Math.max(1, Math.ceil(data.matched / PAGE)) : 1;
	const page = Math.floor(offset / PAGE) + 1;

	return (
		<div className="max-w-5xl mx-auto">
			<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
				<div>
					<h1 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic">Gousto cookbook</h1>
					<p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.12em] mt-0.5">
						{data ? `${data.total.toLocaleString()} RECIPES · ${data.favourites} FAVOURITE${data.favourites === 1 ? "" : "S"}` : "…"}
						{data?.last_synced_at ? ` · SYNCED ${new Date(data.last_synced_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
					</p>
				</div>
				<Link href="/health/recipes" className="text-[10px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.18em]">
					MY RECIPES
				</Link>
			</div>

			{empty ? (
				<div className="text-center py-16">
					<p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">Nothing here yet.</p>
					<p className="text-xs text-ink-3 mt-1">
						Gousto refuses requests from cloud servers, so the cookbook is pulled from the PC: <code className="font-[family-name:var(--font-mono)] text-ink-4">npm run gousto:sync</code> in the Mycelium repo fills the index in about a minute and the recipe details after it.
					</p>
				</div>
			) : (
				<>
					<input value={search} onChange={(e) => changeSearch(e.target.value)} placeholder="Search Gousto recipes…" className={`${RECIPES_INPUT_CLS} mb-3`} aria-label="Search Gousto recipes" />
					<div className="flex flex-wrap items-center gap-1 mb-4">
						<button type="button" onClick={() => changeFavourites(false)} className={`px-2 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] border transition-colors ${!favourites ? "border-accent bg-accent/10 text-accent" : "border-hairline text-ink-3"}`}>
							All
						</button>
						<button type="button" onClick={() => changeFavourites(true)} className={`px-2 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] border transition-colors ${favourites ? "border-[#f5b56d] bg-[#f5b56d]/10 text-[#f5b56d]" : "border-hairline text-ink-3"}`}>
							♥ Favourites{data ? ` ${data.favourites}` : ""}
						</button>
						<span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
						<select value={cuisine} onChange={(e) => changeCuisine(e.target.value)} aria-label="Cuisine" className="bg-ink-0/40 border border-ink-2 rounded-full text-[10px] text-ink-4 px-2 py-1 font-[family-name:var(--font-mono)] outline-none">
							<option value="">Any cuisine</option>
							{cuisines.map((c) => (
								<option key={c.name} value={c.name}>
									{c.name} ({c.count})
								</option>
							))}
						</select>
						{categories.length > 0 && (
							<select value={category} onChange={(e) => changeCategory(e.target.value)} aria-label="Category" className="bg-ink-0/40 border border-ink-2 rounded-full text-[10px] text-ink-4 px-2 py-1 font-[family-name:var(--font-mono)] outline-none max-w-[12rem]">
								<option value="">Any category</option>
								{categories.map((c) => (
									<option key={c.name} value={c.name}>
										{c.name} ({c.count})
									</option>
								))}
							</select>
						)}
						<select value={sort} onChange={(e) => changeSort(e.target.value as (typeof SORTS)[number]["value"])} aria-label="Sort" className="bg-ink-0/40 border border-ink-2 rounded-full text-[10px] text-ink-4 px-2 py-1 font-[family-name:var(--font-mono)] outline-none">
							{SORTS.map((s) => (
								<option key={s.value} value={s.value}>
									{s.label}
								</option>
							))}
						</select>
						{data && <span className="ml-auto text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">{data.matched.toLocaleString()} MATCH{data.matched === 1 ? "" : "ES"}</span>}
					</div>

					{isLoading && !data ? (
						<p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">Loading…</p>
					) : recipes.length === 0 ? (
						<p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">{favourites ? "No favourites yet. Tap the heart on a recipe." : "Nothing matches."}</p>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{recipes.map((r) => (
								<Link key={r.id} href={`/health/recipes/gousto/${encodeURIComponent(r.slug)}`} className="group relative rounded-xl border border-hairline overflow-hidden hover:border-ink-3 transition-colors">
									<div className="h-36 w-full bg-cover bg-center bg-ink-1" style={r.image_url ? { backgroundImage: `url(${r.image_url})` } : undefined} />
									<Heart on={r.is_favourite} onToggle={() => void toggle(r)} className="absolute top-2 right-2 bg-black/50 backdrop-blur" />
									{r.saved_recipe_id && <span className="absolute top-2 left-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-[#5de8e0] font-[family-name:var(--font-mono)]">SAVED</span>}
									<div className="p-3">
										<p className="text-sm text-ink-4 font-[family-name:var(--font-display)] group-hover:text-text-0 transition-colors line-clamp-2">{r.title}</p>
										<div className="flex items-center gap-2 mt-1 text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
											<Stars avg={r.rating_avg} count={r.rating_count} />
											{r.prep_for_2 != null && <span>{r.prep_for_2}m</span>}
											{r.cuisine && <span className="truncate">{r.cuisine}</span>}
										</div>
									</div>
								</Link>
							))}
						</div>
					)}

					{pages > 1 && (
						<div className="flex items-center justify-center gap-3 py-5 text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
							<button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={page <= 1} className="px-2 py-1 rounded-v2-md border border-hairline hover:text-ink-4 disabled:opacity-40">
								← PREV
							</button>
							<span>
								PAGE {page} / {pages}
							</span>
							<button type="button" onClick={() => setOffset(offset + PAGE)} disabled={page >= pages} className="px-2 py-1 rounded-v2-md border border-hairline hover:text-ink-4 disabled:opacity-40">
								NEXT →
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
