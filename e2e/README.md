# End-to-end checks

Playwright against a dev server on **port 3100**, wired to the **local** Supabase stack (Docker + `supabase start`). The hosted database is never touched and every paid or outward-facing key (cloud AI, Telegram, email, PayPal, Google) is blank on that server. See `e2e/support/env.ts`.

```
npm run e2e                                         everything, as Phil and as Tess
npm run e2e -- e2e/work.spec.ts --project=phil      one file as one person
npm run e2e -- e2e/smoke.spec.ts --grep "/work$"    one check
```

## Who the checks run as

| Project | Person | What they are |
|---|---|---|
| `phil` | `phil@mycelium.local` | the seeded instance owner |
| `tess` | `tess@mycelium.local` | a second user with her own personal space |

Both sign in with a real session (password grant, written as the cookies `@supabase/ssr` sets). File naming decides who runs a spec:

- `name.spec.ts` runs once as each person
- `name.phil.spec.ts` runs as Phil only
- `name.tess.spec.ts` runs as Tess only

A spec that needs both people in one test opens a second context with `browser.newContext({ storageState: storageStateFor(TESS) })` from `e2e/support/users.ts`.

## Conventions

- **Own your data.** Everything a spec creates carries a prefix unique to the spec (`E2E-work-…`) plus a run id, and the spec removes it afterwards where the app offers a delete. Never delete or edit rows the spec did not create: the local database is shared with the vitest access suites.
- **Drive the UI for what the UI does; use the API for setup.** `request` (the Playwright fixture) carries the same session as the page. For server-to-server paths use the header `x-api-secret: e2e-api-secret` (acts as Phil) or `Authorization: Bearer e2e-cron-secret` (cron routes).
- **SQL for assertions only**, through `localSql()` in `lib/access/introspect.ts`, when the app offers no way to read the thing back.
- **AI is off.** A feature that calls a model must degrade without a 5xx. If it does not, that is a finding.
- **Selectors:** role and visible text first; add a `data-testid` to the app only where there is no stable role or label.
- **No sleeps.** Wait on a response, a locator or a URL.
- A second-factor prompt can be answered with `totp()` from `scripts/lib/totp.mjs` once the test has enrolled a factor for that user.

## What is not here

Unit and database-level checks stay in vitest (`npm test`). Cross-user data isolation over every endpoint stays in `npm run isolation-test`. These specs cover what only a browser shows: that the surface opens, that its main journeys complete, and that a second user sees what they should and nothing else.
