# Digest: Email migration (project MAIL)
Brief sections: Section 1, 1b, H1, H2 item 4 (renewals), H2 items 8 and 9 (assumed), H10 Email (H1) folded item. Source A:\Projects\Mycelium\docs\intake\intake-2026-11-27.md. Dashes in quoted answers are the brief's own.

## 1. First answers

### Section 1: Email migration (project MAIL) (brief lines 15-44)

1. Mail for philipwhelan.com is hosted at **IONOS**.
2. **Two to five** addresses receive mail on it.
3. All three domains (philipwhelan.com, philwhelan.com, sporebit.com) are registered at **IONOS**.
4. Why: **security clean-up** and a **shorter, cleaner address**.
5. Split: **personal and life admin on philwhelan.com; dev, apps and side projects on sporebit.com**.
6. New host: **stay on IONOS**.
7. Budget: **nothing extra**.
8. Address style: **a few by purpose** (for example phil@, bills@, shopping@, dev@), not one alias per service.
9. Old mail history: **move it all across**.
10. **50 to 200** accounts use an old address.
11. Account list built from **the Proton Pass export plus an inbox sender sweep**.
12. Who changes each account: **Claude in his browser** for low-risk ones **and** change **as mail arrives** for the rest. Not a hand-worked checklist.
13. Critical accounts on the old address, each its own ticket: **Microsoft account, Apple ID, banks / HMRC / pension, IONOS and other hosting**.
14. Order: **critical first**.
15. Microsoft sign-in: **add the new address as primary alias and remove the old one**.
16. Old domain: **keep one year, then drop** ("1 year then drop"). `[claude]` flagged in the question: a lapsed domain can be bought and receive reset emails.
17. Catch-all on the old domain during migration: **yes, forwarded and labelled** (the label is the "change as mail arrives" queue).
18. DNS: **stays at IONOS**.
19. SPF / DKIM / DMARC: **monitor first, then enforce**, on all three domains.
20. App sending from sporebit.com (Mycelium invites): **a ticket in MAIL**, linked to the Mycelium ticket that needs it.
21. Only Phil has addresses on the old domain.
22. Read on **iPhone Mail, Pixel and webmail** (no Outlook on the PC).
23. The mailbox Mycelium may read (MYC-201): **on sporebit.com**, dedicated, never his personal mailbox.
24. Telling contacts: **"they don't"**, no announcement, no auto-reply.
25. Pace: **15-minute chunks**, a batch per sitting on the daily list.
26. Tracking: **a checklist ticket**, one step per account, state in the Mycelium database.
27. Done means: **old mailboxes closed**.
28. Calendars, contacts and files on old-address accounts: **audit first**, decide per account.
29. Per-account clean-up while changing the address: **2FA or passkey on, weak or reused passwords replaced, unused accounts closed**.
30. Output: **a researched house-style guide per phase** on the phase ticket.

## 2. Round 2 extras

### Section 1b: Email migration, extras (brief lines 415-424)

