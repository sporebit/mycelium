# MYCELIUM REDESIGN — ALL PROMPTS (P0–P12)
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
- ✅ **Part 1** (`27a49f4`) — split TasksClient inline components → `TaskDetailPaneWrap`, `TaskMainView`, `TaskListSkeleton`, `ProjectFilterDropdown`. Build-verified, then **browser-verified 2026-08-28** (headless Playwright): all seven views render clean, detail pane opens, no console or page errors, bulk select + bulk urgency change confirmed against throwaway tasks. Part 1 is behaviourally sound.
- ✅ **Part 3** (`179527a`) — `miles-crm-view`, `mycelium:showCompleted`, `mycelium:showProjectTasks` migrated to `ui_prefs.compost_view` / `compost_show_completed` / `compost_show_project`. Legacy keys stay as inert fallback. URL param sync untouched.

**Fresh-session, rested-read next unit:**
- 🔶 **Part 2 — mostly done (2026-08-28)**, `f5d2a08` + `b5704d5`. All six clients now fetch through `useApi`, so Compost shares cache entries with the dashboard and NowBlock instead of holding private copies. Captures/People/Projects/Purchases/Decisions also mutate through `mutateApi`/`apiWrite` (optimistic, rollback, ApiErrorToast). TasksClient's list and projects fetches moved to `useApi` behind a `setTasks` shim, so all 17 existing optimistic call sites are unchanged — its hand-rolled optimism already had rollback, so the win there is the shared cache, not latency.

  **Part 2 completed** in `0c154a8`: the detail pane is now keyed on `/api/tasks/{id}` through `useApi` behind a `setDetailState` shim (all six optimistic call sites unchanged), `triggerFieldPulse()` fires on confirmed completion matching NowBlock, and the comment handlers went through `apiWrite`. `addSubtask` already routed via `createTask`, which checks its response, so it needed nothing. Browser-verified: deep-linking `?task=<id>` loads the pane with a single keyed GET, a comment persists and renders, seven views and bulk unchanged.

  **Answered ahead of Part 2 (2026-08-28):** the bulk-action contract question is
  settled. `/api/tasks/bulk` already exists, whitelists exactly
  status/urgency/due_date/project_id, applies them in one statement
  (all-or-nothing) and logs activity. The bulk bar was fanning out N per-item
  PATCHes instead; `6e45078` switched it to the bulk endpoint. Two defects were
  fixed at the same time: `Promise.all` over `fetch` never rejects on a 4xx/5xx,
  so a server-rejected bulk update reported success, and the non-delete branch
  captured no rollback snapshot at all. Both branches now check `res.ok` and
  restore `prev`. Verified by sabotaging the endpoint to 500 — toast reads
  "Bulk update failed", the UI reverts, the server is unchanged.

  Also fixed (`0dcb122`): Part 3's ui_prefs hydration clobbered an explicit
  `?view=` URL param, breaking deep links — contradicting Part 3's own
  "URL param sync stays untouched" constraint. The URL param now wins.
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

## P6 — HEALTH + NUTRITION 🔶 PARTS 1, 2 DONE — PARTS 3, 4, 5 PENDING

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

## P7 — FINANCE 🔶 PARTS 1–4 DONE

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

## P8 — DROPS · STUDIO · THE BOYS · OTHER (+ SETTINGS v2) 🔶 PARTS 1–3 DONE, 4 MOSTLY

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

## P9 — SPEED PASS 🔶 PARTS 1–2 PARTIAL, 3 N/A

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

## P10 — MULTI-USER (auth, RLS, walls, metering) ⛔ SUPERSEDED BY P12 (2026-09-06) — do not fire

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

## P11 — TOKEN EFFICIENCY ✅ DONE

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

## P0-S — RLS EVERYWHERE (security hotfix, main branch) ✅ DONE

**Landed (`e49f520`, 6 Sep 2026) — as migration `0101`, not `0097`:** 0097–0100
were taken by the fitness/nutrition/PTP work between writing this prompt and
firing it.

**The premise below was wrong, and the work was re-scoped against the live
database.** Part 1's enumeration found the opposite of what was expected:

- 91 of 91 public tables already had `rowsecurity = true`. None were
  unprotected.
- `anon` held only REFERENCES/TRIGGER/TRUNCATE — no SELECT/INSERT/UPDATE/
  DELETE. A live probe with the real anon key returned `42501 permission
  denied` on every table tried, so there was no anon-key data exposure.
- `authenticated` additionally held SELECT on all 92 relations — inert
  today (no Supabase Auth users, RLS denies anyway) but a standing grant a
  future auth rollout would light up.

