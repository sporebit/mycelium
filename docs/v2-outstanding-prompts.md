# v2 rebuild — outstanding prompt backlog

Session context for resuming the Loam & Glow v2 rebuild in a fresh conversation. Written 2026-07-19 after a long single-session run.

## What already shipped tonight

Chronological, most recent first:

- `c527a49` refactor(ventures): split [id] detail page into controller + views  ← Ventures Part 1 of 5
- `ae0ac49` feat(dashboard): Everything view toggle  ← Today surface Part 4/4
- `6682d3f` refactor(dashboard): migrate card layout from localStorage to ui_prefs
- `197f92d` feat(dashboard): Today surface — now block, timeline, glance row
- `aa5b0ff` refactor(dashboard): remove fuel card and ticker rail
- `2659de0` fix(nav): add Assistant, route shortcut-setup via settings
- `66cd9ff` feat(shell): view transitions + reactive mycelium field  ← Nav Part 5/5
- `daf7d27` refactor(shell): remove TopRail, TendrilSpine, SubNavRail
- `025f9c8` feat(shell): mobile tab bar + more sheet
- `49c1ca5` feat(shell): v2 sidebar
- `df88f4c` fix(nav): correct sections.ts route drift
- `2bb3fc4` feat(design): drop Fraunces, Inter Tight display
- `6f4689b` feat(settings): ui_prefs jsonb + motion wiring  ← Loam & Glow Part 5/5
- `fea3f00` feat(data): SWR useApi + optimistic mutateApi
- `aec0261` feat(ui): v2 primitive components
- `3395d19` feat(design): load Fraunces display face
- `4264d93` feat(design): Loam & Glow v2 token layer
- (earlier) `f5e5630` docs(agents): require next build before every push
- (earlier) `d452c34` fix(lint): Bins effect cleanup + drop unused DraggableCard import
- (earlier) `230d686` chore(cron): move reminders, drops-monitor, google-sync off Vercel native cron
- (earlier) `836d33e` fix(bins): self-heal Google Calendar sync when events are manually deleted
- (earlier) `3c2d51b` feat(bins): collection schedule with computed types and Google Calendar sync

## Session state at handoff

- Every commit above was built green with `npx next build` before push. AGENTS.md rule (added in `f5e5630`) is doing its job.
- Vercel status was not polled between each push tonight. Historical pattern is ~2-3 min per Ready build; all should have landed cleanly since the commits are all green locally.
- `graphify update .` was NOT run after Ventures Part 1 (`c527a49`). Should run once the outstanding work below is complete, or opportunistically after the next commit.

## Outstanding backlog

Three multi-part rebuilds queued. **Do one per session** — each is genuinely large and the daily-driver ones (Compost especially) are high-risk if rushed.

### 1. Ventures Parts 2-5 (4 commits remaining)

Part 1 (split monolith) landed as `c527a49`. Remaining:

- **Part 2** — `feat(ventures): useApi + optimistic mutations across detail and tree`
  - Convert `app/ventures/[id]/page.tsx` controller to useApi for the 4 fetches (venture, all-ventures, steps, ads).
  - StepsTab: check-off, add, delete, reorder via mutateApi optimistic.
  - "Create as task" action: check response contract — spec says report if API doesn't return created task's id/route rather than extending scope.
  - `app/ventures/tree/page.tsx`: convert to useApi + optimistic `handleAdd` (currently full re-fetch after POST — this is the "textbook round-trip anti-pattern" the audit flagged).
  - `app/ventures/page.tsx`: convert to useApi (will be replaced by Part 3, but converting now means Part 3 builds on working data layer).

- **Part 3** — `feat(ventures): This Week overview replaces status grid`
  - Replace `/ventures` content (data layer already converted in P2).
  - Active ventures: `status !== "closed" && status !== "idea"` (verify against `STATUS_OPTIONS` in `lib/ventures/types.ts` — those are the enum values used).
  - Per active venture: single next step (first incomplete `venture_step` by `sort_order`), inline "Define next step" affordance if none exist (optimistic POST), "Do it" action, days-since-last-activity computed from max of venture/steps/ads updated_at.
  - Idea-stage ventures in collapsed "Incubator" strip below.
  - Add `ventures_incubator_expanded: boolean` (default false) to `UiPrefs`.

