# Digest: Keys, secrets and domains (SEC and MAIL)
Brief sections: H2 items 1 to 3 and 5 to 12, H10 Keys (H2.11) Stripe item, H1 ticket bullets (Proton hardening, plaintext passwords), H9 flags 2 and 9, run rule on keys and secrets. Source A:\Projects\Mycelium\docs\intake\intake-2026-11-27.md. Dashes in quoted answers are the brief's own.

## 1. First answers

None.

## 2. Round 2 extras

None.

## 3. Round 3 corrections and additions (these win)

### Run rule (KEYS AND SECRETS, from the run instructions)

Run rule: nothing is rotated, revoked, reset, deleted or opened in this run; tickets name keys only, never values.

### H2 items 1 to 3: Domain cull, domain hardening, better home than IONOS (brief lines 612-614)

1. **Domain cull:** philwhelan.com, sporebit.com and philipwhelan.com (until its quiet year ends) are kept. One ticket lists every other domain with renewal date and cost for a keep-or-drop sitting (eight have no mailbox; `sporebit.store` and `sporebit.org` were already marked "cancel, do not renew" in May). Standing rule: **no domain lapses while any address on it is a login or recovery address.**
2. **Domain hardening: every domain, at once** (registrar 2FA, transfer lock, auto-renew with a valid card, WHOIS privacy, DNSSEC, null SPF and reject DMARC on non-sending domains, dangling DNS records left by old Wix, Squarespace, Shopify and Web Genie sites, TLS on live sites). `[claude]` flagged once: this hardens domains the cull is about to drop; the ticket order puts the account-level steps first (they cover every domain in one go) and per-domain DNS work after the keep-or-drop sitting.
3. **"Is there a better home than IONOS?"** goes into the self-hosting epic as one research ticket: what runs on the VPS today, what Substrate replaces, and a registrar comparison. Mail stays at IONOS.

### H2 items 5 to 12: Old VPS, secrets, port 3000, email-to-calendar, calendars, census files, other credentials, eBay alerts (brief lines 616-623)