What `0101` actually fixed:

1. 39 tables had RLS on with **no policy at all** — implicitly deny-all, but
   one permissive policy added later would silently open the table. Each now
   carries an explicit `restrictive ... using (false)`, which a later
   permissive policy cannot override.
2. Eight tables carried a permissive `current_setting('app.user_id')` policy
   with no restrictive backstop (`exercise_aliases`, `health_metrics`,
   `health_workouts`, `pc_components`, `places`, `reminders`, `supplements`,
   `supplement_logs`). Left in place for P12 to replace, now inert behind the
   deny-all.
3. `anon`/`authenticated` held TRUNCATE on every table. Revoked.

`FORCE ROW LEVEL SECURITY` was deliberately not set — the table owner is
`postgres`, which also runs migrations, so forcing it would break seed
migrations. PostgREST never connects as the owner. Migration `0101` is applied:
`supabase migration list` shows Local and Remote both at 0101.

**Prompt as fired, for the record:**

```
TASK: Close the anon-key exposure. Per the migration files, 32 tables have
no RLS: everything created in 0051–0090 except media_items, plus
user_settings (which holds Google OAuth token columns). Supabase grants
anon and authenticated full CRUD on public tables by default, and the anon
key ships in the browser bundle. One migration, one commit, on main.
Independent of P12 — do not wait for it.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. `rm -rf .next && npx next build` before push — per AGENTS.md.
2. No secret value in any report or commit message. Env var NAMES only.
3. Read-only diagnostics via the Supabase CLI; never destructive SQL
   outside a migration file.

════════════════════════════════════════════════════════════════════
PART 1 — ENUMERATE
commit: none
════════════════════════════════════════════════════════════════════
- Query pg_tables/pg_class for every table in schema public with
  rowsecurity = false. Report the list. Expected (from migration files):
  blood_test_markers, blood_test_sessions, blood_test_results, agents,
  agent_conversations, agent_messages, agent_memory, accounts,
  gut_health_logs, eye_prescriptions, recipes, shopping_lists, meal_plan,
  media_episodes, events, investments, spotify_tokens, spotify_plays,
  ventures, venture_steps, venture_ads, venture_inspiration, drops,
  wishlist_items, raffle_entries, cook_guides, drop_monitors,
  weather_cache, bin_schedule_config, bin_garden_seasons,
  bin_google_events, user_settings.
- Also report every table where anon or authenticated hold any privilege
  (information_schema.role_table_grants).
- If the live list differs from the expected list, use the LIVE list.

════════════════════════════════════════════════════════════════════
PART 2 — MIGRATION 0097 (landed as 0101)
commit: fix(db): enable RLS on every table, revoke anon/authenticated
════════════════════════════════════════════════════════════════════
- supabase/migrations/0097_rls_everywhere.sql, following the 0092/0094
  pattern for every table from Part 1:
    alter table X enable row level security;
    drop policy if exists "deny all" on X;
    create policy "deny all" on X as restrictive using (false);
    grant all on X to service_role;
- Then, for the whole schema:
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from
      anon, authenticated;
  The app reads through the service role only, so nothing user-facing
  depends on anon/authenticated grants. If Part 1 shows a table the
  browser client (lib/supabase/client.ts, anon key) genuinely reads,
  STOP and report it before revoking.
- Keep the reminders table's existing app.user_id policy as-is (it is
  additive; P12 replaces it).
- `supabase db push`, then `supabase migration list` — Local and Remote
  both show 0097.

VERIFY: (a) Supabase dashboard → Advisors → Security shows zero
"RLS disabled in public" findings — report the count before and after.
(b) For spotify_tokens, user_settings and three others from the list,
`curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=*" -H "apikey:
$NEXT_PUBLIC_SUPABASE_ANON_KEY"` returns an empty array or a 401/403 —
report the HTTP status per table, never the body. (c) The live site still
works: open Spotify dashboard, blood tests, investments, settings.
(d) Build clean. Commit, push main.

════════════════════════════════════════════════════════════════════
FINAL REPORT
════════════════════════════════════════════════════════════════════
Live no-RLS list vs expected; grants found; commit hash; advisor counts
before/after; per-table curl statuses; any table that needed anon access
(expected: none).
```

---

## P12 — MULTI-USER / TEAMS (supersedes P10) 🔶 IN PROGRESS — PARTS 0–1 DONE, PART 2 NEXT, BRANCH `multi-user`

See `docs/multi-user-handoff.md` for live state, locked decisions and the next
actions. Two decisions are locked and must not be relitigated: the rehearsal
environment is Docker + `supabase start`, and the legacy HS256 JWT secret
exists, so Part 3 takes the short-lived-JWT path rather than the direct-Postgres
fallback.

```
TASK: Multi-user foundation — identity, spaces, teams, grants, audit,
rundowns. Supersedes P10 entirely. Work on branch `multi-user` (EXCEPTION
to auto-push-to-main). Migrations are authored on the branch and verified
ONLY against a local Supabase stack until Part 7 (cutover). Phil merges.