- **Part 4** — `style(ventures): v2 primitives across detail, tree, inspiration`
  - Detail tabs (from P1 split): Surface, Button, Label throughout.
  - `AdModal` → Sheet primitive.
  - Tree view: Surface levels for depth (capped at 3), v2 tokens for accent dot + status pill. Inline "add child" modal → Sheet.
  - Inspiration board: Surface for cards. Category chips via SegmentedControl or matching NowBlock's chip pattern.
  - Ads tab: only show when venture has ≥1 ad OR recorded spend; otherwise hide tab and put "Add first ad" affordance in Plan tab.
  - Mobile: decide + report which pattern handles the 5-tab detail row at 390px (SegmentedControl or horizontal scroll).

- **Part 5** — Founder agent verification (may be zero-commit)
  - Verify `create_venture` / `update_venture` / `add_venture_step` tool calls still work end-to-end and new UI reflects them without a manual refresh beyond normal SWR revalidation.
  - Report SWR key mismatch if any.

### 2. Compost / Organisation rebuild (5 commits)

**HIGHEST RISK — this is the daily driver.** `TasksClient.tsx` is 1283 lines with 47 hooks, keyboard shortcuts, URL param sync, seven view types, bulk actions. Any regression here breaks the primary workflow.

- **Part 1** — `refactor(compost): split TasksClient controller from inline views`
  - Extract inline components at bottom of `TasksClient.tsx`: `DetailPaneWrap`, `MainView`, `ListSkeleton`, `ProjectFilterDropdown` → separate files under `components/compost/`.
  - `TasksClient.tsx` drops to ~300-400 lines (state + 47 hooks + keyboard + URL sync — inherently stateful controller).
  - **Zero logic changes.** Every prop, every handler signature stays identical.
  - Verify every one of the seven views + every keyboard shortcut (list in `TaskShortcutHelp.tsx`) + bulk actions + detail pane + drawer behave identically post-split.

