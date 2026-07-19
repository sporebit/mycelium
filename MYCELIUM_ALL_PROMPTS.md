# MYCELIUM REDESIGN — ALL PROMPTS (P0–P11)
### Reference file. NOT a checklist to clear in one sitting.
**Compiled 19 July 2026**

---

## HOW TO USE THIS FILE

- Fire ONE prompt (or one unfinished PART of a prompt) per session.
- After every prompt: verify by USING the feature, not just reading a green
  build report. "Built clean" and "works" are different claims.
- Compost (P4) is the daily driver — never touch it in a tired or rushed
  session. Ventures, Fitness, Health, Finance are lower-stakes and more
  forgiving of an off night.
- Status as of last update: **P0 done (verified). P1 done (verified). P2
  fired (verify before proceeding). P3 Part 1 in progress, Parts 2–5
  outstanding. P4–P11 not yet started.**
- Each prompt is self-contained — paste the whole block including its
  GLOBAL RULES section, Claude Code doesn't need prior prompts in context.

---

## P0 — FOUNDATION (tokens, fonts, primitives, data layer) ✅ DONE

```
TASK: Loam & Glow v2 foundation — tokens, fonts, primitives, data layer,
settings schema. Five commits. The app must render effectively identical
(minus font/colour refinement) and remain fully working after every
individual commit — each commit is independently shippable.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART, exact commit messages given below. Run
   `npx next build` before EVERY push — per AGENTS.md. tsc --noEmit is NOT
   sufficient; the production build gates on ESLint and one error blocks
   all deploys.
2. FROZEN: Supabase schema semantics (except the single column in Part 5),
   /api/* route contracts, lib/ domain logic, capture pipeline, agent logic.
3. NO new localStorage. The ui_prefs column is the persistence layer for UI
   preferences, keyed per user like the rest of user_settings.
4. TOKENS ONLY going forward: after this prompt, new code uses v2 token
   names. This prompt PRESERVES all legacy tokens as aliases so nothing
   breaks.
5. After completion run `npx graphify update .`

[Parts 1–5: token layer, Fraunces font load, UI primitives, SWR data layer,
ui_prefs settings schema — see session log for full text. STATUS: shipped
as commits 4264d93, 3395d19, aec0261, fea3f00, 6f4689b. Fraunces later
replaced by Inter Tight per follow-up decision — see P0.5 below.]
```

### P0.5 — FONT SWAP (Fraunces → Inter Tight) ✅ DONE

```
TASK: Replace the display face. Fraunces is being removed entirely — the
display font becomes Inter Tight (already loaded for UI text), differentiated
from body text by WEIGHT and SIZE only, not by family. Single commit:
feat(design): drop Fraunces, Inter Tight display.

1. app/layout.tsx: remove the Fraunces import, its variable, and the
   "variable" weight workaround entirely.
2. globals.css: repoint --font-display to the Inter Tight variable. Since
   display and UI are now the same family, hierarchy must come from
   weight/size alone:
   - Confirm Inter Tight 600 is loaded in layout.tsx (add it if not).
   - Base h1..h6 rule and .card-hero / .card-hero-primary: set weight 600,
     letter-spacing -0.02em, line-height 1.15.
3. The italic "Loading…"/empty-state subtitle pattern (~525 usages) will
   render italic Inter Tight. If it reads weak, change that specific
   pattern to text-lo weight 500 non-italic — only if it genuinely looks
   bad, don't pre-emptively change it.
4. Replace the Recoleta-swap comment with a note that display is Inter
   Tight 600, no separate display family.
5. Wordmark: try widening tracking to 0.02em for distinct presence. Confirm
   glow-sweep still renders correctly.

VERIFY: build clean. Headings visibly heavier/tighter than body. Report
final weights loaded, whether the subtitle pattern changed, and how the
wordmark looks with tracking adjustment.
```

---

## P1 — SHELL (navigation, transitions, background) ✅ DONE

```
TASK: Replace all navigation chrome with the v2 shell — desktop sidebar,
mobile bottom bar, reactive background, View Transitions between routes.
Kill TopRail, TendrilSpine, SubNavRail entirely. Five commits, each
independently buildable and shippable.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. Run `npx next build` before EVERY push.
2. Use ONLY v2 tokens from P0. Section accent colours are the ONLY
   exception — allowed as 2px ticks/wayfinding hairlines, nowhere else.
3. Reuse P0 primitives (Surface, Button, Sheet, Skeleton, Label,
   SegmentedControl) and useApi/mutateApi/uiPrefs. NO localStorage.
4. FROZEN: /api/* route contracts, lib/ domain logic (except sections.ts
   route corrections in Part 1), capture pipeline, agent logic.
5. Mobile-first: build and verify at 390px before 1440px.
6. Section colours: 2px active-state tick/border and chart series only.
   Never backgrounds, button fills, or large text.
7. After the final push: npx graphify update .

[Parts 1–5: sections.ts route hygiene, desktop Sidebar, mobile TabBar +
More sheet, demolition of TopRail/TendrilSpine/SubNavRail, View Transitions
+ reactive MyceliumField background — see session log for full text.
STATUS: shipped as df88f4c, 49c1ca5, 025f9c8, daf7d27, 66cd9ff. View
Transitions used CSS fallback (PageFade) rather than the native flag —
Next 15.5's experimental viewTransition would have forced Shell to root
layout and broken segment persistence.]
```

### P1.5 — NAV FOLLOW-UPS ✅ DONE

```
TASK: Small nav corrections following P1 review. Single commit:
fix(nav): add Assistant, route shortcut-setup via settings.

1. lib/nav/sections.ts: add "Assistant" as an Organisation sub-page,
   pointing to /organisation/assistant, positioned last in that section's
   subPages.
2. Do NOT add /fitness/shortcut-setup to any sidebar/nav list. Add a link
   to it from /other/settings instead, near other integration/setup items.

VERIFY: build clean, /organisation/assistant reachable from sidebar,
shortcut-setup reachable from Settings. Commit, push, Ready.
```

---

## P2 — DASHBOARD → "TODAY" SURFACE 🔶 FIRED, NOT YET VERIFIED BY USE

