# Phase 1 tester hand-back — Day log Parts A–E, typed capture, capture learning

*2026-11-20. One of five parallel testers. Last full run on the compiled test build: 92 passed, 0 failed, 10 held as `test.fixme` findings (9 fail when un-skipped; capture-9 is a timing race).*

## Specs

| File | Person | Passing | Held as findings |
|---|---|---|---|
| `e2e/daylog.phil.spec.ts` | Phil | 27 | 0 |
| `e2e/daylog.tess.spec.ts` | Tess | 3 | 1 |
| `e2e/capture.phil.spec.ts` | Phil | 58 | 8 |
| `e2e/capture.tess.spec.ts` | Tess | 4 | 1 |
| `e2e/daylog.helpers.ts` | shared helpers | | |

Residue on the local stack: 209 soft-deleted `raw_captures` rows and their `capture_learning` rows, all prefixed `E2E-capture-` (no route deletes them).

## Fixed by the tester (Day log)

- An impossible date (`/api/journal/days/2026-02-30`) answered 500; the calendar is now checked for all twelve call sites (`lib/daylog/day.ts`, `lib/daylog/day.test.ts`).
- Deleting a day left its review items in the New entities queue (`app/api/journal/days/[date]/route.ts`).
- A skipped day read "1 messages, no summary"; now "scores only", plural fixed (`components/daylog/DayListClient.tsx`).
- Score buttons had no accessible name or pressed state (`components/daylog/DayClient.tsx`).

## Found, not fixed

**Capture pipeline** (left for the rebuild; each has a `test.fixme` of the same name):

- **capture-1** A typed task is triaged twice: it is an Inbox ticket and also sits in the capture review list (`app/api/captures/review/route.ts:63`); leaving the Inbox never sets `reviewed_at`.
- **capture-2** The pending count under-counts: `lib/captures/reviewCount.ts` lacks the typed clause and the `deleted_at` filter the list has.
- **capture-3** A double submit with one `client_uuid` answers 500 (both pass the duplicate read; the unique index refuses the second). One row is stored.
- **capture-4** "remind me to…" in Auto never becomes a reminder: the classifier says `reminder`, `lib/router/writeCapture.ts` has no reminder branch.
- **capture-5** "Routed to" links are dead for most destinations: the UI switches on old names, `routed_to` holds table names (`components/compost/CapturesClient.tsx:11`, `CaptureReviewClient.tsx:104`).
- **capture-6** Someone else's `client_uuid` answers 500: the unique index is across all spaces. Nothing leaks. Needs a migration (unique per space).
- **capture-7** An approved quote never leaves NEEDS REVIEW: low confidence is ORed in without `reviewed_at is null`, and every quote is stored with confidence low.
- **capture-8** A plain task accepted from the Inbox is learned as "ticket" (`lib/capture/learning.ts:102` tests `project_id`, which every ticket has).
- **capture-9** (intermittent, outside the surface) A successful capture can throw in the page: `components/art/MyceliumField.tsx:146-154`, a ripple with a negative radius.
- Smaller: a typed ticket shows as "Task" on its review card; review cards of the same kind repeat element ids; a re-route keeps the previous kind's detail object and urgency; discard after a re-route leaves the row it made; the `deduplicated` answer carries no capture id; `client_uuid` is not validated as a uuid.

**Day log:**

- **daylog-1** For anyone but Phil, a companion called Phil is dropped (`lib/daylog/extraction.ts:42` hard-codes "phil" as self).
- If the model fails at close the day closes with no narrative, and re-extract never writes one.
- Viewing a date creates its row (the spec says so), so every ←/→ visit leaves a "pending" row. Product decision.
- Any digits typed while the score line is waiting are taken as scores ("We went to 2 pubs" sets mood to 2).
- Deleting a day leaves its quote captures in capture review.
- The "Lost my thread" fallback is fed back to the model as its own turn.

## Capture behaviour the rebuild must preserve

