# Master run — Stream B report, part 1 (the daily loop)

*2026-11-20, 03:20–05:30 London. Claude Code on the PC. Tickets MYC-184 (daily loop) and MYC-187 (the tick). Status: **built and deployed**; Phil's live check is chunk 2 of MYC-193. Migrations 0161 and 0165. This is part 1: the loop itself. The Boys' group chat, dormant features, the finish line, the weekly close-out and the monthly measures are not built yet and are listed at the end.*

## What the brief asked for, and where each part stands

| Asked (master run §6, research rules 16–27) | Built | Where |
|---|---|---|
| The morning pick fires when the alarm stops; the evening close when the phone goes on charge, with a fallback time | Yes. The phone's automations ask and show the line themselves; on a day they do not run, the line arrives at the fallback time. | `app/api/daily/morning`, `app/api/daily/close`, `lib/daily/prompts.ts` |
| The proposal comes from dates, priority and energy; one tap accepts or swaps | Dates, urgency, priority score and what is already in progress: yes. Energy: not yet (there is no energy signal to read). | `lib/daily/propose.ts` |
| Today holds five items, the first the one that makes the day a win | Yes, and the total stays under half the day's free time, with shown times half as long again as the estimate. | `lib/daily/propose.ts`, `lib/daily/view.ts` |
| Untouched for 45 minutes, the proposal applies itself | Yes. | `autoAcceptDue` in `lib/daily/server.ts` |
| Evening close: done, moves, drops, capture cards, low-confidence finance cards; under two minutes, ten cards, opens with what got done, "Close the day" always works | Yes, except finance cards (that stream is not built). | `app/close`, `components/daily/CloseDay.tsx` |
| Every big item carries a five-minute next step | The field and the card exist; the PC's own model now writes steps overnight and keeps only the ones it marks sure. | `lib/daily/firstSteps.ts` |
| A limit on things in progress that works as "park one to start one" | Yes: soft, three by default, never for a thing of fifteen minutes or less; Park saves where it was left. | `actOnItem` in `lib/daily/server.ts` |
| One budget of three app-started interruptions a day across push, Telegram and the wall | Yes, and the existing senders now go through it. See "Three moments". | `lib/nudges/budget.ts`, `lib/nudges/interrupt.ts` |
| Nothing during a running focus timer; not the same nudge in the same words twice | Yes. | `lib/nudges/budget.ts` |
| The wording table | Yes: one module, and a test fails on a banned phrase. | `lib/daily/words.ts` |

## Three moments

The budget is three app-started interruptions a day. Before this work the app had five things that each wanted to speak first: the morning briefing, the morning pick, the afternoon check-in, the evening close and the Day log prompt. They are now three moments:

- **Morning:** the briefing. If nothing has offered today's pick yet, the pick is its first line.
- **Afternoon:** the check-in on what is scheduled today, weighed like anything else: held during a focus timer, dropped if the day's three are spent.
- **Evening:** the Day log's message. If the evening close has not been offered yet, the close is its first line, with its link.

When the phone's own automation asks (alarm stopped, charger connected), the phone shows the answer and the server sends nothing on top: that is a reply to something Phil did, not an interruption. Reminders he set himself, replies ("Saved", "Filed as…") and another person's nudges are outside the budget, as decided. The morning and evening moments are sent even when the three are spent, because without them there is no loop, but they still count.

## Findings

