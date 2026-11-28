# Dossier: E.dsa, DropShipAuto kept alive (DSA)

*Written 2026-11-28 by a dossier agent during the unattended run. Per the run's instructions DropShipAuto needs no web research; the facts below come from the DropShipAuto repo on the PC (read only), the 2026-11-28 harvest and the plan. Prices quoted are from May 2026 chats and are marked as not rechecked.*

## 1. What Phil decided

DropShipAuto is kept alive at low priority (H6). Its open items become Backlog tickets in its existing Work project and its servers stay up. The known open items: two replay-mode dashboard bugs with exact diagnoses; the History page rendering no rows; two overlapping ClickUp task sets (215 and 184) to reconcile or retire; account creation with email verification; an email address and a phone number per store; the first real niche. Standing rules: no em dashes anywhere; every agent scored out of 100, pass at 70; UK market. The `[claude]` flag (kept alive means the VPS stays, so the subdomain move off philipwhelan.com is live work) and H9 flag 6 (alive while the venture rule says FixForward only) are not reopened.

## 2. His kit and constraints

- Repo `A:\Projects\DropShipAuto`, branches `develop` (checked out) and `main`, plus a stale `claude/busy-ptolemy-d4133f` branch and worktree (DSA-26). Last commit 2026-07-23 (`51b8119`, v2 rail work).
- Node.js and Express (`server.js`), PostgreSQL, a Mastra workflow of six agents (NicheScout, ProductHunter, BrandBuilder, StoreBuilder, AdCreator, UgcSourcer), a v1 dashboard in `views/` (Alpine.js pages including `history.html`) and a v2 React client in `client/`.
- Hosted on Phil's VPS: production `dropship.philipwhelan.com` (`main`, pm2 app `dropshipauto`), test `test.dropship.philipwhelan.com` (`develop`), auto-deploy from a GitHub push webhook at `/webhook/github` (`docs/WORKFLOW.md`).
- DSA-1 to DSA-26 open in Mycelium Work, including DSA-6 (v2 History list and Run detail), DSA-8 (v2 Replay mode on the shared store), DSA-10 (v2 cutover to the root).
- The Mail epic moves Phil off philipwhelan.com (its quiet year) and onto IONOS and Proton; mail.31 moves DropShipAuto's two subdomains and its Let's Encrypt email.

## 3. What the research found

**Replay bugs (dsa.01).** The harvest's diagnoses (May 2026, chat "VPS GitHub integration setup", turns 266 to 269): bug 1, NicheScout and ProductHunter show Idle because they finish before the SSE connection; fill `activeRuns.replayedSteps` from `workflow_run_config.replayed_agents` right after `db.initRun()`. Bug 2, BrandBuilder shows the cached Hollowmist brand; merge replayed outputs only onto status `replayed` and use the current run id in `GET /api/runs/:runId`. **The repo moved on after that chat:** `server.js` now rebuilds `replayedSteps` from persisted step rows (around line 482 to 517) and carries a comment at `db.initRun()` (around line 785) explaining that `replayed_agents` used to be dropped by a foreign-key failure and is now written atomically. Bug 1 may therefore already be fixed; bug 2 is not confirmed either way. The v2 client may have replaced the dashboard where both were seen.

**History page (dsa.02).** Harvest: "26 runs, page 1 of 2" and no rows; likely the Alpine template reading null fields on backfilled rows. The repo now has a normalised runs list route with filters, sort and pagination "for the History page" and server-side `utils/renderHistory`, which suggests later work on exactly this. Check before fixing.

**ClickUp (dsa.03).** Two sets: 215 tasks from `seed_clickup.py` and `DropShipAuto_Tracker.xlsx` (14 projects), and a 184-task CSV across 12 Lists; a later clean-up took a CSV from 244 to 152 rows. Both source files are in the repo root. Which set is live was never checked. The project rule: ClickUp by manual entry or CSV import, no AI task creators. Since 2026-11-20 the backlog is in Mycelium Work, which makes "retire" a real option; Phil chooses.

