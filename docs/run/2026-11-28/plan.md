# Ticket plan, run of 2026-11-28 (Stream T, step T1)

*Written by the planning session before anything was created. Source: `docs/intake/intake-2026-11-27.md` through the digests in `digests/`. Reading rules applied: sections 1 to 12 are the first answers, the "b" sections add, the Final five govern this stream, Round 3 (H1 to H10) wins where it differs, `[claude]` flags are not reopened and go to the red team, "Assumed" items are ticketed as the cautious check-first version, H10 undecided items get one row each in a LIFE checklist and no tickets, Everlight items are never ticketed, health threads only where H5 names them. The 187 open tickets on production (2026-11-28) were read for duplicates; where one exists it is linked, not recreated.*

## 0. How to read this plan

- **Stable id** (`mail.01`): the idempotency key. The create script tags every ticket `sid:<id>`; a second run finds the tag and creates nothing.
- **Kind**: `task` (Claude or Phil, plain), `guide`/`setup` (Phil's tick-box work, written as checklist data, never markdown), `audit` (a recurring review), `test` (a live check). `epic` is the Work issue type with level 1.
- **Pts**: 1 = one 15-minute sitting of Phil's, 2 = two sittings or one short Claude job, 3 = an evening, 5 = a few evenings or a research dossier, 8 = a build slice, 13 = a build.
- **Date**: `due` (deadline_on). Blank = Backlog with no date, as decided. Only the exceptions carry dates (§0.1).
- **Deps**: `after <id>` = this ticket is blocked by that one (a `ticket_dependencies` row, both directions shown by the app). `link <KEY>` = a relates link to an existing production ticket.
- **Who**: P = Phil at the keyboard or in the house (a sitting), C = Claude Code or an agent, PC = Claude prepares, Phil approves or signs in, K = needs Kirsty.
- **Rundown**: every ticket's description carries What, Why, Done looks like, Unlocks, Depends on. The rundowns are written per epic by the mid-model agents into `tickets/<epic>.json` from this plan and the digest; the red team reads both.

### 0.1 Dates (the only dated tickets)

| Rule from the brief | Date used | Note |
|---|---|---|
| Baby due June 2027; everything essential a month before | Working due date **2027-06-15**; essentials by **2027-05-15** | MYC-182 asks Phil the real due date; baby dates shift when he answers (logged) |
| Broadband review, notice period, March 2027 | 2027-03-01 | 4th Utility commitment ends May 2027 |
| Garden design sitting, February 2027 | 2027-02-06 | a Saturday |
| Garden work, March to May 2027 | 2027-03-06 start, items spread to 2027-05-29 | the May plan re-dated |
| Substrate 30-day proof before June | start hands-off **2027-04-24**, check **2027-05-24** | |
| Optics allowance renews 1 February 2027 | 2027-01-25 | claim this year's before the reset |
| Kirsty's birthday offers, before 23 May 2027 | 2027-04-23 | a month ahead |
| Concert tickets never arrived (14 Nov) | 2026-12-12 | chargeback windows run from the event date; act early |
| Renewals a month ahead | set by the look-up sitting (`fin.14`), not by this run | the dates are unknown until Phil looks |
| Monthly network review | recurring, first 2026-12-28 | `audit` kind |

### 0.2 Projects

| Key | Name | Exists | Used for |
|---|---|---|---|
| MAIL | Email | create | topic 1, H1 |
| SEC | Security | create | topics 2 and 9, H2 keys and domains |
| FIXF | FixForward | create | topic 3 |
| MYC | Mycelium | exists | topics 4, 6, 11, Unblock, Fitness (H5), time tracker (H5), ventures page (H3) |
| BABY | Baby | create | topic 5 |
| SUB | Substrate | create | topic 7 |
| HOME | Home | create | topic 8, H4 (GARDN stays; its tickets are linked) |
| GLASS | Glasses | create | topic 10 |
| LIFE | Life | create | H7 one-offs, H8 rescue, the two checklists |
| PHM | PhirstMaxx | exists | H5 PhirstMaxx |
| DSA | DropShipAuto | exists | H6 kept alive |
| SELL | Selling | exists | one-off sales, linked from FIXF |

### 0.3 Epics (24)

| Epic sid | Project | Title |
|---|---|---|
| E.mail | MAIL | Email migration: sixteen addresses, 1,736 accounts, the old domain's quiet year |
| E.net | SEC | Home network: four networks on the RT-AX86U, one DNS filter, VPN only |
| E.block | SEC | Blocking: listed outlets and adult sites, block with "open anyway" |
| E.keys | SEC | Keys, secrets and domains: rotate everything (later), cull and harden |
| E.fixf | FIXF | FixForward: one item from record to live listing, then the pilot |
| E.fin | MYC | Finance: every pound a job, three paydays kept to |
| E.baby | BABY | Baby: everything essential in the house a month before June 2027 |
| E.wall | MYC | Home dashboard: the wall on the kitchen frame, then panels and controls |
| E.sub | SUB | Substrate: DNS and VPN first, 30 days untouched before June |
| E.home | HOME | Home: the room editor, then the bathroom and the nursery |
| E.office | HOME | Office restart: measurements kept, mood boards, the signature panels |
| E.garden | HOME | Garden 2027: design in February, work March to May |
| E.repairs | HOME | Repairs, odd jobs and the house next door |
| E.glass | GLASS | Glasses: "Mycelium" by voice, a weekend prototype first |
| E.brain | MYC | Mycelium as second brain: Spores, the connector, imports |
| E.unblock | MYC | Unblock Mycelium: the 15-minute gates, worked first |
| E.tracker | MYC | Time allocation tracker: question round first |
| E.fit | MYC | Fitness and health: PTP restart, supplements, nutrition, rehab |
| E.phm | PHM | PhirstMaxx: correct the spec, map the roadmap, Daytripper sharing |
| E.dsa | DSA | DropShipAuto kept alive, low priority |
| E.vent | LIFE | Ventures behind the FixForward rule, and one-off research |
| E.rescue | LIFE | Harvest rescue: archive, the eleven chats, then the delete gate |
| E.review | LIFE | This run's review: decisions, undecided items, the map |
| E.guide | MYC | Field guide follow-ons: public link, voice, authoring |

---

## 1. E.mail: Email migration (MAIL)

Links: PW-30 (Migrate email addresses), PW-71 (Switch to sporebit email address), PW-72 (unsubscribed emails to migrate) are superseded by this epic and linked as relates; PW-57 (Change Apple password) is linked from `mail.22`; MYC-201 linked from `mail.12`; MYC-194 linked from `mail.13`.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| mail.01 | Check the IONOS Mail Basic mailbox and forward limits against the sixteen-address plan | task | 2 | PC | | H1.2 "first ticket". Output: a one-page finding on the epic |
| mail.02 | Check the Proton plan and today's hide-my-email alias limit before any alias work | task | 1 | P | | H1.6 `[claude]` flag; 15 already exist; cost against "nothing extra" |
| mail.03 | Import the account inventory (account-inventory.xlsx) into Mycelium, owner-only, as the checklist's data | task | 5 | C | | H1.10; 3,198 rows, 1,736 account-type; the workbook frozen in the nightly backup; schema as owner-only table with the 0111 policy shape |
| mail.04 | Remap the Target Address column for the High rows to the sixteen addresses | task | 3 | C | after mail.03 | H1 ticket bullet |
| mail.05 | Address plan guide: retire me@, shopping@, travel@, pw@ (philwhelan.com), phil@ and contact@ (sporebit.com), delete both catch@ mailboxes, create the sixteen | setup | 3 | P | after mail.01 | H1.1; Field guide; phil@philwhelan.com survives |
| mail.06 | One mailbox, a folder per address, the other fifteen as forwards; only phil@ and vault@ notify | setup | 2 | P | after mail.05 | 1b landing; H1.2 |
| mail.07 | Catch-all on philipwhelan.com only, forwarding to philipwhelan@philwhelan.com, labelled "old domain" | setup | 1 | P | after mail.06 | H1.3; none on the other two domains |
| mail.08 | Recovery anchor: IONOS, Proton and the Microsoft account recover through Gmail only; vault@ for everything else | setup | 2 | P | after mail.05 | H1.4; the three never recover through an IONOS-hosted address |
| mail.09 | SPF, DKIM and DMARC on all three domains: monitor first (p=none, rua to alerts@) | setup | 2 | PC | after mail.05 | 1.19; Claude writes the records, Phil pastes at IONOS |
| mail.10 | DMARC enforce (quarantine then reject) once a month of reports is clean | setup | 1 | PC | after mail.09 | second half of 1.19 |
| mail.11 | Null SPF and reject DMARC on every domain that never sends | setup | 1 | PC | after keys.05 | H2.2; after the keep-or-drop sitting |
| mail.12 | inbox@sporebit.com: the dedicated mailbox Mycelium reads over IMAP | setup | 1 | P | after mail.05, link MYC-201 | 1.23; MYC-201 is the Mycelium side |
| mail.13 | noreply@ and mycelium@ for app mail (invites, rundowns) with the sending service | setup | 2 | PC | after mail.09, link MYC-194 | 1.20 |
| mail.14 | Claude-in-the-browser dry run on three accounts Phil does not care about, watched live | task | 1 | PC | after mail.04 | 1b; before anything real |
| mail.15 | The per-account routine as a Field guide: change address, rotate password, 2FA on, fix the Proton Pass entry, mark done | guide | 3 | C | after mail.03 | H1 October routine; the one guide every account ticket uses |
| mail.16 | Critical: Microsoft account stays on the Hotmail login with Gmail recovery; remove pw@philipwhelan.com; confirm the May 2026 attack's password change and sign-outs | setup | 2 | P | after mail.08, mail.15 | 1.13, H1.5, H10 Email fold |
| mail.17 | Critical: Apple ID to phil@philwhelan.com with vault@ as recovery | setup | 2 | P | after mail.08, mail.15, link PW-57 | 1.13; PW-57's password change happens here |
| mail.18 | Critical: banks and cards to bank@ (each bank its own step) | setup | 3 | P | after mail.15 | 1.13 |
| mail.19 | Critical: HMRC and pension to admin@ | setup | 2 | P | after mail.15 | 1.13 |
| mail.20 | Critical: IONOS and other hosting (Vercel, Supabase, Cloudflare, GitHub) to dev@, recovery per H1.4 | setup | 3 | P | after mail.08, mail.15 | 1.13; link MYC-209 for the API_SECRET callers list |
| mail.21 | Critical: Mercedes account found and moved (which address does it use) | setup | 1 | P | after mail.15 | H1 bullet |
| mail.22 | Critical: eBay to fixforward@, password rotated, 2FA on, before FixForward touches the account | setup | 1 | P | after mail.15 | H2.12; blocks fixf.20 |
| mail.23 | Critical: the AI providers and API accounts Claude Code uses move from Gmail to ai@ and dev@ | setup | 2 | P | after mail.15 | H10 Email fold |
| mail.24 | High rows, batch tickets: one checklist per 15-minute batch of about ten accounts, Claude in the browser for the low-risk ones | guide | 8 | PC | after mail.14, mail.15 | H1.7; the create script makes the batches from the import once mail.04 is done; this ticket is the parent |
| mail.25 | Shop aliases: a Proton hide-my-email alias per retailer forwarding to shop@ | setup | 3 | P | after mail.02 | H1.6; blocked by the limit check |
| mail.26 | The "change as mail arrives" queue: the old-domain label on the daily line with a weekly count, each arrival offering "change this one now" | task | 5 | C | after mail.07 | 1b counter; a Mycelium feature inside the mail import |
| mail.27 | Gmail: one unsubscribe pass from the workbook's Unsubscribe Link column plus the listed outlets | task | 2 | PC | after mail.03 | H1.8; link block.08 |
| mail.28 | Legacy addresses creps@, ebay@, git@, int@: audit then close; ebay@ checked against the live eBay account first | setup | 2 | P | after mail.22 | H1 bullet |
| mail.29 | Proton Pass clean-up: two dead addresses, the inaccessible Gmail address, the sister's address; 350 logins and 15 aliases | setup | 3 | P | after mail.03 | H1 bullet; check the inventory for any live account on the inaccessible Gmail first |
| mail.30 | Wind down fixclothing.co.uk: Companies House check, Shopify close or move, mailbox, then domain | setup | 2 | PC | | H1 bullet |
| mail.31 | DropShipAuto's two subdomain sites and its Let's Encrypt email move off philipwhelan.com | task | 3 | C | link dsa epic | H1; before the quiet year starts; H6 says the VPS stays |
| mail.32 | Where the old address is public (GitHub commits and the rest): a list, kept verified until the lapse | task | 2 | C | | 1b |
| mail.33 | Calendars, contacts and files on old-address accounts: audit, decide per account | task | 2 | PC | after mail.03 | 1.28 |
| mail.34 | Sites that refuse an address change: close and reopen if used, else close | task | 2 | PC | after mail.24 | 1b |
| mail.35 | The quiet year starts: record the date the last High account moved; month-eleven review ticket created then | task | 1 | C | after mail.24 | H1.9; the month-eleven ticket is made by this one, not now |
| mail.36 | Plain-text passwords from three old sites: reuse check | task | 1 | C | after mail.03 | H1 bullet |
| mail.37 | Proton account hardening (security keys, tested recovery kit): a decision with the cost | task | 1 | P | | H1 bullet; costs money |
| mail.38 | Email-to-calendar as an idea-status item in the mail import (assumed; not built until Phil says) | task | 1 | C | | H2.8 assumed |
| mail.39 | List every calendar (the eight May sub-calendars, Family, Phirsty Life): what writes to it, who sees it, for a keep-or-merge sitting | task | 2 | C | | H2.9 assumed |
| mail.40 | Closing report: accounts moved, closed, secured, effort; to Docs and the Day log | task | 2 | C | after mail.35 | 1b finish |
| mail.41 | Done check: old mailboxes closed | test | 1 | P | after mail.40 | 1.27 |

## 2. E.net: Home network (SEC)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| net.01 | Audit both routers (4th Utility and the RT-AX86U) and an outside scan: open ports, WPS, remote admin, UPnP, firmware | guide | 2 | PC | | 2.14, 2.17 "first ticket"; Claude runs the scan from the PC against Phil's own address |
| net.02 | Research: can the ASUS be the only router (4th Utility modem mode or bridge), and what it means for the broadband decision | task | 3 | C | after net.01 | 2.18; link fin.15 (broadband review) |
| net.03 | Research: where the DNS filter runs (router, Substrate box, hosted); the 26 November guide is input | task | 3 | C | | 2.12, H10 Blocking fold; blocks block.03 and sub.06 |
| net.04 | Research: remote access, the July Tailscale and Remote Desktop set-up against the router's own VPN; 3389 never exposed | task | 3 | C | | H2.13 |
| net.05 | Network design: four networks (Trusted, Work, Smart devices, Guests), names that reveal nothing, VLANs and which managed switch goes where; diagram to Docs | task | 5 | C | after net.01, net.02 | 2.8, 2.16, 2.29, 2b names |
| net.06 | Settings-as-scripts repo for the router: dated config backups, every change a reviewed commit, applied by Claude Code | task | 5 | C | after net.05 | 2b method, 2.28 |
| net.07 | Build the four networks on the ASUS (Merlin): SSIDs, VLANs, isolation rules | guide | 3 | PC | after net.06 | each network its own sitting inside one guide |
| net.08 | Move the Everlight work laptop to Work; isolate and see | guide | 1 | P | after net.07 | 2.7, 2b employer policy |
| net.09 | Move the smart devices (cameras, doorbell, plugs, bulbs, sensors, Alexa, TVs, sticks) to Smart devices, one sitting per room | guide | 3 | P | after net.07 | 2.5 |
| net.10 | Guest network with a QR code card | guide | 1 | P | after net.07 | 2.19 |
| net.11 | Kit under £100: what the two managed switches cover and what is missing; costed list, nothing bought before Phil sees it | task | 2 | C | after net.05 | 2.10 |
| net.12 | Smart devices and the internet: block where the device still works, else allow only its own cloud; per device | guide | 3 | PC | after net.09 | 2.23 |
| net.13 | TV tracking: block only what breaks nothing | guide | 1 | PC | after net.12 | 2b |
| net.14 | Cameras and the baby monitor local only, viewed over the VPN | guide | 2 | PC | after net.12, after sub.07 | 2.25; link baby.21 |
| net.15 | Device inventory in Mycelium beside the home inventory: every device, network, owner, cloud it may reach | task | 5 | C | after net.09 | 2.22 |
| net.16 | Unknown device joins: a push through Mycelium inside the interruption budget | task | 3 | C | after net.15 | 2.21 |
| net.17 | The 2am test: a device sending gigabytes somewhere new is cut off and Phil told in the morning | task | 5 | C | after net.15, after sub.09 | 2b; needs network monitoring (sub.09) |
| net.18 | One tripwire on each network | task | 3 | C | after net.07 | 2b |
| net.19 | Unsupported devices: a cull list with dates; Claude applies the security update itself where it can | task | 2 | C | after net.15 | 2b |
| net.20 | Kirsty's fallback: a labelled "simple mode" switch and a printed card by the routers | guide | 2 | PK | after net.07 | 2b |
| net.21 | Remote access Field guide: PC, laptop, both phones and Kirsty's phone, on the route net.04 chose | guide | 3 | PC | after net.04, after net.07 | H2.13 |
| net.22 | Work laptop remote access on the Everlight-sanctioned route only | guide | 1 | P | after net.21 | H2.14 `[claude]` |
| net.23 | Fuller attack testing: outside scan, cross-network tests, Claude Code with standard scanning tools from the PC against every device on Phil's own network | test | 3 | C | after net.07, net.09 | 2.27 |
| net.24 | Monthly 15-minute network review (recurring, first 2026-12-28): scan, firmware, unknown devices, the blocking test run | audit | 1 | P | after net.07 | 2.30; date 2026-12-28, repeats monthly |
| net.25 | Grandad's PC: confirm the clean reinstall finished, passwords changed from another device, the router checked | guide | 2 | P | | H10 Network fold |
| net.26 | Done check: the four networks hold, the work laptop sees nothing else, the VPN is the only way in | test | 1 | P | after net.23 | |

## 3. E.block: Blocking (SEC)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| block.01 | Research: outlets to list beyond BBC, Daily Mail and ITV, a reason each from the four allowed sources; Phil approves each one | task | 5 | C | | 9.1, 9.5; a checklist of proposed outlets with approve/decline per row |
| block.02 | Ask Kirsty about the shared TVs (LG, Samsung, Fire Stick) before any change | task | 1 | PK | | 9.17; technical TV tickets wait on it |
| block.03 | Filter profiles from the start: Phil, Kirsty (news unfiltered), guests (adult and security lists), a future child | setup | 3 | PC | after net.03 | 9.7, 9.10, 9.11, 9.28 |
| block.04 | Lists on the filter: news (approved outlets, everything from them not only news), adult, scam, malware, trackers | setup | 2 | PC | after block.01, block.03 | 9.4, 9.6, 9.26, 9b |
| block.05 | The block page: next thing from Mycelium with Start, this week's count, a saved quote; "open anyway" quick for news, a 10-minute wait for adult sites | task | 8 | C | after block.04 | 9b; the wait lengthens after a week of many open-anyways |
| block.06 | Close the bypasses on Phil's devices: browsers' encrypted DNS, iCloud Private Relay, VPN and proxy apps | guide | 2 | P | after block.03 | 9.13; one sitting per device |
| block.07 | Same filter away from home: a DNS profile on the iPhone and the Pixel | guide | 1 | P | after block.03 | 9.12 |
| block.08 | Emails and app notifications from listed outlets cleared in the sender sweep; apps removed | guide | 1 | P | after block.01, link mail.27 | 9.21 |
| block.09 | Built-in news feeds off: Discover (Pixel), Apple News and widgets (iPhone), Windows widgets and start pages (PC) | guide | 2 | P | | 9.20; a sitting per device |
| block.10 | YouTube: channel blocking on the PC, "don't recommend" on phones and TVs | guide | 1 | P | after block.01 | 9.15 |
| block.11 | Search: a results-filter extension on the PC | guide | 1 | P | after block.01 | 9.16 |
| block.12 | Alexa: default news and radio providers changed, listed skills disabled | guide | 1 | P | after block.01 | 9.22 |
| block.13 | Podcasts and radio from listed outlets: unfollow, remove the apps | guide | 1 | P | after block.01 | 9.23 |
| block.14 | Sky Glass: research what can be hidden before any change | task | 2 | C | after block.02 | 9.18 |
| block.15 | TV licence: the current rules for his set-up, from the official source | task | 1 | C | | 9.19 |
| block.16 | Shared TVs: apply what Kirsty agreed (LG, Samsung, Fire Stick) | guide | 2 | PK | after block.02, block.14 | 9.17 |
| block.17 | Social app limits: a daily minute allowance per app and blocked hours, tightest in the four weak spots | setup | 2 | PC | after block.03 | 9.26, 9b |
| block.18 | The weekly digest: sources Phil chooses, grouped by the four topics, read in the Sunday close-out beside Finds | task | 8 | C | after sub.14 | 9.3, 9.27, 9b; the feed reader runs on Substrate |
| block.19 | Official alerts only (weather warnings, government emergency alerts) pushed through Mycelium | task | 3 | C | | 9b need-to-know |
| block.20 | Weekly count in the Sunday close-out: hits per list, open-anyways, owner-only; the Boys raise a bad week bluntly | task | 5 | C | after block.05 | 9.24, 9.25, 9b |
| block.21 | Test run from every device and profile; added to the monthly review | test | 2 | P | after block.06, block.07, block.16 | 9.29; link net.24 |
| block.22 | Yearly review of the list against the same criteria | audit | 1 | P | after block.04 | 9b; dated by block.04 when the list goes live |
| block.23 | Done check: 30 days without seeing a listed outlet unless chosen | test | 1 | P | after block.21 | 9.30 |

## 4. E.keys: Keys, secrets and domains (SEC)

No key is rotated, revoked, reset, deleted or opened in this run. Tickets name keys, never values. Links: MYC-6 (Rotate All Mycelium Environment Secrets), MYC-196 (rotate the two exposed secrets), MYC-209 (API_SECRET callers).

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| keys.01 | Rotate everything: the Field guide (parent), names only; the Mycelium rotations (MYC-6, MYC-196), the old VPS set, DropShipAuto's tokens, the old PhirstMaxx keys, the Stripe test key | guide | 5 | PC | link MYC-6, MYC-196, MYC-209 | H2.11, H10 Keys; not at the front of the queue; each part below is a phase |
| keys.02 | Rotate: the old VPS set (the calendar agent's Anthropic key, four IONOS mailbox passwords, the API bearer token, the Google OAuth client secret) | setup | 2 | P | after keys.01, after keys.08 | H2.6; names only |
| keys.03 | Rotate: DropShipAuto's ngrok and GitHub tokens | setup | 1 | P | after keys.01 | H2.11 |
| keys.04 | Rotate: the old PhirstMaxxing app's push keys, cron secret and service-role key, and shut the old site | setup | 2 | P | after keys.01, after phm.01 | H2.11, H5 |
| keys.05 | Rotate: the Stripe test key seen in an August screenshot (project unknown; find it first) | setup | 1 | P | after keys.01 | H10 Keys |
| keys.06 | Census files on the PC: Claude Code checks for the live Gmail app password, the Hotmail export in the Thunderbird folder, the unencrypted Proton Pass CSVs, and reports; revoke and delete only on Phil's say | task | 2 | C | | H2.10; the largest known exposure; goes in the Unblock queue (unblock.12) |
| keys.07 | Act on the census-files report: revoke the app password, delete the exports, empty the folder | setup | 1 | P | after keys.06 | H2.10 |
| keys.08 | The old VPS: what is it doing now (agent running? spend? review queue?), recommended "export its data, then switch off"; nothing switched off without Phil's word | task | 3 | C | | H2.5 assumed; H6 says the VPS itself stays for DropShipAuto |
| keys.09 | Port 3000 on the VPS: find what listens, close it | setup | 1 | PC | after keys.08 | H2.7 assumed |
| keys.10 | Domain cull list: every domain, renewal date, cost, mailboxes, logins that use it; a keep-or-drop checklist (sporebit.store and sporebit.org already "cancel, do not renew") | task | 3 | C | | H2.1; the standing rule on the ticket: no domain lapses while any address on it is a login or recovery |
| keys.11 | Keep-or-drop sitting on the domain list | guide | 1 | P | after keys.10 | H2.1 |
| keys.12 | Domain hardening, account level first: registrar 2FA, transfer lock, auto-renew with a valid card, WHOIS privacy | setup | 2 | P | | H2.2 `[claude]`; covers every domain in one go |
| keys.13 | Domain hardening, per domain after the sitting: DNSSEC, dangling records from old Wix, Squarespace, Shopify and Web Genie sites, TLS on live sites | setup | 3 | PC | after keys.11, keys.12 | H2.2; mail.11 carries the null SPF and reject DMARC |
| keys.14 | A better home than IONOS? What runs on the VPS, what Substrate replaces, a registrar comparison; mail stays at IONOS | task | 3 | C | after keys.08 | H2.3; lives here, linked from E.sub |
| keys.15 | Renewal dates look-up is in Finance (fin.14); this ticket links the domain and VPS renewals into the SEC view | task | 1 | C | after fin.14 | H2.4 |

## 5. E.fixf: FixForward (FIXF)

Links: SELL-1 (laptops) and SELL-2 as relates from the epic. Hard rules from the repo's CLAUDE.md on every ticket that touches eBay: official API only, never scrape, nothing on the live account without Phil's yes, no buyer data persisted, never below floor, no Vinted automation. The repo's own roadmap (phases 0 to 6 to 2027-02-26) is the plan; these tickets mirror it into Mycelium and add what the brief decided.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| fixf.01 | Research: trading rules (eBay business expectation, HMRC trading allowance, the 30-sales report) and the employment contract's side-work terms, before any buying automation | task | 3 | C | | 3.23, H10 flag 1; shared with fin.26 |
| fixf.02 | The medical display: confirm in writing whose it is before it enters inventory | task | 1 | P | | H10 flag 2 |
| fixf.03 | Scraping policy: FixForward uses official APIs only; sold medians come from Phil's Product research screenshot or typed figure; the "plus scraping" answer is declined by the repo's rule | task | 1 | C | | 3.26 `[claude]`; a decision record on the ticket, for Phil to overturn if he wants |
| fixf.04 | Phil's queue: eBay developer registration (submitted 2026-11-26): check status, then set the keyset in Credential Manager and verify (1.4, 1.5) | setup | 1 | P | | repo phase 1; money: none |
| fixf.05 | Phil's queue: business policies in Seller Hub (FF-Standard, FF-Returns-30, FF-Payment) and confirm "Send automated offers" is off | setup | 1 | P | | repo; K3 risk |
| fixf.06 | Phil's queue: the £85.96 basket (photo station, packing shelf, backdrop, cards) ordered or declined | setup | 1 | P | | 3b chore; costs money so it waits for Phil |
| fixf.07 | Saturday rehearsal on ID 12 (SH-0018), timed; the timings replace the time budget | guide | 2 | P | | repo phase 0 |
| fixf.08 | Fix the three certain risks before the live test: inventory page floor rounding (done in the working tree, commit it), the Syncthing share exclusion, private notes in git history (commits 3e9884a, bdfe853) | task | 3 | PC | | repo risks K1, S2, S3; history rewrite needs Phil's yes |
| fixf.09 | Brand: shop name, logo, a card in every parcel; the identity ticket | task | 3 | PC | | 3b |
| fixf.10 | Listing voice standard check: plain and exact, faults first | task | 1 | C | | 3b; the repo has standards; confirm they say this |
| fixf.11 | User token exchange and verification (2.4, 2.5), then policies verified (3.6), each on Phil's yes | setup | 1 | P | after fixf.04, fixf.05 | repo phase 1 |
| fixf.12 | The live test: ID 12 end to end, buyer view on the phone, one price revision, one watcher offer, one traffic report, each on its own yes; outcome A or B recorded | guide | 3 | P | after fixf.07, fixf.08, fixf.11, after mail.22 | repo phase 2; 3.27 first slice; the fork |
| fixf.13 | Outcome B fallback by 2026-12-11 if keys have not arrived: hand-made listings from paste-ready drafts | task | 2 | PC | after fixf.12 | repo |
| fixf.14 | Mycelium tables for FixForward: own prefix, deny-all plus service_role RLS, one adapter file, migration owned by the integrator | task | 8 | C | | 3.20 `[claude]`, 3.21; the schema from the repo's item.v1 and reading.v1 |
| fixf.15 | Import the inventory into Mycelium's tables; the Google Sheet kept as a view | task | 3 | C | after fixf.14 | 3.9 |
| fixf.16 | The Mycelium page: inventory, drafts awaiting approval, profit per item and per hour, running total on the daily line | task | 8 | C | after fixf.15 | 3.21, 3b |
| fixf.17 | Telegram approvals: one-tap approve a listing, an offer below floor, a message outside the templates | task | 5 | C | after fixf.16 | 3.21 |
| fixf.18 | Photo tidy-up: crop, straighten, order, attach; PC model first | task | 5 | C | after fixf.15 | 3.12, 3.22 |
| fixf.19 | Pricing from sold data as guidance only; Phil sets every price; unsold listings get a suggested drop he approves | task | 5 | C | after fixf.16 | 3.13, 3.14; the engine's schedules behind approve-once-at-listing |
| fixf.20 | Offers: auto-accept at or above floor, counter below, the rest to Phil | task | 3 | C | after fixf.17, after mail.22 | 3.16 |
| fixf.21 | Buyer messages: the five templates auto-answer, the rest to Phil | task | 3 | C | after fixf.17 | 3.17 |
| fixf.22 | Postage: label prepared, bought when Phil confirms | task | 3 | C | after fixf.17 | 3.18 |
| fixf.23 | Buy alerts: expected profit above a per-category bar Phil sets; never bids or buys | task | 5 | C | after fixf.01, fixf.16 | 3.15, 3b |
| fixf.24 | Repairs per item: fault, parts, time, test result, profit per hour; before, during and after photos | task | 3 | C | after fixf.16 | 3.24, 3b |
| fixf.25 | Dead stock: after a set time bundle as a job lot, then donate or recycle | task | 2 | C | after fixf.19 | 3b; the engine's lot proposal |
| fixf.26 | Weekly batch night: a queue of what to shoot and pack on the daily list | task | 2 | C | after fixf.16 | 3b |
| fixf.27 | The PC worker runs the engine; the free cloud tier receives eBay's notifications | task | 5 | C | after fixf.14 | 3.19 |
| fixf.28 | Pilot: about 20 items live on one-tap approval; the dry-run week passes (zero breaches, 20 decisions spot-checked) | guide | 3 | P | after fixf.12, fixf.16, fixf.17 | repo phase 3 |
| fixf.29 | Spare drives sold: secure erase, not quick format | guide | 1 | P | | H10 FixForward fold |
| fixf.30 | DropShipAuto: what is worth reusing (a list) | task | 2 | C | | 3.10 |
| fixf.31 | The 32 remaining sold-listing searches; the Valuation tab runs 20 to 30% low | guide | 2 | P | | H10 fold; Product research screenshots, not scraping |
| fixf.32 | Extend the selling sheet to clothes, shoes and other items | task | 2 | C | after fixf.15 | H10 fold |
| fixf.33 | Scale-up and decide (phases 5 and 6): second-intake weekends, the 2027-02-26 report: total raised, hours, pounds per hour, sell-through | task | 3 | PC | after fixf.28 | repo |
| fixf.34 | Done check for the first slice: one item from inventory record to live listing | test | 1 | P | after fixf.12 | 3.27; unlocks every venture behind the H6 rule |

## 6. E.fin: Finance (MYC)

Gate: MYC-195 (Enable Banking sign-up) blocks everything that reads transactions.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| fin.01 | The first sitting that will not be avoided: Claude goes through Finance with Phil, one screen at a time | guide | 1 | P | after MYC-195 | 4b; the opener |
| fin.02 | Categories reworked in one 15-minute sitting | guide | 1 | P | after fin.01 | 4.22 |
| fin.03 | Every pound a job: the payday plan proposed by Mycelium, adjusted and accepted; budget month from the 16th | task | 8 | C | after MYC-195 | 4.5, 4.6, 4b payday sitting |
| fin.04 | The daily money line in the morning briefing: the Boys, blunt, a traffic light; overspent days called out | task | 5 | C | after fin.03 | 4.4, 4b |
| fin.05 | Payday summary and budget prompt; a warning when a balance will not cover upcoming bills; a weekly spending digest; inside the three-a-day budget | task | 5 | C | after fin.03 | 4.25 |
| fin.06 | Fixed personal spending money each payday; unspent swept to debt or savings | task | 2 | C | after fin.03 | 4.26, 4b |
| fin.07 | No-spend days counted per week, no streak | task | 2 | C | after fin.04 | 4b |
| fin.08 | Named pots (car, home repairs, Christmas, baby, holidays) and bank pots and vaults tracked separately | task | 3 | C | after fin.03 | 4.12, 4.23 |
| fin.09 | What he owes: both payoff orders laid out, he chooses | task | 2 | C | after fin.01 | 4.9; 4b order: debt, then safety net, then investing |
| fin.10 | Safety net: three months of essentials, the figure from the data | task | 1 | C | after fin.03 | 4.10 |
| fin.11 | Subscriptions cancel sweep: Keep or Cancel each; cancellations become tickets with the exact link | guide | 2 | PC | after MYC-195 | 4.13 |
| fin.12 | Account tidy-up: every account and card listed, decide each | guide | 2 | PC | | 4.28 |
| fin.13 | Net worth into Mycelium: the Google Sheet imported once and retired; the mortgage line removed | task | 3 | C | | 4.21, 4.15 |
| fin.14 | Renewal dates look-up in one sitting: Mercedes EQA lease end, IONOS Mail Basic, the IONOS VPS, philipwhelan.com, the two Sporebit domains, energy, mobile, insurance; dated tickets a month ahead made from it | guide | 1 | P | | H2.4, 4.14; the only way the renewal tickets get dates |
| fin.15 | Broadband review (4th Utility, £37.00 a month, commitment ends May 2027): notice period, and whether the ASUS can be the only router | task | 1 | P | link net.02 | date 2027-03-01 |
| fin.16 | The renewals list in Finance | task | 3 | C | after fin.14 | H3 |
| fin.17 | Lower-income months around the birth: both employers' leave pay terms gathered, then modelled month by month | task | 3 | C | after fin.03 | 4.11; link baby.28 |
| fin.18 | Shared costs with Kirsty: options laid out for the two of them; the household budget before she moves in; a no-figures headline for her | task | 2 | PK | after fin.03 | 4.7, 4.8, 4b |
| fin.19 | Pension: contributions reviewed, old pots found (information only) | task | 2 | PC | | 4.16 |
| fin.20 | Investing options laid out neutrally | task | 3 | C | | 4.17 |
| fin.21 | Child money: Child Benefit claim, a savings account for the child, childcare costs and support schemes | task | 3 | C | | 4.18; link E.baby |
| fin.22 | Protection: wills, life insurance, income protection (information, options) | task | 3 | C | | 4.20 |
| fin.23 | Receipts, everything: switch on and exercise Receipts at runtime for one week first | test | 2 | P | after fin.01 | 4.24 `[claude]`; a trial before the full habit |
| fin.24 | Credit reports quarterly across the three agencies (recurring) | audit | 1 | P | | 4.29 |
| fin.25 | Copilot Money: what he liked, which of it Finance should copy | task | 1 | P | | H3 |
| fin.26 | Tax on side income (shared with FixForward) | task | 2 | C | link fixf.01 | 4.19 |
| fin.27 | Ventures page: money and hours in, money out, per venture, a red, amber, green verdict said bluntly; DropShipAuto's seventeen questions as the question round | task | 8 | C | | H3; question round first |
| fin.28 | Optics allowance (£200 a year): claim this year's for the new glasses before 1 February 2027 | task | 1 | P | | date 2027-01-25 |
| fin.29 | Kirsty's birthday freebies registered ahead of 23 May 2027 (the Birthday Ledger has the dates) | guide | 1 | P | | date 2027-04-23 |
| fin.30 | Concert tickets booked in May for 14 November never arrived (€83.25): refund or chargeback | task | 1 | P | | date 2026-12-12 |
| fin.31 | Done check: three paydays budgeted and kept to | test | 1 | P | after fin.03 | 4.30 |

## 7. E.baby: Baby (BABY)

All dated, worked back from 2027-06-15 (working due date). Tickets live in Phil's space until Kirsty joins (5.20 `[claude]` noted on the epic). The buying list rows live in the Family section's lists (0171); tickets are for decisions and jobs. The first sitting of every dated ticket below is written as checklist data in step T7.

| sid | Title | Kind | Pts | Who | Date | Deps | Notes |
|---|---|---|---|---|---|---|---|
| baby.01 | Safety guardrail page: a researched rules page from official UK sources (car seat law, safe sleep, mattress, monitor); each item ticket links its rule | task | 3 | C | 2026-12-13 | | 5.14; first |
| baby.02 | Price the starter lists, then set the total budget with Kirsty | guide | 1 | PK | 2026-12-20 | after baby.01 | 5.3 |
| baby.03 | Shared baby pot, who paid what in the household budget, running total on the Family page and the payday summary | task | 3 | C | 2027-01-10 | link fin.08 | 5.4, 5.27 |
| baby.04 | Ask family about hand-me-downs before anything is bought | guide | 1 | P | 2026-12-20 | | 5.11 |
| baby.05 | Ask three recent parents what they wish they had and had not bought | guide | 1 | P | 2027-01-10 | | 5b |
| baby.06 | Need, Nice or Wait on every list item; only Need before the birth | guide | 1 | PK | 2027-01-17 | after baby.02 | 5b overspend guard |
| baby.07 | Clear-out weekend booked with Kirsty; the nursery emptied (nothing for the room bought until it is empty) | guide | 2 | PK | 2027-01-31 | after home.10 | 5.6, 5b; after the storage ticket |
| baby.08 | Comparison guide: car seat (fit both cars, a base in each, one seat) | task | 3 | C | 2027-01-24 | after baby.01 | 5.7, 5.13 |
| baby.09 | Comparison guide: pram, against both boots, the streets and the budget | task | 3 | C | 2027-01-31 | after baby.01 | 5.8 |
| baby.10 | Where the baby sleeps the first six months: options researched, one conversation ticket | task | 2 | C | 2027-02-07 | after baby.01 | 5.5, 5b nights |
| baby.11 | Comparison guide: cot and mattress (mattress new) | task | 3 | C | 2027-02-14 | after baby.10 | 5.13 |
| baby.12 | Comparison guide: monitor, a local camera through Home Assistant; the evidence on baby technology first | task | 2 | C | 2027-02-21 | after baby.01, link sub.08 | 5.17, 5b |
| baby.13 | Buy: car seat and bases | guide | 1 | P | 2027-02-28 | after baby.08, baby.06 | big items early |
| baby.14 | Buy: pram | guide | 1 | P | 2027-03-07 | after baby.09, baby.06 | |
| baby.15 | Nursery designed in the editor (or the stopgap), Kirsty picks the mood board | guide | 2 | PK | 2027-03-14 | after baby.07, link home.17 | 5.18, 8.30 |
| baby.16 | Buy: cot and mattress | guide | 1 | P | 2027-03-21 | after baby.11, baby.15 | |
| baby.17 | Feeding kit: Kirsty decides; a minimal either-route kit meanwhile | guide | 1 | K | 2027-03-28 | | 5.9 |
| baby.18 | Paternity leave notice to work | guide | 1 | P | 2027-03-28 | | 5.19; usually 15 weeks before |
| baby.19 | Antenatal classes booked | guide | 1 | PK | 2027-03-14 | | 5.19 |
| baby.20 | Kirsty's own items: leave notice, appointments, paperwork (one ticket each, hers) | task | 2 | K | 2027-03-28 | | 5.26 |
| baby.21 | Buy: monitor; local only over the VPN | guide | 1 | P | 2027-04-11 | after baby.12, after net.14 | |
| baby.22 | Nursery set-up: furniture in, the room finished | guide | 3 | PK | 2027-04-25 | after baby.16, baby.15 | 5.18, 8.30 |
| baby.23 | Buy: the minimal starter set of clothing and kit | guide | 1 | PK | 2027-04-18 | after baby.06 | 5.22 |
| baby.24 | Dry run: fit the car seat in both cars, timed; fold the pram into each boot | guide | 1 | P | 2027-05-02 | after baby.13, baby.14 | 5b |
| baby.25 | Baby first-aid course | guide | 2 | P | 2027-04-18 | | 5b skills |
| baby.26 | Nappies, bathing and safe-sleep basics | guide | 1 | P | 2027-05-02 | | 5b |
| baby.27 | Supporting Kirsty in labour | guide | 1 | P | 2027-05-09 | | 5b |
| baby.28 | Nights and first weeks: one conversation with the options laid out | guide | 1 | PK | 2027-04-25 | link fin.17 | 5b |
| baby.29 | Hospital bag packed; bags in the car with a "go" checklist by the door | guide | 1 | PK | 2027-05-16 | | 5.18, 5b |
| baby.30 | Getting the house ready | guide | 2 | PK | 2027-05-09 | | 5.18 |
| baby.31 | Freezer meals, a help rota, a visitor plan (three sittings) | guide | 2 | PK | 2027-05-23 | | 5.23 |
| baby.32 | Make one thing by hand: choose it (then a dated finish) | guide | 1 | P | 2027-02-14 | | 5b; the finish ticket is made when chosen |
| baby.33 | Handover note before paternity leave (personal ticket; no work content) | guide | 1 | P | 2027-05-30 | | 5.24 |
| baby.34 | Birth registration and documents; GP and insurance (the steps ready, done after) | guide | 1 | P | 2027-06-15 | | 5.19 |
| baby.35 | Gift list: a shareable read-only page from the buying list, unguessable link, items only | task | 5 | C | 2027-02-07 | | 5.12 `[claude]` deliberately public GET; the only decided public endpoint |
| baby.36 | Price watch: alert on a real drop below a level he sets | task | 3 | C | 2027-01-31 | | 5.16 |
| baby.37 | First fortnight at home: Mycelium goes quiet, only the baby log and Kirsty's nudges; nothing counts as slipped | task | 3 | C | 2027-05-30 | | 5b |
| baby.38 | Wait items reviewed a month after the birth | guide | 1 | PK | 2027-07-15 | after baby.06 | 5b |
| baby.39 | Done check: everything essential in the house and set up a month before | test | 1 | PK | 2027-05-15 | | 5.30 |

## 8. E.wall: Home dashboard (MYC)

Links: MYC-189 (wall stream), MYC-205 (Phil's queue: PIN and Kitchen wall), MYC-182 (frame answers), PW-22 (house cleaning schedule, the chores rota panel).

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| wall.01 | Identify the frame from the device itself: model, OS, browser version, full-screen ability | guide | 1 | P | link MYC-182 | 6.3, H10 fold |
| wall.02 | The existing wall on the real frame, lived with for a week; nothing new built until it works | guide | 2 | P | after wall.01, link MYC-205 | 6.15 |
| wall.03 | Boot straight into the dashboard, full-screen, touch wake: a ticket per device type (the frame first) | guide | 2 | PC | after wall.01 | 6.17, 6.18 |
| wall.04 | Costed hardware list refreshed (docs/run/wall-report.md) and the devices he already owns surveyed; nothing bought before he sees it | task | 2 | C | | 6.8, 6.26 |
| wall.05 | Tile library and per-device sets: same panels, a different set per room; touches per tile counted from day one | task | 8 | C | after wall.02 | 6.20, 6.21, 6b; the Field shell's tile grid is the base |
| wall.06 | Panel: shopping list and meal plan | task | 5 | C | after wall.05 | 6.11, 6.16 first |
| wall.07 | Panel: baby log | task | 3 | C | after wall.05 | 6.12 |
| wall.08 | Panel: cooking mode | task | 5 | C | after wall.05 | 6.12 |
| wall.09 | Panel: chores rota (new) | task | 5 | C | after wall.05, link PW-22 | 6b replaces on paper |
| wall.10 | Panel: bin day and fridge reminders | task | 2 | C | after wall.05 | 6b |
| wall.11 | Panel: parcels expected, from the mail import | task | 3 | C | after wall.05, after MYC-201 | 6.24 |
| wall.12 | Panel: energy use (smart meter, EV charger) | task | 5 | C | after wall.05, after sub.08 | 6.13 |
| wall.13 | Panel: PhirstMaxx plans | task | 3 | C | after wall.05 | 6.11 |
| wall.14 | Panel: photo slideshow from a shared phone album (a new connection) | task | 5 | C | after wall.05 | 6.22 |
| wall.15 | Panel: music, Spotify control on whichever speaker is playing | task | 5 | C | after wall.05 | 6.23 |
| wall.16 | Panel: "from the archive", quotes and photos from this day in past years | task | 3 | C | after wall.05 | 6b |
| wall.17 | House controls through Home Assistant: lights and plugs, scenes open; cameras and heating behind the PIN | task | 8 | C | after wall.05, after sub.08 | 6.9, 6.10, 6.29 |
| wall.18 | Doorbell pop-up on a shared-room screen, cameras on demand | task | 3 | C | after wall.17 | 6.14 |
| wall.19 | Night hours per room in Settings; bedroom wind-down (dim, tomorrow's first thing, dark) | task | 3 | C | after wall.05 | 6.19, 6b |
| wall.20 | Guest mode: one tap and on a schedule, per device or all | task | 3 | C | after wall.05 | 6b |
| wall.21 | Idle: house status (doors, heating, what is on) | task | 3 | C | after wall.17 | 6b |
| wall.22 | Offline: last known board with an "as of" time; controls keep working locally | task | 3 | C | after wall.17 | 6.28 |
| wall.23 | Sound: soft natural chimes, speech only when asked | task | 2 | C | after wall.05 | 6b |
| wall.24 | Screens on the Smart-devices network, reaching Mycelium and Home Assistant only | guide | 1 | PC | after net.09 | 6.27 |
| wall.25 | Further rooms: living room, bedroom, office, on devices he owns | guide | 2 | P | after wall.04, wall.05 | 6.7 |
| wall.26 | Done check: both of them use the kitchen screen daily for two weeks | test | 1 | PK | after wall.06 | 6.30 |

## 9. E.sub: Substrate (SUB)

| sid | Title | Kind | Pts | Who | Date | Deps | Notes |
|---|---|---|---|---|---|---|---|
| sub.01 | Costed list: the spare parts as a whole machine, silence, a plug-in meter's week of power, monthly running figure; budget decided after | task | 3 | C | | | 7.3, 7.4, 7b |
| sub.02 | Platform research: plain Linux with containers against a VM host (the VM question folded in); Phil approves | task | 3 | C | | | 7.11, H5 |
| sub.03 | Build the box beside the routers; power-cut restart tested by pulling the plug | guide | 3 | P | | after sub.01, sub.02 | 7.22, 7.23 |
| sub.04 | The first service by hand with a guide, then everything as code: the config repo and a runbook per service in Docs | task | 3 | C | | after sub.03 | 7b learning, 7.28 |
| sub.05 | Names under sporebit.com with real certificates, resolving only inside the house or over the VPN | guide | 2 | PC | | after sub.03 | 7.24 |
| sub.06 | Service: the DNS filter (where net.03 decided) | guide | 3 | PC | | after net.03, sub.04 | 7.29 first |
| sub.07 | Service: the VPN; Kirsty's phone gets it | guide | 2 | PC | | after sub.04, net.04 | 7.10, 7.29 |
| sub.08 | Service: Home Assistant | guide | 3 | PC | | after sub.06 | 2.24, 6.10 |
| sub.09 | Service: network monitoring and device alerts | guide | 3 | PC | | after sub.06 | 7.5 |
| sub.10 | Service: local camera recording, motion clips for a set number of days, doorbell and outdoor only | guide | 3 | PC | | after sub.08 | 7.27 |
| sub.11 | Service: backups, second drive plus an encrypted off-site drive at a family member's house | guide | 3 | PC | | after sub.04 | 7.14, 7.15 |
| sub.12 | Service: photo library with phone upload, run beside the phones' cloud for three months, then a tested restore and a decision | guide | 3 | PC | | after sub.11 | 7.6, 7.17 |
| sub.13 | Service: files and sync; phone and computer backups | guide | 3 | PC | | after sub.11 | 7.6 |
| sub.14 | Service: media library for the TVs (large, a proper library); ebook and audiobook library; the feed reader for the digest | guide | 3 | PC | | after sub.13 | 7.26, 7b |
| sub.15 | Service: paperwork archive that reads and files scanned documents | guide | 3 | PC | | after sub.13 | 7b |
| sub.16 | Service: git hosting and build runners | guide | 2 | PC | | after sub.04 | 7.7 |
| sub.17 | The Mycelium PC worker and FixForward's jobs on Substrate: power cost against benefit (RTX 4070 stays on the PC or a spare GPU) | task | 3 | C | | after sub.16 | 7.7, 7.9 |
| sub.18 | Each house service: a "what happens when it is off" test; internet and light switches work with the server off | test | 2 | P | | after sub.08 | 7.13 |
| sub.19 | Each family service: "set up on Kirsty's phone", not done until untouched for a week | guide | 2 | PK | | after sub.07 | 7.19 |
| sub.20 | Family group of services: one set window, snapshot, rehearsed one-step revert, never on a weeknight | task | 2 | C | | after sub.12 | 7b rule |
| sub.21 | Monitoring: a push through Mycelium and a status page | task | 3 | C | | after sub.09 | 7.21 |
| sub.22 | Updates in the monthly review, snapshot first (recurring) | audit | 1 | P | | after sub.04 | 7.20 |
| sub.23 | Restore test per service at set-up; a yearly timed rebuild drill on a spare drive | test | 3 | P | | after sub.11 | 7b |
| sub.24 | Printed "if it breaks" page for Kirsty | guide | 1 | PC | | after sub.07 | 7b bus test |
| sub.25 | The 30-day proof: hands off from 2027-04-24, checked 2027-05-24 | test | 1 | P | 2027-05-24 | after sub.06, sub.07, sub.08 | 7b dated before June |
| sub.26 | Done check: every chosen service runs 30 days untouched | test | 1 | P | | after sub.25 | 7.30 |

## 10. E.home: Home, the editor and the rooms (HOME)

Links: GARDN-2 (Sort out the loft) relates to home.10.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| home.01 | Editor design: a web viewer in Mycelium, to scale, boxes first, phone and PC, several layouts per room, viewpoints (standing, seated, child, walk-through); the schema with room for a second property | task | 5 | C | | 8.3, 8.11, 8.29, 8b; design before build |
| home.02 | Editor slice 1: rooms and walls from measurements, wall and floor colours, save layouts | task | 13 | C | after home.01 | 8.11 |
| home.03 | Editor slice 2: furniture as sized labelled boxes, place and move to scale, on the phone | task | 13 | C | after home.02 | 8.11, 8.12 |
| home.04 | Editor slice 3: viewpoints and the walk-through path; mood-board renders | task | 8 | C | after home.03 | 8b, 8.1 |
| home.05 | Import the Floorplanner FML once as the fallback geometry | task | 3 | C | after home.02 | 8.21, H10 fold |
| home.06 | Measure the whole house: finish the laser round (decide if the Bosch is still needed), count the stair risers | guide | 2 | P | | 8.15, H10 fold |
| home.07 | Room plan page: layout, colours, shopping list with price and link, job list in order; lists feed the household budget | task | 8 | C | after home.02 | 8.19, 8.28 |
| home.08 | Mood boards: two or three directions per room, a hero piece each; Kirsty picks | task | 3 | C | after home.04 | 8.6, 8.9, 8b |
| home.09 | A budget per room before designing, from the "home" pot | task | 1 | PK | link fin.08 | 8.10 |
| home.10 | House-wide storage: the nursery's contents, what Kirsty brings, baby kit, the loft | guide | 2 | PK | link GARDN-2 | 8.24; before baby.07 |
| home.11 | Existing furniture measured in (his and Kirsty's), decided per room | guide | 2 | PK | after home.03 | 8.14 |
| home.12 | Bathroom: insulation-board receipt mismatch resolved | guide | 1 | P | | H10 fold; the first room, first step |
| home.13 | Bathroom: moisture tests, then cut and fit the boards (diamond blade, clamped guide), boards before battens | guide | 3 | P | after home.12 | H10 fold |
| home.14 | Bathroom: the existing plan and shopping list as tickets; the 1700 P-shaped bath fitted | guide | 5 | P | after home.13 | 8.18; the rundown agent splits this from the plan it finds |
| home.15 | Bathroom: technical record and the scan pass while the room is open | guide | 1 | P | after home.13 | 8.26, 8.27 |
| home.16 | Bathroom: finished, the before-and-after page for the Family timeline | task | 2 | C | after home.14 | 8b |
| home.17 | Nursery: designed in the editor (smallest bedroom), Kirsty picks; budget set | guide | 2 | PK | after home.03, home.08, baby.07 | 8.30; dated through baby.15 |
| home.18 | Nursery: bought and finished before June | guide | 3 | PK | after home.17 | 8.30; dated through baby.22 |
| home.19 | Bedroom, then living room: one room at a time, same process | task | 1 | C | after home.18 | 8.8; the room tickets are made when their turn comes |
| home.20 | Learn it or hire it: plastering and skimming | task | 1 | P | | 8b |
| home.21 | Learn it or hire it: tiling | task | 1 | P | | 8b |
| home.22 | Learn it or hire it: laying flooring | task | 1 | P | | 8b |
| home.23 | Learn it or hire it: electrical work beyond swapping fittings | task | 1 | P | | 8b |
| home.24 | Lighting positions become Home Assistant scenes and dashboard buttons | task | 3 | C | after home.07, after sub.08 | 8b |
| home.25 | Plant list: each plant's needs matched to each room's light, warmth and humidity from the model | task | 5 | C | after home.02 | 8b new |
| home.26 | Everything into Mycelium: geometry, furniture, layouts, room plans; furniture-only inventory for now | task | 3 | C | after home.07 | 8.21, 8.22 |
| home.27 | Done check: the nursery designed in the editor, bought and finished before June | test | 1 | PK | after home.18 | 8.30 |

## 11. E.office: Office restart (HOME)

Links: GARDN-1 (Patch and repair office walls) relates to office.05.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| office.01 | Measurements carried over, marked "do not re-derive": shell 3500 by 4900 by 2450, alcove, chimney breast, windows, door, radiator, clear run 2500; entered in the editor | task | 1 | C | after home.02 | H4 |
| office.02 | Fixed inputs recorded: solid oak or ash desktop 2 m on the right wall; the 3D-printed "Mycelium" wall panels as the signature piece; ply overlay and firm underlay; steel sheet not magnetic paint; flue stays sealed | task | 1 | C | | H4 |
| office.03 | Office mood boards, last in the room order; recess storage and wall colour decided there | task | 3 | C | after home.19 | H4 |
| office.04 | Office budget when its turn comes | task | 1 | P | after office.03 | H4 |
| office.05 | Walls patched and repaired | guide | 2 | P | after office.03, link GARDN-1 | GARDN-1 is the existing ticket; linked |
| office.06 | 3D printer purchase (PLA and PETG only), behind the baby and bathroom spend | task | 1 | P | after office.04 | H4; costs money |
| office.07 | Window hotkeys: trial the two AutoHotkey scripts for a week from the keyboard | guide | 1 | P | | H4 |
| office.08 | Access to Work equipment application: outcome unknown; overlaps desk and chair (undecided row in LIFE; not a ticket) | | | | | listed here for the map only; see review.02 |

## 12. E.garden: Garden 2027 (HOME)

| sid | Title | Kind | Pts | Who | Date | Deps | Notes |
|---|---|---|---|---|---|---|---|
| garden.01 | Garden design sitting in whatever tool exists then: somewhere to sit and eat, growing, a shed or workshop (FixForward's bench), somewhere safe for a child | guide | 2 | PK | 2027-02-06 | | H4 design first |
| garden.02 | Weed clearance | guide | 2 | P | 2027-03-06 | after garden.01 | May plan |
| garden.03 | Hedge trim to the boundary; a note to the neighbour or landlord | guide | 2 | P | 2027-03-13 | after garden.01 | |
| garden.04 | Pressure wash: drive, paths, alley, patio | guide | 2 | P | 2027-03-20 | after garden.02 | |
| garden.05 | Paving joints: test width and depth first (3 mm by 30 mm for polymeric, else brush-in sand) | guide | 1 | P | 2027-03-27 | after garden.04 | |
| garden.06 | Path crack; gap at the gatepost | guide | 1 | P | 2027-04-03 | after garden.04 | |
| garden.07 | Path-to-fence strip: membrane and gravel, or keep weeded | guide | 2 | P | 2027-04-10 | after garden.01 | |
| garden.08 | Drain grid; moss patch | guide | 1 | P | 2027-04-10 | | |
| garden.09 | Back lawn renovation: scarify, aerate, overseed (ryegrass and fescue), top-dress; edge and holes | guide | 3 | P | 2027-04-17 | after garden.02 | |
| garden.10 | Back corner clearance | guide | 1 | P | 2027-04-24 | | |
| garden.11 | Fence treatment | guide | 2 | P | 2027-05-01 | after repairs.01 | after the missing panel |
| garden.12 | Front grass strip: keep or convert | guide | 1 | PK | 2027-05-08 | after garden.01 | undecided in May |
| garden.13 | Shed or workshop: FixForward's bench and storage, priced | task | 2 | C | 2027-05-15 | after garden.01 | 8b |
| garden.14 | Garden done check against the design | test | 1 | PK | 2027-05-29 | | |

## 13. E.repairs: Repairs, odd jobs and next door (HOME)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| repairs.01 | Missing fence panel (about £20 to £30) | guide | 1 | P | | H4 |
| repairs.02 | Boiler flue extension to keep steam off the camera: note the flue diameter first, then a Gas Safe engineer | guide | 1 | P | | H4; costs money |
| repairs.03 | Render patching and paint | guide | 2 | P | | H4 |
| repairs.04 | Derelict property next door: photographs first (the shed on the fence, the exposed sockets), then Doncaster Council's current route, then the report | guide | 1 | P | | H4 |
| repairs.05 | Rattling air-conditioning unit: check the right-side panel fixings before wedging | guide | 1 | P | | H4 |
| repairs.06 | Fly screens before next summer | guide | 1 | P | | H4; the rundown gives it 2027-05 as a soft target, no due date |
| repairs.07 | Cast iron weights: de-rust, oil, store indoors | guide | 1 | P | | H4 |

## 14. E.glass: Glasses (GLASS)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| glass.01 | Research: Gen 3 support in Meta's Wearables Device Access Toolkit; own Android app against a headset plus phone Shortcut against voice messages to a bot; trigger options; silent taps and gestures; how "never speak while others talk" works with "only after I trigger it" | task | 5 | C | | 10.4, 10.6, 10b `[claude]` |
| glass.02 | Weekend prototype: voice capture into Mycelium, answering to "Mycelium", on the route glass.01 chose | task | 8 | PC | after glass.01 | 10.23, 10.28, 10b |
| glass.03 | The day thread: one running thread per day saved in Mycelium, every camera frame kept with it | task | 5 | C | after glass.02 | 10.17, 10.21 |
| glass.04 | Voice actions: next thing and mark done; add a ticket or note; shopping list; baby log | task | 5 | C | after glass.02 | 10.18 |
| glass.05 | Questions by voice with the answer read back; "short" or "full"; the phone's voice and dictation | task | 5 | C | after glass.02 | 10.1, 10.12 to 10.14 |
| glass.06 | Vision: a photo or a short live video chosen by what he says; text, labels, screens, items to list, DIY jobs, receipts | task | 8 | C | after glass.03 | 10.8, 10.9 |
| glass.07 | Steer Claude Code: what a session is doing, start a saved prompt, dictate instructions, answer questions and permission prompts after read-back and a confirm word; phone access folded in | task | 13 | C | after glass.05 | 10.10, 10.11 `[claude]`, H5 |
| glass.08 | Away from the PC: "saved for later" within 15 seconds, a working tone, longer jobs to the phone; through the cloud queue, nothing at home opened | task | 5 | C | after glass.05 | 10.15, 10.26, 10.27 |
| glass.09 | Spoken nudges into the glasses inside the three-a-day budget; "private" switches an answer to phone-only; silence while others talk | task | 5 | C | after glass.05 | 10.20, 10b |
| glass.10 | "Where is it": say it or look at it, into the home inventory with photo and place | task | 5 | C | after glass.06 | 10b |
| glass.11 | Evening walk: "what did I capture today" and the evening close by voice | task | 3 | C | after glass.04 | 10b |
| glass.12 | Field guide steps read aloud: "done", "next", "repeat" | task | 5 | C | after glass.05 | 12b |
| glass.13 | House control by voice, after the dashboard controls work | task | 5 | C | after wall.17, glass.04 | 10.19 |
| glass.14 | "List this" at the FixForward bench, after the first slice | task | 5 | C | after fixf.34, glass.06 | 10b |
| glass.15 | If only an iPhone app works: pair with the Pixel instead | task | 1 | P | after glass.01 | 10.24 |
| glass.16 | Done check: a week of daily use without taking the phone out | test | 1 | P | after glass.04 | 10.30 |

## 15. E.brain: Mycelium as second brain (MYC)

Links: MYC-193 (live checks) relates; MYC-199 relates.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| brain.01 | Spores: the quick-notes section, searchable, from capture and from the glasses | task | 8 | C | | 11.14, 11b |
| brain.02 | The Mycelium connector: every Claude session reads and writes Mycelium; first ticket settles sign-in | task | 8 | C | | 11.11 |
| brain.03 | Connector sign-in decision: the open question written up with the options, Phil decides | task | 1 | P | | 11.11 first ticket |
| brain.04 | Section search: Work and Docs | task | 5 | C | | 11.9, 11.28 |
| brain.05 | Section search: captures and notes | task | 5 | C | after brain.01 | 11.28 |
| brain.06 | Section search: People | task | 5 | C | | 11.28 |
| brain.07 | Section search: Finance | task | 5 | C | | 11.28 |
| brain.08 | List every spreadsheet, then move in the selling sheet, household and shopping lists, finance and net worth | task | 3 | PC | | 11.15 |
| brain.09 | Import: Claude project docs and chat decisions as reference material | task | 5 | C | after brain.02 | 11.10 |
| brain.10 | Import: Google Drive files | task | 5 | C | | 11.10 |
| brain.11 | Import: household paperwork, text read on the PC for free so search finds it | task | 5 | C | after brain.04 | 11.10, 11.12 |
| brain.12 | Import: Apple Notes into Spores | task | 3 | C | after brain.01 | 11.13 |
| brain.13 | Other Claude projects and repos onto tickets: a ticket per project (the sweep list from H10: Ye Madrid, PolySnipe, the portfolio site) | task | 3 | C | | 11.25, H10 unswept |
| brain.14 | Agents' long-term memory: a design ticket with a question round before any build | task | 2 | C | | 11.21 |
| brain.15 | Facts keep their history for people, money and decisions | task | 5 | C | after brain.14 | 11.22 |
| brain.16 | Monthly automatic export to plain files beside the database dumps; Family and Day log treated as permanent | task | 5 | C | | 11.23, 11b archive |
| brain.17 | Off-site backup: the same drive at a family member's house as Substrate | task | 2 | C | link sub.11 | 11.24 |
| brain.18 | The one number: days per week he captures something; a Sunday scoreline, features shipped against days captured | task | 3 | C | | 11.26, 11b |
| brain.19 | No capture today: an evening prompt, then a blunt call-out next morning | task | 2 | C | | 11b |
| brain.20 | Promised to people, owed replies, where things are, read and watched: the four "comes to know" feeds | task | 8 | C | after brain.06 | 11b |
| brain.21 | Year review: one for him, one for the family; "almanac" noted as a name | task | 5 | C | | 11b, H5 |
| brain.22 | Home design direction question round, for when he is ready; no UI work until then | task | 1 | C | | 11.8 |
| brain.23 | Native phone app research, Android included | task | 3 | C | | 11.19 |
| brain.24 | Kirsty's invite: what it waits on and what needs her (baby, budget, kitchen screen); a decision ticket | task | 1 | P | | 11.17 `[claude]` |
| brain.25 | The weekly context scheduled task (off since October) against the fortnightly nudge: decide | task | 1 | P | | H10 Mycelium fold |
| brain.26 | Done check: 30 days running with a capture every day | test | 1 | P | after brain.01 | 11.30 |

## 16. E.unblock: Unblock Mycelium (MYC)

Existing "Phil's queue" tickets are moved under this epic (epic set by PATCH, not recreated): MYC-195 (Enable Banking), MYC-201 (mailbox), MYC-197 (Shortcuts), MYC-182 (frame answers), MYC-196 (two exposed secrets), MYC-194 (email service), MYC-180 (cron jobs), MYC-203 (Boys bots), MYC-205 (wall PIN), MYC-200 (R2), MYC-202 (GitHub token), MYC-198, MYC-204, MYC-192, MYC-210. Each gets its "unlocks" line appended to its description. New ones:

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| unblock.01 | Census files check (keys.06) is the first unblock item: 15 minutes for Claude to look, nothing deleted | task | 1 | C | link keys.06 | H2.10 |
| unblock.02 | Order of the queue written on the epic: bank sign-up, mailbox, Shortcuts, frame, key rotation; each with what it unlocks | task | 1 | C | | 11.7, 11.29 |

## 17. E.tracker: Time allocation tracker (MYC)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| tracker.01 | Question round: which categories, what weekly targets, where the hours come from (calendar, Four-Day Week tracker, PC worker) | task | 1 | P | | H5 `[claude]`; link MYC-177 |
| tracker.02 | Build: calendar time colour-coded into categories against weekly targets | task | 8 | C | after tracker.01 | H5 |
| tracker.03 | Quarterly review | audit | 1 | P | after tracker.02 | H5 |

## 18. E.fit: Fitness and health (MYC)

Owner-only where H5 says so. Health threads beyond these are not ticketed.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| fit.01 | Restart the PTP with Kirsty from wherever makes sense | task | 1 | PK | | H5 |
| fit.02 | Supplements schedule: first step, Phil gives his list | guide | 1 | P | | H5 |
| fit.03 | One settled set of nutrition targets and the overdue review (September's figures stand) | task | 2 | PC | | H5 |
| fit.04 | Joe's rehab sessions and the excluded lifts saved into Fitness | task | 2 | C | | H5; the only copy is an old chat |
| fit.05 | The May workout logger: rest timer and Apple Watch interval lists worth copying? Then retire it | task | 2 | C | | H5 |
| fit.06 | A private habit (owner-only, never on the wall, never shared, not in any shared export): cutting back smoking, tied to sleep | task | 3 | C | | H5 |
| fit.07 | Write the review for Joe PT (existing PW-23) | | | | link PW-23 | existing; not recreated |

## 19. E.phm: PhirstMaxx (PHM)

Links: MYC-207 (Google, Family calendar and PhirstMaxx checklist), PHM-7 (Daytripper v1: share a plan, public RSVP page).

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| phm.01 | Did the import run before the old database was deleted? Confirm, then correct claude/phirstmaxx-spec.md (no importer, no mirror) | task | 2 | C | | H5 `[claude]`; H9 flag 7; the 2026-11-24 commits already dropped mirror and cutover from the design spec; the importer question remains |
| phm.02 | Shut down the old site; its keys go through keys.04 | task | 1 | PC | after phm.01 | H5 |
| phm.03 | Map every old roadmap item (R1 to R11) and each part of PROMPT_3 against the spec: covered, phase 2, or dropped; for Phil's approval | task | 3 | C | after phm.01 | H5 |
| phm.04 | Daytripper sharing rescued from its chat and attached to PHM-7 for phase 2 | task | 2 | C | link PHM-7 | H5; PHM-7 already exists |
| phm.05 | Which screens of the old app were actually used: a 15-minute sitting Phil writes alone | guide | 1 | P | | H5 |

## 20. E.dsa: DropShipAuto kept alive (DSA)

Existing DSA-1 to DSA-26 stay. New, from H6's list where no ticket exists:

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| dsa.01 | Two replay-mode dashboard bugs with exact diagnoses (from the harvest) | task | 3 | C | link DSA-8 | H6 |
| dsa.02 | History page renders no rows | task | 2 | C | link DSA-6 | H6 |
| dsa.03 | Two overlapping ClickUp task sets (215 and 184): reconcile or retire | task | 2 | C | | H6 |
| dsa.04 | Account creation with email verification | task | 5 | C | | H6 |
| dsa.05 | An email address and a phone number per store | task | 3 | PC | | H6; link mail.05 |
| dsa.06 | The first real niche | task | 3 | PC | | H6 |
| dsa.07 | The subdomain sites and Let's Encrypt email move off philipwhelan.com (mail.31 does the work; this is the DSA-side check) | task | 1 | C | after mail.31 | H1, H6 `[claude]` |

## 21. E.vent: Ventures behind the rule, and one-off research (LIFE)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| vent.01 | The rule before June: FixForward only until its first slice ships; every venture ticket here is blocked by fixf.34 | task | 1 | C | after fixf.34 | H6; the epic's description |
| vent.02 | Alex's site: rescue the brochure page and plan from the old chat into claude/archive/ | task | 2 | C | link SELL-2 | H6, H8 |
| vent.03 | Alex's site: ask Alex whether he wants it and whether he owns a domain; note the price disagreement, the NHS claim, the personal phone number and biography | task | 1 | P | after vent.02, after fixf.34 | H6 |
| vent.04 | Alex's site: build as the agency's first client at no charge, once he says yes | task | 8 | C | after vent.03 | H6 |
| vent.05 | Fabian Society and government briefing: first ask which angle he meant, then a sourced neutral briefing | task | 2 | PC | | H6 |

## 22. E.rescue: Harvest rescue and the delete gate (LIFE)

The brief names `claude/harvest-prompts-rescue.md` (Prompts C and D) and `claude/harvest-review.md`; neither exists in the repo. The tickets carry the prompts' purpose and say the files are missing.

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| rescue.01 | Rescue into claude/archive/: office design state, both email plans, the PhirstMaxxing roadmap and prompts; Phil runs one export prompt per project | guide | 2 | P | | H8.1; one phase per project |
| rescue.02 | Rescue chat-only files: the Daytripper spec, Alex's brochure and plan, DropShipAuto's tracker and plan files | guide | 1 | P | | H8.1 |
| rescue.03 | The eleven unread chats, one-chat harvest each: six in Office Set Up, four in PhirstMaxxing, the email inventory chat | guide | 3 | P | | H8.2; one step per chat |
| rescue.04 | The 41 unread chats outside projects, the first five first (Home 3D model and inventory, RAM inventory eBay pricing, Shared savings pot, Financial spending analysis, HTML guide template system) | guide | 3 | P | | H10 unswept |
| rescue.05 | Three unswept projects (Ye Madrid, PolySnipe, the portfolio site): Prompt A in each | guide | 1 | P | | H10 unswept |
| rescue.06 | Check the tickets against the harvest, project by project | task | 3 | C | after rescue.01, rescue.03 | H8.3 |
| rescue.07 | Delete gate: the old projects deleted only after the check; Everlight and Mycelium kept | guide | 1 | P | after rescue.06 | H8.3 |

## 23. E.review: This run's review (LIFE)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| review.01 | Review: decisions made for me on 2026-11-28 (one row per decisions.md entry, Keep or Undo, an answer box) | guide | 2 | P | | the brief's finish; built from decisions.md at the end |
| review.02 | Keep or drop: items from old chats (one row per H10 undecided item, about 45 rows) | guide | 2 | P | | H10 |
| review.03 | Live roadmap page: drawn from ticket links, next unblocked ticket highlighted | task | 8 | C | | Final five 1; Stream U did not reach it |
| review.04 | The map in Docs (one-off diagram of the epics and what unlocks what) | | | | | made by this run (T6), listed for the index; not a ticket |

## 24. E.guide: Field guide follow-ons (MYC)

| sid | Title | Kind | Pts | Who | Deps | Notes |
|---|---|---|---|---|---|---|
| guide.01 | Public read-only guide link: unguessable token, no answers shown, revocable; a decision before build | task | 5 | C | | design D4; the brief's "shareable link" without "public" |
| guide.02 | Guides by voice through the glasses (glass.12 does the build; this links the format's side) | task | 1 | C | link glass.12 | 12b |
| guide.03 | Global Claude instructions prompt for the Field guide format: review and adopt in every project's CLAUDE.md | task | 1 | P | | 12.30; the prompt itself is a run deliverable in docs/guides/ |

---

## 25. Cross-epic order (what unlocks what)

```
unblock (MYC-195, MYC-201, MYC-197, MYC-182, keys.06) ──┬── fin.* (MYC-195)
                                                       ├── wall.11 (MYC-201), mail.12
                                                       ├── glass.02 (MYC-197 Shortcuts)
                                                       └── wall.01/02 (MYC-182)
mail.01/02 ── mail.05 ── mail.06/07/08 ── mail.15 ── mail.16..23 (critical) ── mail.24 (High batches) ── mail.35 (quiet year starts)
                                   └── mail.22 (eBay) ── fixf.12 (live test) ── fixf.34 (first slice) ── vent.*, glass.14
net.01 ── net.02 ── net.05 ── net.06 ── net.07 (four networks) ── net.08/09/10 ── net.12 ── net.14 ── baby.21
net.03 (where the filter runs) ── sub.06 (DNS filter) ── block.03/04 ── block.05 (block page) ── block.20/23
net.04 ── sub.07 (VPN) ── net.21 (remote access guide) ── net.22
sub.01/02 ── sub.03 ── sub.04 ── sub.06/07 ── sub.08 (Home Assistant) ── wall.17, home.24, baby.12
home.01 ── home.02 ── home.03 ── home.08 ── home.17 (nursery design) ── home.18 ── home.27
home.10 (storage) ── baby.07 (nursery cleared) ── baby.15 ── baby.22
keys.10 ── keys.11 ── keys.13, mail.11
garden.01 (Feb) ── garden.02..13 (Mar to May)
```

## 26. Counts (plan; the create script reports actuals)

| Project | Epics | Tickets | Dated |
|---|---|---|---|
| MAIL | 1 | 41 | 0 |
| SEC | 3 | 26 + 23 + 15 = 64 | 1 recurring (net.24) |
| FIXF | 1 | 34 | 0 |
| MYC | 7 | 31 + 26 + 26 + 2 + 3 + 6 + 3 = 97 | 4 (fin.15, fin.28, fin.29, fin.30) |
| BABY | 1 | 39 | 39 |
| SUB | 1 | 26 | 1 (sub.25) |
| HOME | 4 | 27 + 7 + 14 + 7 = 55 | 14 (garden) |
| GLASS | 1 | 16 | 0 |
| LIFE | 3 | 5 + 7 + 3 = 15 | 0 |
| PHM | 1 | 5 | 0 |
| DSA | 1 | 7 | 0 |
| **Total** | **24** | **399** | **59** |

Existing tickets re-parented or linked, not recreated: MYC-6, MYC-180, MYC-182, MYC-192, MYC-193, MYC-194, MYC-195, MYC-196, MYC-197, MYC-198, MYC-200, MYC-201, MYC-202, MYC-203, MYC-204, MYC-205, MYC-207, MYC-209, MYC-210, MYC-177, PW-22, PW-23, PW-30, PW-57, PW-71, PW-72, GARDN-1, GARDN-2, SELL-1, SELL-2, PHM-7, DSA-6, DSA-8.

## 27. Open points for the red team (beyond the nine H9 flags and two H10 flags)

1. The baby working due date (2027-06-15) is a guess at mid-month; MYC-182 asks the real one. Every baby date moves with it.
2. The garden's fourteen dated Saturdays (March to May 2027) land in the same weeks as the nursery set-up, the hospital bag and the Substrate hands-off window. The ledger must price this.
3. `mail.24` creates its batch tickets later, from the import. The red team should check that the "every step its own ticket" rule is satisfied by generating them then rather than now (1,736 rows cannot be 1,736 tickets today).
4. `fixf.03` records a decision against Phil's answer 3.26 ("plus scraping where they fall short") because the FixForward repo's own hard rule forbids it and the brief's `[claude]` flag warned about the account. Phil can overturn it on the ticket.
5. `home.17`/`home.18` depend on an editor that does not exist; `baby.15` says "or the stopgap". The brief declined Floorplanner; the red team should say whether a stopgap must be named anyway.
6. H2.5 to H2.7: the VPS stays up (H6) while its old agent, secrets and port 3000 are checked. Nothing is switched off in this run.
7. SEC holds both the network and the keys epics; MAIL holds the domains' SPF and DMARC only. The brief's digest header for H2 says "SEC and MAIL".
8. Points are the planner's estimates; the ledger converts them to hours.
