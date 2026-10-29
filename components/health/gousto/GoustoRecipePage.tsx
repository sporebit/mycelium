"use client";

/**
 * One Gousto recipe (0151): the cached detail (filled by the PC sync),
 * the heart, and "save to my recipes", which copies it into the app's own
 * recipes table and sends you there.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { apiWrite, jsonBody, reportApiError } from "@/lib/data/apiWrite";
import { mgToG, type GoustoRow } from "@/lib/health/gousto";
import { Heart, Stars } from "./GoustoCookbook";

type Payload = { recipe: GoustoRow; needs_detail?: boolean; error?: string };

const NUTRITION: Array<{ key: string; label: string; unit: "kcal" | "g" }> = [
	{ key: "energy_kcal", label: "Energy", unit: "kcal" },
	{ key: "fat_mg", label: "Fat", unit: "g" },
	{ key: "fat_saturates_mg", label: "of which saturates", unit: "g" },
	{ key: "carbs_mg", label: "Carbohydrate", unit: "g" },
	{ key: "carbs_sugars_mg", label: "of which sugars", unit: "g" },
	{ key: "fibre_mg", label: "Fibre", unit: "g" },
	{ key: "protein_mg", label: "Protein", unit: "g" },
	{ key: "salt_mg", label: "Salt", unit: "g" },
];

export function GoustoRecipePage({ slug }: { slug: string }) {
	const router = useRouter();
	const key = `/api/health/gousto/${encodeURIComponent(slug)}`;
	const { data, error, isLoading, mutate } = useApi<Payload>(key);
	const r = data?.recipe ?? null;
	const [saving, setSaving] = useState(false);

	async function toggle() {
		if (!r) return;
		const next = !r.is_favourite;
		await mutate((cur) => (cur ? { ...cur, recipe: { ...cur.recipe, is_favourite: next } } : cur), { revalidate: false });
		try {
			await apiWrite(key, { method: "PATCH", ...jsonBody({ is_favourite: next }) });
		} catch (e) {
			reportApiError(e, "Could not update the favourite");
			await mutate();
		}
	}

	async function save() {
		if (!r || saving) return;
		setSaving(true);
		try {
			const res = await apiWrite<{ recipe_id: string; already: boolean }>(`${key}/save`, { method: "POST" });
			await mutate();
			router.push(`/health/recipes/${res.recipe_id}`);
		} catch (e) {
			reportApiError(e, "Could not save the recipe");
		} finally {
			setSaving(false);
		}
	}

	if (isLoading && !data) {
		return <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">Loading…</p>;
	}
	if (error || !r) {
		const status = (error as { status?: number } | undefined)?.status;
		return (
			<div className="max-w-3xl mx-auto">
				<Link href="/health/recipes/gousto" className="text-[10px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.18em]">
					← GOUSTO COOKBOOK
				</Link>
				<p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">{status === 404 ? "No such recipe. Run the Gousto sync on the PC first." : "Could not load this recipe."}</p>
			</div>
		);
	}

	const d = r.detail;
	const perPortion = d?.nutrition.per_portion ?? null;
	const prep = r.prep_for_2 != null ? `${r.prep_for_2} min${r.prep_for_4 != null && r.prep_for_4 !== r.prep_for_2 ? ` (for 4: ${r.prep_for_4})` : ""}` : null;

	return (
		<div className="max-w-3xl mx-auto">
			<div className="flex items-center justify-between mb-3">
				<Link href="/health/recipes/gousto" className="text-[10px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.18em]">
					← GOUSTO COOKBOOK
				</Link>
				<div className="flex items-center gap-2">
					<Heart on={r.is_favourite} onToggle={() => void toggle()} size={18} />
					{!d ? null : r.saved_recipe_id ? (
						<Link href={`/health/recipes/${r.saved_recipe_id}`} className="px-3 py-1.5 rounded-v2-md border border-[#5de8e0]/40 bg-[#5de8e0]/10 text-[#5de8e0] text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em]">
							OPEN SAVED COPY
						</Link>
					) : (
						<button type="button" onClick={() => void save()} disabled={saving} className="px-3 py-1.5 rounded-v2-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors disabled:opacity-60">
							{saving ? "SAVING…" : "SAVE TO MY RECIPES"}
						</button>
					)}
				</div>
			</div>

			{(r.image_large_url ?? r.image_url) && <div className="h-56 sm:h-72 w-full rounded-xl bg-cover bg-center bg-ink-1 mb-4" style={{ backgroundImage: `url(${r.image_large_url ?? r.image_url})` }} role="img" aria-label={r.title} />}

			<h1 className="text-xl text-text-0 font-[family-name:var(--font-display)] italic">{r.title}</h1>
			<div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
				<Stars avg={r.rating_avg} count={r.rating_count} />
				{prep && <span>{prep}</span>}
				{(d?.cuisine ?? r.cuisine) && <span>{d?.cuisine ?? r.cuisine}</span>}
				{d?.portions && d.portions.length > 0 && <span>serves {d.portions.join(" / ")}</span>}
				<a href={d?.canonical ?? r.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
					gousto.co.uk ↗
				</a>
			</div>
			{!d && (
				<p className="text-xs text-[#f5b56d] mt-3">
					The ingredients and method for this recipe have not been pulled yet. Run <code className="font-[family-name:var(--font-mono)]">npm run gousto:sync</code> on the PC (favourites are fetched first), or read it on gousto.co.uk.
				</p>
			)}
			{(d?.description ?? r.description) && <p className="text-sm text-ink-4 mt-3 leading-relaxed">{d?.description ?? r.description}</p>}
			{d && d.categories.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-3">
					{d.categories.map((c) => (
						<span key={c} className="px-1.5 py-0.5 rounded-full bg-[#5de8e0]/10 text-[#5de8e0] text-[9px] font-[family-name:var(--font-mono)]">
							{c}
						</span>
					))}
				</div>
			)}

			{d && (
				<div className="grid grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)] gap-6 mt-6">
					<aside>
						<h2 className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">In the box</h2>
						<ul className="flex flex-col gap-1.5">
							{d.ingredients.map((i, idx) => (
								<li key={`${i.label}-${idx}`} className="flex items-center gap-2 text-sm text-ink-4">
									<span className="h-7 w-7 shrink-0 rounded-full bg-cover bg-center bg-ink-1" style={i.image ? { backgroundImage: `url(${i.image})` } : undefined} aria-hidden />
									<span>{i.label}</span>
								</li>
							))}
						</ul>
						{d.basics.length > 0 && (
							<>
								<h2 className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)] mt-4 mb-2">From your cupboard</h2>
								<p className="text-sm text-ink-4">{d.basics.join(", ")}</p>
							</>
						)}
						{d.allergens.length > 0 && (
							<>
								<h2 className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)] mt-4 mb-2">Allergens</h2>
								<p className="text-sm text-[#f5b56d]">{d.allergens.join(", ")}</p>
							</>
						)}
						{perPortion && (
							<>
								<h2 className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)] mt-4 mb-2">Per portion</h2>
								<table className="w-full text-xs text-ink-4">
									<tbody>
										{NUTRITION.map((n) => {
											const raw = perPortion[n.key];
											if (typeof raw !== "number") return null;
											const v = n.unit === "kcal" ? raw : mgToG(raw);
											return (
												<tr key={n.key} className="border-t border-hairline">
													<td className={`py-1 ${n.label.startsWith("of which") ? "pl-3 text-ink-3" : ""}`}>{n.label}</td>
													<td className="py-1 text-right font-[family-name:var(--font-mono)] tabular-nums">
														{v} {n.unit}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</>
						)}
					</aside>
					<section>
						<h2 className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">Method</h2>
						<ol className="flex flex-col gap-4">
							{d.steps.map((s, i) => (
								<li key={s.order ?? i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
									<span className="text-lg text-accent font-[family-name:var(--font-display)] italic leading-none pt-0.5">{i + 1}</span>
									<div>
										{s.image && <div className="h-28 w-full max-w-xs rounded-lg bg-cover bg-center bg-ink-1 mb-2" style={{ backgroundImage: `url(${s.image})` }} aria-hidden />}
										{/* safeStepHtml allowed only p / strong / em / br through */}
										<div className="text-sm text-ink-4 leading-relaxed [&_p]:mb-1.5 [&_strong]:text-text-0" dangerouslySetInnerHTML={{ __html: s.html }} />
									</div>
								</li>
							))}
						</ol>
					</section>
				</div>
			)}
		</div>
	);
}
