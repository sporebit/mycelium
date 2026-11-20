# Master run — Stream D report (the family space)

*2026-11-20, 07:50–08:40 London. Claude Code on the PC. Ticket MYC-186. Status: **built; deploys with the release that follows this report**. Migration 0171. Checked with the two test people; Phil's and Kirsty's live check is chunk 13 of MYC-193 and comes after she has joined (chunk 11).*

## What it is

One page, **Family** (Organisation → Family; in the new shell, Life → Family), for the two of you. It lives in a **team's space**: there is no new kind of space, and the family space is simply the team whose space you choose for it. Everything in it is seen by everyone in that team, and by nobody else.

| Asked (master run §8) | State | Where |
|---|---|---|
| Week by week from the due date | Built. The heading is the week ("21+5", days to go, a progress line), and on the weeks that have one, a line from the standard NHS schedule, marked as general and second to the midwife's dates. After the birth the heading is the baby's age. | `lib/family/weeks.ts` |
| Timeline of scans and notes | Built. Notes, scans, appointments, milestones, photos and letters on one timeline, each marked with the week it fell in, each with at most one picture or file. | `family_entries`, `components/family/Timeline.tsx` |
| Appointments and reminders on a family calendar | Built as far as the family page: appointments show under "Coming up" and each person is reminded the evening before (from 18:00) and two hours before. **Not** yet on the Calendar page, which shows Google Calendar only. | `lib/family/remind.ts`, `/api/cron/family` |
| A shared name-ideas list with voting | Built. Love, like, not this one; a vote is its voter's alone; names you both like come first. | `family_names`, `family_name_votes` |
| Prep checklists with price, bought, link and a running total; starter lists pre-filled | Built as a sheet edited in place (Enter moves down, Tab across). Three starter lists, 45 lines, no prices. | `family_lists`, `family_list_items`, `lib/family/starter.ts` |
| Letters to baby: a different question each week, answered by voice in about a minute | Built. 52 questions, one a week, no repeat for a year. "Answer aloud" records in the browser; the words are written up afterwards by Whisper on the PC, free. Typing works too. | `lib/family/letters.ts`, `components/family/Letters.tsx` |
| Baby log: feeds, sleep, nappies; one tap, both parents, phones and wall | Built for phones and the PC: one tap each, one sleep at a time, undo, today's totals, the other side offered first. **The wall is its own stream.** Works now, before the birth. | `baby_log`, `lib/family/babylog.ts` |
| Household admin: documents, warranties, bins | Built. A document or warranty carries its file and the date it runs out; a bin says when it is next collected. | `household_items` |
| Household budget: bills, baby costs, who paid what | Built. Each month: the total, by kind, what each of you paid, and what would make it even. Family data: it reads nothing from the finance section and writes nothing to it. | `household_costs`, `lib/family/money.ts` |
| Input: normal capture routed to the family timeline, plus upload in the app | Built. A capture that names the family first ("Family: …", "For the baby, …", "Baby: …") lands on the timeline in the words it came in. Upload is in the timeline and household forms. | `lib/family/capture.ts` |
| Photos on Cloudflare R2 | **Not done: the account is Phil's.** Until then pictures are kept in the app's own private storage, one bucket, under the family space's id. The move is a ticket. | |
| Later keepsakes: design the data for them now | Done in the design: see "Keepsakes". | |
| Kirsty's first run asks her to confirm that everything is shared | Built: each person sees the note once, with **Understood**, and it is recorded per person. | `family_acks` |

## How it is put together

- **Ten tables, one access group** (`organisation.family`), all in the team's space, all behind the same row rules as everything else in a team: a member reads and writes, a viewer reads, someone outside the team sees nothing. Two things are tighter than that and enforced in the database: **a vote** and **the "I understand it is shared" confirmation** can only be made by the person they belong to.
- **Files** go in one private bucket, each under the family space's id. The storage rule reads the space from the path, so a file follows the team exactly as the rows do. The browser is never given a path: it asks for a row's file and is sent a link that lasts five minutes.
- **The page asks nothing of the cloud AI.** Weeks, totals, the week's question, reminders and capture routing are all plain arithmetic and rules. The one model involved is Whisper on the PC, for a spoken letter, on the free lane only: a letter waits for the PC rather than spend anything.
- **Reminders are claimed before they are sent**, per person, on the appointment itself. Two knocks in the same minute send one. An appointment reminder is sent whatever the hour and whatever else went out that day (they put it in the calendar; a forgotten scan costs more than an interruption). The Sunday letter question takes its place in the daily three.

