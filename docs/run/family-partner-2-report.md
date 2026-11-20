# Parallel run — lane DC report (family, second pass; partner, second pass)

*2026-11-20, 12:00–14:30 London. Claude Code on the PC, worktree `lane-dc`, port 3107. Tickets MYC-186 (family) and MYC-185 (partner). Status: **built on the branch, not merged, not shipped**; migration 0180 applied to the local stack only. Checked as the two test people; Phil's and Kirsty's live check is the chunk at the end, for the integrator to number.*

## What it is

Six things the first family and partner reports left in "Not built", on one branch.

| Asked | State | Where |
|---|---|---|
| The family's appointments on the Calendar page | Built. Every appointment on the family timeline is on the Calendar page for every member of the family team, beside the Google feeds, tasks, birthdays, events and bills, marked **Family** (its own colour in the legend; the word on the line). An appointment is an hour long on the calendar and carries its place. Nobody outside the team sees them: the page reads the rows as the person looking. | `lib/calendar/family.ts`, `lib/calendar/fetch.ts`, `components/compost/CalendarView.tsx` |
| Editing a timeline entry on the page | Built. **Edit** on any entry opens it as a form where it stands: the line, the words, the day (for an appointment, the date and time and the place). **Save** sends what changed and nothing else; **Cancel** leaves it as it was. A letter's question is shown and cannot be changed. | `components/family/Timeline.tsx` |
| Photos over 4 MB | Built. A picture over 4 MB is made smaller in the browser before it goes: at most 2560 px on its long side, re-encoded as a JPEG, stepping down in size and quality until it is under 3.5 MB. The day it was taken is read from the original's EXIF before anything is done to it and becomes the entry's day, for every JPEG, big or small. A picture the browser cannot decode (most HEIC files on a desktop) goes as it is and the server still answers in words. | `lib/family/photo.ts`, `components/family/shrink.ts` |
| Recurring household bills that add themselves | Built. A cost can be marked **monthly** (a tick in the add row, or one press on a line). When the month turns, the family tick writes that month's line: the same title, amount, payer and category as the latest line of that bill, on the same day of the month (the last day in a shorter month). Idempotent in the database: one line a month per bill, however many knocks and whoever's turn. The line the tick wrote reads *monthly* and is never a source of its own; deleting the bill stops the rhythm without touching the months already written. Nothing of it touches the finance section. | `lib/family/bills.ts`, `lib/family/remind.ts`, `components/family/Budget.tsx`, 0180 |
| A team ticket offers the team space's types and projects | Built. The issue page now reads the meta of the ticket's own space, so a ticket in a team's space offers that team's issue types, projects and label fields; the reader's own appear on the reader's own tickets and nowhere else. The server already refused a type or project from another space; the page no longer offers one. | `lib/work/client.ts` (`useSpaceMeta`), `components/work/IssuePage.tsx` |
| A team's default project has no short key | Built. A team's space takes a key from the team's name when it is made (initials of up to four words, or the first four letters of one word; unique against every space and project key, with a number on the end when needed: WH, WH2 …). Every team space already here was backfilled the same way, oldest first, and its `TKT-n` tickets were rekeyed to the new prefix with the number kept; the old key stays an alias, so every link still opens. The default project answers to the space's key as it always did. | 0180 (`team_space_prefix`, `spaces_00_team_prefix`) |

## How it is put together

