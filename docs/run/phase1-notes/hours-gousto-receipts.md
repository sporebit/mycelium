# Phase 1 tester hand-back — Hours, Gousto, Receipts, the 2026-10-29 fixes

*2026-11-20. One of five parallel testers (with two forks: Receipts; Gousto + fixes). On the compiled test build: 141 passed and 7 fixme as Phil, 24 passed and 1 fixme as Tess. Targeted vitest: 17 passed (`app/api/receipts/route.test.ts`, `app/api/health/extractor-guards.test.ts`).*

## Specs

| File | Phil | Tess |
|---|---|---|
| `e2e/hours-cells.phil.spec.ts` | 2 (+1 fixme) | |
| `e2e/hours-log.phil.spec.ts` | 13 | |
| `e2e/hours-figures.phil.spec.ts` | 16 (+2 fixme) | |
| `e2e/hours-settings.phil.spec.ts` | 17 (+1 fixme) | |
| `e2e/hours.tess.spec.ts` | | 4 |
| `e2e/receipts.phil.spec.ts` | 16 (+2 fixme) | |
| `e2e/receipts.tess.spec.ts` | | 5 |
| `e2e/gousto.phil.spec.ts` | 20 | |
| `e2e/gousto.tess.spec.ts` | | 4 |
| `e2e/fixes-1029-gate.phil.spec.ts` | 41 | |
| `e2e/fixes-1029-extractors.phil.spec.ts` | 9 | |
| `e2e/fixes-1029-fitness.spec.ts` | 7 (+1 fixme) | 7 (+1 fixme) |
| `e2e/fixes-1029-mobility.tess.spec.ts` | | 4 |

`e2e/hours.helpers.ts` is a shared helper. The Hours specs fix the browser clock in March 2031 so "this week" is synthetic; expected figures are worked out in the spec from the spec's rules, not by calling the app's own calculation. The Gousto and fixes specs still carry long waits from the slow-server period and can be lowered.

## Fixed

**Hours** (`components/hours/EntryRow.tsx`, `NewEntryRow.tsx`):
- Esc in a Log cell saved the typed text instead of reverting it; the same cause sent a second save after Enter.
- Tabbing or Enter-moving into an Estimate or Ticket cell and typing added to the old value ("0:25" then "0:45" read "0:250:45" and was refused; a ticket was saved as old key + new URL). Keyboard arrival now selects the cell; a click still places the cursor.
- Accessible names on the row cells and the Logged tick.

**Receipts** (the first time receipts were exercised at runtime):
- Delete left photos in the bucket and answered 200 for a missing receipt (`app/api/receipts/[id]/route.ts`).
- Merge left moved pages unreadable under the new storage rule (`app/api/receipts/merge/route.ts`, `lib/storage/receipts.ts`).
- Removing a participant reset hand-set shares on lines they were never on (`app/api/receipts/[id]/participants/route.ts`).
- Correcting the printed total did not re-judge the receipt; a non-numeric total or bad date answered 500 (now 400).
- Upload left an orphan row when storing the photo threw (`app/api/receipts/route.ts`, proved by vitest).
- Escape in the title field saved the abandoned text; a link to a deleted or foreign receipt sat on "Loading…" for ever (`components/purchases/ReceiptsClient.tsx`).

**Gousto and the 10-29 fixes:**
- A heart tapped while a search was loading stayed unlit with the favourites count wrong (`components/health/gousto/GoustoCookbook.tsx`).
- A recipe Gousto no longer serves told Phil to run the sync (`GoustoRecipePage.tsx`).
- A seeded hold exercise read "2×?" on Today (`app/api/fitness/today/route.ts`).
- Four photo parsers answered 500 with AI off, now 409 with a plain message (the three health parse routes, `app/api/nutrition/foods/scan-label/route.ts`).

## Found, not fixed

**Hours:**
- **The Log is not usable at phone width** (fixme): at 390px the Description cell is 14px wide and Ticket and Logged sit off the right edge. The spec asks for phone use. Suggested: a two-line row below `sm`.
- The flat daily target shows 9:23; the spec says 9:22 (`lib/hours/calc.ts` rounds half up and its test pins 9:23). Phil decides which side changes.
- Daily "Total logged" adds the day's credit; the spec defines it as ticked entries only (a bank-holiday Monday reads 8:30 where the rule gives 1:00). Phil says which the workbook did.
- A JSON backup restores a held entry as merged: the import never reads `mergedAt`. Needs a migration (`hours_apply_import` to take `merged_at`).
- Dashboard "Open backlog · Items" and the Backlog header count differently.
- Undo is one level only, although the route's comment and the SQL function allow the latest not-undone run.
- From reading: every Hours view stays on its skeleton for ever when the bundle fetch fails; the gov.uk refresh answers 500 rather than 502 when the fetch throws; SAVE on Targets is refused until a Tracking start is chosen on a tracker with no settings row; Settings labels are not wired to their inputs.

