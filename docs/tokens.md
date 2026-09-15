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
| `CRON_SECRET` | Authorises cron routes (rundowns, etc.) | Rotate on suspicion; update cron-job.org / Vercel cron config together. |
| `RESEND_API_KEY` | Transactional email (invites, rundowns) | Sending-only key. Set when Resend is configured. |
| `TELEGRAM_*` | Capture bot webhook + send | Webhook secret + bot token. |
| `GOOGLE_CLIENT_ID` / secret | Calendar integration, and (later) Google sign-in | A separate sign-in client is recommended over reusing the calendar client. |
| `PC_METRICS_SECRET` | pc-agent → `/api/pc-metrics` bearer | Only surviving copy is the Vercel env var (M1.5 parked). |
| `HEALTH_IMPORT_SECRET` | Apple Health import bearer | GET now needs it too (P12). |
| `SPOTIFY_*`, `PAYPAL_*` | Integration OAuth clients | Owner-only integrations. |

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
