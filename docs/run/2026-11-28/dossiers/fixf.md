# Dossier: E.fixf, FixForward (project FIXF)

*Written 2026-11-28 for the run's ticket stream. Sources: the plan §5, `digests/fixforward.md`, `digests/fixforward-repo.md`, the FixForward repo's `docs/plan/roadmap.md` and `docs/plan/risk-register.md` (read-only), and web research on the dates shown. Nothing was run in the FixForward repo, nothing touched eBay.*

## 1. What Phil decided

FixForward is both: selling his and the household's own used items now, and later buying faulty items to repair and resell, growing "1 and 2 into 3" (clear his stuff, then steady side income, then a business), on 2 to 5 hours a week. It sells through his existing personal eBay UK account (`fixforward`, private seller). The first slice is one item from inventory record to live listing (the RAM and GPU batch, rehearsal item ID 12, SH-0018), and until that slice ships FixForward is the only venture (H6). Every listing is drafted and he approves it; he sets every price and sold data is guidance only; unsold listings get a suggested drop he approves; buying is alert only, never bids or buys, and only when expected profit clears a per-category bar he sets; offers at or above his floor auto-accept and lower ones come to him with a suggested counter; common buyer questions are auto-answered from templates; postage labels are prepared and bought when he confirms. It runs on the PC worker with the free cloud tier receiving eBay's notifications, keeps its data in tables inside Mycelium's database (own prefix, deny-all plus service_role RLS, one migrations owner), shows on a Mycelium page with Telegram for approvals, uses the PC model first and cloud inside the existing £5 monthly cap. A trading-rules research ticket comes before any buying automation. His answer on market data was "official eBay APIs, plus scraping where they fall short"; the repo's own hard rule forbids scraping, so `fixf.03` records the cautious version for him to overturn. Two `[claude]` flags are carried, not reopened: the employment contract's side-work terms (into `fixf.01`) and the medical display's ownership (`fixf.02`).

## 2. His kit and constraints

- **eBay:** UK private seller account `fixforward`; Simple Delivery on (prepaid labels); business policies FF-Standard, FF-Returns-30 and FF-Payment being made by hand in Seller Hub; "Send automated offers" to be confirmed off (risk K3). New-device sign-in alerts Nov 2025 to Jul 2026 were all Phil (H2.12); the eBay password and two-factor sign-in are done in the email migration's High rows (`mail.22`) before automation touches the account.
- **eBay developer programme:** registration submitted 2026-11-26, pending on 2026-11-28; no keys, no token, nothing has ever called eBay.
- **The repo** `A:\Projects\fixforward`: local only, no remote, last commit `b989a9f`; standards, guides, 70 drafts (SH-0001 to SH-0070), an engine with 203 tests on fake data, secret store in Windows Credential Manager (`scripts/lib.ps1`, real calls never run), stop file, encrypted backup (never run for real), setup scripts 1.4, 1.5, 2.4, 2.5, 3.6. Windows PowerShell 5.1, Node 26.
- **Stock:** 69 memory modules (60 recorded PASS on 2026-11-07 with no pass photo), four graphics cards (untested, need a PC with a free PCIe slot), four pairs of shoes, ten asset-stickered modules confirmed his (2026-11-27). Central valuation £1,497.25 against a £2,500 target in three months to 2027-02-26; the Valuation tab runs 20 to 30% low on the two checks made; 32 sold-listing searches still to run. Spare drives to be wiped by secure erase before any sale.
- **Money:** £0 a month running cost, under £100 of kit; the basket is £85.96 (£97.95 if no kitchen scale).
- **Mycelium side:** Supabase hosted, Vercel Hobby (no sub-daily cron), Telegram bot, the PC worker, the £5 monthly AI cap.
- **Rules that bind everything here** (repo CLAUDE.md): official API only, never drive, script, scrape or fetch the eBay site or Seller Hub; never print, log or commit a secret; nothing changes on the live account without Phil's yes to that action; no buyer data on disk or in any database; never below floor; do not change `selling-rules.md` without Phil; no automation on Vinted.