```
TASK: Rebuild the dashboard as a "Today" surface — priorities first, time-
anchored context second, glanceables third. The existing card grid survives
as a secondary "Everything" view. Fuel and the ticker rail are removed
entirely. Reuse P0/P1 primitives and patterns throughout — no new modal/
toast/skeleton systems, no new fetch pattern.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. v2 tokens only. Section colours only as 2px ticks, never fills.
3. Use components/ui/ primitives — no parallel one-off styled divs.
4. All data fetching via useApi; all mutations via mutateApi, optimistic,
   with rollback + ApiErrorToast. No raw useEffect+fetch in anything
   touched by this prompt.
5. No new localStorage. Persisted UI state goes through ui_prefs.
6. FROZEN: /api/* contracts, lib/compost/now-filter.ts scoring logic
   itself (call it, don't rewrite it), lib/dashboard/headlines.ts.
7. Mobile-first: build/verify at 390px before 1440px.
8. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — REMOVE FUEL + TICKER
commit: refactor(dashboard): remove fuel card and ticker rail
════════════════════════════════════════════════════════════════════
- Delete components/dashboard/cards/Fuel.tsx and its card-registry entry.
  Remove dashboard /api/fuel calls (leave the route + lib/fuel/ intact,
  grep first to confirm dashboard is the only consumer).
- Delete RotatingTicker.tsx and Tickers.tsx and their mount point. Remove
  /api/tickers calls if nothing else uses them.
- Harmless if any user's ui_prefs card_orders references fuel/tickers —
  don't migrate, just confirm nothing throws.

VERIFY 1: build clean, no fuel/ticker remnants render, no console errors.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — TODAY SURFACE STRUCTURE
commit: feat(dashboard): Today surface — now block, timeline, glance row
════════════════════════════════════════════════════════════════════
Create components/dashboard/today/:
2a. TodayHeader.tsx — time-of-day greeting + date (display weight/size),
   LiveClock + SunWidget merged into one compact meta line.
2b. NowBlock.tsx — fetches via useApi from the same endpoint cards/Now.tsx
   uses (reuse, don't re-derive scoring client-side). Top 3 scored items,
   Surface level 1 rows, context chip (match Compost's existing chip
   language), one-tap complete via mutateApi (optimistic, fade on success,
   rollback + toast on failure, triggerFieldPulse() on success). "?"
   affordance opens a Sheet with whatever score-rationale data the
   endpoint actually returns — don't fabricate fields. Empty state: calm,
   not error-styled, links to Everything toggle.
2c. TimelineRail.tsx — horizontal scroll-snap day strip merging calendar
   events (+ weather chips, reuse existing rendering), supplement slots
   (reuse P0's exact `/api/supplements/daily?date=${today}` key for shared
   cache), today's workout session, bins. Tapping a supplement item opens
   a Sheet reusing the existing check-off UI (extract to a shared
   sub-component if not already reusable). Skeleton states while loading.
2d. GlanceRow.tsx — spend-today, kcal vs target, habit streak (reuse
   Habits' P0 hook/key), pending captures count. Surface level 1 tiles,
   <Num> values, tap navigates to section.
2e. Assemble in app/page.tsx: TodayHeader → NowBlock → TimelineRail →
   GlanceRow. Mobile: stacked, NowBlock rows get swipe-right-to-complete
   (pointer-delta threshold, no gesture library unless already present).

VERIFY 2: build clean. Cold load shows skeletons then content. NowBlock
completion instant with correct rollback (sabotage-then-revert test).
TimelineRail scroll-snaps on mobile. Report which endpoints each block hit.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — GRID LAYOUT MIGRATION
commit: refactor(dashboard): migrate card layout from localStorage to
ui_prefs
════════════════════════════════════════════════════════════════════
- Extend UiPrefs with `dashboard_layout: Record<string, unknown>` matching
  DashboardGrid's current localStorage shape exactly (inspect, don't guess).
- Migrate-once: if ui_prefs.dashboard_layout is empty and legacy
  "dashboard-cards" key exists, read once, write via mutateApi, stop
  reading localStorage thereafter. Leave legacy key as inert fallback.
- Confirm Fuel/Tickers gone from card registry (should already be, from
  Part 1 — confirm not redo).
- All layout writes (resize/reorder/hide) go through mutateApi.

VERIFY 3: build clean. Migration fires once, ui_prefs populated in
Supabase, layout persists with localStorage cleared. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 4 — EVERYTHING TOGGLE
commit: feat(dashboard): Everything view toggle
════════════════════════════════════════════════════════════════════
- SegmentedControl "Today" | "Everything" below TodayHeader, default
  "Today", persists in ui_prefs (`dashboard_view`, default "today").
- "Everything" renders existing DashboardGrid unchanged beyond Part 1/3.

VERIFY 4: build clean. Toggle instant, persists across reload. Everything
view still drags/resizes/hides correctly. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Four commit hashes + build status each; Fuel/Tickers fully removed
confirmation; exact endpoints each Today block used; localStorage→ui_prefs
migration verified; confirm Goals/Journal/Glossary/KeyBlockers/Session/
Operator cards remain in Everything (not accidentally dropped).
```

---

## P3 — VENTURES → OPERATING LOOP ✅ DONE

**Follow-ups (deferred, worth their own small commits):**
- (a) Inspiration board restyle — deferred. `app/ventures/inspiration/page.tsx` is 400+ lines with modal + filters + edit flow; would not fit the atomic-commit discipline of P3 Part 4 (which stayed focused on detail/tree/AdModal). Own commit next time.
- (b) Founder agent verification — not run this session. Next time the Founder is open, exercise `create_venture` and `add_venture_step` and confirm they surface in the new This Week overview + Steps tab within one SWR revalidation cycle (focus event or 2s dedupe expiry). Report if a shared-cache mismatch is observed.



```
TASK: Rebuild Ventures from filing cabinet to operating cadence. Overview
becomes "This Week" — every venture surfaces exactly one next action. Split
the 1105-line [id] monolith. Reuse P0-P2 primitives and patterns throughout.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. v2 tokens only. Ventures accent (amber, shared with Organisation) only
   as 2px ticks/wayfinding.
3. Use components/ui/ primitives — no parallel one-off styling.
4. All fetching via useApi; all mutations via mutateApi, optimistic,
   rollback + ApiErrorToast. This fixes the audit-flagged round-trip
   anti-pattern in ventures/tree/page.tsx.
5. No new localStorage. Persisted UI state via ui_prefs.
6. FROZEN: /api/ventures/* contracts, venture_steps/venture_ads/
   venture_inspiration schema, The Founder agent's tool-calling behaviour
   (verify unchanged at the end, don't assume).
7. Mobile-first: 390px before 1440px.
8. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — SPLIT THE MONOLITH (zero behaviour change)
commit: refactor(ventures): split [id] detail page into controller + views
════════════════════════════════════════════════════════════════════
- Create components/ventures/detail/: OverviewTab.tsx, PlanTab.tsx,
  StepsTab.tsx, AdsTab.tsx, NotesTab.tsx, EditableField.tsx, AdModal.tsx
  (keep as modal for now — Part 4 converts to Sheet). Extracted verbatim,
  logic unchanged.
- Remaining page.tsx (or a VentureDetailClient.tsx it delegates to)
  becomes a controller ≤300 lines: tab state, fetching, composition. Still
  raw useEffect+fetch at this stage — Part 2 converts to useApi.
- Types (Venture, Step, Ad, Tab) move to a shared location matching the
  codebase's existing lib/types/ convention.

VERIFY 1: build clean. Every tab renders identically — click through all
five on an existing venture, zero visual/functional difference. Commit,
push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — DATA LAYER + OPTIMISTIC MUTATIONS
commit: feat(ventures): useApi + optimistic mutations across detail and tree
════════════════════════════════════════════════════════════════════
- Controller: useApi for the venture fetch.
- Steps tab: check-off via mutateApi (instant, correct PATCH, rollback +
  toast). Drag-reorder (existing dnd-kit) updates order optimistically.
- "Create as task": keep calling the existing endpoint; show which task it
  created if the response includes an id/route. If it doesn't, that's an
  API contract change — OUT OF SCOPE, report instead of extending the
  route yourself.
- ventures/tree/page.tsx: useApi for the list. handleAdd becomes
  optimistic via mutateApi — child node appears immediately, rolls back
  with toast on failure.
- ventures/page.tsx: convert to useApi (structure/UI comes in Part 3).

VERIFY 2: build clean. Add a child venture — instant, survives reload.
Check off a step — instant, survives reload. Sabotage-then-revert test.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — "THIS WEEK" OVERVIEW
commit: feat(ventures): This Week overview replaces status grid
════════════════════════════════════════════════════════════════════
3a. Active ventures: status not "closed"/"idea" (use actual enum values
   from STATUS_OPTIONS, don't invent new ones).
3b. Per active venture, Surface level 1 row: name + kind icon, THE single
   next incomplete venture_step (ordered by position). None exists →
   inline "Define the next step" input + Button, optimistic POST. "Do it"
   action: mark step done OR "create as task" — use judgement if the API
   doesn't distinguish, explain the choice. "Days since last activity"
   computed client-side from venture/steps/ads updated_at. Row tap (outside
   Do-it) navigates to detail.
3c. Idea-stage ventures: separate collapsed "Incubator" strip, horizontal
   scroll, smaller cards, expand state in ui_prefs
   (`ventures_incubator_expanded`, default false).
3d. Closed ventures: not shown here; remain visible in /ventures/tree only.

VERIFY 3: build clean. Every active venture shows a next step or a prompt
to define one. Inline step-add updates instantly. Incubator
collapses/expands and persists. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 4 — RESTYLE PASS
commit: style(ventures): v2 primitives across detail, tree, inspiration
════════════════════════════════════════════════════════════════════
4a. Detail tabs: Surface, Button, Label throughout. AdModal → Sheet.
4b. Tree view: Surface levels for depth (cap level 3), v2 tokens for
   accent dot/status pill. "Add child" modal → Sheet.
4c. Inspiration board: Surface cards, next/image if not already (note for
   P9 if nontrivial, don't fix here). Filter chips → reuse the chip
   pattern established in Compost/NowBlock, don't invent a third.
4d. Ads tab: only visible when the venture has ≥1 ad or recorded spend.
   Hidden otherwise, Plan tab gets "Add first ad" affordance instead.

VERIFY 4: build clean. Visual coherence with dashboard/nav. Mobile: 5 tabs
usable at 390px (decide pattern, report which). Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 5 — FOUNDER AGENT VERIFICATION
commit: none (verification only; fold any needed fix into the relevant
part above, or a small separate fix commit)
════════════════════════════════════════════════════════════════════
- Ask The Founder agent to create a test venture step via tool-calling.
  Confirm it appears in This Week + Steps tab without manual refresh
  beyond normal SWR revalidation. If it doesn't appear promptly, report
  the SWR-key mismatch rather than silently patching agent code.
- Delete the test step/venture if throwaway.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Five commit hashes (Part 5 may be zero-commit) + build status; Founder
agent tool calls confirmed working end-to-end in new UI; mobile tab
pattern chosen; "create as task" response contract report if needed;
status enum values used for "active" filtering.
```

