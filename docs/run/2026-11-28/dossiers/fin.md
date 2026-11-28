# Dossier: E.fin, Finance (MYC)

*Written 2026-11-28 for the run's Stream T. Information and options only, never financial advice: every money ticket in this epic lays out what exists and what the rules are, and Phil decides. Sources are numbered in section 6; each was checked on 2026-11-28.*

## 1. What Phil decided

Finance has four aims at once: know where the money goes each month, stop overspending, clear what he owes, and build savings and investments. All four reasons he stopped using Finance apply (stale data, never opened, no budget, avoids looking), so the first step is a single sitting with Claude going through it with him, one screen at a time. The data comes from the Enable Banking feed only, with no monthly exports meanwhile, so MYC-195 (the sign-up and the coverage check for Halifax, Revolut and AMEX) gates everything that reads transactions. The method is "every pound a job" each payday, with a budget month that runs payday to payday from the 16th; Mycelium proposes the whole plan, he adjusts and accepts. A daily money line goes into the morning briefing in the Boys' voice, blunt, with a traffic light, and an overspent day is called out. A fixed personal spending amount each payday, with anything unspent swept to what he owes or to savings. No-spend days are counted per week with no streak. Named pots (car, home repairs, Christmas, baby, holidays), bank pots and vaults tracked separately. What he owes: both payoff orders laid out, he chooses; the five-year picture is owing nothing with six months set aside, which orders the work as debt, then a three-month safety net, then investing. Shared costs with Kirsty have not been discussed: a ticket for the two of them, a household budget before she moves in, a no-figures headline for her decided then. No mortgage. Net worth moves fully into Mycelium and the Google Sheet is retired. Receipts: yes, everything. Alerts inside the three-a-day budget: a payday summary and budget prompt, a warning when a balance will not cover upcoming bills, a weekly digest. Credit reports quarterly across the three agencies. Research tickets (information, not advice) for pension, investing, child money, protection and tax on side income. Round 3 adds a Copilot Money ticket, the renewals list, and a ventures page across all ventures with a red, amber, green verdict. Done means three paydays budgeted and kept to.

## 2. His kit and constraints