## 3. What the research found

### 3.1 eBay developer programme, keysets and tokens
- eBay's own guide says developer account approval takes "approximately 1 business day" after the registration form [1] (checked 2026-11-28). Phil's registration has been pending since 2026-11-26 (Thursday 2026-11-26 to Saturday 2026-11-28 is one working day, so still within the estimate; by Tuesday 2026-12-01 it would be well past it).
- Community posts describe registrations auto-rejected for "problems with the data provided or other irregularities" and others stuck in review for five or more days with no reply to the support form [2][3] (forum, not authoritative; checked 2026-11-28). The route when stuck is the Developer Account Support form.
- Two keyset types: **Sandbox** (fictional money) and **Production** (real users and listings). Each holds an App ID (client ID), a Dev ID and a Cert ID (client secret; it acts like a password and can be reset) [1] (checked 2026-11-28).
- **Before a Production keyset works** the developer must subscribe to, or opt out of, eBay's marketplace account deletion and closure notifications; until then the keyset shows "Your Keyset is currently disabled" with a link to the compliance step [1][4] (checked 2026-11-28). The repo plans the opt-out (exemption), which is honest only while no eBay user data is persisted (repo hard rule 4).
- User tokens use the authorization code grant: the code is exchanged using the application's **RuName** as the redirect value; the access token lasts 7,200 seconds (2 hours) and the refresh token's sample lifetime is 47,304,000 seconds (about 18 months); if the refresh token is revoked or expires, the consent flow is redone [5][6] (checked 2026-11-28; the 18 months is from eBay's samples, not a stated policy, so UNVERIFIED as a guarantee). This matches the repo's design (engine gets only a 2-hour access token).
- Restricted APIs and higher call limits need the free **Application Growth Check** [1] (checked 2026-11-28).

### 3.2 Inventory API versus Trading API for a private seller
- The Inventory API requires the seller account to be opted in to **business policies**; every offer references payment, fulfilment and return policy IDs, and all Inventory API listings are immediate payment [7][8] (checked 2026-11-28).
- An active listing created with the Inventory model **cannot** be revised with Trading `ReviseFixedPriceItem` or `ReviseItem`; it must be revised through the Inventory API [9] (checked 2026-11-28). The restriction is stated in that direction only: a listing made by hand on the site is a classic listing, and the Trading revise calls are the documented route for classic listings [10]. That answers most of the repo's open question for outcome B (whether a hand-made listing can be repriced with `ReviseFixedPriceItem`): the documentation says yes in principle; the live account still has to show it (UNVERIFIED in practice).
- `bulkMigrateListings` can convert up to five classic listings at a time into Inventory API objects, but only if each is fixed price, Good 'Til Cancelled, uses business policies, has a seller SKU and is tracked by item ID [11] (checked 2026-11-28). Whether migration can be undone is not stated. This is a second outcome B route the repo has not listed; it is a one-way step until shown otherwise.
- Revision limit per listing per day is given as 250 in one place and 150 in another on eBay's own reference [9]; irrelevant at one price change per item per day (the engine's cap).
- Marketplace Insights (sold items for 90 days) is **limited release**, only for developers approved by eBay business units [12] (checked 2026-11-28). Sold medians therefore cannot come from the API for this account, as the repo says.

