# Phase 1 tester hand-back — People contacts, People review, Quotes

*2026-11-20. One of five parallel testers. 47 checks pass on the compiled test build; one more is held as `test.fixme` (the approved-quote review bug, in the capture pipeline).*

## Specs

| File | Runs as | Passing |
|---|---|---|
| `e2e/people.phil.spec.ts` | Phil | 13 |
| `e2e/people-review.phil.spec.ts` | Phil | 11 |
| `e2e/quotes.phil.spec.ts` | Phil | 14, plus 1 fixme |
| `e2e/people-quotes.tess.spec.ts` | Tess | 9 |
| `e2e/people.shared.ts` | helper | |

People-review rule R1 (no code path creates a person) is proven three ways: the Work ticket route, the older ticket route, and a description edit each queue one suggestion and create no person, however often the ticket is saved.

## Fixed by the tester

- A quote from a speaker not in People was saved as Phil's own, marked certain; it is now stored as unknown speaker, uncertain (`lib/quotes/server.ts`).
- **A quote could be linked to a person in another user's space.** Create and edit now answer 400; an id that does not exist used to give a 500 quoting the database (`lib/quotes/server.ts`, `app/api/quotes/route.ts`, `app/api/quotes/[id]/route.ts`). The database would not have caught it: the quotes policies test only the quote's own space, and a foreign key does not see RLS.
- Re-running research with no AI key answered 500 with the env var name; now 409 with a plain sentence (`lib/quotes/research.ts`).
- With no AI key a new quote said "researching" for ever; the badge now reads "research off" (`components/quotes/*`, `app/api/quotes/route.ts`).
- An attribution typed by hand never showed on the quote card (`components/quotes/QuoteCard.tsx`).
- The person page said "Loading…" for ever for a binned person or one that is not yours (`components/compost/PersonDetail.tsx`).
- Promote or Unarchive, then another chip within about two seconds, showed the old list (`components/compost/PeopleClient.tsx`).
- Restoring a rejected person left their words under Ignored words until reload (`components/people/PeopleBin.tsx`).
- Review Needed cards never showed the ticket key: the snippet read the boolean `key` column instead of `ticket_key` (`lib/people/snippets.ts`).

## Found, not fixed

- An approved quote capture comes back under Needs review and stays in the dashboard count (capture pipeline; fixed in the capture rebuild).
- **The database has no same-space guard on any link to a person.** Quotes are closed in the app only. From reading, not run: `app/api/people/mentions/[id]/resolve/route.ts` takes `person_id` unchecked, `app/api/pending-entities/[id]/resolve/route.ts` takes `link_to_id` unchecked, and the `people_promote_on_link` trigger (SECURITY DEFINER) updates `people` with no space check, so a link from another space would promote someone's contact. Needs a migration: a trigger on every column `people_link_tables()` returns, refusing a person outside the row's space.
- DELETE on a person that does not exist answers 200; a non-uuid id answers 500 (`app/api/people/[id]/route.ts`, `lib/people/contacts.ts`).
- The Add / Edit person drawer's fields have no programmatic labels (`components/compost/PersonDrawer.tsx`).
- From reading only: `POST /api/people` checks duplicates with `ilike`, so `_` and `%` in a name act as wildcards; `exportPeopleVcf` leaves out binned people but not archived ones (whether archived people should reach the iPhone is Phil's call).
- No delete for import batches (test runs leave `E2E-people-….vcf` batch rows on the local stack).

## Needs Phil's eyes (about 15 minutes, on production; drop 8, 7, 6 first)

1. **Clear the 62.** People → REVIEW NEEDED. KEEP any card that is a real person. Then SELECT → ALL → REJECT n and confirm: the list empties, with a notice giving the count and "words now ignored".
2. **Check where they went.** Other → Settings → People & teams: the Bin lists them with a "gone on" date; Ignored words lists their words as "rejected person".
3. **A rejected word stays gone.** Save a ticket whose title contains one of the rejected phrases; Organisation → Entity review → NEW ENTITIES shows nothing new for it.
4. **Judge the queue's noise.** Same tab: look at what ticket titles have queued since 20 October. Automation proves each phrase queues once; only Phil can say whether that rate is tolerable or tickets should link existing people only.
5. **One real voice quote.** Say "Quote from <someone in People>: …" to the Shortcut or Telegram: the read-back; the review card with that person already picked; APPROVE; Quotes shows it at the top and the badge moves from "researching" to a verdict within a minute.
6. **Quotes on the phone.** The sheet comes up from the bottom, the text is large, the merch tick toggles in place.
7. **Export to the iPhone.** People → EXPORT .VCF, import on icloud.com: names, numbers and a custom label arrive intact.
8. **Review Needed on a touch screen.** KEEP / ARCHIVE / REJECT sit at reduced opacity until hover; check they are legible without one.