**POST `/api/capture`** — body `{ text?, client_uuid?, typed?: { kind, fields } }`. 400 for "bad json", "unknown capture type", "text required", or `{ error, errors }` from the registry's `validate`, with nothing stored. No session: 401; the cron bearer is not a capture credential. An existing `client_uuid` answers `{ ok: true, deduplicated: true }` and stores nothing. A typed submit never runs the classifier on the request path, never resolves mentions, never creates or queues a person. Stored typed captures: `source = web`, `llm_source = regex`, `raw_text` = the primary field, classification carrying `typed: true`, `typed_kind`, `typed_fields`; a ticket is stored with `kind = task`.

**Typed answer:** `{ ok, typed: true, kind, title, routed_to, routed_id, ticket_key, review, capture_id }`.

| Typed kind | On submit | On APPROVE |
|---|---|---|
| task, ticket | `review: "tickets_inbox"`, an Inbox ticket, `source = ui`, `suggested` = heuristics + the form's fields + `typed` | no second ticket |
| reminder | `review: "captures"`, stays in `raw_captures` | ticket of kind reminder, moved to Next, `remind_at` from London wall clock |
| purchase, media, quote, account | as above | row in `purchases`, `media_items`, `quotes`, `accounts` |
| pain_log | as above | `exercise_pain_logs`, `exercise_name = standalone` |
| journal | as above | appended to today's Day log transcript, channel `capture` |
| person | as above | updates the chosen person; never creates one |
| decision, idea, note, workout | as above | stays a capture |

**Auto answer:** `{ ok, kind, urgency, title, llm_source, routed_to, routed_id }` (no `capture_id`, no ticket key). Auto files immediately.

