# Master run — Stream A report (capture)

*2026-11-20, 02:40–05:20 London. Claude Code on the PC. Ticket MYC-183. Status: **built and deployed**; Phil's live check is chunk 3 of MYC-193, and it waits on him building the iPhone Shortcuts from the guide in his queue. Migrations 0159, 0162, 0163.*

## What the brief asked for, and where each part stands

| Asked (master run §5) | Built | Where |
|---|---|---|
| Answer in under a second, do the work afterwards, never duplicate on a retry | Yes. One insert, then **202 "saved"**; filing happens after the response. The same client id sent again is the same capture. On production a capture was answered at once and filed six seconds later. | `lib/capture/pipeline.ts`, `app/api/capture/route.ts`, `app/api/capture-audio/route.ts` |
| Nothing lost if filing fails | Yes. A stored capture that was never processed, or failed, is finished by a sweep on the next capture and every night, up to three attempts, and stays visible with its error after that. | `lib/capture/sweep.ts`, `app/api/cron/tickets-nightly/route.ts` |
| Dictation sent at once; audio saved on the phone first; removed only on confirmation; a Retry Shortcut; triggers | Server side yes. The Shortcuts themselves are a written build guide, because a Shortcut file cannot be made or signed on a Windows PC. | `docs/checklists/iphone-shortcuts.json` (ticket in Phil's queue) |
| Edit before sending; dismissing the box loses nothing | Yes: the Shortcut sends the unedited words first, then the answer to the box. Changed words re-file the capture and are kept as his. | `correctCapture` in `lib/capture/pipeline.ts` |
| Whisper on the PC re-transcribes; his hand edit wins | Yes. The recording is kept with the capture; the PC collects a transcription job, and the better text replaces the stored text unless he edited it. | `lib/capture/jobs.ts`, `lib/capture/transcript.ts`, `pc-worker/` |
| Paragraphs in long captures, wording untouched | Yes, on the server. | `lib/capture/paragraphs.ts` |
| "Saved", then a push "Filed as …" with a fix link | Yes. The push is a reply to something he started, so it is outside the interruption budget. | `lib/nudges/interrupt.ts` |
| Every capture to review; seven days, then filed with the guess, tagged "unreviewed" | Yes. | `lib/capture/queue.ts`, `lib/capture/autofile.ts` |
| Review as swipe cards in the evening close | Yes: Accept, Fix (five choices or the full editor), Discard; the whole deck stays within ten cards. | `components/daily/CloseDay.tsx`, `app/api/daily/close/route.ts` |
| Long captures split into items, each a card linked to the original recording | Yes. Items are held as ideas with a suggested kind until accepted; each plays the original recording. | `lib/capture/split.ts` |
| Share sheet, photo capture, typed quick note | Photo and share-sheet doors exist on the server; the Shortcuts for them are in the guide. | `app/api/capture-photo/route.ts` |

## Findings

1. **API tokens had never worked**, so the phone could not have used one. Three faults, each hiding the next: the token table's owner column was removed by the migration that created it (making a token failed); reading a token looked for the same column; a token that resolved reached the database as nobody. The `tix` command hid all of it by falling back to the master secret. Fixed, with a check that makes a real token and uses it (`e2e/api-token.phil.spec.ts`). The phone gets a token that can capture and ask for the daily prompts and nothing else; it cannot review, read tickets or reach settings.
2. **A token's "projects" scope is recorded but checked by no route.** Harmless for the phone's token (it has none), wrong for a tickets token. On the build list.
3. **About 40 captures were waiting** on production when the new queue went live (the old queue hid typed captures and counted differently). Anything older than seven days files itself on tonight's run, tagged "unreviewed".
4. **Spoken reminder times never set a reminder** in the first build of the pipeline; found by the tester within the hour, fixed (`lib/capture/reminderDue.ts`).
5. **The PC worker failed against production for ninety minutes unnoticed** (it was running code from before a fix). It now reports a refusal by Telegram, once, straight from the PC.
6. **One upload is capped at about 4 MB by the host**: roughly eight minutes of speech at the Shortcut's Normal quality. Longer recordings stay on the phone. A two-step upload exists as a design, not as code.

## What was done

- **0159** capture pipeline columns, the `captures` file bucket (files follow their rows), the job queue and the worker heartbeat. **0162** the client id is unique per space, not globally (two people's phones can no longer collide). **0163** a capture card is answered when its ticket leaves the Inbox by any route.
- The pipeline, the three doors, the sweep, the seven-day rule, the split, the transcript rule, capture cards in the evening close, the picture and recording on the review card.
- The PC worker: a scheduled task on this PC that collects jobs, transcribes with Whisper on the graphics card and can run the local model; it also knocks on the five-minute tick (see the next report).
- The phone's token type in Settings → Security → API tokens.
- 113 end-to-end checks on capture and Day log, every earlier capture finding now a passing check; 5 checks on tokens; unit tests for paragraphs, splitting, the transcript rule, reminder times and token scopes.
- Commits: the capture work is in `8c4d8c8..c9f95d4` (first release, 04:29) and in the second release that follows this report (token fixes, the review card's picture and player, the Shortcuts guide, the tick).

## Deviations from the brief

- **The recordings folder is `iCloud Drive/Shortcuts/Mycelium Inbox`**, not a top-level "Mycelium Inbox": a Shortcut can save without a prompt only inside its own Shortcuts folder.
- **The Shortcut records and then transcribes the recording**; it does not use dictation. Dictation keeps no audio and a recording makes no text, and they cannot hear the same speech in one run.
- **Classification stays in the cloud for now**, not on the PC's model. It costs fractions of a penny per capture and answers in seconds; on the PC it would wait up to a minute for the next collection. The expensive part, transcription, is on the PC. Revisit when every cloud call is behind the cap (Stream E).
- **No model reads a photo.** That costs money per picture. With words, the words are filed and the photo rides along; without, it waits in review as a photo.
- **A shared link is kept as a link**; the page is not fetched or summarised.

## Design calls

- **Receive and process are separate steps with a status on the row**, rather than a queue for everything: the common case finishes in the same function a moment after the reply, and the status makes any failure visible and retryable without another moving part.
- **Every reply carries a status word.** A Shortcut cannot see whether a request succeeded, only what came back; it deletes the phone's copy on the word "saved" and nothing else.
- **Split items are held as ideas, not filed.** A wrong guess on one sentence out of a ramble should cost one tap at review, not create a ticket to clean up.
- **The two-step send** (unedited words first) exists so that closing the edit box, a call arriving, or the phone dying costs nothing.
- **"Card answered when its ticket leaves the Inbox" is a database trigger**: at least six routes move a ticket.

## Not built (on the list)

Recordings over about 4 MB; classification on the PC's model; removing a deleted capture's recording from storage; an unmatched workout capture leaves a pending row; typed captures get no shadow prediction when cloud AI is off; the "projects" scope of a token.

## For Phil

- **Build the Shortcuts** from the checklist in your queue (about 45 minutes, once). It starts with making the phone's token. Do not type the token into the checklist.
- After that, **chunk 3 of MYC-193** is the live check: seven steps, fifteen minutes.
- **Rotate the master secret** once the new Shortcuts work; the old Shortcuts stop working at that point, which is the intent.
- This terminal cannot write the Claude project's copies of the state documents; `graphify update .` could not run.