---

## P4 — ORGANISATION / COMPOST 🔶 GROUNDWORK DONE — PARTS 2, 4, 5 PENDING

**Landed tonight (mechanical, low-risk):**
- ✅ **Part 1** (`27a49f4`) — split TasksClient inline components → `TaskDetailPaneWrap`, `TaskMainView`, `TaskListSkeleton`, `ProjectFilterDropdown`. Build-verified only; behavioural sweep of all seven views + every keyboard shortcut + bulk + detail pane + drawer needs a real browser session before P4 Part 2.
- ✅ **Part 3** (`179527a`) — `miles-crm-view`, `mycelium:showCompleted`, `mycelium:showProjectTasks` migrated to `ui_prefs.compost_view` / `compost_show_completed` / `compost_show_project`. Legacy keys stay as inert fallback. URL param sync untouched.

**Fresh-session, rested-read next unit:**
- ⬜ **Part 2** — useApi + optimistic mutations for tasks/captures/people/projects/purchases/decisions. Kanban drag, bulk actions, detail-pane edits all become instant. `triggerFieldPulse()` on task completion.
- ⬜ **Part 4** — v2 primitives across all seven views + Sheet-based detail pane/drawer + density-driven table row height.
- ⬜ **Part 5** — mobile swipe (right = done, left = reschedule sheet, long-press = bulk).



```
TASK: v2 pass on Organisation/Compost, the daily driver. PRESENTATION AND
DATA-LAYER ONLY — task state machine, statuses, scoring, keyboard shortcuts,
and API contracts are FROZEN. This is the highest-traffic surface in the
app; every change here is verified against real daily use, not just a build.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. v2 tokens only. Organisation accent (amber) as 2px ticks only.
3. components/ui/ primitives throughout — no parallel styling.
4. All fetching via useApi; all mutations via mutateApi, optimistic,
   rollback + ApiErrorToast.
5. No new localStorage — miles-crm-view, showCompleted, showProject move
   to ui_prefs.
6. ABSOLUTELY FROZEN, verify unchanged at the end: every keyboard shortcut
   in TasksClient, URL param sync, the seven view types, status transition
   logic, bulk-action behaviour, lib/compost/now-filter.ts.
7. Mobile-first: 390px before 1440px.
8. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — STRUCTURAL SPLIT (zero behaviour change)
commit: refactor(compost): split TasksClient controller from inline views
════════════════════════════════════════════════════════════════════
- Move DetailPaneWrap, MainView, ListSkeleton, ProjectFilterDropdown (and
  any other inline component at the bottom of TasksClient.tsx) into their
  own files under components/compost/.
- TasksClient.tsx drops toward ~300-400 lines. Zero logic changes — every
  prop/handler signature stays identical.

VERIFY 1: build clean. Exercise all seven views, every keyboard shortcut
(check TaskShortcutHelp for the full list, test each), bulk select +
actions, detail pane and drawer open/close. Behaviourally identical.
Highest-risk file in the codebase — verify thoroughly. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — DATA LAYER + OPTIMISTIC MUTATIONS
commit: feat(compost): useApi + optimistic mutations for tasks/captures/
people/projects
════════════════════════════════════════════════════════════════════
- Task fetching → useApi, keyed including view/filter query params so
  different filtered views don't collide in cache.
- Mutations → mutateApi, optimistic, rollback + toast: status change
  (including kanban drag), check-off, bulk actions (per-item vs all-or-
  nothing depends on the actual API contract — check and report), detail
  pane/drawer field edits (optimistic on the existing save-trigger, don't
  change when saves fire).
- Same treatment for CapturesClient, PeopleClient, ProjectsClient,
  PurchasesClient, DecisionsClient.
- triggerFieldPulse() on task completion, matching NowBlock's P2 behaviour.

VERIFY 2: build clean. Drag a task throttled to Slow 3G — instant, persists.
Sabotage-then-revert on status-change and bulk-action. Bulk-select 5, change
status, confirm all 5 update instantly. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — PREFERENCES MIGRATION
commit: refactor(compost): migrate view/filter prefs from localStorage to
ui_prefs
════════════════════════════════════════════════════════════════════
- Extend UiPrefs: compost_view (default "list"), compost_show_completed
  (default false), compost_show_project (default matching current).
- Migrate-once pattern, legacy keys as inert fallback. URL param sync
  stays untouched — different persistence layer, different purpose.

VERIFY 3: build clean. View preference migrates on first load, persists
via ui_prefs, survives localStorage clear. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 4 — RESTYLE PASS
commit: style(compost): v2 primitives across all seven views
════════════════════════════════════════════════════════════════════
4a. Kanban: Surface level 1 wells, hairline dividers, cards Surface level
   2. Drag: lift shadow + 1.02 scale, drop = glow-pulse. --ease-out
   --dur-base on dnd-kit's transition config, no physics library.
4b. Detail pane + TaskDrawer → Sheet primitive (right panel desktop,
   check/preserve mobile behaviour). Content layout unchanged.
4c. Table view: <Num> for numeric/date columns, row height respects
   ui_prefs.density (40px default / 32px compact — first real consumer of
   this pref), hairline row dividers.
4d. Calendar view: Surface day cells; weather-chip consistency with P2's
   TimelineRail only if this calendar already shows weather — don't add
   if it doesn't.
4e. List/Smart/Category: Surface level 1 rows, hairline dividers,
   UrgencyPill/StatusDropdown on v2 tokens, interaction unchanged.
4f. ViewSwitcher → SegmentedControl if seven options fit cleanly; else a
   scrollable/overflow variant — decide and report.

VERIFY 4: build clean. All seven views visually coherent. Mobile: board
becomes horizontal snap-scroll columns, detail/drawer are bottom sheets,
ViewSwitcher usable narrow. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 5 — MOBILE GESTURES
commit: feat(compost): swipe actions on mobile task rows
════════════════════════════════════════════════════════════════════
- List/Smart/Category rows on touch: swipe-right = mark done (same
  mutateApi path), swipe-left reveals reschedule (Sheet with date picker,
  reuse existing reschedule mechanism if one exists elsewhere).
- Long-press enters bulk-select mode; bulk bar adapts to a fixed bottom
  bar above TabBar on mobile.
- Pointer events/touch deltas directly — no new gesture library unless
  already in package.json.

VERIFY 5: build clean. On an ACTUAL phone: swipe-right completes, swipe-
left reveals reschedule, long-press enters bulk mode, all feel responsive.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Five commit hashes + build status; explicit confirmation every keyboard
shortcut works (list + mark each verified); URL param sync untouched
confirmation; bulk-action failure handling (all-or-nothing vs per-item);
ViewSwitcher pattern chosen; gesture library needed or not.
```

