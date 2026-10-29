# Spec — Platform, Auth, Capture, Agents, Integrations

*Crawled 2026-08-29; reviewed with Phil same day. (?) = inferred, unverified. Auth/RLS/cron facts re-checked against the repo 2026-09-06.*

## Auth & middleware

**As built since P12 (2026-09-15): see `claude/spec-access.md`** — Supabase Auth identity, spaces + entity registry, `app.accessible_spaces()` policies, `createUserClient()` / `withUser()`, the gate order (public paths → PC metrics → CRON/API secrets → `mtk_` tokens → session → break-glass → sensitive paths), teams/grants/invites, audit, rate limits, export/delete, rundowns. **2026-10-29:** `/api/health` is public *exactly*; as a prefix it had let every `/api/health/*` route skip the gate (`41c5035`). The paragraph below is the **pre-P12** description, kept for history.

*(Historical, pre-2026-09-15)* `middleware.ts` gates everything except `PUBLIC_PREFIXES` (`/login`, `/api/auth/*`, `/api/telegram/webhook`, `/api/cron/reminders`, `/api/health-import`, `/api/cron/drops-monitor`). Four ways in: HMAC-signed `auth-token` cookie (secret `AUTH_SECRET`, 30-day, verified in middleware via WebCrypto; `lib/auth/cookie.ts`); `x-api-secret` header (`API_SECRET`, CLI/programmatic); `Authorization: Bearer CRON_SECRET` (scheduled functions); and path-scoped `Bearer PC_METRICS_SECRET` for `/api/studio/pc-metrics` only (agent POST + future headless Pi GET — added when the previously public GET was closed). API routes 401; pages redirect to `/login`. Server data access via `createServerClient()` (`lib/supabase/server.ts`, service role, bypasses RLS) — the single most connected function in the codebase (238 edges). A browser client (`lib/supabase/client.ts`, anon key) exists. No Supabase Auth, no `@supabase/ssr` today; the single user is identified by the `USER_ID` env value stored as `user_id text` on 45 tables. `push_subscriptions.user_id` is the one `uuid references auth.users(id)` column. Multi-user replaces all of this — see `claude/multi-user-plan.md` (Phase 2 identity, Phase 4 authorisation).

**RLS coverage (from migration files, 2026-09-06):** tables from 0001–0046, 0059 and 0092–0096 have RLS + deny-all + service_role grant; `reminders` (0044) uses a `current_setting('app.user_id')` policy instead; ~30 tables created 0051–0090 (blood tests, agents, accounts, gut health, eye prescriptions, recipes/shopping/meal plan, media episodes, events, investments, spotify tokens/plays, ventures, drops, weather cache, bins) have no RLS. With Supabase's default grants that makes them reachable via the anon key. Fix = Multi-user Phase 0.

## Capture pipeline

Inbound: Telegram bot webhook `/api/telegram/webhook` and iOS Shortcuts → `/api/capture-audio` (voice) / `/api/capture`. Whisper transcription (OpenAI), then classification → routing rules (`routing_rules`, 0021, editable at `/the-boys/rules`) → entity creation with review queue (`/organisation/captures/review`; UI-created entities bypass review, automated ones route through it; `entity_review_rules` 0034). Pending-entity and pending-route resolution endpoints; `capture_source_labels` config (0086). Voice failures must reply in Telegram and preserve `file_id` — never silently drop. Outbound Telegram via `/api/telegram/send` (also shopping-list send).

**As of 2026-10-29.** One classifier, `lib/router/classifyCapture.ts` `classifyCapture()`, serves all three inbound routes (Telegram, `/api/capture`, `/api/capture-audio`). Its prompt = the user's routing rules + `CLASSIFIER_SYSTEM_PROMPT` + a **few-shot block built from `capture_learning`** (`lib/capture/learning.ts` `buildFewShotBlock`, cached per user, invalidated on approval) + the ignored-kinds block. **Kinds** the classifier can return: `task`, `note`, `decision`, `idea`, `journal`, `workout`, `purchase`, `pain_log`, `reminder`, `media`, `account`, `quote`; the registry test fails if any of them lacks a registry entry. A `task` becomes a ticket in Inbox (`kind === "ticket"` is the typed form of the same thing); `person` exists only as a typed kind, never a classifier intent (the capture rule: tickets link existing people only).

**Typed capture (MYC-161, 0138).** `lib/capture/registry.ts` is the one field registry: `TYPED_KINDS` = task, ticket, reminder, purchase, media, quote, journal, idea, decision, note, person, account, pain_log, workout; each `EntityDef` lists its fields (type, options, person pickers, hidden fields such as `waiting_on_person_id`), `classificationForTyped()` turns a filled form into the same classification shape the LLM would have produced, and `toPostBody` whitelists what reaches the API. The web capture form posts a typed kind straight to the review queue; **the classifier still runs in the shadow** (`usageTag: capture.shadow`, metered in `api_usage`) so the prediction can be compared with what the user chose. `capture_learning` (one row per `raw_captures` row): `predicted_kind/fields/llm_source` at capture, `chosen_kind/fields` from the form, `approved_kind/fields/at` on review approval (`recordPrediction` / `recordApproval` / `recordTicketApproval`, the last from the ticket move route). The approved rows are what the few-shot block is built from, so corrections teach the classifier without a model change.