**Receipts:**
- No way to delete a receipt on screen (fixme). Printed total, date and retailer cannot be edited on screen (fixme).
- A failed reparse, add-photos or merge demotes a good receipt to FAILED (`lib/receipts/parse.ts`).
- Exactly 5p adrift: the server says NEEDS REVIEW, the screen shows it as fine (`lib/receipts/reconcile.ts`).
- A three-way even split over-collects a penny (`lib/receipts/shares.ts`).
- A participant's default share and undoing a payment are API-only.
- **Hosted follow-up:** receipt uploads cannot have worked on production before 0158, and any receipt deleted or merged since the multi-user cutover may have stranded photos.

**Gousto and fixes:**
- A surviving exercise-level pain log is shown nowhere (fixme, both people): the route keeps only logs whose session still exists.
- The same 500-on-missing-key remains in `app/api/agents/[agentId]/stream/route.ts`, `lib/tickets/rundown.ts` and `lib/receipts/parse.ts`.
- Latent: Gousto `[slug]` routes look up by slug alone while uniqueness is space plus slug.

Left on the local stack: seven one-pixel PNGs in the `receipts` bucket from before the delete-order fix.

## Needs Phil's eyes

**Hours (15 minutes; drop 10, 9, 8 first).** MYC-177 already covers History against the workbook and the seed import; none of that is repeated.
1. `/organisation/hours/log` on the PC: type three real entries into the blank row with Enter, change a Time and a Ticket by tabbing into them, press Esc on one edit, then MERGE. It should feel as fast as the workbook. Decide: a click places the cursor and Tab/Enter selects the whole cell. Right, or should a click select the cell too?
2. The same page on the phone: the Description is squeezed to nothing. Say how a row should look there.
3. `/organisation/hours` on a working day beside the workbook's Dashboard: banner, Today pill, even pace and left today agree. Rule on 9:22 or 9:23.
4. `/organisation/hours/daily`, a bank-holiday or leave day: should "Total logged" include the credit (as now) or only ticked time (as the spec says)?
5. On the Dashboard press OPEN BLOCK-OUT EMAIL and CALENDAR .ICS: the draft opens with the right people, subject and Friday's date; the file lands in Outlook as an all-day, free entry.
6. Copy a real week of Log rows from the workbook; Settings → Import, paste, DRY RUN: "To add" plus "Unchanged" equals the rows copied, nothing rejected.
7. Settings → DOWNLOAD .XLSX, open in Excel: something he would send his team lead?
8. Settings → REFRESH FROM GOV.UK on production: matches the real bank holidays.
9. Click two ticket keys on `/organisation/hours/tickets`: they open the right Jira pages.
10. Look: the Daily week summary strip, a History week opened to its days, the Today tile Monday to Thursday.

**Receipts (15 minutes; needs cloud AI; drop 8, 7, 6 first).**
1. `/organisation/receipts`: upload one real till receipt photo. Retailer, date and lines match the paper; status PARSED or NEEDS REVIEW with a believable reason.
2. Ctrl+Shift+H: RECEIPT TOTAL matches the paper; DIFFERENCE is zero or explains itself.
3. A long receipt as two overlapping photos: no line twice.
4. Correct one wrong line total and click away: badge and DIFFERENCE update.
5. Add a real person under SPLIT WITH, tap their chip on two lines, right-click a chip and set a percentage: figures read sensibly and are easy to hit on the phone.
6. Balances: record a payment, open the receipt from under the card.
7. One HEIC photo: is the message clear?
8. Upload the same receipt twice, tick both, Merge: wording clear, every page shown.

**Gousto (15 minutes; drop 7, 6, 5 first).** The PC task "Mycelium Gousto sync" ran 8 and 15 November with exit 0 and is next due 22 November 03:00.
1. `/health/recipes/gousto` on production: about 12,000 recipes, "SYNCED 15 Nov" or later, real photos.
2. Search "curry", pick a category, then a cuisine: counts believable; no category twice as "X" and "X Recipes".
3. A recipe he has cooked: ingredients, allergens, nutrition and method match the Gousto card.
4. On the phone, tap a heart straight after typing a search: it lights and Favourites goes up.
5. SAVE TO MY RECIPES on one: it lands in My recipes and reaches a shopping list through a meal plan.
6. Look on the phone: card grid, filter row, detail page.
7. Read the new wording on a recipe Gousto no longer serves.

From the 10-29 fixes, only Phil can judge the rest timer's minimised bar during a real workout, and how a surviving exercise pain log should be shown.
