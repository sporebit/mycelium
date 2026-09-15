# Mycelium — App Spec Index

*Built 2026-08-29 from a full repo crawl (route listing, migrations 0001–0095, repo docs, MYCELIUM_ALL_PROMPTS.md, .graphify report @ c7d144d). Repo is ground truth; the weekly Sunday run diffs and corrects these docs. Items marked (?) are inferred, not verified. Corrected 2026-09-06 from a manual migration crawl (96 migrations; RLS coverage). Corrected 2026-09-13 by the weekly run from doc-recorded repo state (repo itself unreachable that run): RLS shipped as 0101, PTP as 0097–0100, multi-user built on branch 0102–0115. 2026-09-14: Quotes, Day log (Journal v2) and Tickets specs added (planned, not built); Tickets absorbs the Checklists spec.*

## What mycelium is

Phil's personal life-OS at **mycelium.sporebit.com**. Next.js 15 (App Router) + React 19, Supabase (hosted Postgres, Free plan, CLI-managed migrations), Tailwind v4, Vercel (**Pro** plan, confirmed 2026-09-11; auto-deploy from `main`), PWA via Serwist. 233 API routes (as counted 2026-08-29), 97 pages. Migrations: `main` and hosted are at **0101** (0097–0100 PTP import, 0101 RLS everywhere); the **`multi-user` branch adds 0102–0115**, not yet cut over. Single-user today (HMAC cookie auth) until the P12 cutover; multi-user Parts 0–6 are **built and verified on the branch** — see `claude/multi-user-plan.md` and repo `docs/multi-user-handoff.md` (supersedes P10).

## Spec docs

| Doc | Covers |
|---|---|
| `claude/spec-platform.md` | Stack, auth/middleware, capture pipeline, agents (The Boys), integrations, design system (Loam & Glow v2), PWA/offline, cron |
| `claude/spec-organisation.md` | Tasks (to become Tickets), projects, people, captures, decisions, purchases, receipts, habits (to fold into Tickets), media, calendar, review, quotes (planned) |
| `claude/spec-fitness.md` | Programmes, sessions, sets, pain, baselines, aliases, body metrics, Workout Now |
| `claude/spec-health.md` | Nutrition, recipes/meal plan, supplements, blood tests, gut health, eye prescriptions, shopping lists |
| `claude/spec-finance.md` | Multi-bank transactions, PayPal, categorisation, analysis, investments, service accounts |
| `claude/spec-studio-drops-ventures.md` | PC metrics (+ agent contract), Spotify, PC build log, drops, ventures (venture_steps to fold into Tickets), journal (0003 — to be replaced by Day log), places, reminders (to fold into Tickets) |
| `claude/multi-user-plan.md` | Identity, spaces, teams, grants, audit, rundowns, knowledge base — plan + decision record (built on branch; cutover pending) |
| `claude/tickets-spec.md` | **Tickets** — replaces Tasks; four-level tree, per-project keys, GTD lists + Weekly Review, context facets (Where/Tool/Time) + points, Now view, recurrence (absorbs Habits + Reminders), steps/templates (absorbs Checklists), capture, check-ins, rundowns, evidence-based closing via GitHub/Vercel webhooks, `tix` CLI + Claude Code skill, scoped API tokens, backlog export — **first build after cutover** |
| `claude/checklists-spec.md` | Checklists feature — **superseded 2026-09-14 by `claude/tickets-spec.md` §9** (its §3 shapes retained as ticket columns) |
| `claude/quotes-spec.md` | Quotes feature (capture, People attribution, background research, merch) — to build after Tickets |
| `claude/daylog-spec.md` | Day log / Journal v2 (nightly Telegram + in-app interview, scenes, per-turn extraction into the review queue, People "Days" tab, nightly 1–5 scores, linked users) — replaces the 0003 Journal; to build after Tickets |

Post-cutover spec debt (recorded in backlog): `claude/spec-platform.md` needs an "Identity & access" section and a new `claude/spec-access.md` (teams/grants/audit/rundowns). When Tickets ships: `claude/spec-organisation.md` Tasks/Habits sections rewritten as Tickets; reminders removed from the studio spec; capture intent `ticket`, API tokens and the GitHub/Vercel webhooks added to `claude/spec-platform.md`.

## Sections & navigation (Loam & Glow v2 shell)

Desktop sidebar + mobile bottom TabBar (More sheet), ⌘K search, View-Transition page fades (CSS PageFade). Home `/` = "Today" surface (NowBlock, TimelineRail, GlanceRow) with an "Everything" card-grid toggle. Sections: Organisation (amber), Fitness (primary glow `#84f5b8`), Health (teal), Finance (cool blue), Studio (magenta), Drops, Ventures, The Boys (agents), plus Journal, Review, Places, Reminders, Other/Settings. Hidden sections configurable via `ui_prefs.hidden_sections` (drives sidebar, TabBar and ⌘K).

## Key cross-cutting rules

- All client fetching converges on `useApi` (SWR); mutations via `mutateApi`, optimistic with rollback + ApiErrorToast. ~102 client files still on raw fetch (P9 straggler list).
- UI preferences persist in `ui_prefs` (0091), never new localStorage.
- v2 design tokens only; section accents as 2px ticks, never fills. `<Num>`/`<Money>` for numerals; finance privacy = true redaction, constant-width mask.
- **Invariant:** every table gets RLS enabled + deny-all restrictive policy + service_role grant (0092/0094 pattern). **Reality (2026-09-06 onward): SATISFIED** — P0-S shipped as `0101_rls_everywhere.sql` (catalogue-driven enable + restrictive `USING (false)` + service_role grant; schema-wide REVOKE from anon+authenticated; default privileges revoked), applied hosted. The `authenticated` re-grant needed for the multi-user client swap is done in `0111` (branch). Dashboard Security Advisor verification + anon-key re-probe folded into cutover verification.
- Daily boundaries computed in Europe/London, not UTC.
- Migrations numbered by build order; CLI `supabase db push` only. The `multi-user` branch owns `supabase/migrations/**` until cutover; the `tickets` branch owns it after (0116–0118 planned).
- Automated entities never auto-create a person; everything from voice/Telegram/extraction goes through the captures review queue (Quotes decision 9, Day log decision 17, Tickets decision 18 — tickets themselves land in Inbox directly, only a would-be Person or Project goes through the queue).

## Repo layout

`app/` routes+pages · `components/` by domain (`compost/` = Organisation internals) · `lib/` domain logic, `lib/ai/` + `lib/config/models.ts` for LLM calls · `supabase/migrations/` · `pc-agent/` Windows telemetry service · `docs/` working plans/reports (pc-monitoring-plan, receipts audit/phases, cron-migration, multi-user handoff/rollback/phil-checklist) · `AGENTS.md` build/commit/push rules · `MYCELIUM_ALL_PROMPTS.md` Loam & Glow P0–P11 prompt file with live session log · `.graphify/` knowledge graph.