- **Banks and cards:** Halifax (current account), Revolut, American Express, PayPal. The per-bank CSV parsers in the repo are frozen; feeds land in the same `bank_transactions` shape with de-duplication against CSV rows (`claude/backlog.md`, Finance auto-import).
- **What is already built (Stream F, MYC-188, awaiting Phil's live checks in MYC-193 chunks 14 and 15):**
  - Finance, Bills (0173): recurring payments worked out from the transactions each time (cadence, amount, next expected, price rises, forgotten subscriptions first); keep, cancel and not-a-bill marks are the only stored state.
  - Finance, Budget (0173): a month per category, edited in place, compared up to the day the imports reach. The month is a calendar month today; the payday month from the 16th is new work (fin.03).
  - A morning job with one nudge at 80% and one at 100% of a category's month, and one after an unusually large payment. These nudges carry a percentage or a count and never an amount.
  - Silent categorising: rules, then a merchant memory, then the model; unsure ones become "Looks like ...?" cards in the evening close.
  - Net worth (0175, `finance_holdings` and `finance_holding_values`): pension, property, mortgage (owed), vehicles, each figure with the date it was true on; a monthly "Update the pension figure" item. Investments are shown apart until Phil says whether the sheet already counts them (chunk 15 step 6).
  - PayPal daily sync verified on production.
- **Findings from that build:** production's bank data stops on 17 July 2026; 1,638 of 2,639 transactions had no category and the morning sweep places them over about eight days.
- **Other pages:** Spending, Analysis, Accounts (service register, no passwords), Investments, Snapshot, Advisor chat.
- **Hard rules:** Finance is owner-only and cannot be granted to anyone (`claude/spec-access.md`: grants never cover finance or platform); true redaction with hidden-by-default money, including chart axes; never on the wall.
- **Pension:** Royal London; no personal API; the value comes from statement emails through the mail import (MYC-201) plus the monthly item.
- **Email import:** blocked on MYC-201 (a mailbox the app may read). Receipts, bills and statements arrive through it once it exists.
- **Hosting:** Vercel Hobby (daily crons only), Supabase.
- **Known renewals:** 4th Utility broadband, £37.00 a month, commitment ends May 2027. To look up: Mercedes EQA lease end, IONOS Mail Basic, the IONOS VPS, philipwhelan.com, the two Sporebit domains, energy, mobile, insurance.
- **Life context:** baby due June 2027 (working date 2027-06-15 until MYC-182 is answered); Kirsty moving in; FixForward is the only venture being worked.

## 3. What the research found

### 3.1 Enable Banking (gate for the epic, MYC-195)
- Restricted mode: a production application is activated by linking your own accounts in the Control Panel; it then returns data only for linked accounts. Every account Phil wants must be linked, or the API returns an empty list for it. A further API authorisation is needed even for the same account, because activation does not authorise the app [1][2].
- Cost: the terms say production use without a contract is limited to evaluation or the personal use of private individuals, and personal use is free of charge [3][4].
- Consent length is set per bank: `GET /aspsps` returns each bank's `maximum_consent_validity`; for most banks it is 180 days. Sessions can also end early (`EXPIRED_SESSION`), for example where a bank allows one session per user [1]. This sets the re-link cadence that the backlog's "dated ticket and a push a week before expiry" depends on.
- History: most banks give at least a year of transactions, often two to three, but the full history is usually available only for about an hour after authorisation; after that many limit access to 90 days [1]. The first pull after linking should therefore ask for the longest history (`strategy=longest`) at once, which would backfill the gap since 17 July 2026.
- Coverage for Halifax, Revolut and American Express in the UK: **UNVERIFIED.** No public page lists Enable Banking's UK banks; the list is behind `GET /aspsps` with an application key. MYC-195 already asks Phil to check each one in the Control Panel. The backlog records Revolut as "not viable" in August 2026 under a different route.
- One search result suggested Halifax online customers are being moved onto the Lloyds app (Lloyds Banking Group). **UNVERIFIED** (the Halifax page returned an error); if true, the bank may appear under a different name in the Enable Banking list.

### 3.2 Child money (fin.21)
- Child Benefit 2026/27: £27.05 a week for the eldest or only child, £17.90 for each other child (gov.uk, marked provisional) [5][6]. The 2027/28 rate (the year the baby arrives) is not yet published: UNVERIFIED.
- Claims can be backdated up to three months [7]. The birth must be registered first (England: within 42 days, UNVERIFIED in this run). Claiming also protects National Insurance credits for the parent at home, even where the charge would take the money back (UNVERIFIED in this run, widely stated).
- High Income Child Benefit Charge: starts at £60,000 adjusted net income of the higher earner, 1% of the benefit per £200 over, all of it at £80,000; unchanged for 2026/27 [8][9]. Pension contributions reduce adjusted net income [9].
- Junior ISA: £9,000 a year per child for 2026/27, shared between cash and stocks and shares, opened by a parent or guardian, locked until 18, unused allowance lost [10].
- Childcare in England: working parents can get 30 funded hours from the term after the child turns 9 months, applying up to 16 weeks before; each parent must earn at least the equivalent of 16 hours at the minimum wage and under £100,000 adjusted net income; reconfirm every three months [11][12]. Tax-Free Childcare adds 25% (up to £2,000 a year per child, UNVERIFIED figure) and can be combined with the funded hours [11].

### 3.3 Leave pay around the birth (fin.17)
- Statutory paternity leave became a day-one right on 6 April 2026 (Employment Rights Act 2025); statutory paternity pay still needs 26 weeks' continuous service [13][14].
- Statutory paternity pay from 5 April 2026: £194.32 a week or 90% of average weekly earnings if lower [15].
- Notice: the usual rule is notice by the 15th week before the expected week of childbirth. A temporary 28-day notice applied only to due dates from 5 April to 25 July 2026 [15][13]. For a due date of 15 June 2027 the expected week starts Sunday 13 June 2027, so the 15th week before it runs from Sunday 28 February to Saturday 6 March 2027 (calculated, check with the employer's policy).
- Each employer's own enhanced pay terms are not public and are what fin.17 gathers.

### 3.4 Credit reports (fin.24)
- A free statutory report is a legal right from each of Experian, Equifax and TransUnion; the agencies can hold different information, so all three are worth checking [16][17].
- Experian's statutory report posts a passkey within five working days [16]. Free ongoing routes: ClearScore (Equifax report monthly) [16]; MSE Credit Club (moved to TransUnion in November 2023 per one source, another still says Experian: UNVERIFIED) [16]; Credit Karma (listed as free, contents not confirmed) [18].
- Search for the agencies by name, not "free credit report", to avoid copycat paid services [19].

### 3.5 Tax on side income (fin.26, shared with fixf.01)
- The trading allowance is £1,000 for 2026/27; it covers all trading income together across platforms [20].
- It rises to £3,000 from 6 April 2027 (2027/28 onwards), confirmed in the Budget of 28 October 2026 [21][22]. The reporting threshold rising with it rests on secondary sources: UNVERIFIED [22].
- Selling your own possessions is generally not trading income; platforms report sellers to HMRC under the digital platform rules since 2024, which does not by itself make it taxable [20][23].
- Self Assessment registration for 2026/27, if needed, is due by 5 October 2027 [24].

### 3.6 Pension (fin.19)
- gov.uk "Find pension contact details" gives the administrator's contact details from an employer or provider name; it does not confirm a pot exists or its value [25].
- The Pensions Dashboards are still rolling out and not open to the public (secondary source, April 2026: UNVERIFIED) [26]; this matches the backlog's 2026-11-20 finding.

### 3.7 Chargeback for the concert tickets (fin.30)
- Visa and Mastercard chargeback is usually 120 days, counted from the date the service was due for a future-dated item such as an event, with a 540-day overall cap [27][28]. For an event on 14 November 2026 that points to about mid-March 2027, so 2026-12-12 leaves room. Banks may ask you to contact the seller first and wait a set period. A bank is not obliged to raise one [29]. American Express runs its own dispute process. Which card paid is not known: check first.
- Section 75 does not apply (the amount is under £100).

### 3.8 Copilot Money (fin.25)
- Features as described publicly: budgets with rollover and a "rebalance" that adjusts category budgets to actual spend; recurring and subscription detection with a monthly view, split, mark and pause; custom categories and rules; automatic categorising; net worth across accounts, investments, crypto and a home value from an address; cash-flow view; iOS and Mac first, a web app since December 2025 [30][31][32].
- UK bank connections are not confirmed; reviews describe it as US-focused (Plaid and MX) [33]. Phil did not buy it; the ticket is only about what to copy.

### 3.9 Budgeting method
- "Every pound a job" is zero-based budgeting. Nothing to research beyond what is already built; the payday month is the product decision.

## 4. Risks

| Risk | Mitigation the tickets carry |
|---|---|
| Lock-out or data gap: the bank consent lapses (about 180 days for most banks) and the feed stops quietly | fin.03 and the existing backlog item: a dated ticket and a push a week before expiry; the first pull asks for the longest history |
| Data loss: only 90 days of history after the first hour of a consent | Ask for the longest history in the first pull after linking (a note on MYC-195 via `existing`) |
| Money: a payoff order or an investing choice made from a ticket's text | Every such ticket says information and options only, Phil chooses; nothing is bought, opened, moved or cancelled in this run |
| Money: cancelling a subscription that something depends on (for example the IONOS VPS, Mail Basic, domains) | fin.11 marks each "Keep or Cancel" only; cancellations become separate tickets with the exact link; domain, mail and VPS items are excluded and handled by E.mail and E.keys |
| Avoidance: the daily line and alerts feel like a telling-off | Tone as decided (blunt, the Boys) but no blaming words; alerts stay inside the three-a-day budget |
| Privacy: money on the wall, in pushes or in a shared export | Finance stays owner-only; the wall never shows Finance; pushes carry a percentage or a traffic light, not an amount, unless Phil changes that rule (section 5) |
| Kirsty-facing: the household budget reveals Phil's private figures | fin.18 uses the separate household budget in the family space; Phil's Finance stays private; the no-figures headline is decided with her |
| Dates: the chargeback window or the optics claim closes | fin.30 dated 2026-12-12, fin.28 dated 2027-01-25 |

## 5. Facts that differ from the plan

- **baby.18 (E.baby, not this epic):** dated 2027-03-28, noted "usually 15 weeks before". For a 15 June 2027 due date the notice must be given by the end of the 15th week before the expected week, which ends Saturday 6 March 2027. 2027-03-28 is three weeks late. Suggest about 2027-02-26, and move it again when MYC-182 gives the real date.
- **fin.26 and fixf.01:** the trading allowance is £1,000 for 2026/27 and £3,000 from 6 April 2027. The plan names only "the HMRC trading allowance"; both figures belong in the tickets.
- **fin.13:** net worth is already in Mycelium (0175, Finance, Snapshot, by-hand holdings including a mortgage line). The ticket is the last import of the sheet, the sheet's retirement, removing the mortgage holding, and settling whether investments count, not a new build. Points 3 still fit.
- **fin.03:** the Budget page (0173) uses calendar months; the payday month from the 16th is a change to an existing page, not a new one.
- **fin.11:** Bills (0173) already lists recurring payments with keep, cancel and not-a-bill marks; the sweep is a guided pass over that page, then tickets for the cancellations.
- **fin.04:** the existing nudges never carry an amount. The plan's daily line does not say whether it shows figures. Written cautious: a traffic light and percentages in the push, figures only inside the app behind the masking, until Phil says otherwise. Question for Phil on the ticket.
- **MYC-195:** Enable Banking's coverage of Halifax, Revolut and AMEX cannot be confirmed from public pages. If any one is missing, fin.03 onwards still run on the banks that are covered plus PayPal; the plan assumes all three.
- **Halifax:** possibly moving customers to the Lloyds app (UNVERIFIED); may change the name the bank appears under.
- **fin.21:** Child Benefit and the funded childcare hours are claims with their own windows (Child Benefit backdates three months; funded hours apply from 16 weeks before 9 months). The plan has no dates for them; they belong on the baby timeline (link to E.baby) once the due date is known. Not dated here, as the brief says.
- **fin.25:** Copilot Money's UK bank support is not confirmed; it does not change the ticket, which is about features to copy.

## 6. Sources

1. https://enablebanking.com/docs/faq, Enable Banking FAQ (consent validity, restricted mode, history), checked 2026-11-28
2. https://enablebanking.com/docs/api/linked-accounts/, Whitelisting own accounts for restricted API usage, checked 2026-11-28
3. https://enablebanking.com/terms, Enable Banking Terms of Service, checked 2026-11-28 (via search summary)
4. https://enablebanking.com/blog/2026/01/15/enable-banking-changelog-december-2025, Changelog December 2025 (personal use free), checked 2026-11-28 (via search summary)
5. https://www.gov.uk/government/publications/rates-and-allowances-tax-credits-child-benefit-and-guardians-allowance/tax-credits-child-benefit-and-guardians-allowance, Child Benefit rates and allowances, checked 2026-11-28
6. https://www.parallelparliament.co.uk/debate/2025-11-26/commons/written-statements/child-benefit-and-guardians-allowance-uprating, Child Benefit uprating written statement, checked 2026-11-28
7. https://www.royallondon.com/guides-tools/life-events/starting-a-family/child-benefit-and-the-high-income-child-benefit-tax-charge/, Child Benefit and the HICBC, checked 2026-11-28
8. https://gov.uk/government/publications/changes-to-the-high-income-child-benefit-charge/information-on-changes-to-the-high-incomechild-benefit-charge, Changes to the HICBC, checked 2026-11-28
9. https://payslipiq.co.uk/guides/high-income-child-benefit-charge-2026, HICBC 2026, checked 2026-11-28
10. https://www.hl.co.uk/investment-services/junior-isa/junior-isa-allowance, Junior ISA allowance 2026/27, checked 2026-11-28
11. https://www.beststartinlife.gov.uk/childcare-early-years-education/15-and-30-hours-support/faqs, 15 and 30 hours FAQs, checked 2026-11-28
12. https://parentportal.leeds.gov.uk/Synergy/FIS_Website/9months.aspx, Funded childcare for 9-month-olds, checked 2026-11-28
13. https://www.acas.org.uk/your-paternity-rights-leave-and-pay/taking-paternity-leave, Acas: taking paternity leave, checked 2026-11-28
14. https://www.lewissilkin.com/en/insights/2026/02/12/day-one-family-rights-from-april-2026, Day-one family rights from April 2026, checked 2026-11-28
15. https://www.nibusinessinfo.co.uk/content/new-statutory-payment-rates-2026-27, New statutory payment rates 2026-27, checked 2026-11-28
16. https://www.which.co.uk/money/credit-cards-and-loans/credit-scores/guides/credit-reports-all-you-need-to-know, Which?: credit reports, checked 2026-11-28
17. https://www.transunion.co.uk/consumer/statutory-credit-report, TransUnion statutory credit report, checked 2026-11-28
18. https://www.finder.com/uk/free-credit-report, Finder: who offers a free credit report, checked 2026-11-28
19. https://www.clearscore.com/learn/credit-score-and-report/how-to-get-free-experian-credit-report, ClearScore: free Experian report, checked 2026-11-28
20. https://www.moneyhelper.org.uk/en/blog/work/will-I-have-to-start-paying-tax-when-I-sell-items-online, MoneyHelper: tax on selling online, checked 2026-11-28
21. https://www.gov.uk/government/publications/income-tax-increasing-the-trading-allowance/increasing-the-trading-allowance, Increasing the trading allowance, checked 2026-11-28
22. https://www.alliotts.com/articles/trading-allowance-to-increase-to-3000/, Trading allowance to increase to £3,000, checked 2026-11-28
23. https://www.litrg.org.uk/working/gig-economy/digital-platform-reporting-rules, LITRG: digital platform reporting rules, checked 2026-11-28
24. https://saga.co.uk/money-news/what-tax-do-i-need-to-pay-on-side-hustles, Saga: tax on side hustles, checked 2026-11-28
25. https://gov.uk/find-lost-pension, Find pension contact details, checked 2026-11-28
26. https://freedomisntfree.co.uk/articles/find-lost-pensions-uk, Find lost pensions UK, checked 2026-11-28
27. https://blog.moneysavingexpert.com/reclaim/visa-mastercard-chargeback, MSE: Visa and Mastercard chargeback, checked 2026-11-28
28. https://stripe.com/gb/resources/more/chargeback-time-limits-in-the-uk, Chargeback time limits in the UK, checked 2026-11-28
29. https://www.financial-ombudsman.org.uk/pay-it-safe/index.html, Financial Ombudsman: Section 75 and chargeback, checked 2026-11-28
30. https://copilot.money/llms.txt, Copilot Money product summary, checked 2026-11-28
31. https://www.gobankingrates.com/saving-money/budgeting/copilot-app/, GoBankingRates: Copilot review, checked 2026-11-28
32. https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/, Penny Hoarder: Copilot Money review 2026, checked 2026-11-28
33. https://freenance.io/products/copilot-money-review-2026-budgeting-app-iphone-best-design/, Freenance: Copilot Money review 2026, checked 2026-11-28
