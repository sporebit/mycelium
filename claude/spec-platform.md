# Spec — Platform, Auth, Capture, Agents, Integrations

*Crawled 2026-08-29; reviewed with Phil same day. (?) = inferred, unverified. Auth/RLS/cron facts re-checked against the repo 2026-09-06.*

## Auth & middleware

`middleware.ts` gates everything except `PUBLIC_PREFIXES` (`/login`, `/api/auth/*`, `/api/telegram/webhook`, `/api/cron/reminders`, `/api/health-import`, `/api/cron/drops-monitor`). Four ways in: HMAC-signed `auth-token` cookie (secret `AUTH_SECRET`, 30-day, verified in middleware via WebCrypto; `lib/auth/cookie.ts`); `x-api-secret` header (`API_SECRET`, CLI/programmatic); `Authorization: Bearer CRON_SECRET` (scheduled functions); and path-scoped `Bearer PC_METRICS_SECRET` for `/api/studio/pc-metrics` only (agent POST + future headless Pi GET — added when the previously public GET was closed). API routes 401; pages redirect to `/login`. Server data access via `createServerClient()` (`lib/supabase/server.ts`, service role, bypasses RLS) — the single most connected function in the codebase (238 edges). A browser client (`lib/supabase/client.ts`, anon key) exists. No Supabase Auth, no `@supabase/ssr` today; the single user is identified by the `USER_ID` env value stored as `user_id text` on 45 tables. `push_subscriptions.user_id` is the one `uuid references auth.users(id)` column. Multi-user replaces all of this — see `claude/multi-user-plan.md` (Phase 2 identity, Phase 4 authorisation).

**RLS coverage (from migration files, 2026-09-06):** tables from 0001–0046, 0059 and 0092–0096 have RLS + deny-all + service_role grant; `reminders` (0044) uses a `current_setting('app.user_id')` policy instead; ~30 tables created 0051–0090 (blood tests, agents, accounts, gut health, eye prescriptions, recipes/shopping/meal plan, media episodes, events, investments, spotify tokens/plays, ventures, drops, weather cache, bins) have no RLS. With Supabase's default grants that makes them reachable via the anon key. Fix = Multi-user Phase 0.

## Capture pipeline

Inbound: Telegram bot webhook `/api/telegram/webhook` and iOS Shortcuts → `/api/capture-audio` (voice) / `/api/capture`. Whisper transcription (OpenAI), then classification → routing rules (`routing_rules`, 0021, editable at `/the-boys/rules`) → entity creation with review queue (`/organisation/captures/review`; UI-created entities bypass review, automated ones route through it; `entity_review_rules` 0034). Pending-entity and pending-route resolution endpoints; `capture_source_labels` config (0086). Voice failures must reply in Telegram and preserve `file_id` — never silently drop. Outbound Telegram via `/api/telegram/send` (also shopping-list send).

## Agents — The Boys (`/the-boys`)

Chat + voice (silence-detection loop, TTS via `/api/agents/tts`) with tool-calling and confirm-before-execute cards (`[agentId]/confirm-tool`). 7 agents incl. "Da Boi" (cross-domain, keyword-heuristic context diet from P11), The Founder (ventures tools: create_venture, add_venture_step), a nutritionist (0066), founder/engineer agents (0073). Domain-scoped agent chat surfaces also live inside sections: `/fitness/coach` and `/finance/advisor` (confirmed by Phil, 2026-08-29). System prompts assembled in `lib/ai/` with cache_control breakpoints (P11; note: an agent under ~1024 prefix tokens won't cache — `fitness` doesn't). Model ids centralised in `lib/config/models.ts`; Haiku for classification/extraction, Sonnet for vision scans. Memory summaries capped (~300 words) with a pre-classifier short-circuit list (weight logging etc.) that bypasses the LLM for simple captures. Agent memory is one row per agent (`agent_memory`, 0053), not per user — agents stay Phil-only under the multi-user plan. Usage logged to `api_usage`, surfaced at `/other/api-usage`.

## Integrations

- **Google Calendar**: OAuth (`/api/google/auth|callback`), tokens as columns on `user_settings` (0088), event ids 0089, sync via `/api/google/sync` + `/api/cron/google-sync`.
- **Spotify**: OAuth, tokens in `spotify_tokens` (0069, single row, no RLS — see above), plays 0070; now-playing, recently-played, top artists/tracks, sync-plays; dashboard at `/studio/spotify`.
- **Apple Health**: Health Auto Export iOS app → POST `/api/health-import` (`HEALTH_IMPORT_SECRET`), one row per metric per day (0045). Code done; activation still pending (secret + app config — on the backlog).
- **Telegram**: capture + reminders + drops alerts + shopping lists. `user_settings.telegram_chat_id` exists per user (0075) but only Phil's chat is wired.
- **Push**: web-push, subscriptions 0039, `/api/push/send|subscribe`.
- **Weather/sun**: `/api/weather` (3h server cache, 0087) + `/api/sun`; chips in Today TimelineRail.
- **Bins**: `bin_schedule` 0090, `/api/bins/next|sync` — Doncaster council bin collection days, surfaced on the Today timeline.
- **Email**: none. Multi-user Phase 1 adds Resend (app mail + custom SMTP for Supabase Auth).

## Cron

Vercel Hobby caps cron at daily, so **cron-job.org** drives sub-daily jobs (Bearer `CRON_SECRET`/`REMINDERS_CRON_SECRET`), with `vercel.json` as backup; see `docs/cron-migration.md`. `vercel.json` today: `/api/briefings/morning` (06:00 weekdays, 08:00 weekends) and `/api/finance/paypal/sync` (07:00 daily). Jobs on cron-job.org (?): reminders, google-sync, drops-monitor. DB-side: pg_cron (available, 1.6.4) runs pc_metrics rollup/prune (0095).

## Design system — Loam & Glow v2

Dark earthy base, bioluminescent glow accents; tokens defined in P0 (v2 names; legacy aliases preserved). Inter Tight everywhere (Fraunces removed in P0.5; hierarchy by weight/size — headings 600, -0.02em). Primitives in `components/ui/`: Surface (levels), Button, Sheet, Skeleton, Label, SegmentedControl, Num/Money/Mono. Section accents (locked): Fitness `#84f5b8`, Finance `#6db8f5`, Health `#5de8e0`, Organisation/Ventures `#f5b56d`, Studio `#f56db5`. Accents only as 2px ticks/chart series. Reactive MyceliumField canvas background with `triggerFieldPulse()` on completions. Motion setting (full/reduced/off) via data-motion attribute.

## PWA / offline

Serwist service worker (`/sw.js`; warm `.next` breaks its build — always `rm -rf .next` first). `/workout-now` is offline-first: IndexedDB queue + Background Sync, idempotent upsert by client UUID (0040). `/offline` fallback page.

## Settings (`/other/settings`)

Settings v2 (P8): panel navigation (Sheet-based on mobile). Appearance (density → real table row heights, motion), Layout (pinned tabs, hidden sections, dashboard reset), FeatureFlags (behaviours: voice capture, AI categorisation, vision scan — distinct from hidden_sections which is nav visibility), Integrations, Capture labels, Data (export `/other/export`, api-usage). Storage split: `ui_prefs` (0091) vs `user_settings` (0075). Remaining P8 debt: Integrations/Capture/Data panels still on old inner styling.