Decisions this prompt encodes (Phil, 2026-09-06 — do not relitigate):
- ≤5 users; invite-only; non-Phil users get web + push only (no Google,
  Spotify, Apple Health, Telegram or PC-agent integrations); agents (The
  Boys, /fitness/coach, /finance/advisor) stay Phil-only.
- Auth: Supabase Auth — magic link, password + TOTP, passkeys (beta,
  experimental flag), Google. Apple sign-in DEFERRED. TOTP mandatory for
  instance owner, team owners, team admins.
- Old HMAC cookie survives only as a dormant break-glass path.
- Every record belongs to a space: one personal space per user, one per
  team. Grants attach to spaces at section + entity-group grain. Verbs:
  view, edit, create_delete, share.
- Roles per team: owner (exactly one), admin, member, viewer — plus
  per-member section toggles that narrow, never widen.
- Direct user→user grants are a separate table but resolve through the
  SAME SQL function as team membership. One policy per table.
- Finance is hard-excluded from sharing: owner-only policy shape and a
  check constraint. No code path can grant it.
- Instance owner (Phil) manages access, never reads others' content;
  RLS has no instance-owner bypass anywhere.
- Owner leaving → named successor (instance owner appoints if the owner
  vanishes, audited). Member leaving → contributions stay with the team.
- Audit includes cross-user reads, visible to the data owner.
- Export + full delete are self-service.
- Rundowns: per-team settings, per-recipient opt-out; rendered once PER
  RECIPIENT under that recipient's identity; email + push + in-app;
  Telegram for Phil only.
- Cutover: all existing data → Phil's personal space; teams start empty.
Defaults for the open items (edit these lines before firing if wrong):
  A. AI-backed features (voice capture, AI categorisation, vision scan,
     capture classification) default OFF for non-Phil users; instance
     owner can enable per user.
  B. workout_exercises is a SHARED read-only catalogue.
  D. user_id text columns ARE converted to uuid.

════════════════════════════════════════════════════════════════════
GLOBAL RULES
════════════════════════════════════════════════════════════════════
1. Branch `multi-user`; push there only. `rm -rf .next && npx next build`
   before every commit regardless. One commit per PART, messages below.
2. NEVER `supabase db push` in this prompt. All migrations are verified on
   `supabase start` (local stack). `supabase db reset` is allowed LOCALLY
   only. The live DB is touched once, in Part 7, by Phil.