### 3.3 Simple Delivery and the buyer protection fee
- Simple Delivery is "the only delivery method available for private sellers who list eligible items" on eBay.co.uk; items up to £750 (some electronics over £300 excluded); carriers EVRi, Royal Mail and InPost; labels valid 7 days; seller chooses buyer pays or free postage [13] (checked 2026-11-28).
- Opt-out (custom postage) exists only for certain categories priced at £20 or under, typically letter or large-letter items of 100 g or less [13] (checked 2026-11-28). ID 12 starts at £21.50, so it would not qualify; cheaper modules might. Not for this run to decide.
- eBay's help page does not mention APIs or business policies [13]. A forum reply reports eBay telling a tool maker that Simple Delivery would not be added to the API and that business policies override it when listing through the API [14] (forum, UNVERIFIED); an open developer thread asks the same question unanswered [15]. Business policies are no longer reachable in the eBay app for private sellers since 7 April 2025, only on desktop or mobile browser [14] (forum, UNVERIFIED). The live test (`fixf.12`) is still the only way to know; the repo's fork stands.
- **Buyer protection fee** (paid by the buyer on UK private seller listings, built into the displayed price, postage excluded): £0.10 flat per item plus 7% of the price up to £20, 4% of the part from £20 to £300, 2% of the part from £300 to £4,000, nothing above £4,000 [16] (checked 2026-11-28). The repo's business case quotes the first two bands only; the 2% band matters for nothing in today's stock but would for the medical display.
- Private sellers pay no final value fee and no regulatory operating fee (vehicles excepted) [17] (checked 2026-11-28).

### 3.4 HMRC digital platform reporting
- eBay's UK help page states the thresholds for UK residents as **£1,707 or more** in total sales after fees, or **30 or more** sales (cancelled ones excluded), measured per calendar year; eBay reports each January, broken down by quarter [18] (checked 2026-11-28). GOV.UK rounds the euro threshold to "roughly £1,700" [19].
- eBay collects full name, address, National Insurance number (and VAT number if any) and reports the payout bank account; a banner and email ask for the details once a threshold is met; not supplying them can mean **payout holds or selling blocks**, and the details are refreshed every 36 months with a 30-day window [18] (checked 2026-11-28).
- eBay says the reporting does not change existing tax obligations, and whether someone trades is not decided by reaching the thresholds [20] (checked 2026-11-28).

### 3.5 The trading allowance and personal possessions
- HMRC: selling personal possessions (things bought for your own use) usually means no Income Tax; buying things to resell can be trading [21][22] (checked 2026-11-28). Capital Gains Tax may arise on a single item sold for more than £6,000 [22].
- The **trading allowance is £1,000** a year (gross income, 6 April to 5 April) today. GOV.UK's policy paper of 28 October 2026 raises it to **£3,000 from 6 April 2027** (tax year 2027 to 2028), with the self-assessment reporting threshold for trading income rising with it [23][24] (checked 2026-11-28; seen via the policy paper's title and summary and two professional bodies, the full page not read, so the detail is partly UNVERIFIED).
- **Employment contract side-work:** no general research answers this; only Phil's own contract does. The ticket asks him to read its exclusivity, conflict-of-interest and outside-work clauses, and his employer's handbook if the contract refers to one.

### 3.6 When eBay expects a business account
- eBay's business seller policy: a seller is a business if they "sell items they have bought to resell", "make items in order to sell them" or "buy items for their business"; breaches can mean listing removal, warning, restrictions or suspension [25] (checked 2026-11-28). Seller Centre adds "large quantities" [26].
- The trigger is buying to resell, not turnover. Phil's answer 3.1 (buying faulty items to repair and resell) and 3.15 (buy alerts) are exactly that trigger. The repo already says: register as a business only when buying or repairing to sell starts. Business fees on £2,500 would be about £350.51 (repo `business-case.md`, checked by the repo 2026-11-27).

### 3.7 Royal Mail Tracked 48 today
- Royal Mail's online price table shows Tracked 48 **small parcel up to 2 kg at £3.65 online** and **large letter at £2.85 online**, from 7 April 2026 [27][28] (checked 2026-11-28, from Royal Mail's pages as returned by search; both pages refused a direct read, so UNVERIFIED in detail). Royal Mail's 2026 prices page also mentions changes to barcoded large letters from 5 October 2026 and a revised online guide; the new figures were not found (UNVERIFIED).
- eBay's announcement for 7 April 2026 says Tracked 48 parcels rose by up to £0.55 an item on eBay labels [29] (checked 2026-11-28).
- Under Simple Delivery the label price is eBay's own; the £3.95 in the repo's FF-Standard policy is a policy value that Simple Delivery may override. The buyer view at the live test settles which price shows.