## Keepsakes: what the data already holds

Nothing was built for these, as asked, but each has what it needs:

- **Narrated film / time-capsule site:** every timeline entry has a stable id, its date, its author, its words, and at most one picture or recording; the week of the pregnancy or the baby's age is worked out from the dates, not stored, so correcting the due date corrects every label.
- **Letters collection:** a letter keeps the exact question it answered and, when spoken, the original recording as well as its words.
- **Photobook:** photos are entries like any other, so order, captions and authors come free. When photos move to R2 the entry keeps its path and nothing else changes.

## Found on the way

- **"30 February" was accepted as a date** by the first version of the date check (JavaScript reads it as 2 March). Caught by a unit test before anything used it; dates are now read back and compared.
- **The release script would have shipped this stream's migration with the previous release.** It applies whatever migration files are in the folder, not the ones in the commit being shipped, and 0171 was sitting there uncommitted while release 7 was building. Moved aside in time (hosted went to 0170 only). The script now refuses to run if the migrations folder differs from the commit it is shipping.
- **A scheduled job with no handler answered 500 every time it was due.** The tick keeps its own table of handlers; the family job was in the schedule and not in that table. Caught by the tick's own check; there is now a unit test that every scheduled job has a handler.
- **Supabase refuses a direct delete from its files table**, so removing a timeline entry removes its file through the storage service, and the tests clean up the same way.

## Not built

- **The wall** (baby log on the wall, nudges and reminders aloud): Stream G.
- **Appointments on the Calendar page.** They are on the family page and in reminders only.
- **The baby log by voice** ("baby fed, left side"). One tap was the ask; a spoken version would be the same rule-based routing as "Family: …".
- **Recurring bills that add themselves.** A cost can be marked monthly or yearly; nothing is created from that yet.
- **Editing a timeline entry on the page.** It can be removed and re-added; the API accepts changes.
- **Photos over 4 MB** are refused in words (the host's request limit). Phone photos are often larger; shrinking them in the browser before upload is the fix and was not done.
- **Photos on R2**, as above.
- **A private-notes switch** for the family space: offered to Kirsty as a question in the checklist, not built until she asks.

## Design calls

- **Under Organisation, not a new section.** Sections are fixed in two database constraints and in every team's toggles; the family tables needed none of that.
- **The family space is a team's space.** So membership, roles, leaving and the session rules are the ones already tested, and the real team stays Phil's to create.
- **No model for routing a capture to the family.** It goes there only when the family is named first. A capture that merely mentions the baby is filed as usual; a wrong guess here would put a private note in front of someone else.
- **Reminders for appointments ignore the daily three and quiet hours;** the weekly question does not.
- **The baby log works before the birth** so it can be tried, and moves to the front of the page once "Born on" is filled in.
- **One sleep at a time.** A second "Asleep" while one is running is refused rather than guessed at.
- **Whoever adds a cost paid it,** unless they say otherwise; "Not paid yet" is a choice.
- **Prices are never guessed** and the starter lists carry none.

## Checks

- Unit: 30 (weeks and ages, the baby log's arithmetic, money, bins, the letter questions, reminders, capture routing, starter lists, file kinds).
- Access, at the database: 9 (outsider, viewer, member; a vote and a confirmation cannot be made in another's name; one profile per space; the files rule).
- End to end: 14, as two people, including a spoken letter through to its words, the tick claiming each reminder once, and a capture landing on the timeline.
- The page was photographed at phone and desktop sizes and three layout faults found that way were fixed (list names cut off, a date running over a title, "just now ago").

## For Phil

- **Chunk 13 of MYC-193** walks the two of you through it. Creating the team and choosing it are the first two steps and need your authenticator.
- **MYC-200:** Cloudflare R2 for photos (an account and a card on file; the free tier covers 10 GB). Not urgent: pictures work today.
- **One question for Kirsty** in the checklist: is "everything here is shared" what she wants, or does she want private notes?
- This terminal cannot write the Claude project's copies of the state documents; `graphify update .` could not run (the tool is not installed on this PC).