3. This branch owns supabase/migrations/** for its lifetime. Number from
   0098. If main gains migrations meanwhile, renumber before merge —
   migrations replay number-ordered, not merge-ordered.
4. No secret value in any report, doc or commit. Env var NAMES only.
5. Service-role client (`createServerClient`) becomes importable ONLY from
   lib/system/**. Enforce with ESLint no-restricted-imports. Every page
   and /api route uses the user-scoped client. RLS is the wall; app code
   is UX.
6. Every table is in exactly one of: the entity registry (has space_id),
   the shared-reference list, or Supabase-internal. A test enforces this.
7. Reports contain findings, file paths, commit hashes, deviations. Never
   reproduce code in a report. After the final push: `npx graphify update .`

════════════════════════════════════════════════════════════════════
PART 0 — PRE-FLIGHT
commit: chore(multi-user): pre-flight — deps, registry, rollback runbook
════════════════════════════════════════════════════════════════════
- Create branch `multi-user` from main (main must already carry 0101).
- Add deps: @supabase/ssr, resend. Confirm @supabase/supabase-js ≥ 2.105
  (passkeys need it).
- `supabase start`; replay 0001–0101 clean on the local stack. Report any
  migration that fails locally — that is a pre-existing drift, fix it
  first as its own commit.
- Enumerate every table in public and classify against this registry.
  Section: organisation | fitness | health | finance | studio | drops |
  ventures | journal | places | reminders | media | platform.
  Entity groups (table → group), e.g.:
    fitness.programmes: workout_programmes, workout_programme_phases,
      workout_programme_sessions, workout_programme_exercises, workouts
    fitness.sessions: workout_sessions, workout_session_exercises,
      workout_sets, workout_session_types, pending_workout_routes
    fitness.body: body_metrics, health_metrics, health_workouts,
      exercise_baselines, exercise_pain_logs, exercise_aliases
    health.nutrition: foods, meal_groups, nutrition_logs, recipes,
      shopping_lists, meal_plan
    health.supplements: supplements, supplement_logs
    health.clinical: blood_test_sessions, blood_test_results,
      gut_health_logs, eye_prescriptions
    organisation.tasks: tasks, task_comments, task_activity, projects
    organisation.people: people, people_mentions, people_aliases, entities
    organisation.captures: raw_captures, pending_entities, routing_rules,
      entity_review_rules, context_options
    organisation.purchases: purchases, receipts, receipt_images,
      receipt_lines, receipt_participants, receipt_line_shares,
      receipt_settlements
    finance.*: bank_accounts, transactions, paypal_payments, investments,
      accounts (finance groups are owner-only — see Part 3)
    studio.pc: pc_components, pc_metrics, pc_metrics_hourly
    studio.spotify: spotify_tokens, spotify_plays
    drops.*: drops, wishlist_items, raffle_entries, drop_monitors
    ventures.*: ventures, venture_steps, venture_ads, venture_inspiration
    media.*: media_items, media_episodes
    journal/places/reminders/events/daily_logs/memory_chunks: one group
      each under their section
    platform: user_settings, dashboard_layouts, push_subscriptions,
      audit_log, agent_conversations, agent_messages, bin_schedule_config,
      bin_garden_seasons, bin_google_events
  Shared reference (NO space_id, read-only for authenticated): agents,
  agent_memory (service-role only), workout_exercises, blood_test_markers,
  cook_guides, weather_cache.
  Write the registry as lib/access/registry.ts (single source) AND as the
  seed for an entity_groups table in Part 2. Any table not in either list:
  STOP and ask before Part 2 — do not guess.
- Check whether the project's legacy HS256 JWT secret is available
  (Supabase dashboard → JWT keys). Report yes/no; Part 3 depends on it.
- Write docs/multi-user-rollback.md: exact command sequence to restore a
  pg_dump into a fresh Supabase project and repoint Vercel env (names
  only). Write docs/multi-user-phil-checklist.md: the things only Phil
  can do — Resend account + RESEND_API_KEY; sporebit.com SPF/DKIM/DMARC;
  Resend as custom SMTP in Supabase Auth; enable email + magic link +
  TOTP MFA + Google provider; passkeys flag; add env vars
  BREAK_GLASS_SECRET, BREAK_GLASS_ENABLED=false, RESEND_API_KEY,
  SUPABASE_JWT_SECRET (if available).

VERIFY 0: local stack replays clean; registry covers every table or a
STOP was raised; both docs exist. Build clean. Commit, push branch.

════════════════════════════════════════════════════════════════════
PART 1 — IDENTITY
commit: feat(auth): Supabase Auth, profiles, middleware, break-glass
════════════════════════════════════════════════════════════════════
- Migration 0098_profiles.sql: profiles(id uuid pk references auth.users
  on delete cascade, display_name, is_instance_owner boolean not null
  default false, personal_space_id uuid null, created_at). Partial unique
  index: exactly one row with is_instance_owner = true. RLS: a user reads
  own row; instance owner reads all rows (profiles only — this is the one
  place the instance owner sees other users, and it is names, not
  content).
- lib/supabase/user.ts → createUserClient() via @supabase/ssr (cookies).
  Move createServerClient to lib/system/serviceClient.ts. ESLint rule:
  createServerClient importable only under lib/system/**.
- New middleware.ts, in this order:
  1. PUBLIC_PREFIXES unchanged (each route validates its own secret).
  2. Path-scoped PC_METRICS_SECRET unchanged.
  3. CRON_SECRET / API_SECRET → x-principal: system. API_SECRET acts as
     Phil only; no acting-user header is honoured.
  4. Supabase session refresh (@supabase/ssr pattern).
  5. Break-glass: only if BREAK_GLASS_ENABLED === "true" AND the cookie
     verifies against BREAK_GLASS_SECRET (new secret; AUTH_SECRET retired)
     → acts as Phil, and every request writes an audit event (Part 5's
     writer; stub it here with a TODO that Part 5 must resolve).
  6. /admin/** and routes tagged sensitive require aal2 (MFA) and a
     re-auth cookie younger than 10 minutes (Part 5 sets it; here, aal2
     only).
- /login restyled with v2 primitives: magic link, password, Google;
  passkey register + sign-in behind `experimental: { passkey: true }`.
  TOTP enrol/verify screens. /other/settings/security: auth methods,
  TOTP, passkeys, sessions list (Part 5 adds remote sign-out).
- Seed Phil: create his auth user locally, profile with
  is_instance_owner = true. Record the mapping from USER_ID (text) to
  his auth uid for Part 2's backfill — in code, not in a report.
- Remove the AUTH_SECRET cookie path from lib/auth/cookie.ts (keep the
  HMAC helper for break-glass, re-keyed).

VERIFY 1: on the local stack + `next dev`, Phil signs in via magic link,
password, and passkey (Google needs Phil's provider config — report
untested if absent). /admin 403s without aal2. Break-glass refused with
the flag off, accepted with it on. Build clean. Commit, push branch.

════════════════════════════════════════════════════════════════════
PART 2 — SPACES + OWNERSHIP MIGRATION
commit: feat(db): spaces, space_id on every table, created_by uuid
════════════════════════════════════════════════════════════════════
- 0099_spaces.sql: spaces(id, kind personal|team, owner_user_id null,
  team_id null, created_at); entity_groups(table_name pk, section,
  entity_group) seeded from the registry; teams scaffold (Part 4 fills
  it). Function app.personal_space() → the caller's personal space id.
  Phil's personal space created and linked from profiles.
- 0100–0105, one migration per domain group (platform, organisation,
  fitness, health, finance, studio/drops/ventures/media/journal):
  for every registered table —
    add column space_id uuid; backfill (own user_id → Phil's personal
    space; child tables from their parent); set not null; FK references
    spaces(id) on delete cascade; index on space_id.
    user_id text → created_by uuid null references auth.users on delete
    set null (convert via the mapping from Part 1; any value that fails
    the cast → STOP and report the table + count, do not coerce).
    Drop the reminders app.user_id policy (Part 3 replaces it).
  Shared-reference tables: no space_id; policy "read for authenticated".
- A verification script scripts/verify-ownership.ts: per-table row count
  before vs after, count(space_id is null) = 0, FK validity, and that
  every registered table has space_id + created_by.

VERIFY 2: replay the full chain twice on the local stack — once from
empty, once from a pg_dump of live restored locally (Phil supplies the
dump file path; never commit it). Script output pasted into the report.
Build clean. Commit, push branch.

════════════════════════════════════════════════════════════════════
PART 3 — AUTHORISATION + CLIENT SWAP
commit: refactor(data): user-scoped client, real RLS, system helpers
════════════════════════════════════════════════════════════════════
- 0106_access.sql: team_members(team_id, user_id, role, joined_at) with
  partial unique index (team_id) where role = 'owner';
  team_member_sections(team_id, user_id, section, can_view, can_edit,
  can_create_delete, can_share); user_grants(id, grantor_id, grantee_id,
  section, entity_groups text[], verbs text[], expires_at, revoked_at,
  reason, created_at) with check (section <> 'finance').
  app.accessible_spaces(entity_group text, verb text) returns setof uuid
  — STABLE, SECURITY DEFINER — union of: the caller's personal space;
  team spaces where membership role/toggles allow (group, verb); personal
  spaces of grantors with an unexpired, unrevoked grant covering (group,
  verb). Role defaults: owner = all; admin = view/edit/create_delete all
  sections + share; member = view/edit/create_delete in enabled sections;
  viewer = view in enabled sections. Toggles only narrow.
- 0107_policies.sql: for every registered NON-finance table, drop the
  deny-all restrictive policy and create four permissive policies for
  authenticated:
    select: space_id in (select app.accessible_spaces('<group>','view'))
    insert with check: … 'create_delete'
    update using/with check: … 'edit'
    delete using: … 'create_delete'
  For every FINANCE table: using (space_id = app.personal_space()) on all
  four — the helper is never called. anon has nothing anywhere.
  service_role keeps its grants (system code only).
- Replace every createServerClient() outside lib/system/** with
  createUserClient(). Cron, webhook, health-import, pc-metrics, Telegram
  routes: lib/system/withUser(userId, fn) — mint a short-lived HS256 JWT
  (role authenticated, sub = userId) with SUPABASE_JWT_SECRET and run
  PostgREST calls as that user so RLS applies. If Part 0 found no legacy
  secret: implement the fallback (a non-BYPASSRLS Postgres role over a
  direct pg connection with `set local request.jwt.claims`) and say so.
  Inbound secret routes resolve their user from config
  (INTEGRATION_BINDINGS or user_settings), never from the request.
- api_usage gains user_id; existing rows → Phil.
- Feature flags: AI-backed features default off for new users (open item
  A); an instance-owner-only endpoint toggles them per user.

VERIFY 3 — the isolation test, the most important check in this prompt:
create a second local test user with an empty personal space. Script
scripts/isolation-test.ts enumerates every app/api/**/route.ts, calls
each GET (and the list/read POSTs) as the test user, and asserts zero
rows/ids belonging to Phil — report endpoint by endpoint, not a summary.
Then a PostgREST probe per registered table with the test user's JWT
expecting zero rows. Then the same suite as Phil expecting his data
intact through every page. Policy unit tests (vitest against the local
stack) for: personal, team-by-role, team-by-toggle, direct grant,
finance — one positive and one negative each. Build clean. Commit, push.