## 4. Risks

| Risk | What could happen | Mitigation the tickets carry |
|---|---|---|
| Account suspension from scraping | eBay restricts or suspends the account he sells through; lost sales and feedback | `fixf.03` records official API only; sold data is Phil's own Product research screenshot or typed figure (`fixf.31`); the hard rules repeat on every eBay ticket |
| Business-seller breach | Buying to resell on a private account breaches eBay's business seller policy | `fixf.01` before `fixf.23` (buy alerts) and before repairs of bought items (`fixf.24`); stock stays household belongings until Phil decides |
| Below-floor offer from eBay's own automatic offers (K3) | An offer goes out under a stepped-down floor, outside the engine's guard | `fixf.05` confirms "Send automated offers" off; `fixf.12` checks again at the live test |
| Floor rounding (K1) | The inventory page shows floors under 80% of median | `fixf.08` commits the fix before anything reads a floor |
| Keyset exemption broken by persisted buyer data | The deletion-notification exemption becomes false; compliance problem | No buyer data stored anywhere (`fixf.14` schema has no buyer column; audit allow-list); repeated on `fixf.17` to `fixf.22`, `fixf.27` |
| Secret leak | Cert ID or refresh token printed, logged or synced | Secrets only in Credential Manager via the repo's scripts with hidden prompts; Syncthing exclusion first (`fixf.08`); no secret in any ticket field |
| Token invalidated by the password change | Rotating the eBay password in `mail.22` after the token exchange may revoke the user token (UNVERIFIED) and force a redo | `fixf.11` waits for `mail.22` (see §5) |
| Lock-out | Two-factor set up without backup codes, eBay sign-in lost | Belongs to `mail.22`; `fixf.11` and `fixf.12` wait for it |
| Data loss: git history rewrite | `git filter-branch` is irreversible; wrong filter loses drafts | `fixf.08` makes it Phil's explicit yes, after a backup bundle; drafts are regenerated from records |
| Data loss: drive wipe on the wrong disk | `clean all` on C:, A: or the backup disk | `fixf.29` names the three disks never to select and asks for the disk number to be read twice; irreversible marking |
| Money | Basket bought and unused; postage bought before a sale confirms | `fixf.06` waits for Phil; `fixf.22` buys a label only on his confirm |
| Payout hold | After 30 sales or £1,707 eBay asks for the NI number; not answering can hold payouts | `fixf.01` notes it; `fixf.33` reports the count |
| Employer conflict | Side work outside the contract's terms | `fixf.01` asks Phil to read his contract before buying automation |
| Selling what is not his | The medical display may belong to an employer or a trust | `fixf.02`: written confirmation before it enters inventory |
| Kirsty-facing | Household items sold that she counts as hers; private inventory copied to her devices through Syncthing | Ledger records each item's owner (repo); Syncthing exclusion in `fixf.08` |

## 5. Facts that differ from the plan