---

## P5 — FITNESS 🔶 PART 1 DONE — PARTS 2, 3, 4 PENDING

**Landed tonight:**
- ✅ **Part 1** (`0b9a10e`) — localStorage audit + migration. Full audit list:
  - `body-metrics-weight-unit` → `ui_prefs.fitness_ui.weight_unit`
  - `fitness-hidden-exercises` → `ui_prefs.fitness_ui.hidden_exercises`
  - `fitness-today-hidden` → `ui_prefs.fitness_ui.hidden_completed_sessions`
  - `LogClient.tsx` per-workout weight-unit — **NOT** migrated (per-workout scoped, not a user-wide pref)
  - `WorkoutNowClient.tsx` template cache — **NOT** migrated (data cache, not a pref)

**Fresh-session, rested-read next unit — set-logging is the highest-stakes mutation in the app; do not batch with P4:**
- ⬜ **Part 2** — set-logging optimistic. UI advances to next set on submit, rest timer starts on optimistic save (else rest desyncs).
- ⬜ **Part 3** — live session focus mode (sidebar/tabbar collapse, confirm-to-exit).
- ⬜ **Part 4** — history/programmes/body restyle.



```
TASK: v2 pass on Fitness. Set-logging flow is sacred — improve feel, change
no semantics. The live session screen becomes the one genuinely focused
moment in the whole app.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. v2 tokens only. Fitness = primary glow accent; can appear more than
   other sections' accents (active-set indicators, PR moments) but never
   as large background fills.
3. components/ui/ primitives throughout.
4. All fetching via useApi; all mutations via mutateApi, optimistic.
5. No new localStorage — audit and migrate known violations (rest-timer
   hide, exercises hide, completed-session hide, plus any others found).
6. FROZEN: template↔programme live sync, rest timer chime/vibration logic,
   set/rep/weight data model, muscle-map logic.
7. Mobile-first: 390px before 1440px — used mid-workout, one-handed,
   often sweaty. Generous touch targets.
8. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — LOCALSTORAGE AUDIT + MIGRATION
commit: refactor(fitness): migrate UI-hide prefs from localStorage to
ui_prefs
════════════════════════════════════════════════════════════════════
- Grep components/fitness/ and app/fitness/ for every localStorage usage.
  Report all found, not just the three known ones.
- Extend UiPrefs with a fitness_ui field (shape TBD by what's found — your
  call, report which) covering each hide/minimise flag.
- Migrate-once pattern, legacy keys as inert fallback.

VERIFY 1: build clean. Rest timer minimise state, hidden exercises, hidden
completed sessions all persist via ui_prefs, survive localStorage clear.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — DATA LAYER
commit: feat(fitness): useApi + optimistic set logging
════════════════════════════════════════════════════════════════════
- TodayView, WorkoutNowClient, LogClient, HistoryClient → useApi.
- Set logging: UI advances to next set/exercise IMMEDIATELY on submit,
  PATCH in background, rollback returns to prior set. Given the stakes of
  a failed mid-workout save, consider a more prominent inline error state
  than the standard toast — use judgement, report the choice.
- Rest timer must auto-start on the OPTIMISTIC save, not server
  confirmation, or the rest period desyncs from actual rest taken.
- PainLogModal/FinishModal/ExtraSessionModal/AddSessionModal: mutateApi
  where the action is a simple state change; leave as async submit-then-
  navigate where something downstream genuinely needs server confirmation
  first (check FinishModal specifically).

VERIFY 2: build clean. Log a set throttled — instant advance, timer starts
immediately. Sabotage-then-revert specifically on set-logging (highest-
stakes mutation in the app). Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — LIVE SESSION FOCUS MODE
commit: feat(fitness): focused live session screen
════════════════════════════════════════════════════════════════════
- Active session: Sidebar/TabBar collapse to a minimal exit affordance
  requiring confirm (Sheet: "End session early? Progress is saved." /
  Cancel / Confirm) — preserve whatever data-safety behaviour currently
  exists on navigate-away, just add the deliberate confirm step.
- Hero current-exercise name (display weight), large number steppers
  (44px+ targets, +/- flanking tap-to-edit, <Num> tabular), rest timer as
  a prominent Surface level 2 pill with unchanged chime/vibration.
- PR/milestone: check if lib/fitness/progression.ts already surfaces PR
  detection. If yes, wire glow-pulse + brief celebratory state. If PR
  detection doesn't exist client-visibly today, do NOT build it here —
  report that it needs its own scoped prompt.

VERIFY 3: build clean. Start session — chrome collapses. Exit requires
confirm, cancel keeps session, confirm exits with data intact (verify
logged sets survived). Log several sets on mobile without layout jumps.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 4 — HISTORY, PROGRAMMES, BODY RESTYLE
commit: style(fitness): v2 primitives across history, programmes, body
════════════════════════════════════════════════════════════════════
- History/exercise detail: charts with glow-mint as single series colour,
  hairline gridlines, <Num> axis values. One glow-pulse on mount if a PR
  is present in range (reuse Part 3's detection finding, don't invent).
- ProgrammesList/ProgrammeEditor: Surface cards, same drag lift+settle
  treatment as Compost's kanban for visual consistency.
- BodyMetricsView: chart restyle matching history, unit toggle via
  SegmentedControl.
- WorkoutsListClient/WorkoutDetailClient: Surface cards, consistent
  progression chart styling.

VERIFY 4: build clean. Visual coherence check against P2/P3/P4 screenshots.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Four commit hashes + build status; every localStorage violation found and
migrated (full list); error-handling choice for failed set-logging; PR
detection existence + what was done with that finding; rest timer
chime/vibration unchanged confirmation; template↔programme live sync
still works (create test programme from template, edit template, verify
programme reflects it).
```

