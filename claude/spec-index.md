# Mycelium — App Spec Index

*Built 2026-08-29 from a full repo crawl. Repo is ground truth; the weekly Sunday run diffs and corrects these docs. Corrected 2026-09-06, 09-13, 09-20, 09-27, 10-04 (doc-recorded state). **Corrected 2026-10-20 from the repo (Cowork with PC access): `main` at `29b5f3e`, migrations through 0148, Work redesign built.***

## What mycelium is

Phil's personal life-OS at **mycelium.sporebit.com**. Next.js 15 (App Router) + React 19, Supabase (hosted Postgres, Free plan, CLI-managed migrations), Tailwind v4, Vercel (**Pro**; auto-deploy from `main`), PWA via Serwist. Route/page counts from 08-29 (233 / 97) are very stale — `/api/work/*` alone added 39 route files.

**Migration chain (repo-verified 2026-10-29): ends at 0155, local and hosted identical** (0149 people review · 0150 google_sync_error · 0151–0152 Gousto · 0153 pain logs SET NULL · 0154–0155 Gousto facets). Earlier: 0097–0100 PTP · 0101 RLS everywhere · 0102–0115 P12 multi-user · 0116–0120 Tickets A–H · 0121 area kind · 0122 per-project keys · 0123 sprints · 0124 policy/grant fix · 0125 reminders dropped · 0126 Quotes · 0127–0133 Day log A–E · 0134 supersets · **0135** re-key on first project (MYC-150) · **0136** agent voices (MYC-149) · **0137** 12 statuses + When (MYC-158, §18 — live; build no further on it) · **0138** capture learning (MYC-161) · **0139** `tickets.started_at` (MYC-163 merge) · **0140** People contacts (MYC-165) · **0141–0146** Work schema · **0147** `work_search` · **0148** Work status guards (MYC-174). Next free: **0149** (taken by the People review build, in progress 2026-10-20).

**Multi-user (P12) live since 2026-09-15**: Supabase Auth (asymmetric JWT signing keys; legacy HS256 secret retained for `withUser()` — never rotate it). Legacy env vars (`USER_ID`/`DASHBOARD_PASSWORD`/`AUTH_SECRET`) await retirement.

## Spec docs

| Doc | Covers |
|---|---|
| `claude/spec-platform.md` | Stack, auth/middleware (pointer to `spec-access.md`), capture pipeline (classifier kinds, typed capture + learning 0138, review), agents (prompt builder + live context), integrations + inbound webhooks, cron table as of 2026-10-29, Work notifications + channels (0145), design system, PWA/offline. Spec debt cleared 2026-10-29 |
| `claude/spec-access.md` | **Identity & access as built (written 2026-10-29)**: Supabase Auth, spaces + entity registry + `register_table`, `accessible_spaces()` policies, clients, the gate order incl. the 2026-10-29 `/api/health` prefix fix, teams/grants/invites, audit, rate limits, export/delete, rundowns |
| `claude/spec-organisation.md` | Tasks (as merged 09-25), projects, people (contacts tier), captures, decisions, purchases, receipts, habits, media, quotes, calendar, review. Tasks/Tickets sections now point at `/work` and `claude/spec-work.md` (2026-10-29) |
| `claude/spec-work.md` | **Work + Docs — BUILT (MYC-174, 0141–0148, 2026-09-29/30).** State verified before build (§0), data model, query object + JQL, `/api/work/*`, pages, notifications, Docs, migration plan, build parts, deviations, **as built (§11)**. Awaiting Phil's live check |
| `claude/work-redesign-spec.md` | Work redesign decisions W1–W17 (2026-09-29) and where each stands |
| `claude/tasks-merge-spec.md` | Tasks+Tickets merge (MYC-163, 0139) — as built + state verified 09-29 (Part 2 never shipped). Superseded by Work |
| `claude/tickets-spec.md` | **Tickets** — Parts A–H (0116–0120), partition 0121, keys 0122, sprints 0123, re-key 0135, §18 statuses/When 0137. Data model, keys, steps engine, webhooks, `tix` remain the reference underneath Work. §0 GTD framing superseded |
| `claude/capture-form-spec.md` | Typed capture form + capture learning (MYC-161, 0138) |
| `claude/people-contacts-spec.md` | People contacts — **BUILT (MYC-165, 0140)**: tier, soft delete + bin, merge, phones/emails, vCard import/export; as built + FK survey |
| `claude/people-review-spec.md` | **People review — committed 2026-10-20, build in progress**: no path auto-creates a person, reject (bin + ignore list), archive (hidden + not matched), ignore list fed to the classifier, bulk actions |
| `claude/spec-fitness.md` | Programmes, sessions, sets, pain, baselines, aliases, body metrics; supersets, rename-on-tap, archive filter, pain-log SET NULL (0153), live context — corrected 2026-10-29 |
| `claude/spec-health.md` | Nutrition, recipes/meal plan, **Gousto cookbook (0151–0155, PC-side sync)**, supplements, blood tests, gut health, eye prescriptions, shopping lists; extractor guards |
| `claude/spec-finance.md` | Multi-bank transactions, PayPal, categorisation, analysis, investments, service accounts |
| `claude/spec-studio-drops-ventures.md` | PC metrics, Spotify, PC build log, drops, ventures, journal (→ Day log), places, reminders (→ tickets) |
| `claude/multi-user-plan.md` | P12 plan + decision record; cut over 2026-09-15. As built: `claude/spec-access.md` |
| `claude/checklists-spec.md` | Superseded 2026-09-14 by tickets-spec §9 |
| `claude/quotes-spec.md` | Quotes — BUILT v1 (0126). Awaiting Phil's live check |
| `claude/daylog-spec.md` | Day log / Journal v2 — BUILT Parts A–E (0127–0133). Awaiting Phil's live checks |
| `claude/ideas-spec.md` | Ideas decision record (21 decisions). Not built beyond `idea` as a capture kind + `/organisation/ideas` list (MYC-156). An idea graduates to a Work project when building starts (W15) |

