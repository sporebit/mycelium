# Master run — Stream F report (finance), first part

*2026-11-20, 09:30–11:00 London. Claude Code on the PC. Ticket MYC-188. Status: **bills, budget and silent categorising built and live** (release `ffccfa6` with migration 0173, then the categorising release that follows this report). The bank feed and the email import are **blocked on Phil** (MYC-195, MYC-201) and not started. Phil's live check is a new chunk of MYC-193.*

## What it is

Three things from §10, all owner-only, none of it ever in a share, nothing of it in a page until amounts are shown.

| Asked (master run §10) | State | Where |
|---|---|---|
| Bills and subscriptions: recurring detection, due dates, price rises, forgotten subs | Built. **Finance → Bills.** Worked out from the imported transactions each time the page is opened: a merchant paid at a steady interval (weekly to yearly) is a recurring payment; three payments make one, two for a direct debit or standing order. Each shows how often, how much, what it comes to a month, when the next is expected, and whether the latest payment is dearer than the ones before. Subscriptions nobody has said keep or cancel to are listed first, costliest first: those are the forgotten ones. Nothing is stored but what the person says (keep, cancel, not a bill), against the merchant's key. | `lib/finance/recurring.ts` (pure), `finance_recurring_marks`, `components/finance/BillsClient.tsx` |
| Budget vs actual | Built. **Finance → Budget.** One row a category: the month's budget, what has gone, what is left, and where the month is heading at the rate so far. The budget cell is edited where it sits (Enter moves down); empty removes it. Compared only up to the day the imports reach, so a half-imported month is not "under budget". | `lib/finance/budget.ts` (pure), `finance_budgets`, `components/finance/BudgetClient.tsx` |
| Spending nudges: a hot category | Built. Once a morning (`/api/cron/finance`, on the tick): one nudge when a category passes 80% of its month's budget and one when it passes all of it, each once a month, each a percentage and never an amount, each inside the day's three. | `lib/finance/billsServer.ts` → `runBudgetAlerts` |
| Spending nudges: a big or unusual payment | Built. The morning after an import that brought a payment at least £100, in the top two per cent of six months' spending, and at least three times what that merchant usually gets: one line with a count, never an amount or a name, once a day. With fewer than twenty payments of history nothing is called unusual. | `lib/finance/unusual.ts` (pure), `runUnusualAlert` |
| Categorising: silent; only low-confidence ones become swipe cards in the evening close | Built. Three steps, cheapest first: rules (transfers to his own accounts, cash, fees); then the **merchant memory**: a merchant whose past payments all carry one category gives the next payment the same one, no model and no cost, with what he chose by hand counting five times a confident guess; then the model, in batches of forty, for what is left. Runs after every import (after the reply has gone) and once a morning over anything still waiting, 200 at a time. A payment the model placed with confidence under 0.6 is a **card in the evening close**: *Looks like Groceries?* Yes on the right, Fix on the left (then the category), Not now underneath. A yes or a fix locks the category, and the memory counts it as his word. | `lib/finance/categorise.ts`, `lib/finance/merchantMemory.ts` (pure), `lib/finance/unsure.ts`, `components/daily/CloseDay.tsx` |
| Bank feeds (Enable Banking) | **Not started: the sign-up is Phil's** (MYC-195). | |
| Email import (receipts, bills, statements, order and tracking numbers) | **Not started: the mailbox credentials are Phil's** (MYC-201, created this session, says exactly which env names). | |
| PayPal: verify the existing sync | **Verified on production**: the daily 07:00 run landed on 19 November with payments to 18 November, 167 payments in all. | `vercel.json`, `/api/finance/paypal/sync` |
| Net worth over time, with pension, house, mortgage and cars by hand | **Not in this part.** The daily snapshot (0172, earlier today) holds what the sheet gives; there is nowhere yet to put a by-hand figure, so the "update pension figure" item has nowhere to point and was not created. | |
| Re-link reminders | Nothing to remind about until a feed exists. | |

## How it is put together