---

## P6 — HEALTH + NUTRITION ⬜ NOT STARTED

```
TASK: v2 pass on Health + Nutrition. Two heavy monoliths get split
(blood-tests: 1092 lines, recipes: 900 lines). Supplements reuses the exact
P0 optimistic pattern already proven working.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. v2 tokens only. Health accent (teal) as 2px ticks only.
3. components/ui/ primitives throughout.
4. All fetching via useApi; all mutations via mutateApi, optimistic.
5. No new localStorage.
6. FROZEN: blood marker reference ranges/data literals, Claude Vision scan
   flow's actual API calls, meal-planner date math, Open Food Facts/USDA
   adapters, barcode scan flow.
7. Mobile-first: 390px before 1440px.
8. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — SPLIT BLOOD TESTS (zero behaviour change)
commit: refactor(health): split blood-tests monolith into controller +
views
════════════════════════════════════════════════════════════════════
- Extract ResultRow, RangeBar, HistoryTab, AddResultsModal into
  components/health/blood-tests/.
- PANEL_ORDER, ALL_MARKERS data literals move to lib/health/blood-
  markers.ts (or existing convention) — pure data move.
- Controller drops to a manageable size.

VERIFY 1: build clean. All 4 tabs + parsing + range bars identical. Add a
test result, parsing still works. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — SPLIT RECIPES (zero behaviour change)
commit: refactor(health): split recipes monolith
════════════════════════════════════════════════════════════════════
- Extract meal-planner grid, recipe list/detail, Vision-scan flow into
  components/health/recipes/ — no pre-existing component boundary to
  follow, use judgement on the split, report boundaries chosen.
- Date-math helpers move to lib/health/meal-planner-dates.ts.
- Confirm /health/recipes route is correct (should be from P1 — verify
  not redo).

VERIFY 2: build clean. Weekly planner, recipe CRUD, Vision scan (multi-
page merge) all identical to before. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — DATA LAYER
commit: feat(health): useApi + optimistic mutations
════════════════════════════════════════════════════════════════════
- blood-tests, recipes/meal-planner, gut-health, eye-prescription,
  shopping-lists → useApi.
- Supplements: ALREADY has the P0 optimistic pattern — don't rebuild.
  Confirm the daily-checklist page uses the SAME
  `/api/supplements/daily?date=${today}` key as the P0 dashboard card and
  P2 TimelineRail, for genuinely shared cache across all three surfaces
  (flagged as NOT currently shared in the P0 report — fix here).
- Shopping list check-off, meal-planner slot assignment, gut-health/eye-
  prescription entry creation: optimistic.

VERIFY 3: build clean. Check a supplement on the dashboard card, navigate
to the full page, confirm it reflects without a fresh fetch (proves shared
cache). Sabotage-then-revert on shopping-list check-off. Commit, push,
Ready.

════════════════════════════════════════════════════════════════════
PART 4 — NUTRITION LOGGING FLOW
commit: feat(nutrition): mobile-first logging, optimistic entries
════════════════════════════════════════════════════════════════════
- NutritionClient + MacroBar → useApi, <Num> tabular values, smooth width
  transition on update.
- Food logging: scan/search steps stay as-is (genuinely need to wait on
  external calls) — only the final "add to log" commit becomes optimistic.
- MealGroupSection: Surface-based, reorder only if it already supports it.
- Mobile: scan buttons thumb-reachable, checked against TabBar FAB
  collision.

VERIFY 4: build clean. Barcode scan on mobile — scan waits appropriately,
final add-to-log is instant. MacroBar animates smoothly. Commit, push,
Ready.

════════════════════════════════════════════════════════════════════
PART 5 — RESTYLE PASS
commit: style(health): v2 primitives across blood-tests, recipes,
supplements
════════════════════════════════════════════════════════════════════
- Blood tests: RangeBar with hairline track, marker dot, status via
  wash/dot colour (resolved v2-warn/error/info) not saturated fills.
- Recipes: Surface-based grid/cards. Vision scan gets visible multi-page
  progress feedback if genuinely missing (check first).
- Supplements: confirm v2 tokens (existing pattern, may still be on legacy
  names).
- Eye prescription: confirm sections.ts entry from P1, restyle EyeCard.
- Shopping lists, gut-health: Surface-based restyle.

VERIFY 5: build clean. Visual coherence against prior screenshots. Commit,
push, Ready.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Five commit hashes + build status; Supplements cache-sharing fix verified
working across all three surfaces (how verified); blood-tests/recipes
component boundaries chosen; Vision scan progress feedback added or
already existed.
```

---

## P7 — FINANCE ⬜ NOT STARTED

```
TASK: v2 pass on Finance. Numbers are the product here — typography does
the heavy lifting, restraint does the rest.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. v2 tokens only. Finance accent (cool blue) as 2px ticks only.
3. components/ui/ primitives throughout, <Num> for every numeric value.
4. All fetching via useApi; all mutations via mutateApi, optimistic.
5. No new localStorage.
6. FROZEN: CSV parsers (per-bank), PayPal API/match/persist logic,
   taxonomy/categorise.ts assignment rules, net-worth snapshot logic,
   privacy redaction mechanism (constant-width masking) itself — you may
   USE PrivacyContext, not modify how masking works.
7. Mobile-first: 390px before 1440px.
8. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — NUMERALS + HIERARCHY PASS
commit: style(finance): tabular numerals and value hierarchy
════════════════════════════════════════════════════════════════════
- Every currency/numeric value across Finance routes goes through <Num>
  (which delegates to existing Money for currency — confirmed working
  from P0). Grep for any remaining ad-hoc £/number formatting and convert.
- Establish value hierarchy by SIZE/WEIGHT not colour: hero numbers
  (net position, headline totals) largest/heaviest; supporting figures
  smaller/lighter. Negative values: --v2-error, sparingly. Positive:
  --glow-dim, sparingly — most figures should be neutral text-hi/text-mid,
  colour reserved for actual signal (loss/gain), not decoration.
- Overview page: net position becomes the single largest number on the
  page (display weight/size from the font-swap prompt).

VERIFY 1: build clean. Privacy toggle masks every value including any
chart axis labels — verify specifically, this was a known risk area.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — DATA LAYER
commit: feat(finance): useApi + optimistic categorisation
════════════════════════════════════════════════════════════════════
- SpendingClient, AccountsClient, AnalysisClient, InvestmentsClient →
  useApi.
- Transaction category reassignment: optimistic via mutateApi (instant UI,
  rollback + toast on failure). AI categorisation trigger stays as a
  genuine async action (real LLM call, can't be optimistic) — only the
  manual override/reassignment becomes optimistic.
- Investment price refresh: keep its existing batched-5 pattern, but
  surface a visible progress indicator (X of Y batches) using Skeleton or
  a simple progress element — check if this feedback already exists.

VERIFY 2: build clean. Manually reassign a transaction's category —
instant, rollback works on simulated failure. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — SPENDING + IMPORT RESTYLE
commit: style(finance): spending table, category chips, import flow
════════════════════════════════════════════════════════════════════
- Transaction table: compact density option (respects ui_prefs.density),
  hairline row dividers, <Num> throughout.
- Category chips: ghost-style (hairline border, not filled backgrounds),
  reuse the chip visual language established in Compost/Ventures rather
  than inventing a fourth variant.
- CSV import flow (per-bank): restyle with clear step indicators (Surface-
  based progress), each bank's specific parsing logic untouched — this is
  UI chrome around an unchanged pipeline.
- PayPal match/reconcile flow: restyle match cards, keep matching logic
  untouched.

VERIFY 3: build clean. Import a real (or test) CSV end to end — parsing
still correct, UI clearly shows progress through the steps. Commit, push,
Ready.

════════════════════════════════════════════════════════════════════
PART 4 — ANALYSIS + INVESTMENTS RESTYLE
commit: style(finance): analysis charts, investments P&L
════════════════════════════════════════════════════════════════════
- Analysis charts (category/temporal): one series colour per chart max
  (glow or the finance blue, not both plus category colours competing),
  hairline gridlines, <Num> for all labels.
- Investments: P&L colouring via subtle wash backgrounds, not solid
  saturated fills. Refresh action shows per-batch progress from Part 2.

VERIFY 4: build clean. Visual coherence against prior sections'
screenshots. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Four commit hashes + build status; confirmation privacy toggle masks
everything including charts; confirmation CSV import/PayPal match logic
functionally unchanged; investment refresh progress indicator
implementation.
```