**Sign-up (dsa.04).** `GET /register` serves `views/auth/register.html`; forgot and reset password pages exist; but the server has only `POST /auth/login` and `POST /auth/logout`. No sign-up handler, no verification. The May plan: bcrypt (in use), a verification token, Resend for sending. The sender cannot sit on philipwhelan.com once the quiet year starts.

**Per-store email and phone (dsa.05).** May plan: five suggested addresses per company after BrandBuilder, reviewed before any API call, made through the Google Workspace Admin SDK (ADR-009, about £5 per mailbox a month, May 2026, not rechecked), and a UK Twilio number per store for SMS and voice (ADR-010, about £1 a month plus about £0.013 a minute, May 2026, not rechecked). UK numbers generally need proof of address registered with the provider before use (UNVERIFIED in this run). A Google Workspace per store sits awkwardly with the Mail epic's IONOS and Proton plan.

**First real niche (dsa.06).** Milestone M18: Shopify Basic (about £25 a month, May 2026, not rechecked), a custom domain, real products, the first five UGC DMs, social accounts, a first post. NicheScout's settings: UK focus, a £100-plus high-ticket flag, HOLD on risky results. Test niches (Tranquipaw and others) were tests only.

**Subdomain move (dsa.07).** philipwhelan.com appears in `docs/WORKFLOW.md` (both site URLs and the webhook URL); the Shopify webhook route checks an HMAC; the Let's Encrypt account email lives on the VPS. The harvest also flags git identity and webhook plans as affected.

## 4. Risks

- **Money:** a live store, mailboxes and numbers cost money monthly. Mitigation: dsa.05 is design only, dsa.06 waits for fixf.34 and stops at a shortlist; every money ticket says nothing is bought in this run.
- **Breaking production while fixing:** fixes go to `develop`, are verified on test, then promoted per `docs/WORKFLOW.md`.
- **Losing ClickUp history:** Claude deletes nothing in ClickUp; Phil does any deletion after reading the comparison.
- **Lock-out of the sites during the domain move:** certificates and the webhook can stop when the hostnames change. Mitigation: dsa.07 checks a renewal dry run and a test deploy after mail.31.
- **Fixing bugs that are already fixed or superseded by v2:** dsa.01 and dsa.02 start with a check on test.

## 5. Facts that differ from the plan

- **dsa.01 and dsa.02:** the repo has two months of later work (to 2026-07-23) than the chat the bugs came from, including a fix aimed at `replayed_agents` not persisting and a reworked History route. Both tickets are written as "check on test first, then fix if still there".
- **dsa.04:** a register page already exists in the v1 views; what is missing is the server side (sign-up handler, token, email). The plan's "account creation" is narrower in fact.
- **dsa.05:** added `after dsa.04` (an account to attach the addresses to). The Google Workspace choice in ADR-009 needs a fresh yes against the Mail epic's IONOS and Proton plan; the plan's "link mail.05" is kept as a soft dependency.
- **dsa.06:** added `after fixf.34`, because going live spends money monthly and H6 says FixForward only until the first slice. The plan gave no dependency. The integrator should confirm or remove.
- **dsa.07:** the plan lists `link dsa epic` on mail.31; the DSA side is written as `after mail.31`.
- **Not ticketed though named in the harvest's "high value" list:** the multi-store "KPMG standard" tracker (17 scoping questions unanswered). H6 does not name it among the known open items, so it is left out; the integrator may want an H10-style row.

## 6. Sources

1. `A:\Projects\DropShipAuto\server.js` (auth routes, `/api/pipeline/start`, history routes), branch `develop`, commit `51b8119` (checked 2026-11-28)
2. `A:\Projects\DropShipAuto\docs\WORKFLOW.md` (hosts, branches, webhook) (checked 2026-11-28)
3. `A:\Projects\DropShipAuto\views\` (`history.html`, `auth/register.html`) (checked 2026-11-28)
4. `docs/intake/harvests/dropshipauto.md` (items 1 to 9, standing rules, overlaps) (checked 2026-11-28)
5. `docs/run/2026-11-28/open-tickets.txt` (DSA-3 to DSA-26) (checked 2026-11-28)
6. `docs/run/2026-11-28/plan.md` §20 and mail.31 (checked 2026-11-28)
