-- Migration: nutrition_targets — daily macro targets versioned by an
-- effective-from date, with an optional review date.
--
-- Until now targets were two disagreeing hard-coded constants:
-- NUTRITION_TARGETS in lib/config/nutrition.ts (four macros, read by the
-- dashboard card) and DEFAULT_NUTRITION_TARGETS in lib/nutrition/types-v2.ts
-- (eight, read by MacroBar and the history view). Neither could express a
-- target that starts on a date and is reviewed on another, which is what
-- the PTP nutrition plan requires.
--
-- Reads resolve to the row with the greatest effective_from <= today; the
-- constants above survive only as a fallback when no row matches.
-- Superseding a target means inserting a new row, never updating an old
-- one, so the history of what was being eaten toward stays intact.
--
-- Depends on: nothing (self-contained); follows the RLS/grant pattern in 0092.
-- Rollback:
--   DROP TABLE nutrition_targets;

create table if not exists nutrition_targets (
	id             uuid        primary key default gen_random_uuid(),
	user_id        text        not null,
	-- The day this target starts applying. One row per user per date.
	effective_from date        not null,
	-- When to revisit. Surfaced to the nutritionist agent and used to
	-- schedule the review reminder. Null = no scheduled review.
	review_on      date,
	kcal           numeric     not null,
	protein_g      numeric     not null,
	fat_g          numeric     not null,
	carbs_g        numeric     not null,
	-- Fibre and water are ranges in the plan rather than point targets.
	-- Min is what the progress bars read; max is guidance.
	fibre_min_g    numeric,
	fibre_max_g    numeric,
	water_min_l    numeric,
	water_max_l    numeric,
	-- Carried over from DEFAULT_NUTRITION_TARGETS so the nutrient detail
	-- panel keeps all eight denominators from one source.
	sugar_g        numeric,
	saturated_fat_g numeric,
	salt_g         numeric,
	-- Free text: where the numbers came from and what was traded off.
	notes          text,
	created_at     timestamptz not null default now(),
	unique (user_id, effective_from)
);

alter table nutrition_targets enable row level security;
create policy "deny all" on nutrition_targets as restrictive using (false);

create index if not exists nutrition_targets_user_effective_idx
	on nutrition_targets (user_id, effective_from desc);

grant all on nutrition_targets to service_role;

-- Seed the PTP targets. Written by Kirsty September 2026, protein raised
-- from 150 g to 200 g by Phil with the deficit taken out of carbs
-- (320 g -> 270 g). Provisional: review three weeks in.
insert into nutrition_targets (
	user_id, effective_from, review_on,
	kcal, protein_g, fat_g, carbs_g,
	fibre_min_g, fibre_max_g, water_min_l, water_max_l,
	sugar_g, saturated_fat_g, salt_g,
	notes
)
select
	coalesce(current_setting('app.user_id', true), 'phil'),
	date '2026-09-07', date '2026-09-28',
	2600, 200, 80, 270,
	30, 35, 2.5, 3.0,
	50, 20, 6,
	'PTP Phase 1. Basis ~80kg, 5''10-5''11, age 32. Kirsty''s original figures were 150 g protein / 320 g carbs derived from 1.6-2.0 g/kg; protein raised to 200 g with the deficit taken out of carbs. Water is 2.5-3 L plus extra around training. Hold 3-6 weeks, review at week 3.'
where not exists (
	select 1 from nutrition_targets
	where user_id = coalesce(current_setting('app.user_id', true), 'phil')
	  and effective_from = date '2026-09-07'
);
