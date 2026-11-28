# FixForward repo digest (read 2026-11-28)

Source: `A:\Projects\fixforward`, read-only. Last commit `b989a9f` (2026-11-27 03:28 +0000), 40+ commits, all local, nothing pushed, no remote. Working tree has three uncommitted edits made after the overnight run: `REVIEW.md` (Needs Phil 8 ticked), `docs/project/inventory.md` and `docs/reference/inventory-page.html` (floor rounding fix). `.env`, `data/private`, `items/*/evidence`, `items/*/packing` were not opened. No secret or serial appears below.

Note on names: the repo and the eBay account are `fixforward` (one word, lower case). The user is Phil. "SH-0001 to SH-0070" are provisional record IDs from the sheet import; "inventory ID 12" is the sheet's row number (SH-0018).

## 1. What FixForward is, and its state on 2026-11-28

**What it is.** Automation and process for `fixforward`, Phil's eBay UK private seller account. It sells things Phil and his household already own: mainly computer parts (RAM, graphics cards) and clothing/trainers, plus ornaments and anything else (`docs/project/selling-rules.md`, Purpose). Target: 2,500 pounds from existing belongings in three months, on 3 to 5 hours a week, 0 pounds a month running cost, under 100 pounds of equipment. Top priority when rules conflict: account reputation. Three horizons (`docs/project/product-spec.md` section 1): (1) clear Phil's stock now; (2) decide private versus business from the pilot's numbers; (3) later, offer the system to other sellers ("built for Phil, shaped for many", nothing built for sign-up or billing).

**Built (all on synthetic data or paper, nothing run against reality):**
- Standards: photo, titles, descriptions, item specifics, condition grading, voice and tone, drive wiping, parts testing, packing, message templates (`docs/standards/`).
- Guides (self-contained HTML from `tools/guide-kit/`): Saturday first item, photo setup, label printing, intake first run, account hardening, drive wiping.
- 70 listing drafts in `drafts/` (SH-0001 to SH-0070), 70 private item records in `data/private/items/` (git-ignored), all imported from Phil's Component Inventory workbook. None photographed, approved or on eBay.
- Photo intake (`/intake` command plus `engine/src/intake/`), the engine core, secret store in Windows Credential Manager (`scripts/lib.ps1`), encrypted backup and restore, EXIF stripper, stop flag, brand foundation, plans, product docs, six proposals.
- Engine: `npm test` 203 tests (REVIEW.md section 1 and CLAUDE.md status), plus four PowerShell suites in `scripts/tests/`. No type checker has run (Node type stripping only).
- A private-guard pre-commit hook (`tools/private-guard/guard.mjs`) blocks serials and private identifiers from commits.

**Never run (REVIEW.md section 5, CLAUDE.md status):**
- Nothing has touched eBay: no endpoint called, no listing, no token, no sandbox.
- The intake has never seen a real photo.
- The real Credential Manager calls (`CredRead`, `CredWrite`, `CredDelete`) were only compiled, never run; tests use a DPAPI dummy store in `%TEMP%` that accepts only `DUMMY-` values.
- Real `age` encryption never run (tests use a reversible stand-in).
- `.env` still holds dummy test values from an earlier faulty test; it is retired and Phil is to delete it once the new step 1.4 passes.
- Viewing-copy rotation (`scripts/make-viewing-copies.ps1`) untested.
- The inventory page (a Claude artifact with its own database) has no photo upload and no call to Claude yet (`docs/product/architecture.md` finding 4).
- No runner, no scheduled task, no push sender, no eBay client (`architecture.md` finding 1).

**Waiting on eBay developer approval:**
- Developer registration submitted 2026-11-26, pending. Approval time UNVERIFIED (`docs/plan/roadmap.md`). No real keys exist.
- Until keys: `1.4-set-secrets.ps1`, `1.5-verify-keyset.ps1`, then with Phil's yes `2.4-exchange-code.ps1`, `2.5-verify-user-token.ps1`, `3.6-verify-policies.ps1`; then the first live test.
- Also blocked on Phil by hand: business policies FF-Standard (Royal Mail Tracked 48 at 3.95 pounds, dispatch 1 working day), FF-Returns-30, FF-Payment, being created in Seller Hub. Simple Delivery is on ("Dispatch with eBay": DHL, Evri, InPost, Royal Mail; cut-off 14:00; `live-test-setup.md`).
- Cannot be known until the live test: whether a private account can publish Simple Delivery listings through the Inventory API (the fork, outcome A or B), whether watcher offers work on a private account, how handling time behaves on Simple Delivery.
- Sold medians cannot come from the API (Marketplace Insights is limited release); anchor is Phil's Product research screenshot or typed figure (`docs/project/ebay-api-check.md`).

**Process state.** Saturday 2026-11-28 is a rehearsal on inventory ID 12 (SH-0018, a tested 8GB Micron SODIMM, 19.99 pound median, also the live-test item). The basket (85.96 pounds) was recommended for ordering 2026-11-27; nothing arrives before Monday 2026-11-30.

## 2. Hard rules (CLAUDE.md and selling-rules.md)

CLAUDE.md hard rules (these bind any session in that repo and anything Mycelium builds for it):
1. eBay only through its official API. Never drive, script, scrape or fetch the eBay marketplace or account (listings, search, sold prices, seller pages, Seller Hub, signed-in pages). Reading developer.ebay.com and help/Seller Centre articles is allowed.
2. Never print, log, echo, commit or paste any secret value. Wording is being replaced: secrets now live only in Windows Credential Manager via `scripts/lib.ps1` (proposal `docs/proposals/claude-md-secrets.md`; old text names `.env` and `Import-Env`, which no longer exist).
3. Nothing changes on the live eBay account without Phil's yes in the session to that specific action (publish, revise, end, offer, message, feedback, order, cancellation, refund). Read-only calls are fine.
4. Store no eBay user data (buyer names, usernames, addresses, order or message contents) on disk or in any database. The keyset's deletion-notification exemption is valid only while nothing is persisted.
5. Never price, offer or accept below an item's floor.
6. Do not edit `selling-rules.md` or change a rule's meaning in code without Phil's approval; propose instead.
7. No automation operates Vinted.