- **Two tables, both finance** (`finance_recurring_marks`, `finance_budgets`; 0173), owner-only by the shape of their rules: the row's space is the reader's own personal space and nothing else, the shape every finance table has had since 0111. Added to the access registry's finance groups (`recurring`, `budgets`); the registry test knows the full list.
- **The recurring payments are never stored.** They are computed from the transactions each time (26 months, paged a thousand rows at a time), so an import that adds or corrects a payment changes the page at once, and there is no second copy to drift. The merchant key strips reference numbers, dates, card markers and town names, so the same merchant reads the same every month; the e2e seeds use made-up names with no digits for that reason.
- **Everything is judged against the newest transaction, not today.** Data arrives by import and can be months old. A payment "due" after the last import is not late, it is not known yet; the pages say what day the data runs to, and after a fortnight say so plainly.
- **The memory does not count its own placements** as evidence, or it would vote for its own answer for ever; three corrections by hand outweigh twenty of its own. A merchant that goes two ways (a supermarket that is sometimes fuel) is left for a person.
- **A model that cannot be asked leaves the payment uncategorised** rather than writing "Uncategorised at 0.1" over it, so the next morning's sweep tries again. Before this change every unasked batch was written down as a guess. The model call goes through the one meter (MYC-187) like every other paid call.
- **The close deck stays within ten.** Finance cards take whatever room the open items and capture cards leave, dearest first. The close route catches any finance error, so a finance fault never stops the close.
- **The cron is on the tick** (`lib/system/schedule.ts`, London hours 9 and 10, once an hour), not in `vercel.json`: the Hobby cron gate stands.

## Checked

- Unit: 43 checks across `recurring`, `budget`, `merchantMemory` and `unusual` (cadence bands, price rises, the forgotten-first ordering, month arithmetic including the day the data reaches, the 80%/100% alerts once each, memory agreement and the self-vote rule, the unusual-payment thresholds, and that no nudge line names an amount or uses a banned word).
- End to end as Phil and Tess (`e2e/finance-bills.phil.spec.ts`): the recurring payments found from seeded transactions, the marks and their effect on the totals, Tess seeing none of it and her marks touching none of his, the budget against spending up to the day the data reaches, the morning job answering 401 without the secret and sending nothing about a month with no data, the pages with nothing in them until amounts are shown and the sheet editing in place, and the categorising: a merchant placed by hand placing its next payment through the memory, an unreachable model leaving a new merchant untouched, an unsure payment as a card in his close and not in hers, and a fix locking it. **See "Found on the way" for the one unexplained failure.**
- Production: hosted migrations at **0173**; `/api/health` reports the release.

## Found on the way

- **Production's bank data stops on 17 July 2026** (2,639 transactions, the newest row written that evening), and **1,638 of them have no category**. The bills and budget pages are honest about the first (they say what day the data runs to); the morning sweep will place the second over about eight mornings at 200 a time, through the meter. Until Enable Banking is linked, the way to bring the data forward is a CSV import on Finance → Spending; the import now categorises what it brings.
- **The first run of the new e2e spec failed once and never again.** Straight after the compiled server came up, the first test saw no transactions through the API (the seed was present in the database; the API answered 200 with an empty view). With a debug line added it passed, and it has passed on every full run since. Not understood; recorded here so a repeat is recognised.
- **The manual-category route already locked a category** (`POST /api/finance/transactions/[id]/category` sets `manual` and `category_locked`), which is what the memory needs; nothing had to change there. The older `PATCH /api/finance/transactions/[id]` sets a category with no source and no lock and is left as it was.
- **`graphify update .` could not run** (not installed on this PC); the project-side copies of `context.md` and `backlog.md` were not synced (no Projects tool in the terminal).

## Phil's live check (a chunk of MYC-193, 15 minutes)

1. Finance → Bills. Amounts hidden: no merchant, no figure anywhere. Show amounts: the list reads right against what you know leaves each month; say Keep or Cancel it to three.
2. Finance → Budget. Set a budget for two categories (type, Enter). Step back to July and see the month compared to the day the data reaches.
3. Finance → Spending: import a recent CSV from one bank. Within a minute the new rows have categories; the ones it was unsure about appear at the next evening close as *Looks like …?* cards. Answer one with Yes and one with Fix.
4. The morning after an import, if a budget is over four-fifths or a payment was unusually large, one line arrives and names no amount.