1. **The morning briefing had not been sent since 24 October.** It sends only when the London hour is 7 (9 at weekends), and its one daily trigger fires at 06:00 UTC. That is 07:00 London in summer and 06:00 in winter, so from the day the clocks went back it was skipped every morning. It now rides the five-minute tick and keeps its own London hour, so it will arrive at about 07:00 on the first morning the PC is on (or once the one cron-job.org job exists).
2. **Nothing sub-daily was firing at all**, as the Phase 0 report said: Vercel's free plan allows daily jobs only and the four cron-job.org jobs were never created. Rather than four jobs for Phil to create, there is now one route that knows the schedule, and the PC worker knocks on it every five minutes. Day log prompts, check-ins, reminders, quote research and rundowns therefore start working again without him doing anything, while the PC is on. His ticket shrinks to one job, for when the PC is off.
3. **A small local model writes a wrong first step about a third of the time** ("Measure the car's width" for booking an MOT). Asked to mark which it is sure of, it flags most of the wrong ones itself. Only sure steps are kept, about half; the rest keep the plain line. A wrong step on the focus card costs more trust than a plain one.
4. **The "same words" rule would have silenced the morning prompt** on any day whose first task was the same as an unanswered yesterday's. The two prompts the loop is built on are now exempt; chases are not.

## What was done

- **0161** day plans, plan items, the next-step and parked fields on tickets, the interruption ledger. **0165** a marker for when the evening close was offered, so its three possible senders cannot each send it.
- The proposal, the focus card and its actions, the evening close with capture cards, the slipped-date card, both prompts with fallbacks, a one-line Today for automations (`/api/daily/say`), the Today panel in Settings (times, quiet hours, the limits, free minutes per weekday).
- **The tick** (`/api/cron/tick`, schedule in `lib/system/schedule.ts`): briefing, Day log, daily prompts, reminders, check-ins, quote research, rundowns. Every job is safe to run twice. The PC worker knocks every five minutes and now reports by Telegram, once, if the app refuses it.
- First steps overnight from the PC's model (queued at 02:00 and whenever a day is closed).
- Checks: 13 end-to-end on the loop, 5 on the tick, and unit tests for the proposal, the budget, the fallbacks, the schedule, the wording and the first-step parser.

## Deviations from the brief

- **Energy is not used in the proposal.** Nothing in the app records it yet. The proposal uses dates, urgency, the existing priority score, what is in progress, and time.
- **Finance cards are not in the evening close**: the finance stream comes later.
- **The fallback times are not exact.** They are checked every five minutes, and only while something is knocking on the tick.
- **The check-in can now be dropped** on a day when three interruptions have already gone. That is the budget working as decided; the items are on Today either way.

## Design calls

- **The proposal is rules, not a model.** It has to be there at alarm-stop every day, explainable ("Its date is today"), free, and the same whether or not the PC is on.
- **"Three moments" rather than a strict first-come count.** Counting alone would have let the briefing, the pick and the check-in use the day's three before the evening. Giving the morning and evening a carrier each keeps the count honest and the loop whole.
- **When the phone asks, the phone shows.** A push on top of an automation's own notification is the same message twice on the same device.
- **One tick route with the schedule on the server**, not a schedule in each knocker: the PC and cron-job.org need to know one address and nothing else, and changing a cadence is a code change in one table.
- **Steps the model is not sure of are dropped, never shown as suggestions.** A suggestion still has to be read and judged at the moment the research says to ask for no judgement.

## Not built yet (Stream B, part 2)

The Boys' group chat (one bot per agent; creating the bots is Phil's); dormant features (usage events, true history, the nav and dashboard marks, the weekly question); the finish-line view; the weekly close-out; the eight monthly measures; ten-minute and two-minute notices before a scheduled switch; wall speech (the ledger rows are written, nothing reads them aloud yet).

## For Phil

- **Chunk 2 of MYC-193** is the live check: seven steps, fifteen minutes, best done across one real day.
- The morning briefing will start arriving again. It now opens with today's one thing.
- The Day log message at 21:30 now opens with the evening close and its link.
- Settings → Today holds the times and limits if the defaults are wrong for you (morning 08:30, evening 21:30, quiet 22:00 to 07:00, three interruptions, three things in progress).
- MYC-180 is now one cron-job.org job instead of four, and only matters when the PC is off.
- This terminal cannot write the Claude project's copies of the state documents; `graphify update .` could not run.