- **Likely failure he named:** stopping after the critical accounts. **Counter:** the forwarded-mail label shrinks visibly, a per-week count of old-domain mail on the daily line, aim zero, each arrival offering "change this one now" with Claude in the browser.
- **Addresses on philwhelan.com (eight):** phil@ (people), bills@ (money and utilities), shop@ (retail and deliveries), admin@ (government, health, legal), home@ (the house), news@ (newsletters and digest sources), vault@ (account recovery only, never given to a shop), bank@ (banks and cards only).
- **Addresses on sporebit.com (eight):** dev@ (GitHub, hosting, APIs), inbox@ (Mycelium's reader), noreply@ (mail the apps send), hello@ (public contact), fixforward@ (eBay, PayPal seller side, couriers), alerts@ (server, backup and DMARC reports), ai@ (AI providers and API accounts), mycelium@ (reply-to on invites).
- Not wanted: car@, travel@, health@, family@, baby@, career@, receipts@, junk@.
- **Month eleven:** a review ticket; he decides whether the domain lapses.
- **Claude in the browser:** dry run on three accounts he does not care about, watched live, before anything real.
- **Sites that refuse an address change:** close and reopen if still used, otherwise close.
- **Landing:** one mailbox, a folder per address, only phil@ and vault@ notify.
- **Public trail (GitHub commits etc.):** leave history; new address going forward; old address kept verified until the lapse; a ticket lists where the old address is public.
- **Finish:** a closing report (accounts moved, closed, secured, effort) saved to Docs and the Day log.

## 3. Round 3 corrections and additions (these win)

### H1: Email migration, corrections to sections 1 and 1b (brief lines 583-608)

**Facts that replace yesterday's estimates.** The account list already exists: `Desktop\mail-census\account-inventory.xlsx` (built 2026-10-09 by `mail_census.py`, a header-only sweep of every mailbox, cross-checked against the Proton Pass export). It holds 3,198 sender rows across **17 addresses** (not "two to five"), of which **1,736 are account-type** (not "50 to 200"), 1,455 are marketing-only, 355 services sit on more than one address, and about 1,100 have no Proton Pass entry. `pw@philipwhelan.com` carries 615 accounts and `philip@philipwhelan.com` 353. Section 1 answers 2, 10 and 11 are superseded by this; no new sweep is needed.

**Decided 2026-11-28 (each asked against the May and October plans):**

1. **Address set:** yesterday's sixteen (section 1b) are the real set. The mailboxes made in May and October are retired or renamed into it: `me@`, `shopping@`, `travel@` and `pw@` on philwhelan.com; `phil@` and `contact@` on sporebit.com; both `catch@` mailboxes are deleted. `phil@philwhelan.com` survives as the people address.
2. **Inboxes:** one mailbox with a folder per address (yesterday's answer stands over May's separate mailboxes); the other addresses are forwards. First ticket checks the IONOS Mail Basic mailbox and forward limits.
3. **Catch-all:** none on philwhelan.com and none on sporebit.com. The only catch-all is on philipwhelan.com, forwarding to the existing forwarding-only `philipwhelan@philwhelan.com`, labelled (section 1 answer 17).
4. **Recovery anchor:** the IONOS account, Proton and the Microsoft account log in or recover through **Gmail only**, never through an address on a domain IONOS hosts. `vault@` is for every other account's recovery and is never used for those three.
5. **Microsoft account:** stays on the Hotmail login with Gmail recovery; `pw@philipwhelan.com` is removed from it. This replaces section 1 answer 15 (no new primary alias).
6. **Aliases:** an alias for every shop (the May design: each retailer gets its own Proton hide-my-email alias forwarding to the shop address). `[claude]` this reverses section 1 answer 8 ("not one alias per service") and may cost money against answer 7 ("nothing extra"): the free Proton tier's alias limit was last quoted as about ten and never verified, and 15 aliases already exist. First ticket: check the plan and today's limits before any alias work.
7. **Scale:** the **High** rows of the inventory are moved deliberately (Claude in the browser for low-risk ones, as chosen); everything else changes when its mail arrives; marketing-only senders are left to die with the domain.
8. **Unwanted mail:** no unsubscribe campaign on the old domain. Gmail gets one unsubscribe pass (the workbook has an Unsubscribe Link column), plus the listed outlets from topic 9.
9. **The old domain's year** starts when the last High account has moved, not from a calendar date; the month-eleven review stands.
10. **Tracking:** the inventory is imported into Mycelium, owner-only, and becomes the checklist's data (state in the database); the workbook is kept as a frozen source in the nightly backup.

**Tickets the harvests add to MAIL:**
- Per-account routine from the October plan: change the address, rotate the password, set up 2FA, fix the Proton Pass entry, mark done. Password rotation was already "in progress"; how far it got is unknown.
- Correct the workbook's Target Address column for the High rows (the October heuristic used the old address names; remap to the sixteen).
- Proton Pass clean-up: remove entries for two dead addresses, one inaccessible Gmail address and one address that belongs to his sister; 350 logins and 15 aliases to reorganise. The inaccessible Gmail address: check the inventory for any live account still using it.
- Wind down `fixclothing.co.uk`: check for a Companies House record, close or move Shopify, drop the mailbox, then the domain.
- Legacy addresses on philipwhelan.com (`creps@`, `ebay@`, `git@`, `int@`): audit, then close. `ebay@` is checked against the live eBay account first (links to FixForward).
- The other domains on the mail plan (`surprise-packs.com`, `mywebsitetitle.co.uk`) have no plan: covered by the domain review below.
- Dependents that break when philipwhelan.com is retired: DropShipAuto's two sites on philipwhelan.com subdomains and its Let's Encrypt account email. Both move before the quiet year starts.
- Mercedes account: find which address it uses and add it to the High rows.
- Proton account hardening (security keys, a tested recovery kit): idea, costs money; a decision ticket.
- Passwords that three old sites once emailed in plain text: covered by the rotation; one check ticket for reuse.

### H2 item 4: Renewals (the dated lines) (brief lines 615)

4. **Renewals:** dated tickets plus a renewals list in Finance. Known: **broadband (4th Utility) commitment ends May 2027, £37.00 a month, review and check the notice period in March 2027**. Dates to look up in one sitting: Mercedes EQA lease end, IONOS Mail Basic, the IONOS VPS, philipwhelan.com, the two Sporebit domains. `[claude]` the broadband decision links to SEC answer 18 (making the ASUS the only router depends on the provider).

### H10 folded item: Email (H1) (brief lines 701)

- **Email (H1):** in May Phil asked to move the accounts Claude Code uses from his Gmail address to sporebit.com. Under H1 these go to `dev@` and `ai@`; Gmail stays as the recovery anchor only. The Microsoft account sign-in attack of May 2026 (unsolicited Authenticator prompts): one check that the password was changed and sessions signed out, inside the Microsoft ticket (H1.5).

## 4. Flags marked [claude] that touch this epic

- Section 1 item 16 (brief line 30): 16. Old domain: **keep one year, then drop** ("1 year then drop"). `[claude]` flagged in the question: a lapsed domain can be bought and receive reset emails.
- H1 item 6 (brief line 592): 6. **Aliases:** an alias for every shop (the May design: each retailer gets its own Proton hide-my-email alias forwarding to the shop address). `[claude]` this reverses section 1 answer 8 ("not one alias per service") and may cost money against answer 7 ("nothing extra"): the free Proton tier's alias limit was last quoted as about ten and never verified, and 15 aliases already exist. First ticket: check the plan and today's limits before any alias work.
- H2 item 4 (brief line 615): 4. **Renewals:** dated tickets plus a renewals list in Finance. Known: **broadband (4th Utility) commitment ends May 2027, £37.00 a month, review and check the notice period in March 2027**. Dates to look up in one sitting: Mercedes EQA lease end, IONOS Mail Basic, the IONOS VPS, philipwhelan.com, the two Sporebit domains. `[claude]` the broadband decision links to SEC answer 18 (making the ASUS the only router depends on the provider).

## 5. Assumed items

### H2 item 8: Email-to-calendar (assumed) (brief lines 619)

8. **Email-to-calendar** (the old agent's one unique feature). **Assumed:** added to Mycelium's mail import as an idea-status item (events to the calendar when confident, the rest as evening review cards); not ticketed for build until Phil says.

### H2 item 9: Calendars (assumed) (brief lines 620)

9. **Calendars:** the eight May sub-calendars (Personal, Birthdays, Events, Family/Household Admin, Finance, Fitness, Sporebit, Travel) now sit beside Family and Phirsty Life. **Assumed:** one ticket lists every calendar, what writes to it and who sees it, for a keep-or-merge sitting.

## 6. Dates named for this epic

- Old domain: kept one year, then dropped (section 1 answer 16, brief line 30); the year starts when the last High account has moved, not from a calendar date (H1 item 9, line 595).
- Month eleven: a review ticket, he decides whether the domain lapses (1b, line 419).
- Account inventory built 2026-10-09 by mail_census.py (H1, line 583); H1 decisions made 2026-11-28 (line 585).
- Renewals (H2 item 4, line 615): broadband (4th Utility) commitment ends May 2027 at 37.00 pounds a month, review and check the notice period in March 2027. Dates to look up in one sitting: Mercedes EQA lease end, IONOS Mail Basic, the IONOS VPS, philipwhelan.com, the two Sporebit domains.
- Per-week count of old-domain mail on the daily line, aim zero (1b, line 415).
- Dependents (DropShipAuto sites on philipwhelan.com subdomains, Let's Encrypt account email) move before the quiet year starts (H1, line 605).

## 7. Cross-links to other epics

- sec-keys-and-domains: recovery anchor (Gmail only), password rotation, Proton hardening, plaintext-password check, domain cull and hardening, secrets on the old VPS.
- fixforward: ebay@ is checked against the live eBay account first (H1, line 603); fixforward@ is the seller-side address (1b, line 417).
- ventures-and-life (DSA project): DropShipAuto's two subdomain sites and Let's Encrypt email move off philipwhelan.com before the quiet year (H1, line 605).
- substrate-self-hosting: service names under sporebit.com, alerts@ for server, backup and DMARC reports (1b, line 417).
- sec-blocking: listed outlets cleared in this epic's sender sweep (section 9 answer 21).
- dashboard-wall: the mailbox Mycelium may read (inbox@, MYC-201) feeds parcels (section 1 answer 23).
- finance: bills@ and bank@ addresses (1b, line 416).
