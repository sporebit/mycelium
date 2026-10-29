/**
 * Gousto cookbook (0151): the unauthenticated JSON API the gousto.co.uk
 * cookbook pages read from, the row shapes we keep, and the conversion
 * into the app's own `recipes` row when one is saved.
 *
 * Unofficial. Gousto could change or close it; every caller treats a
 * failure as "not synced", never as data.
 */

export const GOUSTO_API = "https://production-api.gousto.co.uk/cmsreadbroker/v1";
export const GOUSTO_SITE = "https://www.gousto.co.uk/cookbook";
/** The API accepts up to 200 per page. */
export const GOUSTO_PAGE = 200;
/** Re-fetch a cached detail after this long. */
export const DETAIL_TTL_MS = 30 * 86400_000;

// Browser-shaped headers: the API is what gousto.co.uk's own pages call.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADERS = {
	accept: "application/json, text/plain, */*",
	"accept-language": "en-GB,en;q=0.9",
	"user-agent": UA,
	origin: "https://www.gousto.co.uk",
	referer: "https://www.gousto.co.uk/cookbook/recipes",
};

type GoustoImage = { image: string; width: number };
type GoustoMedia = { images?: GoustoImage[] };

export type GoustoListingEntry = {
	uid: string;
	gousto_uid: string;
	title: string;
	media?: GoustoMedia;
	rating?: { average?: number; count?: number };
	prep_times?: { for_2?: number; for_4?: number };
	url: string;
};

export type GoustoIngredient = { label?: string; name?: string; media?: GoustoMedia };
export type GoustoStep = { instruction: string; order: number; media?: GoustoMedia };
export type GoustoNutrition = Record<string, number | null | undefined>;

export type GoustoDetailEntry = GoustoListingEntry & {
	description?: string;
	cuisine?: { slug?: string; title?: string } | null;
	categories?: Array<{ title: string; url?: string }>;
	ingredients?: GoustoIngredient[];
	basics?: Array<{ title: string; slug?: string }>;
	cooking_instructions?: GoustoStep[];
	allergens?: Array<{ title?: string; name?: string } | string>;
	nutritional_information?: { per_hundred_grams?: GoustoNutrition; per_portion?: GoustoNutrition };
	seo?: { canonical?: string; description?: string };
	portion_sizes?: Array<{ portions: number; is_offered?: boolean }>;
};

/** What we keep of a detail payload — enough for the page, no SKU noise. */
export type GoustoDetail = {
	description: string | null;
	cuisine: string | null;
	categories: string[];
	ingredients: Array<{ label: string; image: string | null }>;
	basics: string[];
	steps: Array<{ order: number; html: string; text: string; image: string | null }>;
	allergens: string[];
	nutrition: { per_portion: GoustoNutrition | null; per_100g: GoustoNutrition | null };
	portions: number[];
	canonical: string | null;
};

export type GoustoRow = {
	id: string;
	space_id?: string | null;
	gousto_uid: string;
	slug: string;
	title: string;
	url: string;
	image_url: string | null;
	image_large_url: string | null;
	rating_avg: number | null;
	rating_count: number | null;
	prep_for_2: number | null;
	prep_for_4: number | null;
	cuisine: string | null;
	description: string | null;
	categories: string[];
	detail: GoustoDetail | null;
	detail_fetched_at: string | null;
	is_favourite: boolean;
	favourited_at: string | null;
	saved_recipe_id: string | null;
	last_seen_at: string;
};

/** The columns the list and the cards need. */
export const LISTING_SELECT =
	"id, space_id, gousto_uid, slug, title, url, image_url, rating_avg, rating_count, prep_for_2, prep_for_4, cuisine, categories, is_favourite, favourited_at, saved_recipe_id, detail_fetched_at, last_seen_at";

export const DETAIL_SELECT = `${LISTING_SELECT}, image_large_url, description, detail`;

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

/** The last path segment of a listing or detail url: the API's recipe key. */
export function slugOf(url: string): string {
	return url.replace(/\/+$/, "").split("/").pop() ?? "";
}

/** The image closest to `wanted` px wide, or the largest when none is as wide. */
export function pickImage(media: GoustoMedia | undefined, wanted: number): string | null {
	const images = (media?.images ?? []).filter((i) => i && typeof i.image === "string" && i.image);
	if (images.length === 0) return null;
	const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
	const atLeast = sorted.find((i) => (i.width ?? 0) >= wanted);
	return (atLeast ?? sorted[sorted.length - 1]).image;
}

export function largestImage(media: GoustoMedia | undefined): string | null {
	return pickImage(media, Number.MAX_SAFE_INTEGER);
}

