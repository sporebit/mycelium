# Tokens and secrets — inventory (names only)

*Names, scope and rotation only. **Never** put a secret value in this file.
Started 2026-09-15 after the P12 cutover, per the backlog token-hygiene item.
Values live in Vercel (Production/Preview) and in the local `.env.local`;
`.env.example` lists every name with a comment.*

## Live application secrets (Vercel env vars)

| Name | Purpose | Notes / rotation |
|---|---|---|
| `SUPABASE_JWT_SECRET` | Legacy HS256 secret; system routes mint user tokens with it | Do **not** rotate/revoke — `withUser` depends on it. On the hosted project it is the "Legacy JWT Secret" (still used to verify), the project having moved to asymmetric signing keys. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service role (bypasses RLS) | Fenced to `lib/system`. Rotating means re-pasting into Vercel. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser anon key | Public by design; RLS is the wall. |
| `BREAK_GLASS_SECRET` | Dormant emergency access (P12) | Random. `BREAK_GLASS_ENABLED=false` except during an incident. Replaced the retired `AUTH_SECRET`. |
| `API_SECRET` | System/API principal bearer (acts as Phil) | Superseded per-token by Tickets `api_tokens` (spec §14.4) once that ships. |
| `CRON_SECRET` | Authorises cron routes (rundowns, tickets nightly / check-ins, quotes research sweeper) | Rotate on suspicion; update cron-job.org / Vercel cron config together. |
| `ANTHROPIC_API_KEY` | Rundowns (`tickets.rundown`) and Quotes research (`quotes.research`), both Sonnet + web search, both logged to `api_usage` | Set on Vercel (Production). Proven live 2026-09-19 by a Quotes research re-run. `ANTHROPIC_MODEL` optionally overrides the Sonnet id. |
| `RESEND_API_KEY` | Transactional email (invites, rundowns) | Sending-only key. Set when Resend is configured. |
| `TELEGRAM_*` | Capture bot webhook + send | Webhook secret + bot token. |
| `GOOGLE_CLIENT_ID` / secret | Calendar integration, and (later) Google sign-in | A separate sign-in client is recommended over reusing the calendar client. |
| `PC_METRICS_SECRET` | pc-agent → `/api/pc-metrics` bearer | Only surviving copy is the Vercel env var (M1.5 parked). |
| `HEALTH_IMPORT_SECRET` | Apple Health import bearer | GET now needs it too (P12). |
| `SPOTIFY_*`, `PAYPAL_*` | Integration OAuth clients | Owner-only integrations. |
| `GITHUB_WEBHOOK_SECRET` | HMAC for `POST /api/tickets/github` (Tickets Part G) | Set 2026-09-18 (Production + Preview); GitHub repo webhook id 681119122 carries the same value. |
| `GITHUB_TOKEN` | Outbound Issues sync (create issue) — PAT or App installation token | Only needed when a project has `github_issues_sync` on. Not yet set. |
| `GITHUB_BOT_LOGIN` | Loop guard: inbound issue events by this login are ignored | Optional. |
| `VERCEL_WEBHOOK_SECRET` | HMAC-SHA1 for `POST /api/tickets/vercel` | Set 2026-09-18 from the Vercel webhook create response (Production + Preview). |
| `TICKETS_SMOKE_URL` | Smoke check after a production deploy | Defaults to `https://mycelium.sporebit.com/api/health`. |
| `TICKETS_RUNDOWN_CAP_PENCE` | Monthly rundown cap (spec §9.1) | Defaults to 1000 (£10). |
| `api_tokens` (table, not env) | Scoped `mtk_` bearer tokens for `tix` / Claude Code | Minted at Settings → Security → API tokens; hashes only in the DB; revoke there. |

## Retired at cutover (2026-09-15)

| Name | Was | Status |
|---|---|---|
| `USER_ID` | Single-user identity (`phil`) | Removed from Vercel in cutover step 8. |
| `DASHBOARD_PASSWORD` | Pre-P12 dashboard gate | Removed in step 8. |
| `AUTH_SECRET` | Pre-P12 HMAC cookie secret | Replaced by `BREAK_GLASS_SECRET`; removed in step 8. |

## One-off tokens minted for operations

Personal access tokens minted for a cutover or run-book (Supabase Management
API, Vercel CLI, Resend admin, IONOS DNS) are revoked as the last step of
that operation. Record any that outlive a session here by name, scope and
revocation date so the next run starts from a known state.

- (none outstanding as of 2026-09-15)