Other conventions: Windows PowerShell 5.1, project root `A:\Projects\fixforward`, code indented with tabs and no alignment padding, tabular output headers without underscores, datetimes `YYYY-MM-DD HH:MM:SS`, one folder per item under `items/` (`photos/` public, `evidence/` and `packing/` private, all kept out of git). `docs/project/` holds approved documents and is never edited by agents (changes go in `docs/proposals/`). The Claude project "fixforward - eBay" is the source of truth for the `docs/project/` copies (taken 2026-11-26).

Hard rules for the automation in selling-rules.md v1.5:
- Never price, offer or auto-accept below the item's current floor; the floor is never below 80% of the sold median on Phil's payout; at the minimum, stop and flag.
- Levers (price drop plus watcher offer) must not stack past the floor.
- Compare against competitors on the buyer-facing price (private listings show a price including eBay's buyer protection fee).
- No item's price moves unless Phil approved that item's schedule (approve once, at listing).
- No message is auto-sent unless it is an approved template, and every one says it is automatic.
- Condition and flaw statements are never changed by automation.
- No refund, partial refund or cancellation without Phil.
- Nothing listed without Phil's one-tap approval of that item.
- Anchor and floor come only from sold data (Product research screenshot or a figure Phil typed).

Key numbers in the rules: start price 108% of sold median (rounded down to 50p, never below floor); floor 80% of median rounded UP to the penny (changed in code and inventory page on 2026-11-27); Best Offer on; offers at or above floor auto-accept; within about 10% below floor go to Phil's phone; lower get an automatic counter at the floor; watcher offers fixed 5% off current price, capped at floor, at most one per step, 4-day life; returns 30 days, buyer pays return postage; dispatch next working day, orders paid after 2pm go the next working day; minimum value under 10 pounds items bundled or skipped; over 750 pounds or oversize kept out of automation; UK only; no collection; cancellation requests polled about every 15 minutes; positive feedback left automatically on delivery; secrets in Credential Manager; two backups (nightly encrypted cloud export plus dated second disk).

Schedules (selling-rules.md): parts (RAM, GPUs, drives) stale at day 7, then 101%, 94%, 87%, 80% at days 7, 14, 21, 28, job-lot proposal after a 14-day hold at day 42. Clothing/trainers/accessories/ornaments stale at day 21, then 104, 100, 96, 92, 88, 84, 80% at days 21 to 105 every 14 days, lot proposal at day 119. Example: 40 pound median gives 43.00, 40.00, 37.50, 34.50, floor 32.00. Worked floor example: 19.99 pound median gives start 21.50, then 20.00, 18.50, 17.00, floor 16.00.

Implication for Mycelium tickets: anything that touches eBay must go through the API adapter behind the engine's guard; no Mycelium feature may scrape eBay, store buyer data, or send an unapproved message.

## 3. Roadmap and plan as the repo states it

Source: `docs/plan/roadmap.md`, `time-budget.md`, `risk-register.md`, `open-decisions.md`, `business-case.md`, `valuation.md`. The three months run 2026-11-27 to Friday 2027-02-26 (13 weeks); whether the clock should start at the pilot's first listing is an open decision.

| Phase | Dates | Content |
|---|---|---|
| 0 Decide and rehearse | 2026-11-27 to 11-29 | Saturday rehearsal on ID 12; order basket; time every step |
| 1 Setup | 11-30 to 12-06 | Kit arrives; Monday packing phase; label alignment test; Syncthing exclusion, BitLocker, `age` key; policies; when eBay approves: secrets and token scripts; pilot intake of about 20 items (drafts only) |
| 2 Live test (the fork) | 12-07 to 12-11 | One real listing (ID 12) end to end; Phil checks buyer view on his phone; one price revision, one watcher offer, one traffic report, each on its own yes; confirm "Send automated offers" is off in Seller Hub |
| 3 Pilot and dry run | 12-08 to 12-23 | About 20 items live on one-tap approval; dry-run week about 12-14 to 12-20 (pass: zero rule breaches and 20 decisions spot-checked); no price moves on eBay until dry run passed and four engine interpretations settled |
| 4 Away | 12-24 to 2027-01-03 | Time Away in eBay plus the away switch (stop file for now) |
| 5 Scale-up | 01-04 to 01-24 | Post-pilot rule review; rest of tier 1 (about 949 pounds at median across 33); tier 2 priced by hand; lots; second intake weekends 01-09 and 01-16 |
| 6 Run and decide | 01-25 to 02-26 | Floors reached, lot proposals, monthly review, business-case check; on 02-26 report total raised, hours, pounds per hour, sell-through |

**Outcome A** (buyer view shows Simple Delivery and the buyer protection fee): listings go up through the API after one-tap approval. **Outcome B** (it does not): end and relist ID 12 by hand; Phil creates each listing by hand from a paste-ready draft; engine handles everything after. B costs 6 to 10 more minutes per listing, 5 to 8 hours over the stock on hand (about 46 listings after quantity listings and lots). Unverified under B: whether a hand-made listing can be repriced with Trading `ReviseFixedPriceItem`. If keys have not arrived by Fri 12-11, take outcome B for the pilot regardless.

**Protect two dates:** 12-11 (outcome B fallback) and the second-intake weekends 01-09 and 01-16 (the only route to the last 1,000 pounds). If Phil can give only 3 hours a week, cut untested tier 3, not the second intake.

**Time budget** (`time-budget.md`, all estimates, Saturday's timings replace them):
- Per item, label to post: RAM module 26.5 min (intake 15.5), further module in a quantity listing 18.5, graphics card 48, pair of shoes 38, clothing item 36.
- Fixed time about 25 min/week plus about 2 hours once for setup and live test.
- 3 hours a week: 39 hours in 13 weeks, about 31.6 usable, 5 to 6 modules a week (about 145 to 170 pounds of stock a week). 5 hours a week: 65 hours, 57.6 usable, about 10 modules a week (about 300 pounds a week).
- Stock on hand needs 29.2 to 35 hours (valuation), 24.4 to 30.2 after quantity listings and lots.
- Pounds per hour: tier 1 about 64, tier 2 about 51, tier 3 about 9.
- Second intake needs each item to average about 15 to 18 pounds (5 hours a week, slow) up to about 330 pounds (3 hours a week, slow).

**Valuation** (`valuation.md`, sold data collected 2026-11-07): stock on hand raises 1,112.85 (low), 1,497.25 (central), 1,759.30 (high); 890.28 if a fifth is unsold. Gap to 2,500: 1,002.75 at central, 1,387.15 low, 740.70 high. Tier 1 (33 tested modules with a median of their own): medians 948.73, starts 1,016.00, floors 759.12. Tier 2 (22 thin-comp tested parts): 333.80 to 670.07. Tier 3 (11 untested): 19.93 to 73.23. Tier 4 (four pairs of shoes) not valued (no sold data). Hours, not prices, are the binding limit.

**Risks** (`risk-register.md`, 30 entries, IDs H hours, L live test, K rules, S security, T tax, O operations). Top: H1 (3 hours a week fills the budget), H2 (second intake slips). Likeliest to cost the account: K3 (eBay's own "Send automated offers" can send an offer under a stepped-down floor) and K5 (a missed flaw). Three certain now, fix before the live test: K1 (inventory page floor rounding, now fixed in working tree), S2 (Syncthing share), S3 (private sheet notes in git history, commits `3e9884a` and `bdfe853`). T2: eBay will report Phil to HMRC at 30 sales or over 2,000 euros in a calendar year, near certain for 2027, information only.

**Open decisions** (`open-decisions.md`): due this weekend (what Phil owns, basket, backdrop, handle card, phone and printer models, Syncthing); before live test by 12-06 (floor rounding, `age` key and BitLocker, attended-runs rule, stop-file as kill switch, history rewrite, setup-guide secrets wording, where the ntfy topic lives, serials on the page); before pilot lists by 12-07 (identical units, sold-median method, test proof, shoes for Vinted, which clothing items join); before the engine changes anything by 12-20 (four engine interpretations, 48-hour dry-run rule and four caps, Christmas away dates, whether stale clock runs while away); January (untested parts, lots, graphics-card test PC, drop tier 3, post-pilot rule changes); by 02-26 (private or business, scale-up, interview round, long-term home: own app or a Mycelium module).

**Business case** (`business-case.md`): stay private. Business fees on 2,500 pounds would be about 350.51 (14.0%); about 195 even if every price could rise by the buyer protection fee. Parts alone: 199.67 (13.3%) against 0. Business fees: 9.9% Computers/Tablets/Networking, 11.9% Clothes/Shoes/Accessories, plus 0.30 or 0.40 per order, 0.35% regulatory fee, 30p per listing with no free listings. Private: no final value fee, 300 free listings a month then 35p, buyer pays protection fee (0.10 plus 7% up to 20 pounds, 4% from 20 to 300). Register as a business only if Phil starts buying or repairing to sell (eBay's own trigger and the rules' review trigger). Trading allowance 1,000 pounds a year. Pilot must show four numbers: minutes per item, realised price against median, sell-through by day 28 (parts) and day 63 (clothing), pounds per hour on household stock (about 43 to 51 now). All fee figures from `docs/research/fees-and-obligations.md`, checked 2026-11-27; whether memory and graphics cards fall under 9.9% is UNVERIFIED.

## 4. The engine

Location `engine/` (TypeScript, zero npm dependencies, Node 23.6 or later with type stripping; Node 26 installed on the PC). Run with `npm test` (`node --test "engine/**/*.test.ts" "tools/**/*.test.mjs"`). Other scripts: `npm run dryrun`, `npm run intake`, `npm run approve`, `npm run guides`, `npm run guard`. **Test count: 203 engine tests** (CLAUDE.md and REVIEW.md; PROGRESS.md recorded 160 mid-run for the T5 subset) plus four PowerShell suites.

Config in `engine/config/`: `rules.json` (mirrors selling-rules.md number for number, with a drift test that fails if they diverge; the seasonal months in it are marked proposed), `account.json`, `flaw-words.json`, `intake.json`, `packaging.json`, `shot-lists.json`. Schemas in `engine/schema/`: `item.v1.schema.json`, `reading.v1.schema.json`.

| Module | What it does |
|---|---|
| `pricing.ts` | Whole-pence maths: floor = 80% of median rounded up; prices round down to 50p, never below floor; both schedules |
| `schedule-clock.ts` | Stale clock derived from dated events (day 7 parts, day 21 slow); Best Offer or median refresh restarts it; seasonal pause |
| `plan.ts` | What a stale check does: watcher offer first if watchers, else price drop; one watcher offer per step; 14-day hold at floor then lot proposal; away mode means no watcher offers |
| `offers.ts` | Decides an incoming Best Offer (accept at or above floor, to Phil within about 10% below, counter at floor below that); away mode sends all to Phil. Advice only |
| `guards.ts` | `gate()`, the single gate every outgoing action passes: hard rules, stop flag, proposed caps (one price change per item per day, one auto-reply per conversation per 24 hours, one watcher offer per step, three errors or one refusal sets the stop). Actions are absolute and keyed |
| `act.ts` | The only code that calls a channel: guard, intent line, call, result line; a refusal sets the stop; settled keys are skipped |
| `audit.ts` | Append-only JSON lines (`data/private/audit/audit-YYYY-MM.jsonl`), allow-listed fields only so buyer text cannot reach disk |
| `messages.ts` | Auto-replies only from the five approved templates, filled from the listing, ending with the automatic-reply sentence; matching is plain code, never a model |
| `rules.ts` | Loads and types the rules config |
| `dryrun.ts` | Replays imported records over a pretend calendar against the fake channel and a seeded fake market; uses public copies only; output checked for serials |
| `random.ts` | Seeded randomness for the dry run |
| `channel/channel.ts` | The channel interface (below) |
| `channel/fake.ts` | In-memory channel for tests and the dry run |
| `items/validate.ts`, `check.ts` | Schema validator (limited keyword set) and the cross-field rules plus approval gate of `item-record.md` |
| `items/public.ts` | `publicCopy`: deletes every `private` key, drops private-role photos, fails if any serial remains. The only copy that may feed a listing |
| `items/identity.ts` | Name and key spec composed from unit fields, shared by import and intake |
| `draft/draft.ts`, `write-drafts.ts` | Listing drafts (markdown) from the public copy to the standards; anything awaiting Phil is in [square brackets] |
| `import/sheet.ts`, `xlsx.ts` | Reads Phil's workbook (zip of XML, no dependencies) into item.v1 records, provisional IDs SH-0001 upward |
| `intake/*` | Photo intake: `scan`, `exif`, `order`, `files`, `finish`, `journal` (ledger keyed by SHA-256), `reading`, `group`, `roles`, `link`, `median`, `names`, `packaging`, `build`, `write`, `summary`, `page`, `outbox`, `approve`, `undo`, `cli`, `fixtures`, `scenario`, `types` |
| `no-network.test.ts` | Test that engine code makes no network call |

**The channel interface** (`engine/src/channel/channel.ts`): nine methods, `publish`, `revisePrice`, `revise`, `end`, `sendOffer`, `respondToOffer`, `sendMessage`, `leaveFeedback`, `readState`. Three properties are its worth: every call carries an idempotency key; every call carries absolute values (never "drop by 7%"); only `act.ts` may call a channel, and only after `gate()` passes. `ListingState` holds IDs, prices and counts and has no field for a buyer (rule 4).

**Where the eBay adapter would go** (`docs/product/architecture.md` sections 5, 9, 13): a new `ebay-api` adapter in its own folder (the engine's only network exit, decision A13), written against fixtures built from eBay's documentation, meeting eBay only in the live test on Phil's yes. Two adapters because of the live-test fork: `ebay-api` (Inventory API createInventoryItem, createOffer, publishOffer with the three policy IDs; `updateOffer` for price; Trading for Best Offer read/respond; Negotiation API for watcher offers; Message, Feedback, Post-Order APIs) and `ebay-by-hand` (writes the paste-ready pack, returns `{handover}`, Phil lists and types the item number, `attach` records it). Six interface changes must land first: `publish` takes full listing content from the public copy; `can: Capabilities` on every adapter; `readAll()` bulk read; `cancelRequested` on `ListingState`; `inbox()` for buyer messages held in memory only; `attach()` plus the handover return. Also `accountId` bound at construction. Order of work: runner against the fake channel (stop file read before each action), then the adapter, then the live test. If identical-units is approved, the interface key moves from `itemId` to a listing key; decide that before writing the adapter.

**Architecture layers** (`architecture.md`): Capture, Understand, Item, Draft, Channel, Pricing, Guards, Audit, plus a missing Run layer (scheduler, heartbeat, push; not built). Hosting now: one Task Scheduler task on Phil's PC while signed in, every 15 minutes, wrapper `scripts/run-engine.ps1` (not built) that mints a 2-hour access token and pipes it to the engine so the refresh token never leaves PowerShell. Alerts: ntfy.sh, one random topic per account, held in Credential Manager. Move to an always-on host when the deletion-notification endpoint is needed (HTTPS required), a second account exists, event-driven alerts are wanted, or heartbeat gaps appear. No host researched. A scheduled cloud agent is ruled out. Decisions A1 to A14 listed with reversal costs; Phil's choices: A2 (one core bundled for the page, recommended), A14 (let eBay hold auto-accept at the floor after the live test), the dry-run thresholds, identical units.

**Tenancy**: `accountId` is in the record and secret target names but not yet in code paths; three small changes recommended now, a gate list before any second account.

**Other code**: `scripts/` holds `lib.ps1` (six secret-store functions, token minting, `Invoke-EbayGet`), setup steps 1.4 to 3.6, `stop.ps1` (stop file `%LOCALAPPDATA%\fixforward\STOP`, cleared only by typing `CLEAR STOP`), `backup.ps1`, `restore.ps1`, `strip-photo-metadata.ps1`, `make-viewing-copies.ps1`, tests in `scripts/tests/`. `tools/` holds `guide-kit`, `private-guard`, `brand`.

## 5. Stock

**The 70 drafted items** (`drafts/`, `drafts/README.md`). Seventy drafts SH-0001 to SH-0070 imported from the sheet. Composition from `valuation.md`: 66 parts records plus four pairs of shoes; the parts are 69 memory modules (some grouped into four kits: Vengeance LPX pair, Dominator Platinum pair, XMS3 triple, Samsung 4 x 4GB server kit) and four graphics cards (two Quadro P620, two FirePro W4100). No draft contains a serial. Each is built from the public copy of its record and checked against every private identifier. 33 items have a sold median of their own (3 or more qualifying sales of the exact part number in the 90 days to 2026-11-07); 37 are "thin comps" for Phil to price. Each median is dated 2026-11-07 and must be refreshed before listing. The nine DDR3/DDR3L modules and four cards are drafted as "For parts or not working". 60 modules are recorded PASS on 2026-11-07 but with no photo; no draft title says "Tested". Ten modules carry an asset sticker (Phil confirmed 2026-11-27 all ten are his to sell). Two shoe items are marked for Vinted in the sheet but drafted for eBay. Four shoe pairs have no sold data.

**RAM/GPU first slice (pilot).** Saturday rehearsal item: inventory ID 12 (SH-0018). Pilot of about 20 items (`roadmap.md` phase 1): the 32GB module (SH-0043), the nine 16GB modules (SH-0046 to SH-0054), five 8GB tier-1 modules, four pairs of shoes, one or two clothing or ornament items. Retest of the 15 pilot modules with MemTest86 and pass-screen photos is the recommendation (about 45 minutes hands-on, 7 hours unattended, estimate). Graphics cards wait for a PC with a free PCIe slot (Needs Phil 12).

**Valuation plan** (`docs/plan/valuation.md`): list in order of week 1 tier 1 (32GB 89 to 104 pounds, nine 16GB at 40 to 43, then 8GB) plus the shoes; weeks 2 and 3 tier 2 priced by hand; then lots; second intake by end of week 4. Numbers in section 3 above. About 1,000 pounds must come from items not yet inventoried.

**Identical units** (`docs/proposals/identical-units.md`, not approved): modules with the same full part number, condition and test result and no flaw go in one fixed-price quantity listing, because eBay UK's duplicate listings policy bars more than one identical fixed-price listing at a time from one seller. Each module keeps its own FF ID, serial, proof and box (`listingGroupId`). 24 tested flawless modules fall into 8 groups; one listing per part number saves about 192 minutes (about 3 hours; 408 versus 216). Pairs are free (buyer buys quantity 2). Until approved, only one module per part number may be listed. Recommended first group: three HMA82GS6JJR8N-VK modules (40.00 pound median). Unverified until live test: private account quantity listing via Inventory API with Simple Delivery. Changes six lines of selling-rules.md and closes open item 5.

**Lots** (`docs/proposals/lots.md`, not approved): fourteen modules in 12 drafts sell under 10 pounds each. Lot A: five untested DDR3L laptop modules (IDs 11, 31, 34, 36, 40), 28GB, suggested 18 pounds, needs the untested-parts proposal. Lot B: five tested DDR3/DDR3L desktop modules (IDs 55, 56, 57, 5, 6), 20GB, suggested 15 pounds. Group C (four untested DDR3 desktop modules, about 7 pounds) skipped. Ten drafts become two listings, saving about 96 minutes, 33 pounds total. Recommendation: approve lot B now, lot A with untested-parts, skip C.

**Other proposals**: `sold-median-method.md` (median = qualifying sales in last 90 days, same part number and condition group, unreliable sales excluded, thin comps = fewer than 3 qualifying sales, Phil's typed price becomes the anchor); `untested-parts.md` (parts that cannot be tested list as "For parts or not working", "Untested" first; worth about 20 to 73 pounds); `claude-md-secrets.md` and `setup-guide-secrets.md` (replace `.env` wording with Credential Manager wording in CLAUDE.md and the published setup guide). All six are unapproved.

## 6. Photo intake design, and photo/packing/parts-testing standards

**Design** (`docs/product/photo-intake-design.md`, built in `engine/src/intake/`; the "Built tonight vs designed" table wins where they differ): a file-backed pipeline with one CLI. Phone photos land in `inbox\` over USB. Code scans, hashes (a photo is its SHA-256, so a second run does nothing), orders by EXIF, makes viewing copies and writes a manifest. The model (a Claude Code session running `/intake`) looks at up to 10 viewing copies at a time and writes one `reading.v1` per photo (transcription only, no record fields, no condition); code regroups at each pre-printed ID label shot, resolves roles (shot-list position can demote a photo but never promote it), links to the matching sheet record, builds the item record with value, confidence, source photo and method per field, schedules the price, drafts from the public copy, strips metadata, files by role, and writes a summary. `reading.v1` is the only thing a model hands to code; a "printed" value must quote text the photo reading transcribed. Phil's approval and answers enter only from his own terminal (`npm run approve -- <ID>` refuses without a real console). Condition is never asserted by the AI; a guessed name, key spec or condition blocks approval. Built for the PC route only; the page route (upload and Claude reading) and a paid API reader are not built. Not built: the outbox file at approval, the label-ID and which-item asks, eight of nine property tests. A cheap model reading a 12-photo item costs about 0.05 US dollars on Sonnet 5.5 (`architecture.md` section 7, `pricing.md`). First real test is Saturday's photos via `docs/testing/intake-first-run.html`.

**Standards, one line each:**
- Photo (`photo-standard.md`): 1 to 24 photos per listing, 500 px minimum (1600 recommended), 12 MB max; nine fixed roles (label, hero, angle, flaw, spec-label public; serial, test-screen, scale, research-screenshot private); two white A1 foam boards plus Phil's own matched lights at 45 degrees, curtains closed; no borders, text, watermarks, logos or contact information in listing photos; serials physically covered with paper, never blurred digitally; strip all metadata except Orientation; JPEG or PNG only (HEIC refused, "Most Compatible" setting).
- Packing (`packing-standard.md`): pack at intake in the final packaging, weigh and measure packed; codes E1 padded envelope 150 x 210 mm (RAM), M1 poly mailer 305 x 405 mm (clothing), B1 box 305 x 229 x 152 mm (cards, ornaments), B2 box 457 x 305 x 178 mm (shoes in own box); every module or card in a static shielding bag with the ID label on it; cereal-card stiffener for RAM; H-seal tape; shake test for boxes; gauge check for large-letter eligibility; B1 may post as medium parcel (UNVERIFIED).
- Parts testing (`parts-testing.md`): "tested" only with a pass, date, test name and stored pass-screen photo; MemTest86 Free (v11.7) for every RAM module, CPU-Z for SPD, GPU-Z plus memtest_vulkan plus FurMark 2 for cards, CrystalDiskInfo for drives; one part at a time, kits tested as kits; machine off and unplugged at the wall, no mains work, never open a power supply, never disconnect a battery.
- Condition (`condition-grading.md`): condition is Phil's call; one agreed word per flaw kind; parts tested map to Used (3000), untested or failed to For parts (7000); clothing and shoes use eBay's New or Pre-owned grades; sizes "about 3 mm" under 1 cm, "about 4 cm" from 1 cm up.
- Titles (`listing-titles.md`): 80 characters, fixed order brand, model, key spec, size, condition; "Tested" only with stored proof.
- Messages (`message-templates.md`): five approved templates verbatim, closed-pattern matching in plain code, everything doubtful to Phil.

## 7. Security (headlines)

`docs/security/threat-model.md` (v1, 2026-11-27, 13 decisions D1 to D13, residual risks R1 to R11):
- **Threat model.** Assets A1 to A12 (refresh token, client secret, seller account, keyset exemption, household privacy, evidence, inventory with serials, ledger, rules and scripts, audit log, stock, Phil's accounts). Actors P1 to P8 (account thief, malware as Phil, sync peer or cloud provider, bad-faith buyer, unattended agent, the unstable PC, Phil himself, household). Likeliest serious loss: eBay sign-in phished or reused, not code.
- **Five things before any secret exists:** take fixforward out of the Syncthing share (`A:\Projects` holds `.stfolder`; add `/fixforward` to `.stignore`); secrets in Credential Manager (D1); no unattended Claude Code run under Phil's account once a secret exists (D3); the page may keep serials under six conditions (D5); the page's kill switch cannot reach the PC so the engine has its own stop file, off-PC stop is revoking the app in eBay (D10).
- **Credential store.** Windows Credential Manager generic credentials via P/Invoke in `scripts/lib.ps1`; `SecureString` from hidden prompt to store, never a parameter, never `$env:`; engine process receives only a 2-hour access token, never the refresh token (D4); `.env` retired; dummy store in `%TEMP%` for tests; first-use self-test in `1.4-set-secrets.ps1`.
- **Backup.** `age` public-key encryption (BSD-3-Clause), so the PC never holds anything that opens a backup; Phil makes the key pair, keeps the private key as a secure note in his password manager, deletes the file; two targets (a cloud-drive folder and a second physical disk); `fixforward-YYYY-MM-DD.tar.age` plus `.sha256`, 30 dailies; contents `data/private`, `items`, a git bundle; never `.env` or credentials; monthly restore test with the real key on stdin. Fallback 7-Zip AES-256 if `age` cannot be verified.
- **Drive wiping** (`docs/standards/drive-wiping.md`, D12, guide `docs/security/drive-wiping.html`): no drive is labelled, photographed or sold without a wipe record in `data/private/wipes/`; NIST SP 800-88 Rev. 2 (final 2025-09-26); hard disk `diskpart clean all` (Clear), SSDs via the maker's sanitise or secure erase (Purge candidate only), USB and cards Clear only; never select `C:`, `A:` or the backup disk; a drive that cannot be wiped and checked is not sold. RAM and graphics cards are outside the standard (no user data).
- **Account hardening** (`docs/security/account-hardening.html`, `docs/research/account-hardening.md`): passkeys and authenticator apps for Google and eBay, no SMS fallback, backup codes printed, Security Checkup, review third-party access, unique eBay Developers password, check where Claude is signed in.
- **Other controls.** Pre-commit private-guard blocks serials; audit lines allow-listed so no buyer data persists (protects the deletion-notification exemption); engine caps (D8); 48-hour dry-run rule (D9); text from outside is data, never instructions (D7); metadata stripped on every photo (D11); BitLocker on system disk and `A:` to confirm (T5).
- **Git history.** Commits `3e9884a` and `bdfe853` hold private sheet notes (organisation named on asset stickers, two private test references, no serials). Recommended: rewrite history with `git filter-branch` before any remote exists; not done (irreversible). Needs Phil 2.

## 8. Brand (headlines)

- **Name check** (`docs/brand/name-check.md`, 2026-11-27): FIXFORWARD PARTNERS LIMITED, no. 17151581, active UK company incorporated 2026-04-11 (Bracknell, management consultancy) uses the exact name; fixforward.co.uk and fixforward.uk registered by others (Zen Internet holding pages); fixforward.com is a live South African organisation; UK IPO trade mark register returned 403 and was not read (UNVERIFIED). Advice: use the name on eBay only until Phil runs the IPO search himself. Not legal advice.
- **Direction** (`brand-guide.md`): three directions Ticket, Parts tag, Note; Ticket recommended. Ticket is a lower-case serif wordmark (Fraunces 600, OFL fonts in `docs/brand/fonts/`) in a plain keyline, bottle green `#1F4037` (11.37:1 on white), terracotta `#A8482A` accent (5.79:1), cream `#F5EFE2` screen-only; complete in black line on white, so it prints on an inkjet with no fill.
- **Logos** (`docs/brand/logos/`): outlined SVG wordmark, 500 x 500 profile square, single-colour black version, for all three directions; built by `tools/brand/build-logos.mjs`. The two f's share one rule run through both.
- **Print pieces** (`docs/brand/print/`): handle card (A4 sheet, 180 x 220 mm card), parcel insert (A6, 105 x 148.5 mm, care and returns), box-front label (63.5 x 38.1 mm, fits the 21-up sheet), parcel label. Original work only.
- **Voice** (`docs/standards/voice-and-tone.md`, `ff-voice`): one private seller, first person singular, warm and plain, no hype words, no emoji, no exclamation marks, no capitals for emphasis. Never "refurbished", "warranty", "professionally tested", "shop", "store", "business", "stock", "customers", "clearance". Technical register for parts, warmer for clothing and ornaments. The name is written `fixforward`, never a speaker ("at fixforward"), no TM or Ltd. "Tested" means date, test name and stored photo.
- **eBay profile** (`docs/brand/ebay-profile.md`): 235-character profile text (limits 1,000 desktop, 500 app), fixed listing footer.
- **Open brand questions**: handle card in listing photos may breach eBay's contact-information and no-logos picture policies (Needs Phil 13, 14).

## 9. Needs Phil (REVIEW.md section 2, numbered as the repo numbers it)

Most important first. Status as read on 2026-11-28 in the working tree.
1. Take fixforward out of the Syncthing share: add `/fixforward` to `A:\Projects\.stignore`, delete copies on other devices. Backups replace what the sync did by accident (threat model D2).
2. Private sheet notes reached git history (`3e9884a`, `bdfe853`, 43 drafts). Options: leave, or rewrite history with `git filter-branch --index-filter "git rm -r --cached --ignore-unmatch drafts" -- --all` then regenerate drafts, clear `refs/original`, expire reflog, `git gc --prune=now`. Recommend rewrite before any remote.
3. Order the basket, 85.96 pounds from four suppliers; confirm Dataman's bag price and delivery (12.02 pounds, unconfirmed) before paying.
4. Inventory page floor rounding: floor rounded down to 50p breaches the 80% rule (19.99 pound median shows 15.50 not 16.00). Recommend floor = 80% rounded up to the penny; displayed prices round down to 50p, never below floor. Code already does this; `docs/project/inventory.md` and the page source were edited after the run (uncommitted), but the live artifact is maintained by Claude in the fixforward project.
5. Switch off eBay's own automatic offers to watchers before the first listing (risk K3), in Seller Hub at the live test.
6. Test proof for the 60 modules already tested: retest the 15 pilot modules with MemTest86 and photograph the pass screen (about 45 minutes hands-on, 7 hours unattended), the other 45 at their own intake.
7. Approve or reject the six proposals in `docs/proposals/`; identical units and the sold-median method matter most.
8. DONE (Phil, 2026-11-27): all ten asset-stickered modules are his to sell. Leave stickers on, photograph the label as is, describe the sticker as a flaw.
9. Before any real secret exists: make the `age` key pair, store the private key in the password manager, put the public key and two target folders in `%LOCALAPPDATA%\fixforward\backup.config.json`; confirm BitLocker on system disk and `A:`.
10. No unattended Claude Code run under Phil's Windows account once step 1.4 has run (threat model D3); attended only, or a second Windows account.
11. Four engine interpretations to confirm: (1) current floor read as the next step's price, 80% at the last step; (2) a Best Offer restarts the clock for the full stale window; (3) stale clock paused out of season using proposed months in `rules.json` (needs Phil's months); (4) away mode stops auto-accept, watcher and counter-offers, so all offers go to Phil. Recommend accept all four.
12. Graphics cards are untested (sheet's Tested column blank); need a PC with a free PCIe slot and a monitor.
13. Handle card in listing photos: rules require it, eBay's contact-information policy and picture policy may object. Options: keep, drop to a private shot, ask eBay. Recommend keep with drop as fallback.
14. Choose the brand direction; recommend Ticket.
15. The name: exact-name UK company exists; run the UK IPO trade mark search before printing in volume.
16. Two shoe items marked Vinted in the sheet (Hunter boots, HOKA mules) drafted for eBay; recommend eBay now; HOKA mules need an answer on whether worn.
17. Backdrop: recommend four white A1 foam boards (16.95 pounds delivered) over a bedsheet or waiting for a sold-out tent.
18. What Phil owns for the buying list: kitchen scale (1 g steps to 5 kg; if none add 11.99 pounds, total 97.95), two matching lights and their make, phone tripod or holder, masking tape.
19. Phone and printer models (some Epsons print the top and bottom 4 cm at lower quality; a few phone settings vary by model).

## 10. Not done (REVIEW.md section 5)

- T8, mostly. Done: `parts-testing.md`, `packing-standard.md`, `message-templates.md`. Not done: measurements, clothing prep, storage and labels, restricted items, data and privacy standards; the intake-session, parts-testing, listing, sale-to-post, returns and away-mode guides; buying lists for 100 and 300 items; `docs/compliance/`; live-test, dry-run-week and pilot test plans.
- No real eBay, photo, credential or encryption run, by the brief's boundaries.
- Parts of the intake design: the outbox file at approval, the label-ID and which-item asks, eight of nine property tests.
- No type checker has run over the TypeScript (`tsc` not installed).
- T5 and T7 had no critic review (the brief required one only for T1 to T4 and brand).
- Viewing-copy rotation untested.
- Open critic findings: T1 round 2 left 17 minor defects unfixed; six round-1 majors partly fixed and the last pass not re-reviewed (`docs/reviews/`).
- Unverified items (REVIEW.md section 4): `.env` dummy values; real Credential Manager calls; real `age` round trip; whether eBay's refresh-token request needs a `scope`; Dataman price; Labels4u VAT; card sizes; B1 and B2 box dimensions and whether B1 posts as small parcel; label sheet geometry (15.15 mm top, 7.25 mm side, 66 mm pitch); whether Product research needs an active listing or shows an average rather than a median; handle card under eBay policy; centimetre limits for small parcel; phone menu paths.
- Agents ran as stand-ins during the run because `.claude/agents/` loads at session start; callable by name from the next session.

## 11. DropShipAuto

The repo says nothing about DropShipAuto. A case-insensitive search for "dropship" across all markdown, JSON, TypeScript and PowerShell outside `data/private` found no mention. Nothing to reuse by the repo's own statement. The nearest reusable ideas are generic and from this repo: the guard-gate plus audit-log pattern, the Channel interface with a fake, absolute keyed idempotent actions, and the public-copy/private-object split; all are in `engine/src/` and `docs/product/architecture.md`.

Related to Mycelium: the repo names Mycelium in four places. `selling-rules.md` open item 3 (long-term home "its own app, or a Mycelium module", with tenant-separated data, a restricted role for the selling engine, and row-level security from the start); `live-test-setup.md` known gap ("checklist state lives in the guide artifact's database, not in Mycelium's database"); `ebay-api-check.md` (away switch described as "the Mycelium switch"); `OVERNIGHT.md` boundary 6 (agents must not touch `A:\Projects\Mycelium`). Open decisions place "own app or Mycelium module" after horizon 1 pays.

## 12. Doc file index

Paths relative to `A:\Projects\fixforward`.

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Hard rules, conventions, status on 2026-11-28, next terminal tasks |
| `REVIEW.md` | Morning review: summary, 19 Needs Phil items, decisions made, unverified, not done, critic leftovers, proposals, order, tokens, file map |
| `OVERNIGHT.md` | Brief for the 2026-11-27 unattended run: standard, boundaries, agents, tasks T0 to T8 |
| `PROGRESS.md` | Task checklist of the overnight run |
| `docs/project/selling-rules.md` | v1.5 selling rules, source of truth for behaviour |
| `docs/project/product-spec.md` | What is built and why (v1, 2026-11-27), eight-layer design, decisions |
| `docs/project/ebay-api-check.md` | What eBay's API can and cannot do for a UK private seller; first live test |
| `docs/project/live-test-setup.md` | Setup guide pointer, answer keys, findings on Simple Delivery, local folder contents |
| `docs/project/inventory.md` | Interim inventory page (artifact) fields, statuses, floor arithmetic |
| `docs/plan/roadmap.md` | Phases 0 to 6, live-test fork, dates |
| `docs/plan/time-budget.md` | Minutes per step per category, hours available, 3 versus 5 hours a week |
| `docs/plan/risk-register.md` | 30 risks with likelihood, impact, owner, control, trigger |
| `docs/plan/open-decisions.md` | Decisions by due date |
| `docs/plan/business-case.md` | Private versus business fees and obligations |
| `docs/plan/valuation.md` | Stock value, tiers, listing order, hours |
| `docs/product/architecture.md` | Layers, tenancy, channel interface changes, eBay adapters, hosting, decisions A1 to A14 |
| `docs/product/item-record.md` | item.v1 record design and rules |
| `docs/product/photo-intake-design.md` | Intake pipeline design with built-versus-designed table |
| `docs/product/customers.md` | Who a photo-first tool could win with (nobody yet) |
| `docs/product/competitors.md` | eBay's free tools and paid cross-listers |
| `docs/product/pricing.md` | AI cost per item, per-item-sold pricing model if ever sold |
| `docs/product/channels.md` | Which marketplaces have a usable API (only eBay) |
| `docs/proposals/identical-units.md` | Quantity listings per part number |
| `docs/proposals/lots.md` | Lots A and B, group C skipped |
| `docs/proposals/sold-median-method.md` | 90 days, 3 sales, thin comps |
| `docs/proposals/untested-parts.md` | List untested parts as For parts or not working |
| `docs/proposals/claude-md-secrets.md` | New CLAUDE.md wording for Credential Manager |
| `docs/proposals/setup-guide-secrets.md` | New setup-guide wording for Credential Manager |
| `docs/security/threat-model.md` | Assets, actors, threats T1 to T43, decisions D1 to D13, secret store spec |
| `docs/security/secret-store-build-notes.md` | Where the build differs from the threat model |
| `docs/security/account-hardening.html` | Guide: secure Google, eBay, eBay Developers, Claude sign-ins |
| `docs/security/drive-wiping.html` | Guide: wipe a drive before sale |
| `docs/standards/photo-standard.md` | Roles, set, limits, phone settings |
| `docs/standards/packing-standard.md` | Packaging codes and packing by category |
| `docs/standards/parts-testing.md` | Test tools and what counts as a pass |
| `docs/standards/condition-grading.md` | eBay condition mapping and flaw words |
| `docs/standards/item-specifics.md` | Item specifics by category |
| `docs/standards/listing-titles.md` | Title templates and 80-character rule |
| `docs/standards/listing-descriptions.md` | Five fixed sections |
| `docs/standards/message-templates.md` | Approved buyer replies and routing |
| `docs/standards/voice-and-tone.md` | Voice rules, word lists, tested wording, footer |
| `docs/standards/drive-wiping.md` | Wipe method per drive type, wipe record |
| `docs/brand/brand-guide.md` | Three directions, Ticket recommended, palette, type |
| `docs/brand/name-check.md` | UK company, domain and register search for the name |
| `docs/brand/ebay-profile.md` | Profile text and listing footer with eBay limits |
| `docs/brand/logos/README.md` | Logo files and how they are built |
| `docs/brand/print/*.html` | Handle card, parcel insert, box-front label, parcel label |
| `docs/brand/fonts/README.md` | Free-licence fonts |
| `docs/buying/weekend-under-100.md` (and `.csv`) | 85.96 pound basket with suppliers and prices |
| `docs/guides/weekend-first-item.html` | Saturday start to finish |
| `docs/guides/photo-setup.html` | Photo set and repeatability |
| `docs/guides/label-printing.html` | Inkjet 21-up label printing |
| `docs/guides/print/label-alignment-test.html` | Alignment test page |
| `docs/testing/intake-first-run.html` | How Phil runs the intake on real photos |
| `docs/reference/ebay-api-setup-guide.html` | The published live-test setup guide |
| `docs/reference/inventory-page.html` | Copy of the inventory page source |
| `docs/research/ebay-listing-facts.md` | Title, specifics, condition, description limits |
| `docs/research/fees-and-obligations.md` | eBay UK fees, HMRC reporting |
| `docs/research/product-market.md` | Market research for horizon 3 |
| `docs/research/product-research-access.md` | Product research (Terapeak) access and data range |
| `docs/research/channels.md` | Marketplace API research |
| `docs/research/photo-rules-and-phones.md` | eBay photo rules and phone settings |
| `docs/research/label-printing.md` | 21-up label geometry and inkjet |
| `docs/research/weekend-kit.md` | Basket research, four rounds |
| `docs/research/push-alerts.md` | Free push options (ntfy recommended) |
| `docs/research/account-hardening.md` | Second factors and sessions |
| `docs/research/drive-wiping.md` | NIST 800-88 Rev. 2 reading and tools |
| `docs/reviews/*.md` | Critic reports: t1 (two rounds), t2 (two rounds), t3, t4, brand |
| `docs/_superseded/` | Replaced shot lists, packaging list, handle card, logo drafts |
| `drafts/README.md` and `drafts/SH-00NN-*.md` | Index and the 70 listing drafts |
| `.claude/agents/ff-{scout,researcher,architect,voice,critic}.md` | Five agents on haiku, sonnet, fable, fable, fable |
| `.claude/commands/intake.md` | The `/intake` command |