/** Plain text from Gousto's step HTML: paragraphs become lines, tags go. */
export function stripHtml(html: string): string {
	return html
		.replace(/<\s*br\s*\/?>/gi, "\n")
		.replace(/<\/\s*(p|li|div)\s*>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.join("\n");
}

/** Keep only <p>, <strong>, <em>, <br> (and </…>) — the tags the steps use. */
export function safeStepHtml(html: string): string {
	return html.replace(/<(\/?)([a-z0-9]+)[^>]*>/gi, (_m, close: string, tag: string) => {
		const t = tag.toLowerCase();
		if (t === "p" || t === "strong" || t === "em" || t === "b" || t === "i") return `<${close}${t}>`;
		if (t === "br") return "<br>";
		return "";
	});
}

/** A listing entry → the columns the sync upserts (never the favourite or detail columns). */
export function summariseEntry(e: GoustoListingEntry, now = new Date()) {
	const slug = slugOf(e.url);
	return {
		gousto_uid: e.gousto_uid,
		slug,
		title: (e.title ?? "").trim() || slug,
		url: `${GOUSTO_SITE}${e.url.startsWith("/") ? e.url : `/${e.url}`}`,
		image_url: pickImage(e.media, 400),
		image_large_url: largestImage(e.media),
		rating_avg: typeof e.rating?.average === "number" ? Math.round(e.rating.average * 100) / 100 : null,
		rating_count: typeof e.rating?.count === "number" ? e.rating.count : null,
		prep_for_2: typeof e.prep_times?.for_2 === "number" ? e.prep_times.for_2 : null,
		prep_for_4: typeof e.prep_times?.for_4 === "number" ? e.prep_times.for_4 : null,
		last_seen_at: now.toISOString(),
		updated_at: now.toISOString(),
	};
}

function allergenName(a: { title?: string; name?: string } | string): string | null {
	if (typeof a === "string") return a.trim() || null;
	return (a.title ?? a.name ?? "").trim() || null;
}

/** A detail payload → what the page needs plus the listing-level columns it refreshes. */
export function toDetail(e: GoustoDetailEntry): GoustoDetail {
	const steps = [...(e.cooking_instructions ?? [])]
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
		.map((s) => ({
			order: s.order,
			html: safeStepHtml(s.instruction ?? ""),
			text: stripHtml(s.instruction ?? ""),
			image: pickImage(s.media, 400),
		}));
	const categories = (e.categories ?? []).map((c) => (c.title ?? "").trim()).filter((t) => t && t !== "All Gousto Recipes");
	return {
		description: (e.description ?? e.seo?.description ?? "").trim() || null,
		cuisine: (e.cuisine?.title ?? "").trim() || null,
		categories,
		ingredients: (e.ingredients ?? []).map((i) => ({ label: (i.label ?? i.name ?? "").trim(), image: pickImage(i.media, 200) })).filter((i) => i.label),
		basics: (e.basics ?? []).map((b) => (b.title ?? "").trim()).filter(Boolean),
		steps,
		allergens: (e.allergens ?? []).map(allergenName).filter((a): a is string => !!a),
		nutrition: {
			per_portion: e.nutritional_information?.per_portion ?? null,
			per_100g: e.nutritional_information?.per_hundred_grams ?? null,
		},
		portions: (e.portion_sizes ?? []).filter((p) => p.is_offered !== false).map((p) => p.portions),
		canonical: e.seo?.canonical ?? null,
	};
}

/** mg → g to one decimal, for the nutrition table. */
export function mgToG(v: number | null | undefined): number | null {
	return typeof v === "number" ? Math.round(v / 100) / 10 : null;
}

/**
 * The saved copy: a Gousto recipe as a row for the app's own `recipes`
 * table, so the meal planner, scaling and shopping lists treat it like
 * any recipe Phil typed in. Amounts stay empty — Gousto lists ingredients
 * by pack, not by measure.
 */
export function toRecipeRow(row: Pick<GoustoRow, "title" | "url" | "image_large_url" | "image_url" | "prep_for_2" | "cuisine">, detail: GoustoDetail) {
	const tags = Array.from(new Set(["gousto", ...detail.categories.map((c) => c.toLowerCase().replace(/\s+recipes?$/i, "").trim())].filter(Boolean)));
	return {
		title: row.title,
		source_url: detail.canonical ?? row.url,
		source_name: "Gousto",
		image_url: row.image_large_url ?? row.image_url,
		prep_time_minutes: row.prep_for_2,
		cook_time_minutes: null,
		servings: 2,
		ingredients: [
			...detail.ingredients.map((i) => ({ amount: "", unit: null, name: i.label, notes: null })),
			...detail.basics.map((b) => ({ amount: "", unit: null, name: b, notes: "from the cupboard" })),
		],
		method: detail.steps.map((s, i) => ({ step: i + 1, instruction: s.text })),
		tags,
		cuisine: detail.cuisine ?? row.cuisine,
		notes: [detail.description, detail.allergens.length > 0 ? `Allergens: ${detail.allergens.join(", ")}` : null].filter(Boolean).join("\n\n") || null,
	};
}

// ---------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------

async function goustoFetch<T>(path: string): Promise<T | null> {
	const res = await fetch(`${GOUSTO_API}${path}`, { headers: HEADERS, cache: "no-store" });
	if (res.status === 404) return null;
	if (!res.ok) {
		const snippet = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
		throw new Error(`Gousto ${res.status} on ${path}${snippet ? ` — ${snippet}` : ""}`);
	}
	const json = (await res.json()) as { status?: string; data?: T };
	if (json.status !== "ok" || !json.data) throw new Error(`Gousto answered "${json.status ?? "?"}" on ${path}`);
	return json.data;
}

export async function fetchListingPage(offset: number, limit = GOUSTO_PAGE): Promise<{ count: number; entries: GoustoListingEntry[] }> {
	const data = await goustoFetch<{ count: number; entries: GoustoListingEntry[] }>(`/recipes?limit=${limit}&offset=${offset}`);
	if (!data) return { count: 0, entries: [] };
	return { count: data.count ?? 0, entries: Array.isArray(data.entries) ? data.entries : [] };
}

export async function fetchDetail(slug: string): Promise<GoustoDetailEntry | null> {
	const data = await goustoFetch<{ entry: GoustoDetailEntry }>(`/recipe/${encodeURIComponent(slug)}`);
	return data?.entry ?? null;
}