---

## P8 — DROPS · STUDIO · THE BOYS · OTHER (+ SETTINGS v2) ⬜ NOT STARTED

```
TASK: v2 pass on the remaining sections, plus the real Settings v2 build —
this is the bounded customisation scope agreed earlier: layout, feature
flags, preferences. Not colours/fonts/arbitrary theming.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. v2 tokens only. Section accents as 2px ticks only.
3. components/ui/ primitives throughout.
4. All fetching via useApi; all mutations via mutateApi, optimistic.
5. No new localStorage — this prompt is where ui_prefs becomes the
   genuinely user-facing customisation surface.
6. FROZEN: agent tool-calling logic, voice chat silence-detection/TTS
   pipeline, Spotify/PC-metrics data collection, drops monitor/alert logic.
7. Mobile-first: 390px before 1440px.
8. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — DROPS
commit: style(drops): v2 primitives across calendar, monitor, raffles,
cook guides
════════════════════════════════════════════════════════════════════
- Convert fetching to useApi.
- Calendar: Surface day cells, consistent with Compost's calendar view.
- Monitor: list shows last-check freshness (relative time via existing
  date utils), status via wash colour not saturated fill.
- Raffle states: ghost chips (ties into the chip language established in
  P4/P7 — reuse, don't reinvent again).
- Cook guides: clean article layout, headings at display weight, body at
  normal weight — this is read-heavy content, prioritise legibility
  (max-width reading column, don't let it stretch full-width like the
  kanban views need to).

VERIFY 1: build clean. Restock monitor still triggers Telegram alerts
correctly (verify the alert pipeline wasn't touched, just its list UI).
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — STUDIO
commit: style(studio): v2 primitives across PC metrics, Spotify
════════════════════════════════════════════════════════════════════
- PC metrics: gauge rings restyled as hairline rings with <Num> centred
  values (not filled saturated gauges — restraint, per the design thesis).
  Sparklines thin, single colour. Drive bars: hairline track, glow-dim
  fill.
- Spotify: album-art-forward cards using next/image with proper lazy
  loading, <Num> for play counts/stats.
- Confirm PC metrics live-data polling (Windows service) is untouched —
  this is styling only, the ingestion pipeline is frozen.

VERIFY 2: build clean. Live PC metrics still update correctly (watch a
value change in real time if the service is running). Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — THE BOYS (agent chat)
commit: style(agents): v2 chat surface, voice overlay recolour
════════════════════════════════════════════════════════════════════
- Message bubbles on Surface level 2, user vs agent visually distinct via
  alignment + subtle background level difference (not colour-coding by
  hue — stay within the restrained palette).
- IF streaming responses are already implemented, verify unchanged. IF
  responses currently arrive in one block (not streamed), do NOT implement
  streaming here — that's an API/architecture change out of scope for a
  styling prompt. Report which is the current state.
- Voice overlay waveform: recolour to glow-dim on surface-0 background,
  keep the existing AnalyserNode/getByteFrequencyData visualisation logic
  untouched, this is a colour/style change only.
- Tool-confirmation cards (before an agent executes create_task etc):
  restyle with clear approve/deny via Button primary/ghost, keep the
  confirmation gating logic itself untouched.

VERIFY 3: build clean. Have a real conversation with an agent, confirm
tool-calling confirmation flow still works exactly as before, voice chat
loop (dictate + full voice mode) both still function. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 4 — SETTINGS v2 (bounded customisation)
commit: feat(settings): v2 settings page — appearance, layout, sections,
integrations
════════════════════════════════════════════════════════════════════
Rebuild /other/settings with a left-anchored section list (Sheet-based
navigation on mobile — tapping a category opens it as a full sheet rather
than an in-page scroll, given how much content this page has):

- Appearance: density (SegmentedControl comfortable/compact, wired to
  ui_prefs.density — this makes P4's table density actually user-
  controllable), motion (full/reduced/off, wired to the P0 data-motion
  attribute), tickers — NOTE: tickers were removed entirely in P2, so
  omit this toggle, don't resurrect a dead feature.
- Layout: pinned mobile tabs editor (same UI pattern as the TabBar's More-
  sheet pin editor from P1 — reuse that component if it was built
  generically enough, else rebuild consistently), hidden sections
  multi-select (drives Sidebar/TabBar/⌘K — verify hiding here actually
  removes a section everywhere, this was flagged as a P8 verify item),
  dashboard layout reset button (clears ui_prefs.dashboard_layout back to
  defaults).
- Sections: per-section feature flags — if hiding a section already
  covers "I don't use Drops", decide if a separate feature-flag layer is
  even needed beyond hidden_sections, or if that IS the feature-flag
  system. Don't build two parallel systems that do the same thing — use
  judgement, report the decision.
- Integrations: existing Google Calendar/Spotify/Telegram connection
  blocks, restyled with Surface/Button, connection status via wash colour
  not saturated badges. Include the shortcut-setup link added in P1.5.
- Capture: existing capture-source-labels config, restyled.
- Data: Export + API Usage pages linked (restyle those two pages
  themselves too — Surface-based layout, <Num> for usage figures).

All settings writes optimistic via mutateApi against ui_prefs/
user_settings as appropriate (ui_prefs fields vs the other user_settings
columns — route each write to the correct table/column).

VERIFY 4: build clean. Hide a section — confirm it disappears from
Sidebar, TabBar's More sheet, AND ⌘K search results (three places, verify
all three). Change density — confirm Compost's table (from P4, if already
shipped) actually responds. Motion off — confirm animations stop app-wide.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Four commit hashes + build status; confirmation drops alert pipeline
untouched; confirmation PC metrics live polling untouched; whether agent
chat is currently streamed or single-block (report, don't fix); the
feature-flags-vs-hidden-sections decision made in Part 4; confirmation
hiding a section propagates to all three surfaces (sidebar/tabbar/search).
```

---

## P9 — SPEED PASS ⬜ NOT STARTED

