# Spec — Finance

*Crawled 2026-08-29; reviewed with Phil same day. Numbers are the product; privacy redaction is a hard rule. (?) = inferred.*

## Transactions & banks

`bank_transactions` (0036) + multi-bank (0037): Halifax, Revolut, AMEX, PayPal CSV importers (per-bank parsers — FROZEN), date-range presets. Type standardisation (0047, `IS DISTINCT FROM` semantics), category metadata (0048). Categorisation: rules engine → AI (Haiku, model id from `lib/config/models.ts`) → manual override (optimistic). PayPal: payments table (0038), API sync + match/reconcile flow (`/api/finance/paypal/sync|match|matches`; `lib/finance/paypal-api.test.ts` exists). PostgREST caps reads at 1000 rows, so aggregates go through server-side RPCs: `txn_agg` (0049), `spend_by_category` + `spend_by_month` (0050).

## Pages

`/finance` (overview — net position is the largest number on the page), `/finance/spending` (table w/ density, filters, import flow, mini analysis panel), `/finance/analysis` (period selector, summary cards, category bars, monthly stacked trend — AnalysisClient stays on raw fetch: its endpoints are POST-as-read, which GET-only useApi can't key), `/finance/accounts` (service register — `service_accounts` 0061: name, email, purpose, status, cost; NO passwords/2FA), `/finance/investments` (0068: holdings, refresh-prices batched 5 at a time via Yahoo (?)), `/finance/snapshot` (net worth), `/finance/advisor` — **AI advisor chat surface** (finance-scoped agent conversation, same family as The Boys).

## Privacy

True redaction, not blur: `<Money>`/`<PrivateText>` never render the value in the DOM when hidden; constant-width placeholder; default hidden, session-only reveal. Chart tickFormatters leaked amounts once — fixed via `formatGBP({hidden})` (P7). Every new finance surface must verify masking including chart axes.

## Backlog notes (confirmed live by Phil, 2026-08-29)

Spending phase C (more banks) committed; live holdings (Coinbase/Rabby/Revolut Stocks via Yahoo) idea; Revolut current account not viable without paid Open Banking; PDF statement import deferred.

## Loam & Glow state

P7 parts 1–4 shipped (numerals/hierarchy, useApi for Spending/Accounts/Investments, restyles).
