# Spec — Health & Nutrition

*Crawled 2026-08-29; reviewed with Phil same day. Nutrition targets section added 2026-09-06 (migration 0098). Gousto cookbook, extractor guards and the nutritionist's live context added 2026-10-29. (?) = inferred, unverified.*

## Nutrition (`/health/nutrition`, `/nutrition`)

Nutrition v2 (0028): `foods`, `nutrition_logs`, meal groups (`/api/nutrition/meal-groups`), redistribute, burned-calories, history, estimate. Food resolution: Open Food Facts (UK subdomain, English forced) → USDA for raw ingredients → Claude Vision label-scan fallback; barcode scan via @zxing (`/api/nutrition/foods/barcode/[code]`, `scan-label`). Optimistic add-to-log only — scan/search steps genuinely wait. MacroBar with `<Num>` + smooth width transitions.

## Nutrition targets (0098, added 2026-09-06)

**2026-10-29:** the nutritionist agent gets a live block on every fresh turn (`lib/agents/live-context.ts`): targets with the review date, today's intake, 7-day average, gut logs for the week, recipe library — read-only. A past `review_on` therefore keeps surfacing until a newer targets row supersedes it.

`nutrition_targets` — versioned daily targets: `user_id`, `effective_from`, `review_on`, kcal, protein_g, fat_g, carbs_g, fibre min/max, water min/max, notes. Read helper `lib/nutrition/targets.ts` picks the row with the greatest `effective_from <= date`; `/api/nutrition/targets?date=` returns it with `is_versioned`. MacroBar, the dashboard Nutrition card and the history chart all read it.

Before 0098 the targets were hard-coded in two places that disagreed — `lib/config/nutrition.ts` `NUTRITION_TARGETS` (2800/180/300/80, dashboard card) and `lib/nutrition/types-v2.ts:103` `DEFAULT_NUTRITION_TARGETS` (same four plus fibre/sugar/sat-fat/salt, MacroBar + history). Both are now fallbacks only, used when no row is effective for the requested date.

**Current row:** effective 2026-09-07, review 2026-09-28 — 2600 kcal, 200 g protein, 80 g fat, 270 g carbs, 30–35 g fibre, 2.5–3 L water. Provisional by design; from Kirsty's plan with Phil's protein amendment (see repo `docs/ptp-plan.md`). **Decision 2026-09-06: `effective_from` is not backdated** to make the numbers appear before the 7th — backdating a versioned target to before the decision existed would defeat the audit trail the table exists for.

Water is **not tracked** anywhere. The 2.5–3 L range is recorded in `nutrition_targets` so the number exists, but nothing logs against it. `body_metrics.water_percent` is body composition and unrelated.

## Recipes & meal plan (`/health/recipes`)

`recipes` + meal plan (0064), meal types/card orders (0079). Recipe library, weekly meal-planner grid (date math in `lib/health/meal-planner-dates.ts`), Claude Vision multi-page recipe-card scan (pageCount + "ADD ANOTHER PAGE" flow) — the "regression" was the September no-credit 502; the route works (`claude-sonnet-4-5`). **Guard (2026-10-29, `7bed43a`):** an image with no recipe answers `{"no_recipe": true}` → 422, instead of an invented recipe; the same guard is on the prescription, blood-test, nutrition-label and receipt parsers (`e2c9e13`). Shopping lists (default list 0078): items CRUD, check-off, send-to-Telegram.

### Gousto cookbook (`/health/recipes/gousto`, 0151–0155, 2026-10-29)

`gousto_recipes` (entity group `health.nutrition`): the whole Gousto listing per space (11,977 recipe pages from 12,162 entries; **slug is the identity**, 0152 — re-issued recipes share a url under two uids and the most-rated entry wins), listing columns + a cached `detail` jsonb (ingredients with pack images, basics, steps as sanitised HTML + text, allergens, per-portion and per-100 g nutrition, portions, canonical url) + `is_favourite`/`favourited_at` + `saved_recipe_id`. Pages: the cookbook (search, All/Favourites, Cuisine and Category selects from `gousto_facets()` (0154/0155: Gousto's "Chicken" / "Chicken Recipes" pairs merged), sort popular/rating/newest/A–Z, paging, heart per card) and `/health/recipes/gousto/[slug]` (detail, heart, **SAVE TO MY RECIPES** → copies into `recipes` via `toRecipeRow` — source Gousto, ingredients by pack with cupboard basics noted, method from step text, tags from categories, allergens in notes — idempotent, link back once a copy exists). Routes `/api/health/gousto` (list), `/[slug]` (GET row + detail, PATCH favourite), `/[slug]/save`, and the three the PC script posts to: `/ingest` (raw listing entries), `/[slug]/detail` (raw detail entry or null = gone), `/missing` (slugs without detail, favourites first). **The server never calls Gousto**: its edge 502s cloud egress (Vercel US and lhr1) and sends no CORS headers, and 502s listing pages above ~50 entries. `npm run gousto:sync` (`scripts/gousto-sync.mjs`, `API_SECRET` in env; `--listing-only` ≈ 6 min, `--details-only`, `--details N`, `--stale-days N`) runs on the PC and resumes. Full detail pull done 2026-10-29 (11,929 with detail, 48 gone). Open: schedule it weekly on the PC.

## Supplements (`/health/supplements`)

0041 + timing (0080), seeded schedule (0081), daily log (0084). Daily checklist keyed `/api/supplements/daily?date=${today}` — the SAME SWR key is shared by the dashboard card and Today TimelineRail (shared-cache fix from P6).

## Blood tests (`/health/blood-tests`)

0051: markers/units/reference ranges (data literals in `lib/health/blood-markers.ts` — FROZEN), 4 tabs, RangeBar (hairline track, wash status colours), history trends, Claude parse of results (`/api/health/blood-tests/parse`).

## Other records

- **Gut health** (`/health/gut-health`, 0062, rename 0077): daily log, Bristol scale, timeline; no trigger-scoring by design.
- **Eye prescriptions** (`/health/eye-prescription`, 0063): records + photo parse endpoint.
- **Pain** (`/health/pain`): standalone pain logs surface (shares fitness pain tables). Since 0153 (2026-10-29) `exercise_pain_logs` is SET NULL off `workout_sessions` and `workout_session_exercises`: deleting a logged session keeps its pain logs as standalone entries.
- **Body metrics** — **Health owns this record** (Phil, 2026-08-29): the `/fitness/body` page location is legacy, kept for workout adjacency, not a statement of ownership. Tables 0025/0052/0083; Apple Health import (0045/0082), one row per metric per day; stone default unit.

## Habits touching health

`lib/config/habits.ts` defaults include `move` (Daily Movement, seeded 2026-09-06) and `hydrate` (raised 2 L → 3 L to match the PTP targets). Config lives in `daily_logs.notes` JSON at the `GOALS_SENTINEL_DATE` row, which did not exist until the PTP write created it — before that, defaults were in force with nothing persisted.

## Loam & Glow state

P6 complete (all five parts): monolith splits (blood-tests 1092 lines, recipes 900 lines → controllers + views), useApi/optimistic everywhere, restyles, 164 token replacements.