```
TASK: Performance sweep now that all surfaces are v2. This is where the
"faster" half of the original brief gets measured, not just asserted.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. FROZEN: everything functional — this prompt should change zero
   behaviour, only loading strategy and bundle composition.
3. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — STRAGGLER AUDIT
commit: refactor(perf): convert remaining raw fetch to useApi
════════════════════════════════════════════════════════════════════
- Grep the entire codebase for useEffect + fetch patterns that were NOT
  touched by P2–P8 (likely: Studio's remaining pages if P8 Part 2 didn't
  cover everything, Drops raffle/wishlist detail views, any *Client.tsx
  not explicitly named in a prior prompt).
- Convert each to useApi. List every file converted in the report.

VERIFY 1: build clean. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — BUNDLE ANALYSIS
commit: perf(bundle): dynamic import heavy leaves
════════════════════════════════════════════════════════════════════
- Run next build with the bundle analyzer (add @next/bundle-analyzer if
  not present, or use next build's built-in stats).
- Dynamic-import (next/dynamic, ssr: false where appropriate): chart
  libraries (any recharts/chart.js usage), the Leaflet places map,
  barcode/label scanner components, the agent voice overlay
  (AudioContext/AnalyserNode setup), the MyceliumField canvas art if it
  isn't already lazy.
- Confirm the P4/P6/P7 monolith splits actually reduced first-load JS per
  route — compare before/after bundle sizes for /organisation/tasks,
  /health/blood-tests, /health/recipes specifically (the three biggest
  splits).

VERIFY 2: build clean. Report bundle size deltas for the routes above.
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 3 — PREFETCH + IMAGES
commit: perf(nav): prefetch on hover/touch, next/image everywhere
════════════════════════════════════════════════════════════════════
- Sidebar/TabBar links: prefetch on hover (desktop) / touchstart (mobile)
  if not already Next's default Link behaviour handles this — check
  current prefetch config first, Next.js Link prefetches by default in
  many cases, don't duplicate.
- ⌘K: prefetch the highlighted result as the user arrows through.
- Grep for any remaining <img> tags (inspiration board, Spotify art, media
  items) not using next/image — convert with correct sizes attrs.

VERIFY 3: build clean. Report which prefetch behaviour was already
default vs newly added. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 4 — API CACHING
commit: perf(api): cache headers on stable read-heavy endpoints
════════════════════════════════════════════════════════════════════
- Weather and any remaining stable/slow-changing GET endpoints: confirm
  server-side caching exists (weather already has a 3-hour cache per the
  context doc — verify, don't rebuild). Add Cache-Control headers where
  genuinely missing on read-heavy, infrequently-changing data.
- Do NOT cache anything user-mutation-sensitive (tasks, captures) — SWR's
  focus-revalidation already handles freshness there.

VERIFY 4: build clean. Report which endpoints got new cache headers vs
already had server-side caching. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 5 — MEASURE
commit: none (verification/reporting only)
════════════════════════════════════════════════════════════════════
- Run Lighthouse mobile on /, /organisation/tasks, /fitness (or whatever
  the WorkoutNow route ended up being), /health/blood-tests.
- Compare against the P1 post-P5 baseline number (P9 baseline decision
  from the P1 report — using post-nav-rebuild as the reference point since
  a true pre-P1 baseline was missed).
- Report per-route before/after.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Four commit hashes (Part 5 zero-commit) + build status; straggler files
converted list; bundle size deltas for the three biggest monolith splits;
Lighthouse before/after per route; any remaining known perf debt not
addressed in this pass (report honestly, don't claim completeness if
something was skipped for time).
```

---

## P10 — MULTI-USER (auth, RLS, walls, metering) ⬜ NOT STARTED — BRANCH ONLY

```
TASK: Multi-user foundation — the SaaS unlock. Work on a branch —
EXCEPTION to auto-push-to-main: create branch `multi-user`, push there,
Phil merges after verification against a production data backup.

════════════════════════════════════════════════════════════════════
GLOBAL RULES (rule 1 amended: branch, not main)
════════════════════════════════════════════════════════════════════
1. All work happens on git branch `multi-user`. Do NOT push to main at any
   point in this prompt. `npx next build` before every commit regardless.
2. PRE-FLIGHT, before ANY migration: take a full Supabase backup (pg_dump
   via the connection string). Confirm with Phil the backup exists and is
   restorable before proceeding past this step.
3. After final push to the branch: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 0 — PRE-FLIGHT (STOP for Phil's confirmation before Part 1)
════════════════════════════════════════════════════════════════════
- Take the backup. Report the backup file/location and confirm its size
  looks sane (not empty, roughly matches expected DB size).
- Enumerate every table in the Supabase schema. For each, report whether
  it currently has a user_id (or equivalent) column and whether it
  contains genuinely personal data vs shared/reference data (e.g. exercise
  catalogue, drop retailer list might be legitimately shared across
  users). Present this full list to Phil and WAIT for explicit
  confirmation on which tables get user_id added before writing any
  migration. Do not proceed to Part 1 without that confirmation.

════════════════════════════════════════════════════════════════════
PART 1 — AUTH
commit: feat(auth): Supabase Auth email + magic link
════════════════════════════════════════════════════════════════════
- Add Supabase Auth (email+password + magic link). Restyle the login page
  with v2 primitives.
- Replace the HMAC cookie middleware (lib/auth/cookie.ts) with Supabase
  session middleware. Keep an env-flag fallback to the old cookie
  mechanism for one release cycle in case of issues.

VERIFY 1: build clean on branch. Log in via both email+password and magic
link on a preview deploy. Old cookie fallback still works if the flag is
set. Commit (branch), push (branch).

════════════════════════════════════════════════════════════════════
PART 2 — SCHEMA MIGRATIONS
commit: feat(db): add user_id + RLS to user-data tables (per Part 0
confirmation)
════════════════════════════════════════════════════════════════════
- Sequential migrations, one per logical group of tables (not one giant
  migration): add user_id uuid to every table confirmed in Part 0,
  backfill with Phil's UID, then NOT NULL after backfill succeeds.
- Enable RLS on each; policy user_id = auth.uid().
- Shared/reference tables (per Part 0): explicit read-only policies, no
  user_id needed.

VERIFY 2: build clean on branch. Query each migrated table as Phil's user
— all existing data intact, correctly attributed. Commit (branch), push.

════════════════════════════════════════════════════════════════════
PART 3 — API ROUTE SCOPING
commit: refactor(api): user-scoped server client replaces service role
════════════════════════════════════════════════════════════════════
- Replace service-role Supabase usage in /api/* routes with the user-
  scoped server client (session cookies), EXCEPT cron/webhook/Telegram
  routes — those keep service role + secret header auth and must
  explicitly resolve which user's data they're operating on (currently
  implicit via USER_ID env — make it explicit).

VERIFY 3: build clean on branch. Every route still works for Phil's own
data via the new scoping. Cron jobs (bins, google-sync, reminders,
drops-monitor) still authenticate and operate correctly.  Commit (branch),
push.

════════════════════════════════════════════════════════════════════
PART 4 — WALLS + INVITES
commit: feat(auth): invite codes, test-user isolation verification
════════════════════════════════════════════════════════════════════
- Simple invite-code table; Settings → "Invite a friend" generates a code;
  signup requires a valid code.
- Create a second test user account. Write and run a checklist script (or
  manual pass, report which) hitting every major API endpoint as the test
  user, confirming ZERO rows of Phil's data are visible. This is the
  single most important verification in this entire prompt — do not skip
  or abbreviate it.
- New user seeding: sensible empty state, default visible sections
  (Organisation/Fitness/Health), Drops/Ventures/Studio hidden by default
  via ui_prefs.hidden_sections.

VERIFY 4: the isolation test from above must show zero leakage. Report the
full endpoint-by-endpoint result, not just a summary claim. Commit
(branch), push.

════════════════════════════════════════════════════════════════════
PART 5 — USAGE METERING
commit: feat(billing-prep): per-user token usage tracking
════════════════════════════════════════════════════════════════════
- api_usage rows get user_id. Per-user usage visible in Settings → Data
  for admin-flagged users (add an is_admin boolean to user_settings,
  default false, set true for Phil manually).
- This is metering only — NO billing/Stripe integration, that's
  explicitly out of scope for the whole project per Phil's decision.

VERIFY 5: build clean on branch. Usage figures correctly attributed per
user. Commit (branch), push.

════════════════════════════════════════════════════════════════════
FINAL REPORT — DO NOT MERGE TO MAIN
════════════════════════════════════════════════════════════════════
All commit hashes on the multi-user branch; the full Part 0 table
enumeration and Phil's confirmed decisions; the Part 4 isolation test full
results; explicit statement that main is untouched and merge requires
Phil's manual review + approval against the production backup taken in
Part 0.
```