**Review** (`/organisation/captures/review`, `app/api/captures/[id]/review/route.ts`): APPROVE materialises by kind — person, task/ticket, journal, purchase, media, reminder, pain_log, account, quote (MYC-151…156) — re-keying a changed kind and re-routing a quote to Quotes; `lib/captures/reviewCount.ts` feeds the pending badge.

## Agents — The Boys (`/the-boys`)

Chat + voice (silence-detection loop, TTS via `/api/agents/tts`) with tool-calling and confirm-before-execute cards (`[agentId]/confirm-tool`). 7 agents incl. "Da Boi" (cross-domain, keyword-heuristic context diet from P11), The Founder (ventures tools: create_venture, add_venture_step), a nutritionist (0066), founder/engineer agents (0073). Domain-scoped agent chat surfaces also live inside sections: `/fitness/coach` and `/finance/advisor` (confirmed by Phil, 2026-08-29). System prompts are built in one place, `lib/agents/system.ts` `buildAgentSystemPrompt()` (persona from `lib/agents/prompts.ts`, memory summary, Da Boi's keyword-scoped domain diet with live one-liners, the day-log diet for Da Boi and the persona agent, the user's **manner** instruction (MYC-149), the spoken suffix for voice turns (MYC-148), tool suffix) with cache_control breakpoints (P11; note: an agent under ~1024 prefix tokens won't cache — `fitness` doesn't). **2026-10-29:** the fitness and nutrition agents get a **live context** block on every fresh turn (`lib/agents/live-context.ts`: programme + week of phase, today's plan, last 7 days, pain; targets with review date, today's intake, 7-day average, gut, recipe library) — read-only, never written to memory. Voice per agent (`agent_voices`, 0136) and streamed voice turns via `lib/agents/anthropicStream.ts`. Model ids centralised in `lib/config/models.ts`; Haiku for classification/extraction, Sonnet for vision scans. Memory summaries capped (~300 words) with a pre-classifier short-circuit list (weight logging etc.) that bypasses the LLM for simple captures. Agent memory is one row per agent (`agent_memory`, 0053), not per user — agents stay Phil-only under the multi-user plan. Usage logged to `api_usage`, surfaced at `/other/api-usage`.

## Integrations

- **Google Calendar**: OAuth (`/api/google/auth|callback`), tokens as columns on `user_settings` (0088), event ids 0089, sync via `/api/google/sync` + `/api/cron/google-sync`.
- **Spotify**: OAuth, tokens in `spotify_tokens` (0069, single row, no RLS — see above), plays 0070; now-playing, recently-played, top artists/tracks, sync-plays; dashboard at `/studio/spotify`.
- **Apple Health**: Health Auto Export iOS app → POST `/api/health-import` (`HEALTH_IMPORT_SECRET`), one row per metric per day (0045). Code done; activation still pending (secret + app config — on the backlog).
- **Telegram**: capture + reminders + drops alerts + shopping lists. `user_settings.telegram_chat_id` exists per user (0075) but only Phil's chat is wired.
- **Push**: web-push, subscriptions 0039, `/api/push/send|subscribe`.
- **Weather/sun**: `/api/weather` (3h server cache, 0087) + `/api/sun`; chips in Today TimelineRail.
- **Bins**: `bin_schedule` 0090, `/api/bins/next|sync` — Doncaster council bin collection days, surfaced on the Today timeline.
- **Email**: Resend via `lib/system/email.ts` (invites, Work notifications, rundowns); without `RESEND_API_KEY` the invite link is shown to the inviter instead.

**Inbound webhooks (2026-10-29 list).** All are public prefixes and verify their own secret in the handler: `/api/telegram/webhook` (`x-telegram-bot-api-secret-token` = `TELEGRAM_WEBHOOK_SECRET`), `/api/tickets/github` (HMAC-SHA256; a commit or PR that names a key moves the ticket to Verify on merge to `main` — a *test* ticket key in a commit auto-closes it, `tickets-spec` §7.1), `/api/tickets/vercel` (HMAC-SHA1 `x-vercel-signature` with `VERCEL_WEBHOOK_SECRET`; `deployment.succeeded` on production runs the smoke for every In Review ticket carrying code evidence and moves it to Done), `/api/health-import` (`HEALTH_IMPORT_SECRET`, Apple Health). Each acts as a user through `withUser()` chosen by `lib/system/bindings.ts`.

## Cron