════════════════════════════════════════════════════════════════════
PART 4 — TEAMS, ROLES, INVITES, DIRECT GRANTS
commit: feat(teams): teams, roles, invites, direct grants, onboarding
════════════════════════════════════════════════════════════════════
- 0108_teams_invites.sql: teams(id, name, slug, space_id, owner_user_id,
  successor_user_id null, created_at); invites(id, email, team_id null,
  role, token_hash, expires_at, accepted_at, invited_by, created_at).
  Invite tokens: random 32 bytes, stored as sha256 only, 7-day expiry,
  single use.
- APIs + UI (v2 primitives) under Settings → "People & teams": create
  team; members with role + section toggles; name successor (owner
  cannot leave without one); leave / remove (contributions stay,
  created_by retained); "Share with a person" → user_grants (grantor's
  personal space only; finance never listed; expiry optional); "Shared
  with me".
- Invite flow: owner/admin sends → Resend email → /invite/[token] →
  Supabase Auth user created on acceptance only (inviteUserByEmail or
  magic link), profile + personal space + membership created, onboarding
  chooses auth method, TOTP enrolment forced for admin/owner roles.
- New-user seeding: ui_prefs.hidden_sections hides everything except
  Organisation, Fitness, Health; AI features off (item A).
- Instance-owner-only: appoint successor for a team whose owner is
  disabled/deleted.

