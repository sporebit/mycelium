# Multi-user (P12) — the things only Phil can do

Everything here needs a login, a card, or a DNS record, so none of it can be
automated from a session. Nothing in Parts 1–6 can be fully verified until the
items marked **blocking** are done.

**Deferred by Phil, 10 September 2026:** §1, §3 and §4 are parked so the
build can continue. What each one blocks:

- §1 (Supabase Auth config) — Google sign-in verification, and any sign-in
  at all on the hosted project or a Vercel preview. Nothing local.
- §3 (env vars) — hosted break-glass; Part 3's `withUser()` needs
  `SUPABASE_JWT_SECRET` on the hosted side only. Locally the stack's own
  secret is used.
- §4 (pg_dump) — the second half of VERIFY 2 (replay against real data).
  Part 2's from-empty replay and verifier run without it. **This is the
  check that finds unmappable `user_id` values before cutover, so it must
  happen before Part 7.**

Environment variable **names** only appear below. Never paste a value into a
report, a commit message, or a chat.

---

## 1. Supabase Auth configuration — blocking for Part 1

In the Supabase dashboard for the **Mycelium** project, Authentication →
Providers and Settings:

- [ ] Enable **Email** provider, with **magic link** turned on.
- [ ] Enable **password** sign-in (needed alongside TOTP for the owner roles).
- [ ] Enable **MFA / TOTP**. P12 makes TOTP mandatory for the instance owner,
      team owners and team admins, so this is not optional.
- [ ] Enable the **Google** provider. Requires a Google Cloud OAuth client
      (authorised redirect URI `https://<project>.supabase.co/auth/v1/callback`).
      Until this is done, Part 1's VERIFY reports Google sign-in as untested.
- [ ] Turn on the **passkeys** experimental flag if it is available on the
      project. Apple sign-in is deferred by decision and needs nothing.
- [ ] Authentication → URL Configuration: set **Site URL** to the production
      origin and add `https://<production-host>/api/auth/callback` (and the
      Vercel preview pattern `https://*-<team>.vercel.app/api/auth/callback`)
      to **Redirect URLs**. Every email link and the Google redirect land on
      that route.
- [ ] Authentication → Email Templates: change the **Magic Link** template's
      link to
      `{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=magiclink`
      (and the Invite template to the same with `type=invite`, for Part 4).
      The default `{{ .ConfirmationURL }}` relies on a PKCE verifier cookie
      that only exists in the browser that requested the link, so a link
      opened on another device fails. The token-hash form works anywhere.
      Part 1 verified both shapes locally.

## 2. Resend — blocking for Part 4 (invites) and Part 6 (rundowns)

- [ ] Create a Resend account.
- [ ] Verify the sending domain **sporebit.com**: add the SPF, DKIM and DMARC
      records Resend gives you to the domain's DNS. Invites and rundowns will
      land in spam without these.
- [ ] Create an API key and add it as `RESEND_API_KEY`.
- [ ] Set Resend as **custom SMTP** in Supabase Auth → SMTP Settings, so magic
      links and invite emails come from your domain rather than Supabase's
      shared sender, which is rate-limited and unsuitable for real use.

## 3. Environment variables

Add to `.env.local` **and** to Vercel (Production, Preview and Development as
appropriate). Names only:

- [ ] `SUPABASE_JWT_SECRET` — the legacy HS256 JWT secret, from Project
      Settings → API → JWT Keys. **Part 3 depends on this**: system routes
      (cron, Telegram webhook, health-import, pc-metrics) mint a short-lived
      token with it so they run as a user and RLS applies, instead of running
      as service role and bypassing RLS entirely. You have confirmed this
      secret exists.
- [ ] `BREAK_GLASS_SECRET` — a new random secret. Replaces `AUTH_SECRET`, which
      is retired. The old HMAC cookie survives only as a dormant emergency
      path.
- [ ] `BREAK_GLASS_ENABLED` — set to `false` everywhere. It is turned on only
      during an emergency, and every request made under it writes an audit
      event naming it. To use it: set the flag to `true`, redeploy, then
      `POST /api/auth/break-glass` with `{"secret": "<BREAK_GLASS_SECRET>"}`;
      the cookie it sets lasts one hour, acts as you, and can never reach
      `/admin`. Set the flag back to `false` afterwards.
- [ ] `RESEND_API_KEY` — from step 2. Optionally `RESEND_FROM` (default `Mycelium <invites@sporebit.com>`).

**Do not delete anything yet.** `USER_ID`, `DASHBOARD_PASSWORD` and
`AUTH_SECRET` are removed in Part 7 step 5, after cutover is verified, not
before.

## 4. Before Part 2 can be verified

- [ ] Take a `pg_dump` of the live database and note the local file path.
      Part 2's VERIFY replays the whole migration chain twice: once from empty,
      and once against a restore of this dump, which is the only way to prove
      the ownership backfill works on real data rather than on an empty schema.
- [ ] Report the dump's size against what the dashboard claims the database
      holds. A large discrepancy means the dump is incomplete — stop and
      investigate rather than proceeding.
- [ ] **Never commit the dump.** Keep it outside the repository.

## 4b. Rundowns (Part 6)

- [ ] `vercel.json` on the branch now schedules `/api/cron/rundowns` hourly.
      Confirm the Vercel plan allows an hourly cron (Hobby allows daily
      only; if so, change it to daily and set every team's hour to match).
- [ ] Email delivery of rundowns needs §2 (Resend). Push needs the
      recipient to have enabled push in the app. Telegram goes to
      `TELEGRAM_USER_ID` and only for you.

## 5. Before Part 7 (cutover)

- [ ] Parts 0–6 verified on a Vercel preview deploy of the `multi-user` branch.
- [ ] Every box above ticked.
- [ ] The `pg_dump` from step 4 taken to the PC and kept until a week of normal
      use has passed after cutover.

> The free plan has no automatic backups. That dump is the only thing standing
> between a bad cutover and permanent data loss, which is why Part 7 is a
> separate session with you present and why no session may run
> `supabase db push` before it.

## 6. One open question for the next session

`nutrition_targets` was created by migration `0098`, after the P12 prompt was
written, so the prompt's entity registry does not mention it. It needs an
entity group before Part 2 can add `space_id` to it.

- [x] Confirm `nutrition_targets` belongs to **`health.nutrition`** —
      confirmed by Phil, 10 September 2026.