- **Part 2** — `feat(compost): useApi + optimistic mutations for tasks/captures/people/projects`
  - Task fetching: useApi keyed on `/api/tasks?view=${view}&status=${status}` matching whatever the current fetch constructs (different filter states = different cache entries).
  - Mutations via mutateApi with rollback + toast:
    - Status change (including drag-drop on `TaskBoard`/`TaskStatusBoard`) — instant, PATCH in background.
    - Check-off / completion.
    - Bulk actions (`TaskBulkBar`) — apply optimistically to all selected; single toast on partial/full failure listing what didn't persist. Check bulk endpoint's per-item vs all-or-nothing contract, report constraint.
    - Detail pane / drawer field edits — optimistic on blur/submit.
  - Same treatment for `CapturesClient`, `PeopleClient`, `ProjectsClient`, `PurchasesClient`, `DecisionsClient`.
  - Trigger `triggerFieldPulse()` on task completion (matches NowBlock's P2 behaviour).

- **Part 3** — `refactor(compost): migrate view/filter prefs from localStorage to ui_prefs`
  - Add to `UiPrefs`: `compost_view: string` (default "list"), `compost_show_completed: boolean` (default false), `compost_show_project: boolean` (check existing default in current localStorage read).
  - Same migrate-once pattern as Today Part 3 / Dashboard: legacy keys are `miles-crm-view`, `mycelium:showCompleted`, `mycelium:showProject`. Leave them in place as inert fallback; stop reading after first successful ui_prefs write.
  - **URL param sync stays untouched** — different persistence layer for shareability, not personal default.

- **Part 4** — `style(compost): v2 primitives across all seven views`
  - Kanban (`TaskBoard`, `TaskStatusBoard`): columns as Surface level 1, cards as Surface level 2. Drag: lift shadow + scale 1.02, drop = glow-pulse.
  - Detail pane + `TaskDrawer` → Sheet primitive (right on desktop, bottom on mobile).
  - `TaskTableView`: `<Num>` for numeric/date columns, row height responsive to `ui_prefs.density` (40px default / 32px compact — density was schema'd in P0 but not yet consumed anywhere).
  - `TaskCalendarView`: Surface day cells. Only add weather chips if currently present.
  - List/Smart/Category: Surface level 1 rows, hairline dividers, `UrgencyPill`/`StatusDropdown` restyled with v2 tokens.
  - `ViewSwitcher`: seven options — decide and report if SegmentedControl fits or if scrollable/overflow pattern is needed at narrow widths.

- **Part 5** — `feat(compost): swipe actions on mobile task rows`
  - Swipe-right = mark done (same mutateApi path as tap-complete).
  - Swipe-left reveals action row (reschedule opens Sheet with existing date-picker mechanism, don't invent new).
  - Long-press enters selection mode; bulk bar as fixed bottom bar above TabBar on mobile.
  - No new gesture library — pointer events + touch deltas only.
  - Verify on actual phone, not just DevTools emulation.

### 3. Health + Nutrition rebuild (5 commits)

- **Part 1** — `refactor(health): split blood-tests monolith into controller + views`
  - `app/health/blood-tests/page.tsx` (1092 lines) → extract `ResultRow`, `RangeBar`, `HistoryTab`, `AddResultsModal` into `components/health/blood-tests/`.
  - `PANEL_ORDER` and `ALL_MARKERS` data literals → `lib/health/blood-markers.ts`.
  - **Frozen:** the marker reference ranges/data literals themselves.

- **Part 2** — `refactor(health): split recipes monolith`
  - `app/health/recipes/page.tsx` (900 lines, no existing sub-component tower — audit noted size comes from inline JSX).
  - Split boundaries (spec left to judgement): meal-planner grid, recipe card/list, recipe detail, Vision-scan flow.
  - Date-math helpers → `lib/health/meal-planner-dates.ts` (`getMonday`, `addDays`, `dateStr`, `fmtWeekRange`, `fmtDay`).
  - Verify `/health/recipes` route (already fixed in nav Part 1).

- **Part 3** — `feat(health): useApi + optimistic mutations`
  - Convert blood-tests, recipes/meal-planner, gut-health, eye-prescription, shopping-lists fetching to useApi.
  - **Critical alignment fix**: `SupplementsClient.tsx` / `DailyChecklist.tsx` currently do NOT share the `/api/supplements/daily?date=${today}` SWR key that the P0 dashboard card and P2 TimelineRail use. Align them here for a genuinely shared cache across all three surfaces. This was flagged in the P0 final report as unfixed.
  - Shopping list check-off, meal-planner row assignment, gut-health log entry, eye-prescription entry: all optimistic.

- **Part 4** — `feat(nutrition): mobile-first logging, optimistic entries`
  - `NutritionClient` + `MacroBar`: useApi + `<Num>` for macro values, smooth MacroBar width transition (`--dur-base` `--ease-out`).
  - Food logging: final "add to log" action optimistic (scan/search steps stay as-is — external API calls).
  - `MealGroupSection`: Surface-based; reorder if it currently supports it (spec says don't add new).
  - Mobile: barcode/label scan buttons thumb-reachable, no collision with TabBar FAB.

- **Part 5** — `style(health): v2 primitives across blood-tests, recipes, supplements`
  - `RangeBar` restyle: hairline track, marker dot, status via v2 warn/error/info tokens (not saturated fills).
  - Recipes: meal-planner cells as Surface level 1, recipe cards level 2. Vision scan: add progress state per page if genuinely missing.
  - Supplements: verify daily-checklist slots use v2 tokens.
  - Eye prescription: `EyeCard` Surface restyle.
  - Shopping-lists, gut-health: Surface-based list/entry restyle.

## Cross-cutting notes for the next session

- **AGENTS.md rule enforced**: run `npx next build` before every push. `tsc --noEmit` is NOT sufficient — ESLint gates the production build.
- **`git add -A` risk**: multiple recent commits swept up unrelated untracked files (`.graphify/` cache, stale `pc-agent/package-lock.json`, screenshots-era `scripts/screenshot.mjs`). Prefer `git add <explicit paths>` where practical.
- **Lighthouse baseline** was noted as missed in the Nav rebuild final report — if a P9 comparison is needed, take one now against the current post-rebuild state as the ongoing baseline.
- **Deferred items from Today surface** (not yet addressed anywhere):
  - Swipe-right-to-complete on NowBlock rows (spec asked "in addition to tap"; only tap shipped).
  - Spend-today tile in GlanceRow (Nutrition placeholder used; needs its own daily-spend endpoint pass).
  - LocalStorage → ui_prefs migration for `dashboard-cards` is wired but not runtime-verified with a real legacy profile.
- **View Transitions**: currently CSS fallback (`PageFade` client component keyed on pathname). Native Next 15 experimental flag was deferred — would require moving `Shell` to root layout so `template.tsx` doesn't break segment-layout persistence. Revisit if/when experimental becomes stable.
- **Founder agent verification** (Ventures P5) can be done alongside Ventures P2 mutation testing since the tool calls need to be verified against the new SWR keys anyway.

## Recommended session ordering

1. **Finish Ventures Parts 2-5** — pick up where Part 1 (`c527a49`) left off. Same domain, still-fresh context on split structure.
2. **Health + Nutrition Parts 1-5** — no shared risk with Compost, gets two more monoliths split before touching the daily driver.
3. **Compost Parts 1-5 last** — highest risk, best done with a dedicated fresh-context session after both others are shipped and verified in real daily use.