VERIFY 4: automated matrix — role × section × verb for team spaces;
direct-grant matrix for personal spaces; finance absent from every grant
UI and from user_grants by constraint; one-owner index holds; successor
flow; invite expiry + single use; a new user's first screen. Build clean.
Commit, push.

════════════════════════════════════════════════════════════════════
PART 5 — SECURITY OPERATIONS + ADMIN
commit: feat(security): audit, access log, admin panel, limits, re-auth,
export, delete
════════════════════════════════════════════════════════════════════
- 0109_audit.sql: audit_events(id, at, actor_id, principal
  user|system|break_glass, action, section, entity_group, entity_id,
  subject_user_id, space_id, team_id, ip, user_agent, meta jsonb).
  Writer in lib/system/audit.ts. Events: sign-in/out, MFA changes,
  invites, membership/role changes, grants created/revoked, successor
  changes, exports, deletions, break-glass use (resolve Part 1's TODO),
  and cross-user reads — one event per request whose resolved space
  owner ≠ actor, written in the API layer, not per row.
- Settings → Security → "Who has seen my data": the owner's cross-user
  read events. Sessions list with remote sign-out (auth.sessions via
  system client). Re-auth: sensitive routes require a fresh TOTP/passkey
  verify that sets a signed 10-minute cookie.
- Rate limiting: 0110_rate_limits.sql — Postgres token bucket + one
  function; applied to login, magic-link request, invite creation, TOTP
  verify; lockout after 10 failed second-factor attempts in 15 minutes.
- /admin (instance owner only, aal2): users, teams, memberships, grants,
  invites, audit — filterable by actor/subject/team/section/action/date;
  disable user; appoint successor. NO content tables are read by any
  admin endpoint — assert this in a test.
- Export: extend /other/export to dump the caller's personal space by
  entity group (JSON + CSV zip). Delete account: app.delete_user(uuid) —
  personal space cascade, memberships, grants both directions, invites,
  push subscriptions, then auth.admin.deleteUser; team contributions
  remain with created_by = null; requires re-auth + typed confirmation.

VERIFY 5: an audit row exists for each listed action; the admin test
proves no entity-group table is touched by admin endpoints; rate limits
trip and lock; export contains every group with data; delete leaves zero
rows in the deleted user's personal space and keeps their team rows.
Build clean. Commit, push.

════════════════════════════════════════════════════════════════════
PART 6 — WEEKLY RUNDOWNS
commit: feat(rundowns): weekly team rundowns, per-recipient render
════════════════════════════════════════════════════════════════════
- 0111_rundowns.sql: rundown_settings(team_id pk, enabled, content jsonb
  {changed, upcoming, stats, per_person}, sections text[], day, hour);
  rundown_subscriptions(user_id, team_id, channels text[], opted_out,
  day, hour); rundown_issues(id, team_id, user_id, week, rendered_html,
  channel, sent_at).
- /api/cron/rundowns (CRON_SECRET): for each enabled team, for each
  subscribed recipient, render ONCE PER RECIPIENT under
  withUser(recipient) so RLS filters that copy; store the issue; deliver
  via Resend, web-push, and the in-app page /rundowns/[team]/[week];
  Telegram only when recipient = Phil.
- Team owner UI: enable, content blocks, sections, day/hour. Recipient
  UI: channels, opt-out, day/hour override.

VERIFY 6: two recipients on one team with different section toggles get
different issues; a member without a section never sees its items; an
opted-out user receives nothing; the in-app page 404s for non-members.
Build clean. Commit, push branch. `npx graphify update .`

════════════════════════════════════════════════════════════════════
PART 7 — CUTOVER (separate session, Phil present, main branch)
commit: merge multi-user → main
════════════════════════════════════════════════════════════════════
Preconditions: Parts 0–6 verified on a Vercel preview deploy of the
branch; docs/multi-user-phil-checklist.md fully ticked; Phil has taken
the pg_dump to the PC and reported its size against the dashboard.
1. Renumber migrations if main moved. Merge. Vercel deploys with
   BREAK_GLASS_ENABLED=false.
2. `supabase db push`; `supabase migration list` shows every new number
   Local + Remote.
3. scripts/verify-ownership.ts against production. Phil signs in; runs
   scripts/isolation-test.ts against production with the test user.
4. Phil spot-checks every section on the live site.
5. Delete USER_ID, DASHBOARD_PASSWORD, AUTH_SECRET from Vercel.
6. Keep the dump until a week of normal use has passed.
Rollback = docs/multi-user-rollback.md, not improvisation.

════════════════════════════════════════════════════════════════════
FINAL REPORT (after Part 6; Part 7 reports separately)
════════════════════════════════════════════════════════════════════
Seven commit hashes + build status; registry coverage (tables in
registry / reference / neither); Part 2 script output; the isolation
test endpoint-by-endpoint; policy test counts; the matrices; audit
coverage; rundown leak test; the legacy-JWT decision and which withUser
implementation shipped; every deviation from this prompt and why.
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
| P4 | ✅ Done | 27a49f4, 179527a, 6e45078, 0dcb122, f5d2a08, b5704d5, 7c41289, 0c154a8, 8a7f2bb, 6f0e84b | All five parts landed. Part 4: ViewSwitcher → SegmentedControl in a scroll wrapper (7 segments need ~630px, cannot fit 390px); TaskDrawer → Sheet (bottom sheet on mobile, was a right panel at every width); table rows on ui_prefs.density (40/32px). Part 5: swipe right = done, swipe left = reschedule Sheet, long-press = bulk, via pointer deltas, no gesture library. Verified with emulated touch — NOT on a real handset |
| P5 | 🔶 Parts 1+4 done | 0b9a10e, 5cc3924 | Part 4 done: v2 tokens across 26 fitness components, charts on glow/hairline gridlines, BodyMetrics unit toggle → SegmentedControl, PR glow-pulse reusing the existing isPR flag. Parts 2 (set-logging) and 3 (focus mode) pending — both need real in-workout verification |
| P6 | ✅ Done | 119f795, 7be7063, 94f5a41, 7e9d472, a383434, 6db25ef | All five parts. Part 4: NutritionClient/MacroBar → useApi, optimistic add-to-log. Part 5: RangeBar wash + v2 status colours, 164 token replacements. Vision multi-page progress ALREADY existed (pageCount + "ADD ANOTHER PAGE"), so none added, per spec |
| P7 | 🔶 Parts 1+2+3+4 done | 916e9c4, 65865bc, 39bca11 | Numerals/hierarchy incl. a privacy fix: chart tickFormatters leaked amounts while finance was hidden, now via formatGBP({hidden}). Part 2: Spending, Accounts and Investments clients on useApi. AnalysisClient stays on raw fetch — its endpoints are POST-as-read, which useApi (GET-only) cannot key |
| P8 | 🔶 Parts 1-3 done, 4 mostly | 1eb5d90, f3e09c8, (nav) | Drops/Studio/The Boys swept. Settings v2: section navigation (left-anchored desktop, Sheet on touch — verified 10 panels, bottom sheet at 390px), Appearance density + motion + layout reset, Sections multi-select, hidden_sections drives ⌘K. Verified: density really does drive table rows, 40px vs 32px. Checked the two-systems risk — FeatureFlagsSection toggles BEHAVIOURS (voice capture, AI categorisation, vision scan) while hidden_sections controls NAV VISIBILITY, so they are not duplicates and both stay. Remaining: Integrations/Capture/Data panels still on old inner styling |
| P9 | 🔶 Parts 1-2 partial, 3 n/a | cc39364, 1c2fd0e | Part 1: 24 of ~126 client files on useApi; 102 still raw fetch (LogClient deliberately untouched — that is P5 Part 2). Part 2: chart-only tabs dynamic-imported, /health/blood-tests 229→116 kB and /health/nutrition 241→128 kB. Part 3: nothing to do, zero raw <img>. Gotcha: `ssr:false` is rejected in Server Components in this Next version, so chart-dominant SERVER pages need a client wrapper, not a direct dynamic() |
| P10 | ⛔ Superseded by P12 | — | Replaced 2026-09-06 after Phil's 29-answer discovery; decisions live in the project doc claude/multi-user-plan.md and are restated inside P12 |
| P0-S | ✅ Done | e49f520 | Landed as migration `0101` (0097–0100 were taken by the PTP work). **The premise was wrong:** all 91 tables already had RLS on and the anon key returned 42501 everywhere. Re-scoped against the live DB — 39 tables had RLS with no policy (implicit deny), 8 had a permissive `app.user_id` policy with no restrictive backstop, anon/authenticated held TRUNCATE everywhere. Fix = catalogue-driven restrictive `using (false)` per table + revokes. FORCE RLS deliberately left off so seed migrations running as `postgres` still work |
| P12 | 🔶 In progress — Parts 0–1 done, Part 2 next | 9988ac3 (docs), 80d02a0 (drift fix), d08869a (Part 0), Part 1 = feat(auth) commit on `multi-user` | Branch from `b9892d1`. Locked: Docker + `supabase start`; legacy HS256 JWT secret EXISTS (Part 3 mints short-lived JWTs); Phil's auth uid is FIXED (`app.legacy_user_uid('phil')` = `lib/system/identity.ts`, Part 7 must create his live auth user with that id). Part 0 (VERIFY 0, 10 Sep): chain 0001–0101 replays clean after guarded fixes to 0001/0003/0055/0097; registry + coverage test; rollback runbook. Part 1 (VERIFY 1, 10 Sep): migration `0102_profiles.sql` (profiles, app schema, legacy uid mapping, my_sessions()); `@supabase/ssr` user + browser clients; service client fenced to lib/system/** by ESLint with a deprecated shim at the old path; new middleware (public → pc-metrics → system secrets → session refresh → break-glass → aal2 for /admin) with unspoofable x-principal headers; /login (magic link, password, passkey, Google, TOTP step); Settings → Security (password, TOTP, passkeys, sessions); break-glass keyed on BREAK_GLASS_SECRET, 404 when disabled, never reaches /admin. 59 automated checks green (33 HTTP flag-off, 18 Playwright incl. passkey via virtual authenticator, 8 HTTP flag-on); Google untested (needs provider config). Part 2 starts at **0103**. Registry gained `ACCESS_TABLES` (no space_id) for profiles and the later identity tables. **Open: `nutrition_targets` → `health.nutrition` pending Phil's confirmation; checklist §1 (auth providers, redirect URL, magic-link template → token_hash) and §3 (BREAK_GLASS_*, SUPABASE_JWT_SECRET) untouched.** Read `docs/multi-user-handoff.md` first — say "get started" |
| P11 | ✅ Done | 0cff907, 6430eba, ee064c9 | Caching: measured first — Sonnet 4.5 needs a 1024-token prefix or the marker is silently ignored; personas are 116-265 tokens and only clear it because the tool defs and TOOL_CAPABILITY_SUFFIX (~680) render before them. `fitness` (1 tool, ~950 total) will not cache. Tiering: model ids centralised in lib/config/models.ts; resolveEntity makes no Anthropic call, so only 2 of the spec's 3 targets existed. Diet: keyword heuristic, over-inclusive by design, cross-domain case verified |

**Before P4 (Compost) starts, in any session: manually complete a task,
check a venture step, and confirm both survive a reload. If either fails,
stop and diagnose before touching Compost.**