5. **The first "Mycelium" on the IONOS VPS** (May 2026: Postgres and FastAPI at `api.philwhelan.com`, an agent reading four IONOS inboxes hourly and writing to Google Calendar, a review queue, a watch list and a renewals table; stopped mid-build on 17 May). **Assumed** (unanswered): a ticket checks what it is doing now (is the agent still running, what has it spent, what is in the review queue), with "export its data, then switch it off" as the recommended outcome. Nothing is switched off without Phil's word.
6. **VPS secrets: a ticket** (Phil's answer). Four were exposed in May and parked: the Anthropic API key for the calendar agent, four IONOS mailbox passwords, the API bearer token, the Google OAuth client secret. Names only in the ticket, no values.
7. **Port 3000** is open to the internet on that VPS and nobody knows what listens. **Assumed:** checked and closed in the same ticket as the secrets.
8. **Email-to-calendar** (the old agent's one unique feature). **Assumed:** added to Mycelium's mail import as an idea-status item (events to the calendar when confident, the rest as evening review cards); not ticketed for build until Phil says.
9. **Calendars:** the eight May sub-calendars (Personal, Birthdays, Events, Family/Household Admin, Finance, Fitness, Sporebit, Travel) now sit beside Family and Phirsty Life. **Assumed:** one ticket lists every calendar, what writes to it and who sees it, for a keep-or-merge sitting.
10. **Census files on the PC** (a live Gmail app password, a Hotmail mailbox export in a Thunderbird folder, unencrypted Proton Pass CSV exports): Phil is **not sure** whether they were cleaned up. A ticket for Claude Code to check and report; revoke and delete only on his say. This is the largest known exposure and belongs in the unblock queue.
11. **Other credentials seen in chats** (DropShipAuto's ngrok and GitHub tokens; the old PhirstMaxxing app's push keys, cron secret and service-role key): **one "rotate everything" ticket** as a Field guide, names only, alongside the Mycelium rotations already queued (MYC-6).
12. **eBay new-device sign-in alerts** (Nov 2025 to Jul 2026): **all Phil** (his answer). No incident ticket; the eBay password and 2FA are done in the migration's High rows before FixForward automation touches the account.

### H10 folded item: Keys (H2.11), Stripe test key (brief lines 702)

- **Keys (H2.11):** a Stripe test key was visible in a screenshot in August (project unknown): added to the rotate-everything ticket, names only.

### H1 ticket bullet: Proton account hardening (brief lines 607)

- Proton account hardening (security keys, a tested recovery kit): idea, costs money; a decision ticket.

### H1 ticket bullet: passwords emailed in plain text (brief lines 608)

- Passwords that three old sites once emailed in plain text: covered by the rotation; one check ticket for reuse.

### H9 flag 2: hardening every domain before the cull (brief lines 686)

2. Hardening every domain before the cull (H2.2).

### H9 flag 9: four answers assumed (brief lines 693)

9. Four answers were assumed, all about the old VPS and calendars (H2.5, H2.7, H2.8, H2.9).

## 4. Flags marked [claude] that touch this epic

- H2 items 1 to 3 item 2 (brief line 613): 2. **Domain hardening: every domain, at once** (registrar 2FA, transfer lock, auto-renew with a valid card, WHOIS privacy, DNSSEC, null SPF and reject DMARC on non-sending domains, dangling DNS records left by old Wix, Squarespace, Shopify and Web Genie sites, TLS on live sites). `[claude]` flagged once: this hardens domains the cull is about to drop; the ticket order puts the account-level steps first (they cover every domain in one go) and per-domain DNS work after the keep-or-drop sitting.

## 5. Assumed items

### H2 item 5: the old VPS (assumed) (brief lines 616)

5. **The first "Mycelium" on the IONOS VPS** (May 2026: Postgres and FastAPI at `api.philwhelan.com`, an agent reading four IONOS inboxes hourly and writing to Google Calendar, a review queue, a watch list and a renewals table; stopped mid-build on 17 May). **Assumed** (unanswered): a ticket checks what it is doing now (is the agent still running, what has it spent, what is in the review queue), with "export its data, then switch it off" as the recommended outcome. Nothing is switched off without Phil's word.

### H2 item 7: port 3000 (assumed) (brief lines 618)

7. **Port 3000** is open to the internet on that VPS and nobody knows what listens. **Assumed:** checked and closed in the same ticket as the secrets.

### H2 item 8: email-to-calendar (assumed) (brief lines 619)

8. **Email-to-calendar** (the old agent's one unique feature). **Assumed:** added to Mycelium's mail import as an idea-status item (events to the calendar when confident, the rest as evening review cards); not ticketed for build until Phil says.

### H2 item 9: calendars (assumed) (brief lines 620)

9. **Calendars:** the eight May sub-calendars (Personal, Birthdays, Events, Family/Household Admin, Finance, Fitness, Sporebit, Travel) now sit beside Family and Phirsty Life. **Assumed:** one ticket lists every calendar, what writes to it and who sees it, for a keep-or-merge sitting.

## 6. Dates named for this epic

- Four secrets exposed in May and parked (H2 item 6, line 617); the first "Mycelium" on the IONOS VPS stopped mid-build on 17 May (line 616).
- A Stripe test key visible in a screenshot in August (H10, line 702).
- eBay new-device sign-in alerts Nov 2025 to Jul 2026 (H2 item 12, line 623).
- Domain cull: one ticket lists every other domain with renewal date and cost; sporebit.store and sporebit.org were marked "cancel, do not renew" in May (H2 item 1, line 612).
- Account-level domain hardening first, per-domain DNS work after the keep-or-drop sitting (H2 item 2, line 613).
- Mycelium rotations already queued as MYC-6 (H2 item 11, line 622).

## 7. Cross-links to other epics

- mail-email-migration: recovery anchor, per-account password rotation, the keep-or-drop domain sitting, census files holding Gmail app password and Proton Pass CSVs.
- substrate-self-hosting: H2 item 3 research on a better home than IONOS (VPS replaced by Substrate); the old VPS as context.
- ventures-and-life (DSA project): DropShipAuto ngrok and GitHub tokens, its subdomains and VPS stay up (H6, line 669).
- fixforward: the eBay password and 2FA are done before FixForward automation touches the account (H2 item 12).
- mycelium-second-brain: unblock queue includes key rotation and the census-files check; old PhirstMaxx keys go into the rotate-everything ticket.