- **The calendar's cache now holds the feeds only.** It used to hold one person's whole calendar for five minutes, tasks and all; a family appointment written a moment ago would have waited five minutes to appear. The Google feeds (shared, slow) are still fetched once every five minutes for the process; everything from the database is read fresh on each call, as the caller.
- **The bill rhythm is a pure function** over the rows that are a source or came from one (`monthlyBillsDue(rows, today)`), run from the tick that already goes round every member of a family space every fifteen minutes. The tick's own check and the unique index say the same thing; the index is the one that cannot be forgotten.
- **The photo limit is the host's.** Vercel stops a request at 4.5 MB; the server refuses a file over 4 MB; the browser aims for 3.5 MB so the form around the file fits under it. 2560 px is more than any phone or laptop screen shows and prints at eight inches at 300 dpi, which covers the photobook.
- **The space key is a trigger, not a change to `create_team`.** A team made by the app, by SQL, or by a test all go through the same insert, so all three get a key; `create_team` is untouched and its grants with it.
- **People still belong to a space.** The assignee list on a team ticket is unchanged (`peopleIn` with the ticket's space); the wording table was not touched.

## Found on the way

- **Five personal spaces on the local stack have no key either** (every one but Phil's), so Tess's own tickets are `TKT-n`. The directive named teams, so only team spaces were changed; the same trigger would do for personal spaces. Left as a note, not a ticket: hosted has one personal space, Phil's, and it has its key.
- **A JPEG with EXIF and nothing else is a JPEG to the server** (it checks the type and the header, as the date reader does). The end-to-end check uses one for the date, and a real, decodable PNG stored without compression for the size, so no binary file is kept in the repository.
- **The local CLI refuses `supabase db push --local`** once a higher-numbered migration from another lane is in the shared history, as the coordinator warned; 0180 was applied with psql and its row written to `supabase_migrations.schema_migrations` by hand.

## Not built

- **Yearly bills.** A cost can be marked yearly; the rhythm was asked for monthly and that is what runs. The same function takes a second case when it is wanted.
- **A missed month is not filled in.** A bill from March with nothing written since adds this month's line, not April to October. On purpose: those months were the household's to record.
- **Photos on R2**, still Phil's account (MYC-200).
- **Editing a picture or recording** on an entry: the words and the day change, the file does not.
- **Quick-create inside a team ticket** (a sub-task from the issue page) still reads the reader's own meta for its own pickers; the sub-task's type comes from the ticket's space now, and the server refuses anything else.

## Design calls

- **The line the tick writes is `recurs = 'none'`**, marked by `recurs_from`, rather than a second monthly row. Two monthly rows for one bill would be two sources. The page shows both as *monthly*.
- **A price rise follows the latest line; the day follows the first.** Typing a new amount on last month's line is how the rise is recorded; moving one month's date by hand is a one-off.
- **The entry's day is the EXIF day, not the file's modified time.** A photo saved from a message has today as its modified time; the EXIF day is the day it was taken or nothing.
- **Both of the pass's migrations are in one file**, 0180, because the lane has one reserved number. The two parts are marked and independent.

## Checks

- Unit: 14 new (bills: days in a month, same day in a shorter month, the rhythm's cases; photo: limits, fitting, EXIF in both byte orders, dates that are not; calendar: the mapping). The whole suite, 1029 tests: everything passes except the registry checks against the local database, which fail on four tables other lanes have added to the shared stack and this worktree does not know (`ai_models`, `finance_holdings`, `finds`, `weekly_closeouts`); two access suites timed out while the end-to-end run shared the database and pass on their own. `tsc` and `eslint` clean.
- End to end, port 3107, as Tess with Phil over the API: `e2e/family.tess.spec.ts` (17 pass; four new or extended: the Calendar for both of them; editing an entry and an appointment's place with Cancel; the monthly bill through two knocks, the index refusing a second line, the page's marks; a JPEG landing on its taken day and a 4.6 MB PNG stored as a JPEG under 4 MB) and `e2e/work-team-space.tess.spec.ts` (3 pass, new: the team key and its default project; the team ticket's pickers; her own ticket's pickers).
- Regression: `e2e/people-in-space.tess.spec.ts` 4 pass, `e2e/tick.phil.spec.ts` 6 pass. `e2e/work-issue.phil.spec.ts`: two tests fail (the #ticket chip's navigation, and opening a sub-task from the page) and fail the same way with this lane's issue-page change taken out, so they are the branch's base, not this pass; the other five pass.

## For Phil

Nothing needs you for this lane: no new account, no key, no authenticator. The migration goes with the release that merges the branch.

## Live check (steps; the integrator numbers the chunk)

1. On the phone, open **Family**, add an appointment with a time three days from now and a place. Open **Calendar**: the day has a dot; pick the day; the line reads the appointment's title, the place, and **Family** in the legend's colour. Ask Kirsty to open Calendar: the same line.
2. On the appointment, press **Edit**, change the place, press **Save**: the card shows the new place and *Coming up* at the top of Family does too. Press **Edit** again, change the line, press **Cancel**: nothing changed.
3. Add a photo straight from the phone's camera roll, one larger than 4 MB. It goes through without the "over 4 MB" sentence; the card shows the picture and the day it was taken, not today.
4. In **Budget**, add a bill with **Every month** ticked. On the first of next month (the tick runs every fifteen minutes), open Budget: the month's line is there, marked *monthly*, on the same day, for the same amount; the day after, still one line.
5. In **Work**, open a ticket in your team's space (its key starts with the team's initials, not `TKT`). The **Project** picker lists the team's projects and none of your own; **Type** lists the team's types. Open one of your own tickets: the opposite.
