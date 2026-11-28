# Digest: FixForward eBay automation (new Work project)
Brief sections: Section 3, 3b, H10 FixForward (section 3) folded item, H6 FixForward-only rule, H10 flags 1 and 2, H2 item 12 (eBay alerts). Source A:\Projects\Mycelium\docs\intake\intake-2026-11-27.md. Dashes in quoted answers are the brief's own.

## 1. First answers

### Section 3: FixForward eBay automation (brief lines 81-110)

1. FixForward is **both**: buying faulty items to repair and resell, **and** selling his own used items.
2. State: **designed, not built**.
3. Lives in **a repo on the PC under `A:\Projects`** — Claude Code reads it (and its design notes) before writing tickets.
4. Coverage, all four: **finding stock, pricing from sold listings, creating and updating listings, orders / messages / postage**.
5. Sells through **his existing personal eBay account**.
6. eBay developer API keys: **none yet**.
7. Stock, all four: **PC parts; phones, consoles, electronics; clothing and shoes; household and random items**.
8. Volume: **unknown, start small**.
9. Inventory: **a database, with the Google Sheet imported once and kept as a view**.
10. DropShipAuto: **separate; a ticket lists what is worth reusing**.
11. Listing creation: **drafted, he approves each one**.
12. Photos: **his own, tidied automatically** (crop, straighten, order, attach).
13. Pricing: **he sets every price**. Sold-listing data (answer 4) is shown as guidance, never applied on its own.
14. Unsold listings: **suggest a drop from fresh sold data, he approves**.
15. Buying: **alert only** with expected profit; it never bids or buys.
16. Offers: **auto-accept at or above his floor**; lower ones come to him with a suggested counter.
17. Buyer messages: **auto-answer common questions**; the rest come to him.
18. Postage: **label prepared, bought when he confirms**.
19. Runs on **the PC worker, with the free cloud tier receiving eBay's notifications**.
20. Data: **tables inside Mycelium's database**. `[claude]` consequence: the migrations and RLS invariants apply (one migrations owner, deny-all + service_role pattern), own table prefix.
21. Interface: **a Mycelium page plus Telegram for approvals**; built like PhirstMaxx (own prefix, one adapter file) so it can be lifted out.
22. AI: **PC model first, cloud inside Mycelium's existing £5 monthly cap**.
23. Trading rules (eBay business-account expectation, HMRC trading allowance): **a research ticket first**, before any buying automation.
24. Repairs tracked **per item**: fault, parts, time, test result.
25. Test evidence on listings: **optional**.
26. Market data: **official eBay APIs, plus scraping where they fall short**. `[claude]` flagged in the question: scraping risks the personal account he sells through.
27. First slice: **one item from inventory record to live listing**.
28. Goal: **clear his own stuff, then steady side income, growing into a business** ("1 and 2 into 3").
29. His time: **2 to 5 hours a week**.
30. Tickets in **a new FixForward project**; the existing SELL project keeps one-off sale tickets and links across.

## 2. Round 2 extras

### Section 3b: FixForward, extras (brief lines 440-449)

- **A real brand:** shop name, logo, a card in every parcel (a ticket for the identity).
- **First slice stock:** the RAM already counted and priced.
- **Likely stall he named:** photographing and packing not getting done, repairs not worth the time, losing interest once built (not an eBay restriction).
- **Buy alerts:** only when expected profit clears a bar he sets per category.
- **The chore:** a fixed photo station and packing shelf, and one weekly batch night with a queue of what to shoot and pack.
- **Repairs:** profit per hour shown on every item; he judges (no time box).
- **Interest:** a running total on the daily line.
- **Dead stock:** after a set time, bundle as a job lot, then donate or recycle.
- **Listing voice:** plain and exact — what it is, what was tested, what is wrong with it; faults first.
- **Repair photos:** a before, during and after set per repair.

## 3. Round 3 corrections and additions (these win)

### H10 folded item: FixForward (section 3) (brief lines 705)

- **FixForward (section 3):** the RAM and GPU batch is the first slice (3b). State: 69 modules verified, 32 sold-listing searches still to run, and the two checks made came in 20 to 30% above the valuation, so the Valuation tab runs low. The selling sheet is to be extended to clothes, shoes and other items (already in section 3). Spare drives being wiped: a secure erase, not a quick format, for any that are sold.

### H6 rule before June (brief lines 668)

- **Rule before June: FixForward only, until its first slice ships.** Everything else waits.

### H2 item 12: eBay new-device sign-in alerts (brief lines 623)

12. **eBay new-device sign-in alerts** (Nov 2025 to Jul 2026): **all Phil** (his answer). No incident ticket; the eBay password and 2FA are done in the migration's High rows before FixForward automation touches the account.

## 4. Flags marked [claude] that touch this epic

- Section 3 item 20 (brief line 100): 20. Data: **tables inside Mycelium's database**. `[claude]` consequence: the migrations and RLS invariants apply (one migrations owner, deny-all + service_role pattern), own table prefix.
- Section 3 item 26 (brief line 106): 26. Market data: **official eBay APIs, plus scraping where they fall short**. `[claude]` flagged in the question: scraping risks the personal account he sells through.

### H10 flags [claude], raised once: item 1, employment contract (brief lines 719)

1. **Side-work terms in his employment contract.** The AI website company plan's own next step was "check your employment contract for side-work limits", and Phil said he had not. FixForward's stated goal is "growing into a business" (section 3.28), and section 3.23 already has a research ticket on trading rules. The contract check belongs in that ticket, before any buying automation.

### H10 flags [claude], raised once: item 2, medical display (brief lines 720)

2. **The medical display listed for sale** (a diagnostic monitor, one UK sale seen at £3,000): the chat's open question was whether it is his to sell or belongs to his employer or a trust. It should not enter FixForward's inventory until that is confirmed in writing.

## 5. Assumed items

None.

## 6. Dates named for this epic

- Rule before June: FixForward only, until its first slice ships (H6, line 668).
- Time: 2 to 5 hours a week (section 3 answer 29, line 109).
- One weekly batch night with a queue of what to shoot and pack (3b, line 444).
- Dead stock: after a set time, bundle as a job lot, then donate or recycle (3b, line 447).
- eBay new-device sign-in alerts ran Nov 2025 to Jul 2026 (H2 item 12, line 623).
- Spare drives being wiped: secure erase for any that are sold (H10, line 705).

## 7. Cross-links to other epics

- finance: the tax-on-side-income research ticket is shared; profit per item and per hour feeds the ventures page (H3, line 632).
- glasses: "list this" at the FixForward bench comes later, once the first slice works (10b, line 535).
- home-3d-rooms: a shed or workshop in the garden is FixForward's bench and storage (8b, line 512).
- ventures-and-life (SELL project): the existing SELL project keeps one-off sale tickets and links across (section 3 answer 30); DropShipAuto reuse ticket (answer 10).
- mail-email-migration: ebay@ legacy address checked against the live eBay account (H1, line 603); fixforward@ address (1b).
- sec-keys-and-domains: eBay password and 2FA done in the High rows before automation (H2 item 12).
- mycelium-second-brain: tables inside Mycelium, migrations and RLS invariants, own prefix (section 3 answers 20 and 21).