- **fixf.01 and fin.26 (trading allowance):** the plan and the repo's `business-case.md` say £1,000 a year. GOV.UK's policy paper (28 October 2026) raises it to £3,000 from 6 April 2027 [23]. The 2027 to 2028 tax year (most of FixForward's scale-up) falls under £3,000. The repo's business case should be refreshed by Phil.
- **fixf.01 (reporting threshold):** the plan's wording "about 2,000 euros" is now stated by eBay UK as £1,707 after fees for UK residents [18]. Same rule, different figure.
- **fixf.11 (order):** the plan has it after `fixf.04` and `fixf.05` only. Rotating the eBay password in `mail.22` after the user token is minted may revoke the token (UNVERIFIED), and H2.12 says the password and 2FA are done before automation touches the account. The ticket file adds `after mail.22`; the integrator should keep or drop it.
- **fixf.24 (repairs per item):** plan deps are `fixf.16` only. Repairing items bought to resell is eBay's business-seller trigger [25]; the ticket file adds `after fixf.01` so repairs of bought items wait for the trading-rules answer. Repairs of his own items are not affected.
- **fixf.31 (32 sold-listing searches, 2 points):** at about 2 minutes a search including the screenshot and the typed figure, 32 searches are about four 15-minute sittings, not two. The guide is written as four phases; points left at the plan's 2 for the integrator to adjust.
- **fixf.13 (outcome B by 2026-12-11):** the date is in the title but not in §0.1, so `due` is null. The integrator may want it dated, since the repo calls it a protected date.
- **fixf.13 (outcome B detail):** the repo lists repricing a hand-made listing through Trading `ReviseFixedPriceItem` as unverified. eBay's reference restricts Trading revise calls only on Inventory-model listings [9], so hand-made (classic) listings should be revisable through Trading; and `bulkMigrateListings` is a second route if the listing is fixed price, Good 'Til Cancelled, with business policies and a SKU [11]. Both still need the live account to show it.
- **Repo `live-test-setup.md` (Simple Delivery carriers):** the repo lists DHL, Evri, InPost and Royal Mail; eBay's help page on 2026-11-28 lists EVRi, Royal Mail and InPost [13]. Minor; it does not change any ticket.
- **Repo business case (buyer protection fee):** quotes 7% to £20 and 4% from £20 to £300; eBay's page adds 2% from £300 to £4,000 and nothing above [16]. Matters only for the medical display (`fixf.02`).
- **fixf.04 (approval time):** eBay's stated approval time is about one business day [1]; the repo calls it UNVERIFIED. If still pending by Tuesday 2026-12-01, the support form is the route; the plan does not mention the Production keyset's deletion-notification compliance step, which the ticket now includes.
- **fixf.05 (where to make policies):** business policies are reportedly no longer available in the eBay app for private sellers since April 2025 [14] (forum); the guide says desktop browser.
- **Royal Mail:** the repo's FF-Standard uses £3.95 for Tracked 48; Royal Mail's online price is £3.65 for a small parcel and £2.85 for a large letter since 7 April 2026 [27][28]. Under Simple Delivery eBay sets the label price, so the policy figure may never show. No plan line changes; noted for `fixf.05` and `fixf.12`.
- **Question for Phil (not decided here):** whether to opt out of the marketplace account deletion notifications (exemption, the repo's plan) or subscribe with an HTTPS endpoint later. The exemption is only honest while nothing is persisted; `fixf.14` puts FixForward tables in Mycelium, which must hold no eBay user data for the exemption to stay true. The ticket writes the cautious version (exemption, nothing persisted).

## 6. Sources

1. https://developer.ebay.com/develop/guides/get-started-with-ebay-apis , eBay Developers Program, Get started with eBay APIs (checked 2026-11-28)
2. https://community.ebay.com/forum/ebay-developers-program-57950/topic/established-seller-developer-program-registration-auto-rejected-twice-requesting-manual-review-469862/ , eBay developer forum, registration auto-rejected twice (checked 2026-11-28)
3. https://community.ebay.com/forum/ebay-developers-program-57950/topic/developer-program-registration-stuck-in-review-for-5-days-support-form-submitted-no-response-479600/ , eBay developer forum, registration stuck in review (checked 2026-11-28)
4. https://community.ebay.com/forum/ebay-developers-program-57950/topic/new-keyset-disabled-as-non-compliant-requesting-exemption-474102/ , eBay developer forum, new keyset disabled as non-compliant (checked 2026-11-28)
5. https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html , eBay, The authorization code grant flow (checked 2026-11-28)
6. https://developer.ebay.com/api-docs/static/oauth-refresh-token-request.html , eBay, Refreshing a user access token (checked 2026-11-28)
7. https://developer.ebay.com/api-docs/sell/inventory/overview.html , eBay, Inventory API overview (checked 2026-11-28)
8. https://developer.ebay.com/develop/guides-v2/listing-creation , eBay, Listing creation guide (checked 2026-11-28)
9. https://developer.ebay.com/devzone/xml/docs/reference/ebay/ReviseFixedPriceItem.html , eBay Trading API, ReviseFixedPriceItem (checked 2026-11-28)
10. https://developer.ebay.com/develop/guides/listing-management , eBay, Listing management guide (checked 2026-11-28)
11. https://developer.ebay.com/api-docs/sell/static/inventory/migrating-listings.html , eBay, Migrating listings to the Inventory API (checked 2026-11-28)
12. https://developer.ebay.com/api-docs/buy/marketplace-insights/overview.html , eBay, Marketplace Insights API overview (checked 2026-11-28)
13. https://www.ebay.co.uk/help/selling/posting-items/setting-postage-options/simple-delivery?id=5575 , eBay UK help, Simple Delivery (checked 2026-11-28)
14. https://community.ebay.co.uk/t5/Seller-Central/Business-Policies-for-Private-Sellers-and-Simple-Delivery/m-p/7892179 , eBay UK community, Business policies for private sellers and Simple Delivery (forum; checked 2026-11-28)
15. https://community.ebay.com/t5/Traditional-APIs-Selling/Simple-Delivery-via-Trading-API-UK-private-sellers-automatic-or/td-p/35281753 , eBay developer forum, Simple Delivery via Trading API (checked 2026-11-28)
16. https://ebay.co.uk/help/buying/paying-items/buyer-protection-fee?id=5594 , eBay UK help, Buyer Protection fee (checked 2026-11-28)
17. https://www.ebay.co.uk/help/selling/fees-credits-invoices/selling-fees?id=4364 , eBay UK help, Selling fees (checked 2026-11-28)
18. https://www.ebay.co.uk/help/account/regulatory/sales-reporting/uk-digital-sales-reporting?id=5454 , eBay UK help, UK digital sales reporting (checked 2026-11-28)
19. https://www.gov.uk/guidance/selling-goods-or-services-on-a-digital-platform , GOV.UK, Selling goods or services on a digital platform (checked 2026-11-28)
20. https://www.ebay.co.uk/sellercentre/selling/selling-online-and-hmrc , eBay Seller Centre, Selling online and HMRC (checked 2026-11-28)
21. https://www.gov.uk/guidance/check-if-you-need-to-tell-hmrc-about-your-income-from-online-platforms , GOV.UK, Check if you need to tell HMRC about income from online platforms (checked 2026-11-28)
22. https://taxhelpforhustles.campaign.gov.uk/buying-or-making-things-to-sell-and-online-selling-tax-rules , HMRC campaign, Buying or making things to sell (checked 2026-11-28)
23. https://www.gov.uk/government/publications/income-tax-increasing-the-trading-allowance/increasing-the-trading-allowance , GOV.UK policy paper, Increasing the trading allowance (checked 2026-11-28; summary only)
24. https://www.accaglobal.com/gb/en/technical-activities/technical-resources-search/2026/October/Trading-and-miscellaneous-allowance-triples.html , ACCA, Trading and miscellaneous allowance triples (checked 2026-11-28)
25. https://www.ebay.co.uk/help/policies/selling-policies/selling-practices-policy/business-seller-policy?id=4710 , eBay UK, Business seller policy (checked 2026-11-28)
26. https://www.ebay.co.uk/sellercentre/selling/start-selling/create-ebay-business-account , eBay Seller Centre, Create an eBay business account (checked 2026-11-28)
27. https://www.royalmail.com/sending/uk/tracked-48 , Royal Mail, Tracked 48 (checked 2026-11-28; page refused a direct read, figures from search)
28. https://www.royalmail.com/current-postage-prices/online-parcel-price-reduction , Royal Mail, Online parcel prices (checked 2026-11-28; page refused a direct read, figures from search)
29. https://community.ebay.co.uk/t5/Announcements/Royal-Mail-Tariff-Changes-7th-April-2026/ba-p/8008432 , eBay UK announcement, Royal Mail tariff changes 7 April 2026 (checked 2026-11-28)
30. https://www.royalmail.com/prices2026 , Royal Mail, Prices 2026 (checked 2026-11-28; via search)