## Sections & navigation

Desktop sidebar + mobile TabBar, ⌘K, View-Transition fades. Home `/` = Today surface. **Work** (`/work`: Your work, Issues, Projects, Docs, Notifications, Templates, Weekly review) sits ahead of Organisation; **Docs** at `/docs/*`. Old `/organisation/tasks`, `/organisation/tickets`, `/organisation/tickets/[key]`, `/organisation/projects*`, `/organisation/tickets/sprints` redirect into Work (page-component redirects); `/organisation/tickets/templates` and `/review` keep their URLs. Organisation keeps People, Captures/review, Decisions/Ideas, Purchases, Receipts, Habits, Media, Quotes, Calendar. Other sections: Fitness, Health, Finance, Studio, Drops, Ventures, The Boys, Journal (= Day log), Review, Places, Settings (Journal, Security/api-tokens, Notifications panels). Notification bell in the sidebar footer.

## Key cross-cutting rules

- Client fetching via `useApi` (SWR, `keepPreviousData`); mutations via `mutateApi`, optimistic with rollback. Work pages share `lib/work/client.ts`.
- UI preferences in `ui_prefs` (0091), never new localStorage.
- **Invariant:** every table gets RLS enabled + deny-all restrictive policy + service_role grant; **re-run the 0111 policy/grant loop for every new table** (the 0124 lesson). **0146 lesson:** restrictive policy names must not collide with the loop's `<table>_select…_delete` names — the 0146 self-check fails on a collision.
- **Never `.update()` without a filter** (`lib/settings/userSettingsRow.ts`).
- Daily boundaries in Europe/London.
- Migrations numbered by build order; `supabase db push` only; migrations ship from `main`.
- **Automated entities never auto-create a person** — the intended rule. **Violated as of 2026-10-20:** `rebuildTicketMentions()` and the capture-review reroute auto-create; fixed by `claude/people-review-spec.md` (in progress).
- Day-log routing: while a day is open every Telegram reply goes to the interview; `/c ` escapes to capture.
- No pg_trgm: similarity is the JS trigram in `lib/quotes/text.ts`.
- `classifyCapture` falls back to OpenAI when Anthropic is unavailable.

## Repo layout

`app/` routes+pages (`app/work/*`, `app/docs/*`) · `components/` by domain (`work/`, `docs/`, `editor/`, `tickets/`, `compost/` = Organisation) · `lib/` domain logic (`lib/work/`, `lib/tickets/`, `lib/people/`, `lib/quotes/`, `lib/daylog/`, `lib/agents/`) · `supabase/migrations/` · `pc-agent/` · `docs/` working plans · `claude/` project docs (repo copies; the Claude project is canonical) · `AGENTS.md` build rules · `MYCELIUM_ALL_PROMPTS.md`.
