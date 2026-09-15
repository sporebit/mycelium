# Spec — Health & Nutrition

*Crawled 2026-08-29; reviewed with Phil same day. Nutrition targets section added 2026-09-06 (migration 0098). (?) = inferred, unverified.*

## Nutrition (`/health/nutrition`, `/nutrition`)

Nutrition v2 (0028): `foods`, `nutrition_logs`, meal groups (`/api/nutrition/meal-groups`), redistribute, burned-calories, history, estimate. Food resolution: Open Food Facts (UK subdomain, English forced) → USDA for raw ingredients → Claude Vision label-scan fallback; barcode scan via @zxing (`/api/nutrition/foods/barcode/[code]`, `scan-label`). Optimistic add-to-log only — scan/search steps genuinely wait. MacroBar with `<Num>` + smooth width transitions.

## Nutrition targets (0098, added 2026-09-06)

`nutrition_targets` — versioned daily targets: `user_id`, `effective_from`, `review_on`, kcal, protein_g, fat_g, carbs_g, fibre min/max, water min/max, notes. Read helper `lib/nutrition/targets.ts` picks the row with the greatest `effective_from <= date`; `/api/nutrition/targets?date=` returns it with `is_versioned`. MacroBar, the dashboard Nutrition card and the history chart all read it.

Before 0098 the targets were hard-coded in two places that disagreed — `lib/config/nutrition.ts` `NUTRITION_TARGETS` (2800/180/300/80, dashboard card) and `lib/nutrition/types-v2.ts:103` `DEFAULT_NUTRITION_TARGETS` (same four plus fibre/sugar/sat-fat/salt, MacroBar + history). Both are now fallbacks only, used when no row is effective for the requested date.

**Current row:** effective 2026-09-07, review 2026-09-28 — 2600 kcal, 200 g protein, 80 g fat, 270 g carbs, 30–35 g fibre, 2.5–3 L water. Provisional by design; from Kirsty's plan with Phil's protein amendment (see repo `docs/ptp-plan.md`). **Decision 2026-09-06: `effective_from` is not backdated** to make the numbers appear before the 7th — backdating a versioned target to before the decision existed would defeat the audit trail the table exists for.

Water is **not tracked** anywhere. The 2.5–3 L range is recorded in `nutrition_targets` so the number exists, but nothing logs against it. `body_metrics.water_percent` is body composition and unrelated.

## Recipes & meal plan (`/health/recipes`)

`recipes` + meal plan (0064), meal types/card orders (0079). Recipe library, weekly meal-planner grid (date math in `lib/health/meal-planner-dates.ts`), Claude Vision multi-page recipe-card scan (pageCount + "ADD ANOTHER PAGE" flow) — **open bug: Vision scan regression on recipe add**. Shopping lists (default list 0078): items CRUD, check-off, send-to-Telegram.

## Supplements (`/health/supplements`)

0041 + timing (0080), seeded schedule (0081), daily log (0084). Daily checklist keyed `/api/supplements/daily?date=${today}` — the SAME SWR key is shared by the dashboard card and Today TimelineRail (shared-cache fix from P6).

## Blood tests (`/health/blood-tests`)

0051: markers/units/reference ranges (data literals in `lib/health/blood-markers.ts` — FROZEN), 4 tabs, RangeBar (hairline track, wash status colours), history trends, Claude parse of results (`/api/health/blood-tests/parse`).

## Other records

- **Gut health** (`/health/gut-health`, 0062, rename 0077): daily log, Bristol scale, timeline; no trigger-scoring by design.
- **Eye prescriptions** (`/health/eye-prescription`, 0063): records + photo parse endpoint.
- **Pain** (`/health/pain`): standalone pain logs surface (shares fitness pain tables). Note `exercise_pain_logs` cascades off `workout_sessions` — deleting a logged session destroys its pain evidence.
- **Body metrics** — **Health owns this record** (Phil, 2026-08-29): the `/fitness/body` page location is legacy, kept for workout adjacency, not a statement of ownership. Tables 0025/0052/0083; Apple Health import (0045/0082), one row per metric per day; stone default unit.

## Habits touching health

`lib/config/habits.ts` defaults include `move` (Daily Movement, seeded 2026-09-06) and `hydrate` (raised 2 L → 3 L to match the PTP targets). Config lives in `daily_logs.notes` JSON at the `GOALS_SENTINEL_DATE` row, which did not exist until the PTP write created it — before that, defaults were in force with nothing persisted.

## Loam & Glow state

P6 complete (all five parts): monolith splits (blood-tests 1092 lines, recipes 900 lines → controllers + views), useApi/optimistic everywhere, restyles, 164 token replacements.