**Auto with AI off:** regex fallback (`llm_source: "regex"`), never 5xx; title is the first seven words. Plain sentence → `capture`; "todo…" → task (Inbox ticket); "decided…" → decision; "what if…" → idea; "remember…" → note; reflective → journal (today's Day log); "buy…" and "need to renew…" → purchase; sets/reps → workout (stays a capture); body part + pain word → pain log; "watch list…" → media item; "quote:…" → held with confidence low, the quote row made on approve.

**PATCH `/api/captures/[id]/review`** — approve, reroute, discard; anything else 400. Unknown or another user's id: 404; any action on a discarded capture: 409. A typed form is validated first. Approve is idempotent. Reroute with a changed kind deletes the old routed row and makes the new one. Answer `{ ok, action, capture: { id, classification, routed_to, routed_id, reviewed_at, discarded_at } }`.

**Review queue, GET `/api/captures/review`** — never deleted or discarded rows; newest first; `limit` default 20, cap 200; `before` cursor, `next_cursor` = last row's `created_at`. `needs_review` = confidence low/ambiguous, OR kind ambiguous, OR unreviewed for over an hour, OR typed and unreviewed. `GET /api/captures` filters deleted only. `DELETE /api/captures/[id]` soft-deletes and leaves the routed row.

**Learning** — one `capture_learning` row per capture. Auto writes `predicted_*`; typed writes `chosen_*` and the shadow classification fills `predicted_*` after the response; approve or reroute writes `approved_*`; a ticket leaving the Inbox does the same.

**Isolation** — Tess sees none of Phil's captures, gets 404 acting on one by id, and her captures, ticket and learning rows are hers.

## Needs Phil's eyes (one sitting, on production; drop the last two first)

1. **Telegram prompt.** At 21:30 the bot message reads "Evening. … Talk, Quick or Skip?" with four buttons; any calendar or weather it quotes is right.
2. **A Talk night.** Tap Talk, answer four or five questions, name someone not in People. One question per turn, "who's X?" once, no filler, no facts you did not say. Say "done", reply "4 3 5 2": a recap with a link and "N items to review".
3. **`/journal/<today>`.** The entry reads as your words (60–160 words, then one bullet per scene); scene cards in order with channel labels; cost at the bottom. Automation could not see this at all.
4. **Facts.** Open the "N TO REVIEW" badge; approve one fact and one who-was-there; edit that fact's text and kind on the day page, then delete it.
5. **Voice note and photo by Telegram** while a day is open: the note appears as text; the photo lands on the scene you were describing after close.
6. **Capture form on the phone.** Tap +, pick Reminder, submit with no date: the message sits on the field, the keyboard does not cover the button, the Type dropdown works one-handed.
7. **Review card look.** `/organisation/captures/review` with a typed capture waiting: readable, APPROVE reachable without scrolling on mobile.
8. *(drop first)* **Carry-over.** The night after one with a loose end, the opener starts "Last time you mentioned…".
9. *(drop first)* **Linked user.** Needs a second account in a team with you.

Not provable by automation: the idle close after two hours and the snooze; the monthly spend alert.

---

## Second round, 2026-11-20 04:30 — after the capture rebuild (Stream A)

The capture specs were adapted to the rebuilt pipeline (202 and poll, a status word in every reply, one decision per card and ticket, split items held as ideas, audio with the spec playing the PC worker's part, the seven-day rule, the sweep). On the newest build: **113 passed, 0 failed, 1 held** (`daylog-1`, the hard-coded "phil"). Every earlier capture finding (capture-1 to capture-10) is now a live, passing check.

| File | Person | Passing | Held |
|---|---|---|---|
| `e2e/capture.phil.spec.ts` | Phil | 77 | 0 |
| `e2e/capture.tess.spec.ts` | Tess | 6 | 0 |
| `e2e/daylog.phil.spec.ts` | Phil | 27 | 0 |
| `e2e/daylog.tess.spec.ts` | Tess | 3 | 1 |
| `e2e/quotes.phil.spec.ts` | Phil | 15 | 0 |

New helper: `e2e/capture.helpers.ts`.

### Bugs the round found in the new pipeline (all fixed, each proved by a check)

1. **Reminders were never set from spoken times.** Only an ISO date was accepted, while the classifier gives "today", "tomorrow", a weekday or a number of minutes; "at 9am tomorrow" stayed a card. Fixed in `lib/capture/reminderDue.ts` (with tests); no time and no delay still waits for its card.
2. **The sweep starved behind recordings.** Audio-only rows are skipped without counting an attempt, so a handful at the front blocked every capture with words behind them (`lib/capture/sweep.ts`, now two reads).
3. **Recording first, words second was never processed** until a later sweep (`app/api/capture/route.ts`).
4. **A workout capture left no learning row** (`lib/capture/pipeline.ts`).
5. **capture-10:** a ticket leaving the Inbox by PATCH, bulk move, cancel or the Work pages left its capture card waiting. Fixed in the database (0163, a trigger on the ticket), so every route is covered.

### Found, not fixed

- Typed captures get no shadow prediction with cloud AI off (before the rebuild the pattern rules' guess was recorded). The spec pins the new behaviour.
- `transcribe_only` success answers `status: "ok"`, not "saved" (by reading; unreachable with AI off).
- Deleting a capture leaves its recording in the `captures` bucket (the row is soft-deleted only).
- Every auto workout capture leaves a `pending_workout_routes` row when no session matches.

### Additions to "Needs Phil's eyes" (capture; after the Shortcuts are built)

1. **Shortcut, text.** Say a task. "Saved" comes back at once, then a push "Filed as a task" whose link opens that card.
2. **Shortcut, long dump.** Three or four things with "also…" and "another thing…". The push says "Saved as N separate items"; the evening close shows each as "An idea for now. Suggested: …" with "from a longer recording".
3. **Reminder by voice.** "Remind me to call the dentist at 9am tomorrow" appears in Reminders for tomorrow 09:00 and shows once as a card. "Remind me to water the plants" is only a card.
4. **Recording with the PC on.** Audio only: within a minute or so the card carries the words and the recording plays from the card.
5. **Hand edit wins.** Dictate, correct a word in the box, send. The stored text stays as corrected.
6. **Evening close on the phone.** After the day's items, swipe a capture right (Accept) and left (Fix). The five choices fit under the thumb; "More choices" opens the full editor on that capture.
7. *(drop first)* **Weight.** "Weight 82.4 kg": Body shows it for today; the card reads "Weight logged — 82.4 kg".

Residue on the local stack: 13 transcription jobs under the spec's worker name, 13 audio objects in the `captures` bucket, 5 `pending_workout_routes` rows, soft-deleted captures and their learning rows.
