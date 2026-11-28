# Dossier: E.mail, the email migration (project MAIL)

*Written 2026-11-28 by a T2 dossier agent for the run of 2026-11-28. Sources: plan.md §1, §25 and §27; digests `mail-email-migration.md` and `sec-keys-and-domains.md`; the brief at `docs/intake/intake-2026-11-27.md` lines 15 to 44, 415 to 424 and 583 to 608. Every product fact below was checked on the web on 2026-11-28; anything that could not be confirmed is marked UNVERIFIED. Nothing was changed on any account in this run.*

## 1. What Phil decided

Mail stays at IONOS, DNS stays at IONOS, and nothing extra is spent. Personal and life admin move to sixteen purpose addresses: eight on philwhelan.com (phil@ for people, bills@, shop@, admin@, home@, news@, vault@ for recovery only, bank@) and eight on sporebit.com (dev@, inbox@ for Mycelium's reader, noreply@, hello@, fixforward@, alerts@, ai@, mycelium@). The May and October mailboxes are retired or renamed into that set (me@, shopping@, travel@, pw@ on philwhelan.com; phil@ and contact@ on sporebit.com) and both catch@ mailboxes are deleted; phil@philwhelan.com survives. One mailbox, a folder per address, the others as forwards, and only phil@ and vault@ notify. The only catch-all is on philipwhelan.com, forwarding to philipwhelan@philwhelan.com and labelled "old domain"; that label is the "change as mail arrives" queue with a weekly count on the daily line. IONOS, Proton and the Microsoft account recover through Gmail only; vault@ is the recovery address for everything else. The Microsoft account stays on its Hotmail login and loses pw@philipwhelan.com. The account inventory (3,198 sender rows, 1,736 account-type, 17 addresses) is imported into Mycelium, owner-only, as the checklist's data; the High rows are moved deliberately (Claude in the browser for low-risk ones, after a watched dry run on three throwaway accounts), the rest change as their mail arrives, marketing-only senders die with the domain. Critical accounts go first, each its own ticket. Each account gets the October routine: change the address, rotate the password, 2FA or passkey on, fix the Proton Pass entry, mark done. SPF, DKIM and DMARC go on all three domains, monitor first, then enforce. Every shop gets its own Proton hide-my-email alias forwarding to shop@, but only after a check of the plan and today's alias limit. Gmail gets one unsubscribe pass. The old domain's year starts when the last High account has moved; a month-eleven review decides whether it lapses. Done means the old mailboxes are closed, followed by a closing report. Two `[claude]` flags touch this epic and are not reopened: the lapsed-domain reset-email risk (section 1 answer 16) and the alias cost against "nothing extra" (H1.6).

## 2. His kit and constraints

- **Domains:** philipwhelan.com (the old domain, mail hosted at IONOS, 17 addresses in the inventory, pw@ carries 615 accounts and philip@ 353), philwhelan.com and sporebit.com, all three registered and DNS-hosted at IONOS. Also fixclothing.co.uk (to wind down), surprise-packs.com and mywebsitetitle.co.uk (no plan; the domain cull in E.keys covers them).
- **Mail product:** IONOS Mail Basic. Which variant (Mail Basic 1, 1+ or 5) and how many mailboxes the contract holds today is not recorded anywhere in the run's sources.
- **Existing mailboxes:** May and October creations on philwhelan.com and sporebit.com (named in §1), two catch@ mailboxes, a forwarding-only philipwhelan@philwhelan.com, legacy creps@, ebay@, git@, int@ on philipwhelan.com.
- **Readers:** iPhone Mail, a Pixel, IONOS webmail. No Outlook on the PC.
- **Password manager:** Proton Pass, 350 logins and 15 hide-my-email aliases, with entries for two dead addresses, one inaccessible Gmail address and one address that belongs to his sister. About 1,100 inventory services have no Proton Pass entry.
- **Anchor accounts:** a Gmail address (the recovery anchor), a Hotmail-login Microsoft account (sign-in attack in May 2026 with unsolicited Authenticator prompts), an Apple ID currently on an old address (PW-57 asks for its password change).
- **Inventory:** `Desktop\mail-census\account-inventory.xlsx`, built 2026-10-09 by `mail_census.py`, header-only, cross-checked against the Proton Pass export; has Target Address and Unsubscribe Link columns. The Target Address column uses the October address names and must be remapped for the High rows.
- **Dependents:** DropShipAuto's two sites on philipwhelan.com subdomains and its Let's Encrypt account email (the VPS stays, H6); eBay (FixForward must not touch it before the password and 2FA are done); a Mercedes account on an unknown address; three old sites that once emailed passwords in plain text.
- **Constraints:** 15-minute sittings; nothing extra spent; no announcement or auto-reply to contacts; nothing changed in this run.

## 3. What the research found

### 3.1 IONOS Mail Basic: mailboxes, forwards, storage, price (for mail.01)

- IONOS UK sells **Mail Basic 5** (five mailboxes, 2 GB each, introductory £1 a month for 12 months, then £2.50 a month) and **Mail Basic 1+** (one mailbox, 12 GB, introductory £1.50 a month, then £5 a month); prices exclude VAT at 20%. Both list **"Unlimited Forwarding addresses"** and say mailboxes and storage can be added at any time (price of an extra mailbox not shown). [1] (checked 2026-11-28)
- The help centre's "at a glance" page also describes **Mail Basic 1** (one mailbox, 2 GB) and Mail Basic 1+ (one mailbox, 12 GB); 10 GB extra storage can be bought for a 2 GB mailbox. [2] [3] (checked 2026-11-28)
- **Forwarding addresses** have no mailbox and "only forward incoming emails". Created under My Products > Email & Office > Portfolio > Create next to Email Forward; working immediately. The number of forwarding destinations per address "depends on your package"; one UK help page says up to 10 destinations per address. [4] [5] (checked 2026-11-28)
- **Forwards cannot send.** IONOS says a forwarding address does not count as a sender address. Since 2024 the sender address must share the domain of the mailbox it is sent from, and the Webmail "Sender addresses" option was removed on 29 January 2024; the workaround is a separate account in the mail program, which only works for an address on the same domain as a real mailbox. [6] (checked 2026-11-28) Consequence: a single mailbox on philwhelan.com cannot send as any sporebit.com address (hello@, dev@, fixforward@), and cannot send as bills@ or shop@ either unless those exist as accounts the mail app can authenticate. Whether a Mail Basic mailbox can send as a same-domain forward is UNVERIFIED.
- **Storage against "move it all across":** a 2 GB mailbox holds about 10,000 emails by IONOS's own estimate [1]. Moving the history of pw@ and philip@ and the retired mailboxes into one 2 GB mailbox may not fit. The size of the existing mailboxes is not known. UNVERIFIED whether the current contract already has 12 GB.
- **Mass mailing:** IONOS has sending limits per mailbox; not relevant to Phil's personal use, relevant to noreply@ only if it were sent through IONOS rather than the app's sending service. [5] (search result only; UNVERIFIED figure)

### 3.2 IONOS catch-all behaviour (for mail.07)

- A catch-all is created as an ordinary address with an asterisk as the name (`*@domain`). It receives mail for any address on the domain that does not otherwise exist; renaming it switches it off, renaming back restores it; deleting it deletes its mailbox, so back up first. Valid for Mail Basic and Mail Business. [7] [8] (checked 2026-11-28)
- The help centre describes the catch-all **as a mailbox**. Whether `*@` can be created as a forward (no mailbox) rather than a mailbox is **UNVERIFIED**. If it must be a mailbox, it uses one mailbox slot and needs a forward or filter rule on that mailbox to reach philipwhelan@philwhelan.com. The ticket checks this first.
- A catch-all on a domain that has received 3,198 senders' mail for years will collect spam and dictionary-attack mail. IONOS's spam filter is included with Mail Basic [2]. No IONOS warning on this was found.

### 3.3 Proton Pass hide-my-email aliases (for mail.02 and mail.25)

- **Proton Free: 10 hide-my-email aliases. Pass Plus, Pass Family and Proton Unlimited: unlimited.** [9] [10] (checked 2026-11-28)
- Prices on the pricing page, in US dollars, annual billing: Pass Plus $1.99 a month introductory ($23.88 for the first 12 months, then $35.88 a year; a crossed-out $4.99 is shown as the monthly reference); Pass Family $2.79 a month introductory ($59.88 a year after); Proton Unlimited $6.49 a month introductory ($119.88 a year after). GBP prices were not shown to the fetch and are UNVERIFIED. [10] (checked 2026-11-28)
- Phil already has **15 aliases**, five more than the free limit. Either the account is on a paid plan, or the aliases came through SimpleLogin or under an earlier limit. Pass Plus includes SimpleLogin Premium and the reverse. [11] (checked 2026-11-28)
- **What happens above the limit on a free account** is not documented on an official page. One older user report says aliases above 10 were disabled on downgrade; a later forum reply says Proton adopted SimpleLogin's policy and they keep working. UNVERIFIED either way. [12] [13] (checked 2026-11-28)
- Scale: an alias per retailer, against 1,736 account-type rows and 1,455 marketing-only senders, is well past 10. Free is not enough for this design; the cost is Pass Plus or higher, which conflicts with "nothing extra". That decision is Phil's on mail.02.

### 3.4 Microsoft account: alias removal and recovery (for mail.16)

- Aliases are removed at account.microsoft.com > Your info > Manage how you sign in to Microsoft > Remove next to the alias. **A primary alias cannot be removed**; another primary must be set first. [14] [15] (checked 2026-11-28)
- Removing a **Microsoft-domain** alias (hotmail.com, outlook.com, live.com, msn.com) is permanent and the alias can never be added to any account again. pw@philipwhelan.com is a non-Microsoft address, so this permanence does not apply to it; the Hotmail address must never be removed. [14] (checked 2026-11-28)
- **Security info:** if all previous security info is removed and replaced at once, the account enters a restricted 30-day state; a removed verification method has a 30-day wait before deletion. Do not replace the Gmail proof and the phone at the same time. [14] (Microsoft Q&A; checked 2026-11-28)
- **Sign out everywhere:** Security > Advanced security options > Sign out; it can take up to 24 hours and does not sign out an Xbox console; one community report says a Windows PC stayed signed in. [16] (checked 2026-11-28)
- **Recovery code:** generated at account.live.com/proofs/manage/additional; a new code invalidates the old one; codes cannot be retrieved later. [17] (third-party guide; UNVERIFIED path)
- Microsoft also offers "block an email address from signing in" for an alias, an alternative to removing it. [18] (checked 2026-11-28) Phil decided removal; this is noted only.
- A limit on alias changes per year exists by rumour; the number is UNVERIFIED.

### 3.5 Apple ID primary email (for mail.17)

- Changed on iPhone at Settings > [name] > Sign-In & Security > tap the primary email, or at account.apple.com > Sign-In and Security > Email & Phone Numbers (the site prefers to hand off to a trusted device). Purchases, contacts and data are kept. [19] (checked 2026-11-28)
- The new address must not be in use by another Apple Account. A removed non-iCloud address cannot be linked to another Apple Account for 30 days; after that, someone else may link it for Messages and FaceTime. [19] (checked 2026-11-28)
- **Rescue email exists only for accounts without two-factor authentication.** With 2FA, recovery is through trusted devices and phone numbers, an optional recovery contact and an optional recovery key. [20] [21] (checked 2026-11-28) This means **"vault@ as recovery" has no direct place on a 2FA Apple Account**. The nearest equivalents are: vault@ as an additional address on the account (but additional addresses can also be used to sign in [20]), or no email recovery at all and a recovery contact or key instead. See §5.
- Messages and FaceTime may still be reachable at the old address; Apple says to tell contacts who use it [19]. Phil's rule is that contacts are not told; this is noted only.

### 3.6 SPF, DKIM and DMARC at IONOS, monitor then enforce (for mail.09, mail.10, mail.11)

- At IONOS, records are added under Domains & SSL > the domain > DNS > Add record. **SPF** is a TXT record; IONOS offers a suggested "IONOS SPF (TXT)" entry; there may be only one SPF record per name, so a second sender is added as another `include:` in the same record. [22] [23] (checked 2026-11-28) The exact include host for UK accounts (EU or US) is UNVERIFIED: use the value IONOS's own suggested record shows.
- **DKIM** for IONOS mail is three CNAME records under `_domainkey`, the values shown in the account. [24] (checked 2026-11-28)
- **DMARC** is a TXT record at `_dmarc`; IONOS says SPF and DKIM must exist first. [25] (checked 2026-11-28)
- Google's recommended rollout: set up SPF and DKIM at least 48 hours before DMARC; start at `p=none` with a `rua` report address; review daily; about a week of reports usually covers every mail stream; then quarantine, then reject. Google suggests a small `pct` at first; other guides say `pct` is applied inconsistently and recommend separate none, quarantine and reject periods instead. [26] [27] (checked 2026-11-28) The plan's "a month of clean reports" before enforcing is more cautious than Google's and is kept.
- **Cross-domain report address:** when the `rua` address (alerts@sporebit.com) is on a different domain from the one being reported (philwhelan.com, philipwhelan.com), the receiving domain must publish an authorisation record (a TXT `v=DMARC1` at `philwhelan.com._report._dmarc.sporebit.com` and the same for philipwhelan.com), or receivers may refuse to send reports. [27] (checked 2026-11-28)
- **Non-sending domains:** the standard lock-down is a null SPF (`v=spf1 -all`), DMARC `p=reject`, and optionally a null MX (RFC 7505). [28] (checked 2026-11-28)
- **Reading the reports:** aggregate reports are XML zip files; Gmail no longer sends forensic reports. A free DMARC report reader or Claude reading alerts@ over IMAP turns them into a list of senders. [27] (checked 2026-11-28)

### 3.7 What happens to reset emails when a domain lapses (for mail.35 and the month-eleven review)

- Research presented at IEEE S&P 2016 ("Domain-Z") measured the exploitation of "residual trust" in re-registered domains: the new owner of an expired domain receives the mail meant for the old addresses, and email password reset is the central example (one case: an internet registry account reset by the buyer of an expired domain). [29] [30] (checked 2026-11-28)
- Timeline for a lapsing .com (philipwhelan.com): IONOS says a deleted domain can be recovered up to 30 days after deletion under ICANN rules, during which no third party can register it; the US help page quotes a one-off $90 recovery fee. Generic registrar guidance: a grace period, then a 30-day redemption, then about five days pending delete, then anyone can register it. [31] [32] (checked 2026-11-28)
- Timeline for a lapsing .uk (fixclothing.co.uk): Nominet's current process is an expiry grace period to 30 days, redemption to 90 days, pending delete ending at day 95. [33] (checked 2026-11-28)
- IONOS notifies 30 days and about 7 days before a domain's end. [31] (checked 2026-11-28)
- Mitigation inside the plan: the standing rule from E.keys (no domain lapses while any address on it is a login or recovery address), the quiet year starting only after the last High account moved, and the month-eleven review. Keeping a .com registered is cheap relative to the risk; the review should price both.

### 3.8 Gmail unsubscribe at scale (for mail.27)

- Gmail has a native **Manage subscriptions** page (web: More in the left sidebar; mobile: the menu), rolled out from July 2025: it lists bulk senders with how often they send and unsubscribes in one click by sending the sender's List-Unsubscribe request for you. [34] [35] (checked 2026-11-28)
- Clicking unsubscribe links inside old marketing mail confirms the address is live and some links go through trackers; Gmail's page avoids opening the message. The workbook's Unsubscribe Link column is best used only for senders Gmail's page does not list. General guidance, no single source.
- Gmail's page covers only mail in Gmail; the outlets list from topic 9 (E.block) is a separate filter.

### 3.9 Proton account hardening (for mail.37)

- Proton 2FA is available on free and paid plans; up to four security keys (U2F or FIDO2, or platform keys such as Touch ID or Windows Hello); one-time recovery codes are issued when 2FA is set up; the recovery phrase and the recovery email or phone are the other routes. [36] [37] (checked 2026-11-28)
- Whether hardware security keys specifically are allowed on a free plan is not stated outright; 2FA in general is. UNVERIFIED for keys on free. The money in "costs money" is then the keys themselves (two, so one can be lost), to be priced.

## 4. Risks

| Risk | What could go wrong | Mitigation the tickets carry |
|---|---|---|
| Lock-out of an anchor | IONOS, Proton or Microsoft recovers through an IONOS-hosted address; if IONOS mail breaks, nothing recovers | mail.08 moves all three to Gmail recovery first; mail.16 and mail.20 check it; no anchor uses vault@ |
| Microsoft 30-day restriction | Replacing every proof at once restricts the account for 30 days | mail.16 changes one thing per step, keeps the Hotmail login, never removes the Hotmail alias |
| Apple 30-day lock | The old Apple address is locked for 30 days after removal; a new address already on another Apple Account is refused | mail.17 checks phil@ is free first and removes the old address last |
| Mail history lost | Retiring or deleting a mailbox deletes its mail; answer 9 says move it all across | mail.05 moves each mailbox's mail into the kept mailbox before any rename or delete; irreversible steps marked; storage checked in mail.01 |
| Free 2FA slots in Proton Pass | Proton Free holds codes for only three 2FA items [9]; storing every new authenticator code there stops at three | mail.15 asks once where authenticator codes live and uses that place for every account |
| Storage full | 2 GB fills during the history move; new mail bounces | mail.01 measures the mailboxes and prices 12 GB if needed (nothing bought in the run) |
| Cannot reply as an address | Forwards cannot send; one philwhelan.com mailbox cannot send as sporebit.com | mail.01 records it; mail.06 asks the question before building the forwards |
| Reset mail to a lapsed domain | After the quiet year, a buyer of philipwhelan.com receives reset emails | the standing rule, the year starting only after the last High account, the month-eleven review (mail.35), mail.32's public list |
| Catch-all floods | Spam swamps the "old domain" label and hides real account mail | mail.07 keeps the IONOS spam filter on and the label separate; mail.26 counts per week |
| Claude in the browser on a real account | A wrong click closes or changes the wrong account | mail.14 dry run on three throwaway accounts watched live; mail.24 batches only low-risk rows for Claude; Phil signs in, Claude never sees a password |
| Proton cost | Alias per shop needs a paid plan against "nothing extra" | mail.02 is a decision with the price; mail.25 is blocked until it is made |
| Kirsty-facing breakage | Shared calendars, family accounts or the Family calendar on an old address stop syncing | mail.33 and mail.39 audit first, decide per account |
| eBay before FixForward | Automation touches eBay before its password and 2FA are fixed | mail.22 blocks fixf.20 |
| DMARC enforce breaks legitimate mail | An unlisted sender (DropShipAuto, an old site) gets quarantined | mail.10 waits for a month of clean reports and moves through quarantine before reject |

## 5. Facts that differ from the plan

- **mail.06 vs mail.12:** mail.06 says "the other fifteen as forwards", but mail.12 makes inbox@sporebit.com a dedicated mailbox Mycelium reads over IMAP. inbox@ must be a real mailbox, so the shape is two mailboxes (phil@philwhelan.com and inbox@sporebit.com) and fourteen forwards. The integrator should change mail.06's title.
- **mail.06, sending:** IONOS forwards cannot send and the sender must share the mailbox's domain [6]. With one mailbox on philwhelan.com, Phil cannot reply as hello@, dev@ or fixforward@ (sporebit.com), and possibly not as bills@ or shop@. If replying as those matters, a second sending mailbox on sporebit.com is needed (Mail Basic 5 holds five). Not decided here; mail.06 asks.
- **mail.01, storage:** "move it all across" (section 1 answer 9) into a 2 GB mailbox may not fit [1]. If 12 GB is needed it costs money against "nothing extra". mail.01 measures; nothing is bought.
- **Missing ticket, mail history:** no plan ticket moves the old mail history (answer 9). mail.05 now carries a phase that moves each retiring mailbox's mail before it is renamed or deleted, and mail.41 checks it for the philipwhelan.com mailboxes. The integrator may prefer a separate ticket.
- **mail.07, catch-all as a forward:** IONOS documents the catch-all as a mailbox (`*@`) [7]. Whether it can be a forward straight to philipwhelan@philwhelan.com is UNVERIFIED; if not, the catch-all uses a mailbox slot and needs its own forward rule. mail.07 checks first.
- **mail.17, "vault@ as recovery":** Apple Accounts with two-factor authentication have no rescue email [20]. Recovery is trusted devices and numbers, a recovery contact or a recovery key. mail.17 is written as "check what Apple offers; add vault@ only if Apple shows a place for it; otherwise record the recovery contact or key decision for Phil". Adding vault@ as an additional address would make it a sign-in address, against the vault@ rule ("recovery only").
- **mail.02, the alias cost:** confirmed today: the free tier allows 10 aliases, paid tiers unlimited [9] [10]. An alias per shop is past 10 almost at once, so the design costs about $24 for the first year and $36 a year after on Pass Plus (USD, introductory; GBP UNVERIFIED), against "nothing extra". Phil already has 15 aliases; his current plan is unknown.
- **mail.37, what costs money:** Proton 2FA is free on all plans [36]; the cost of "security keys" is the hardware keys, not a Proton plan (keys on free UNVERIFIED). The ticket says so.
- **mail.09, report address:** rua to alerts@sporebit.com for philwhelan.com and philipwhelan.com needs two authorisation TXT records on sporebit.com [27]. The ticket carries them; the plan line did not mention them.
- **mail.09, timing:** Google advises SPF and DKIM at least 48 hours before DMARC [26]. mail.09 is two sittings with the wait between.
- **mail.16, removal:** pw@philipwhelan.com is a non-Microsoft alias; removing it is not the permanent kind [14]. It must not be the primary alias at the time; if it is, the Hotmail address is made primary first. Replacing all security info at once triggers a 30-day restriction [14].
- **mail.27, method:** Gmail's own Manage subscriptions page [34] is a safer first pass than clicking the workbook's Unsubscribe Link column (no message opened, no tracker). The ticket uses Gmail's page first and the column only for what it misses.
- **mail.05, retiring = deleting mail:** deleting a mailbox at IONOS deletes its contents [8]. Every delete in mail.05 is marked irreversible and comes after the history move.
- **mail.30, fixclothing.co.uk:** a .uk name that is simply left to expire stays recoverable for 90 days and is released at about day 95 [33]; the old addresses on it receive nothing once the mailbox is dropped, but a buyer after release would. The ticket checks for live logins on it before the domain step, under the E.keys standing rule.
- **mail.11, dependency:** the plan row says `after keys.05` (the Stripe test key), but its note says "after the keep-or-drop sitting", which is keys.11. The ticket uses keys.11; the integrator should correct the plan row.
- **Titles changed in the ticket file:** mail.06 now reads "the other fourteen as forwards (inbox@ is its own mailbox)"; mail.17 now reads "recovery checked (Apple has no recovery email on a two-factor account)" in place of "with vault@ as recovery".
- **mail.24 (plan §27 point 3):** writing the batch tickets later from the import is consistent with "one step per account" because each batch's steps are the accounts; the parent's description says so.

## 6. Sources

1. https://www.ionos.co.uk/office-solutions/create-an-email-address, IONOS UK, Business Email plans (Mail Basic 5 and 1+, prices, unlimited forwarding), checked 2026-11-28
2. https://www.ionos.co.uk/help/email/glossary-email-terms-explained/mail-basic-at-a-glance/, IONOS UK help, Mail Basic at a glance, checked 2026-11-28
3. https://www.ionos.co.uk/help/email/troubleshooting-mail-basic-mail-business/purchasing-additional-email-storage-for-a-mail-basic-mailbox, IONOS UK help, buying extra storage for Mail Basic, checked 2026-11-28
4. https://www.ionos.co.uk/help/email/setting-up-mail-basic/creating-a-forwarding-email-address/, IONOS UK help, Creating a forwarding email address, checked 2026-11-28
5. https://www.ionos.co.uk/help/email/setting-up-mail-basic/setting-up-forwarding-for-email-addresses/, IONOS UK help, Setting up forwarding for email addresses (search result: up to 10 destinations), checked 2026-11-28
6. https://www.ionos.co.uk/help/email/general-topics/important-change-for-sending-emails-with-different-sender-addresses/, IONOS help, Important change for sending emails with different sender addresses, checked 2026-11-28
7. https://www.ionos.com/help/email/general-topics/creating-using-and-deactivating-a-catch-all-email-address/, IONOS help, Creating, using and deactivating a catch-all email address, checked 2026-11-28
8. https://www.ionos.co.uk/help/email/general-topics/advantages-of-a-catch-all-email-address/, IONOS UK help, Advantages of a catch-all email address, checked 2026-11-28
9. https://proton.me/support/proton-pass-plans-explained, Proton support, Proton Pass plans explained, checked 2026-11-28
10. https://proton.me/pass/pricing, Proton Pass pricing and plans, checked 2026-11-28
11. https://proton.me/blog/pass-plus-simplelogin-premium-feature, Proton blog, Pass Plus and SimpleLogin Premium, checked 2026-11-28
12. https://discuss.grapheneos.org/d/15355-feels-like-shady-practice-by-proton-pass-team, GrapheneOS forum, user report on aliases above the free limit, checked 2026-11-28
13. https://discuss.privacyguides.net/t/proton-pass-vault-limitation/17887/11, Privacy Guides forum, reply on aliases after downgrade, checked 2026-11-28
14. https://learn.microsoft.com/en-us/answers/questions/4545618/alias-recovery, Microsoft Q&A, alias removal, permanence of Microsoft-domain aliases, 30-day security info wait, checked 2026-11-28
15. https://www.thurrott.com/cloud/132602/tip-change-microsoft-accounts-primary-alias, Thurrott, changing a Microsoft account's primary alias, checked 2026-11-28
16. https://support.microsoft.com/en-gb/topic/8bee7444-6420-4ec1-b26c-40433fbaf9b0, Microsoft Support, How to sign out of your Microsoft account everywhere, checked 2026-11-28
17. https://www.technobezz.com/how-to-use-the-microsoft-account-security-page, Technobezz, Microsoft account security page (recovery code), checked 2026-11-28
18. https://support.microsoft.com/account-billing/block-an-email-address-from-signing-in-60f1d407-cf60-461f-b42f-0019dd790daf, Microsoft Support, Block an email address from signing in, checked 2026-11-28
19. https://support.apple.com/en-gb/109353, Apple Support, Change your Apple Account primary email address, checked 2026-11-28
20. https://support.apple.com/en-gb/102529, Apple Support, About your Apple Account email addresses, checked 2026-11-28
21. https://support.apple.com/en-gb/126981, Apple Support, Remove a recovery contact from an Apple Account, checked 2026-11-28
22. https://easydmarc.com/blog/spf-and-dkim-setup-for-ionos/, EasyDMARC, SPF and DKIM setup for IONOS, checked 2026-11-28
23. https://mxtoolbox.com/t/outbound-email-provider/?name=IONOS, MxToolbox, IONOS outbound provider (one SPF record per name), checked 2026-11-28
24. https://ionos.ca/help/domains/configuring-mail-servers-and-other-related-records/email-authentication-with-dkim, IONOS help, Email authentication with DKIM, checked 2026-11-28
25. https://www.ionos.co.uk/help/domains/configuring-mail-servers-and-other-related-records/configuring-a-dmarc-record-for-a-domain/, IONOS UK help, Configuring a DMARC record for a domain, checked 2026-11-28
26. https://support.google.com/a/answer/10032473, Google Workspace Admin Help, Recommended DMARC rollout, checked 2026-11-28
27. https://www.suped.com/guides/dmarc/how-to-safely-transition-your-dmarc-policy-to-quarantine-or-reject, Suped, How to safely transition your DMARC policy (pct, external reporting authorisation, forensic reports), checked 2026-11-28
28. https://www.rfc-editor.org/rfc/rfc7505, RFC 7505, A "Null MX" No Service Resource Record, checked 2026-11-28
29. https://astrolavos.gatech.edu/articles/domain-z-ieee.pdf, Lever et al., Domain-Z: 28 Registrations Later, IEEE S&P 2016, checked 2026-11-28
30. https://www.darkreading.com/vulnerabilities-threats/are-you-prepared-for-a-zombie-domain-apocalypse-, Dark Reading, Are you prepared for a zombie (domain) apocalypse, checked 2026-11-28
31. https://www.ionos.com/help/domains/terms-and-cancellations/reactivating-an-expired-domain/, IONOS help, Reactivating an expired domain, checked 2026-11-28
32. https://support.dnsimple.com/articles/what-happens-when-domain-expires/, DNSimple, What happens when a domain expires, checked 2026-11-28
33. https://registrars.nominet.uk/uk-namespace/new-domain-expiry-process-and-introduction-of-drop-lists-for-uk/, Nominet, New domain expiry process for .UK, checked 2026-11-28
34. https://workspaceupdates.googleblog.com/2025/07/manage-email-subscriptions-in-gmail.html, Google Workspace Updates, Manage email subscriptions in Gmail, checked 2026-11-28
35. https://blog.google/products/gmail/new-manage-subscriptions-unsubscribe/, Google blog, Declutter your inbox with Gmail's newest feature, checked 2026-11-28
36. https://proton.me/support/2fa-security-key, Proton support, Set up 2FA with a security key, checked 2026-11-28
37. https://proton.me/support/two-factor-authentication-2fa, Proton support, Two-factor authentication, checked 2026-11-28
