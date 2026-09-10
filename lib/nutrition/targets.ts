import type { SupabaseClient } from "@supabase/supabase-js";
import type { NutritionTargets } from "./types-v2";
import { DEFAULT_NUTRITION_TARGETS } from "./types-v2";

/**
 * Daily targets plus the versioning metadata around them.
 *
 * Targets used to be two hard-coded constants that disagreed with each
 * other — NUTRITION_TARGETS in lib/config/nutrition.ts (four macros) and
 * DEFAULT_NUTRITION_TARGETS here (eight). Both survive only as the
 * fallback when the nutrition_targets table has no row covering the date.
 */
export type ResolvedNutritionTargets = NutritionTargets & {
	/** Date this target started applying, or null when defaults are in use. */
	effective_from: string | null;
	/** When to revisit. Null = no scheduled review. */
	review_on: string | null;
	/** Upper end of the fibre range; `fibre` carries the lower end. */
	fibre_max: number | null;
	water_min_l: number | null;
	water_max_l: number | null;
	/** Where the numbers came from and what was traded off. */
	notes: string | null;
	/** False when no row matched and the hard-coded defaults are standing in. */
	is_versioned: boolean;
};

export const FALLBACK_TARGETS: ResolvedNutritionTargets = {
	...DEFAULT_NUTRITION_TARGETS,
	effective_from: null,
	review_on: null,
	fibre_max: null,
	water_min_l: null,
	water_max_l: null,
	notes: null,
	is_versioned: false,
};

type TargetRow = {
	effective_from: string;
	review_on: string | null;
	kcal: number;
	protein_g: number;
	fat_g: number;
	carbs_g: number;
	fibre_min_g: number | null;
	fibre_max_g: number | null;
	water_min_l: number | null;
	water_max_l: number | null;
	sugar_g: number | null;
	saturated_fat_g: number | null;
	salt_g: number | null;
	notes: string | null;
};

const FIELDS =
	"effective_from, review_on, kcal, protein_g, fat_g, carbs_g, fibre_min_g, fibre_max_g, water_min_l, water_max_l, sugar_g, saturated_fat_g, salt_g, notes";

function num(value: number | null, fallback: number): number {
	return typeof value === "number" ? value : fallback;
}

/**
 * Resolves the target in force on `onDate` — the row with the greatest
 * effective_from that is not in the future. Superseding a target means
 * inserting a later row, so this always reads the newest applicable one
 * and older rows stay as history.
 *
 * Never throws: a missing table, a failed query or an empty result all
 * fall back to the hard-coded defaults so the macro bars still render.
 */
export async function getNutritionTargets(
	supabase: SupabaseClient,
	onDate?: string,
): Promise<ResolvedNutritionTargets> {
	const asOf = onDate ?? new Date().toISOString().slice(0, 10);

	const { data, error } = await supabase
		.from("nutrition_targets")
		.select(FIELDS)
		.lte("effective_from", asOf)
		.order("effective_from", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error || !data) return FALLBACK_TARGETS;
	const row = data as TargetRow;

	return {
		kcal: row.kcal,
		protein: row.protein_g,
		carbs: row.carbs_g,
		fat: row.fat_g,
		fibre: num(row.fibre_min_g, DEFAULT_NUTRITION_TARGETS.fibre),
		sugar: num(row.sugar_g, DEFAULT_NUTRITION_TARGETS.sugar),
		saturated_fat: num(
			row.saturated_fat_g,
			DEFAULT_NUTRITION_TARGETS.saturated_fat,
		),
		salt: num(row.salt_g, DEFAULT_NUTRITION_TARGETS.salt),
		effective_from: row.effective_from,
		review_on: row.review_on,
		fibre_max: row.fibre_max_g,
		water_min_l: row.water_min_l,
		water_max_l: row.water_max_l,
		notes: row.notes,
		is_versioned: true,
	};
}
