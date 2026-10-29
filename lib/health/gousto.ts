/**
 * Gousto cookbook (0151): the unauthenticated JSON API the gousto.co.uk
 * cookbook pages read from, the row shapes we keep, and the conversion
 * into the app's own `recipes` row when one is saved.
 *
 * Unofficial. Gousto's edge answers a bare nginx 502 to requests from
 * cloud egress (Vercel, US and London alike) and sends no CORS headers, so
 * neither the server nor the browser can call it from production. The PC
 * script `scripts/gousto-sync.mjs` fetches from a residential connection
 * and posts the raw payloads to /api/health/gousto/ingest and
 * /api/health/gousto/[slug]/detail; everything here is pure shaping.
 */

export const GOUSTO_API = "https://production-api.gousto.co.uk/cmsreadbroker/v1";
export const GOUSTO_SITE = "https://www.gousto.co.uk/cookbook";
/** Pages above ~50 entries (~1 MB) get a bare nginx 502 from Gousto's edge. */
export const GOUSTO_PAGE = 50;
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
	// "Chicken" and "Chicken Recipes" are one category (0155): keep the short form, once
	const categories = Array.from(
		new Set((e.categories ?? []).map((c) => (c.title ?? "").trim().replace(/\s+Recipes$/i, "")).filter((t) => t && t !== "All Gousto")),
	);
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