---

## P11 — TOKEN EFFICIENCY ⬜ NOT STARTED

```
TASK: Cut LLM spend without degrading quality. Measured, not assumed.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. One atomic commit per PART. `npx next build` before every push.
2. FROZEN: agent personality/behaviour quality — every change must be
   verified against real test prompts before/after, not assumed safe.
3. After final push: npx graphify update .

════════════════════════════════════════════════════════════════════
PART 1 — PROMPT CACHING
commit: perf(ai): cache_control breakpoints on agent system prompts
════════════════════════════════════════════════════════════════════
- Add cache_control breakpoints to all agent system-prompt call sites in
  lib/ai/anthropic.ts (or wherever prompts are assembled) — static prefix
  (persona, tools, memory summary) cached, only the conversation turn
  varies.
- This is the single biggest lever (up to ~90% cost reduction on the
  cached portion) and carries the lowest quality risk of anything in this
  prompt — do this part first and thoroughly.

VERIFY 1: build clean. Have a real conversation with each of the 7 agents,
confirm responses are qualitatively unchanged. Report the cache hit
behaviour (check response headers/usage stats for cache_read tokens).
Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 2 — MODEL TIERING
commit: perf(ai): route classification/extraction to Haiku
════════════════════════════════════════════════════════════════════
- classifyCapture, purchase-category extraction, entity resolution → move
  to the current Haiku model (check ai_spending_categorisation_model in
  user_settings — it defaults to the OLD 'claude-haiku-20240307', update
  to a current Haiku model string as part of this, don't just add more
  routes to a stale model).
- Centralise model name strings into lib/config rather than literals
  scattered across files, if not already the case.
- Vision scans (recipe/blood-test/eye-prescription photo parsing) STAY on
  Sonnet — accuracy matters more there and the existing keyword-heuristic
  fallback guards classification/extraction quality risk, not vision.

VERIFY 2: build clean. Test capture classification on 10 varied real
capture examples — compare quality against pre-change behaviour (informal
comparison, use judgement). Report the model string update. Commit, push,
Ready.

════════════════════════════════════════════════════════════════════
PART 3 — DA BOI CONTEXT DIET
commit: perf(ai): lazy live-data injection for Da Boi
════════════════════════════════════════════════════════════════════
- Da Boi currently injects all six agent memory summaries + all live data
  (workouts/spend/tasks/calories) on every message. Add a lightweight
  pre-pass (cheap Haiku call, or a keyword heuristic if that's reliable
  enough — try heuristic first, only add an LLM pre-pass if keyword
  matching proves insufficient) that decides which of the six summary
  blocks and which live-data blocks are actually relevant to the current
  message, injecting only those.
- This must not degrade Da Boi's "can do everything" cross-agent
  awareness for genuinely cross-domain questions — test with a question
  that legitimately spans fitness + nutrition to confirm both blocks still
  get included when relevant.

VERIFY 3: build clean. Test Da Boi with: a fitness-only question (should
skip finance/nutrition blocks), a cross-domain question (should include
both relevant blocks), a totally generic question (should inject minimal
context). Report token counts before/after for each test case. Commit,
push, Ready.

════════════════════════════════════════════════════════════════════
PART 4 — MEMORY + PRE-CLASSIFIER EXTENSIONS
commit: perf(ai): tighter memory summaries, extended pre-classifier
════════════════════════════════════════════════════════════════════
- Memory summarisation: hard cap 300 words at summarise time (check
  current cap, likely 400 per the context doc — reduce), dedupe near-
  identical bullets in the summarisation prompt itself.
- Extend the pre-classifier short-circuit list (weight logging already
  exists) to cover: supplement checks, habit checks, "add X to shopping
  list" (verify this ALREADY short-circuits per the context doc's
  mention — if it doesn't, add it; if it does, leave alone). Each new
  short-circuit pattern needs its own keyword-heuristic guard matching the
  existing pattern's structure.

VERIFY 4: build clean. Confirm each new short-circuit pattern correctly
bypasses the LLM classifier for its intended input and correctly falls
through to the LLM for ambiguous input. Commit, push, Ready.

════════════════════════════════════════════════════════════════════
PART 5 — MEASURE
commit: none (verification/reporting only)
════════════════════════════════════════════════════════════════════
- Confirm api_usage tracking captures the before/after token counts from
  Parts 1-4 (should already log per-call, per the existing table).
- After a day of normal use post-deployment, pull the API Usage page
  numbers and report the actual measured reduction — not an estimate.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Four commit hashes (Part 5 zero-commit) + build status; prompt-caching hit
rate observed; classification quality spot-check results (Part 2); Da
Boi's context-diet test results for all three scenarios; new short-circuit
patterns added and verified; the measured (not estimated) token reduction
after a day of real usage.
```

---

## SESSION LOG (update as prompts land)

| Prompt | Status | Commits | Notes |
|---|---|---|---|
| P0 | ✅ Done, verified | 4264d93, 3395d19, aec0261, fea3f00, 6f4689b | Fraunces axes needed `weight: "variable"` workaround |
| P0.5 | ✅ Done | (font swap commit) | Fraunces → Inter Tight per Phil's call |
| P1 | ✅ Done, verified | df88f4c, 49c1ca5, 025f9c8, daf7d27, 66cd9ff | CSS PageFade used instead of native View Transitions flag |
| P1.5 | ✅ Done | (nav follow-up commit) | Assistant added, shortcut-setup routed via Settings |
| P2 | 🔶 Fired, unverified by use | 4 commits expected | **VERIFY BY USE before P4** |
| P3 | ✅ Done | c527a49, bff473f, d053c67, 0ff48e7 | Follow-ups: (a) inspiration board restyle deferred (own commit); (b) Founder agent verification not run — verify tool calls reflect in new UI next time it's open |
| P4 | 🔶 Groundwork done | 27a49f4 (split), 179527a (prefs) | Parts 2/4/5 pending — fresh session; run browser behavioural sweep (7 views + shortcuts + bulk + detail + drawer) before Part 2 |
| P5 | 🔶 Part 1 done | 0b9a10e | Parts 2/3/4 pending — Part 2 set-logging is highest-stakes mutation, fresh session only |
| P6–P11 | ⬜ Not started | — | — |

**Before P4 (Compost) starts, in any session: manually complete a task,
check a venture step, and confirm both survive a reload. If either fails,
stop and diagnose before touching Compost.**