Vercel Hobby caps cron at daily, so **cron-job.org** drives the three sub-daily jobs moved off Vercel (`docs/cron-migration.md`): `/api/cron/reminders` (Bearer `REMINDERS_CRON_SECRET`, a distinct env var), `/api/cron/drops-monitor` and `/api/cron/google-sync` (Bearer `CRON_SECRET`). **`vercel.json` as of 2026-10-29** (all under `CRON_SECRET`, principal `system`, each route picking its user with `withUser()`):

| Path | Schedule (UTC) | Does |
|---|---|---|
| `/api/briefings/morning` | 06:00 Mon–Fri, 08:00 Sat–Sun | morning briefing to Telegram |
| `/api/finance/paypal/sync` | 07:00 daily | PayPal transactions |
| `/api/cron/rundowns` | hourly | weekly team rundowns (P12 Part 6), per recipient under their RLS |
| `/api/cron/tickets-nightly` | 02:00 | overdue / stale / check-in sweep (tickets spec §8.2) |
| `/api/cron/tickets-checkins` | every 15 min, 15:00–22:59 | waiting-on check-ins (§7.2) |
| `/api/cron/quotes-research` | every 30 min | quotes research sweeper (quotes spec §5; also `after()` on approve) |
| `/api/cron/daylog` | every 15 min, 18:00–03:59 | Day log evening prompts (day-log spec §4.1) |

DB-side: pg_cron (1.6.4) runs the pc_metrics rollup/prune (0095). On the PC: Task Scheduler `Mycelium Gousto sync` (Sunday 03:00, `scripts/gousto-sync-weekly.ps1`) because Gousto refuses cloud egress.

## Notifications (Work, 0145 — 2026-09-30)

`notifications` (one row per recipient per event: `mention`, `assignment`, `status_change`, `comment`; `delivered` jsonb stamps per channel; a restrictive policy so only the recipient reads or changes a row). Written by the actor (`lib/work/notify.ts` `recordEvents` → watchers + assignee + mentioned), then **delivered as the recipient** in `after()` by `lib/system/notifyDeliver.ts` under `withUser(recipient)` so their prefs, push subscriptions and the stamp are all under their own RLS; the service client is used only for the recipient's email address. **Channels** (`lib/work/notifyPrefs.ts`): `in_app`, `telegram` (owner only — one chat wired), `email` (Resend), `push` (web-push, 0039); a per-event × per-channel grid in `user_settings.notification_prefs` plus quiet hours (London, Telegram/email/push suppressed, in-app always). A failing channel is logged and never fails the request. Surface: `/work/notifications` (read, delete). Rundowns use the same four channels (`claude/spec-access.md`).

## Design system — Loam & Glow v2

Dark earthy base, bioluminescent glow accents; tokens defined in P0 (v2 names; legacy aliases preserved). Inter Tight everywhere (Fraunces removed in P0.5; hierarchy by weight/size — headings 600, -0.02em). Primitives in `components/ui/`: Surface (levels), Button, Sheet, Skeleton, Label, SegmentedControl, Num/Money/Mono. Section accents (locked): Fitness `#84f5b8`, Finance `#6db8f5`, Health `#5de8e0`, Organisation/Ventures `#f5b56d`, Studio `#f56db5`. Accents only as 2px ticks/chart series. Reactive MyceliumField canvas background with `triggerFieldPulse()` on completions. Motion setting (full/reduced/off) via data-motion attribute.

## PWA / offline

Serwist service worker (`/sw.js`; warm `.next` breaks its build — always `rm -rf .next` first). `/workout-now` is offline-first: IndexedDB queue + Background Sync, idempotent upsert by client UUID (0040). `/offline` fallback page.

## Settings (`/other/settings`)

Settings v2 (P8): panel navigation (Sheet-based on mobile). Appearance (density → real table row heights, motion), Layout (pinned tabs, hidden sections, dashboard reset), FeatureFlags (behaviours: voice capture, AI categorisation, vision scan — distinct from hidden_sections which is nav visibility), Integrations, Capture labels, Data (export `/other/export`, api-usage). Storage split: `ui_prefs` (0091) vs `user_settings` (0075). Remaining P8 debt: Integrations/Capture/Data panels still on old inner styling.

## Tickets additions — 2026-09-17

- Capture intent: a `task` capture becomes a ticket in Inbox with `suggested` contexts; the Telegram reply carries the key and buttons; captioned photos/PDFs attach via the private `tickets` bucket.
- Identity & access: scoped `api_tokens` (`Bearer mtk_…`, resolved in the middleware, scopes = projects/verbs/routes; `x-principal-scopes` header) — Settings → Security → API tokens.
- Public prefixes: `/api/tickets/github` (HMAC-SHA256) and `/api/tickets/vercel` (HMAC-SHA1).
- Crons: `/api/cron/tickets-nightly` 02:00, `/api/cron/tickets-checkins` every 15 min (vercel.json). `api_usage` table (0119) records LLM cost per tag.
