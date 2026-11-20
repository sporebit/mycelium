# Master run — Stream E report, part 1 (the PC worker, cost and backups)

*2026-11-20, 02:40–06:50 London. Claude Code on the PC. Ticket MYC-187. Status: **built and deployed**, except where marked. No migration in this part (the job queue is 0159).*

## What the brief asked for, and where each part stands

| Asked (master run §9) | State | Where |
|---|---|---|
| A PC worker that collects jobs when the PC is on, with local Whisper and a local model | Built. A scheduled task at logon; leased claims, retry with back-off, a heartbeat; transcription on the graphics card; the local model writes tomorrow's first steps. | `pc-worker/`, `lib/jobs/`, `app/api/worker/` |
| A hard monthly cloud-AI cap of £5 with an alert, enforced from recorded usage | Built: one meter in front of every paid AI call. See "The meter". | `lib/system/aiMeter.ts`, `lib/ai/meterRules.ts`, `instrumentation.ts` |
| Sub-daily jobs without a paid scheduler | Built: one tick route; the PC knocks on it every five minutes; one free cron-job.org job covers the PC being off (MYC-180). | `app/api/cron/tick`, `lib/system/schedule.ts` |
| A restore test | Done. See "Backups". | `scripts/restore-test.sh` |
| A second backup copy on another drive | **Waiting on Phil** (MYC-182: which drive). | |
| Bulk reference data out of the hosted database | Not started. | |
| Local speech for the wall | Not started (research done: `docs/run/external-facts.md`). | |

## The meter

**Finding: 18 of the 25 places that call a paid AI service recorded nothing about what they spent.** The Boys' chat, the ask box, the four photo parsers, the journal summary, the briefing's opening line, finance categorising, embeddings and cloud transcription all spent without a trace. The cap is counted from recorded usage, so it could not see most of the bill. Recorded spend for November so far is 1p and for September 76p; the true figures are not knowable after the fact.

Rather than teach eighteen places to count (and the nineteenth to remember), one meter now stands where every outbound call from the server passes:

- A call to a paid AI endpoint is **refused when the month's cap is spent**. The caller gets an answer shaped like a provider error, so each feature's existing handling applies (capture falls back to its rules; a chat says it could not answer). Nothing a person captured is refused because of the cap; only the paid route is.
- Otherwise the call is sent and **its cost is recorded from the provider's own reply**. For a streamed reply the usage is read from the events as they pass; the stream the caller sees is not delayed or changed.
- **One alert at four-fifths of the cap and one at the cap**, by Telegram.
- The six places that already recorded their spend under their own tag mark their requests, so they are gated but not counted twice.
- If the month's spend cannot be read at all, the call is not made: it does not spend blind. A short blip uses the last known figure.
- `/api/health` now says whether the meter is installed on the running server, so its presence on production can be checked without spending anything.

Prices are list prices entered on 2026-11-20. Claude: Sonnet $3/$15 and Haiku $1/$5 per million tokens in/out, a cache write at 1.25× input and a cache read at 0.1×. OpenAI: whisper-1 $0.006 a minute, tts-1 $15 per million characters, text-embedding-3-small $0.02 per million tokens. A model with no price is costed at the dearest known rate, never as free. ElevenLabs is a subscription with a monthly allowance, so it is counted in characters, not pence, and is outside the £5.

**Two estimates to know about.** A cloud transcription's length is taken from the size of the audio sent unless the provider reports it (an over-estimate by design). And spend is filed under the instance owner when the call site did not say whose it was: there is one bill and one payer.

**To check, not verified:** one recent source says `whisper-1` is scheduled to be retired in February 2027. Cloud transcription is now only a fallback (the PC does it), but Telegram voice notes still use it. Worth confirming on OpenAI's own page before then.

## Backups

**The restore test.** Last night's dump was restored into an empty scratch database on this PC (the hosted database was not touched): **every one of the app's own tables came back**, 21,771 rows in 118 tables, including 309 tickets, 259 captures, 200 people, 63 Day log days and both accounts with their authenticators. `bash scripts/restore-test.sh` repeats it against any dump and leaves the counts beside it.

Two findings from it:

1. **The backup held no uploaded files.** A database dump contains the record of each file, not the file. Recordings, photos, receipt images and ticket attachments were not backed up at all. Today that was four files; with capture now keeping every recording it would have grown quickly. **Fixed:** the nightly backup now also copies every stored file to `A:\Backups\mycelium\storage`, fetching only what is new, and never deletes from the copy, so a file removed in the app by mistake is still there. A failure in the file copy is logged and does not fail the database backup.
2. **Six tables in the platform's own schemas did not load**, because the hosted platform is newer than the local one (sign-in recovery codes, an identity-provisioning feature and file-lifecycle settings that this app does not use). None holds anything of Phil's. In a real disaster the restore target would be a fresh hosted project, where they exist.

Still true: both copies are on drives in the same PC. Theft, fire or the PC itself take all of them. The second drive (MYC-182) covers a drive failing and nothing more; an off-site copy needs a decision (it is free in Google Drive if encrypted first; Cloudflare R2 is free at this size but asks for a card).

## Findings from running it

- **The worker failed against production for ninety minutes and nobody was told.** It was started five minutes before a fix it needed. It now reports a refusal once, by Telegram, straight from the PC.
- **The tick's first run on production was refused by one job** (reminders have their own secret). The check had asserted only "no server error", and a refusal is not a server error. Fixed, and the check now requires success from every job.
- **The morning briefing had not been sent since 24 October**: its hour check and its trigger disagreed once the clocks went back. It rides the tick now.

## Not done

Gating is complete; **attribution is not**: the eighteen formerly silent places are recorded as "unattributed" against their provider and endpoint, not against a feature. The usage page can show how much, not yet which feature. The second backup copy, an off-site copy, moving bulk reference data (12,000 recipes) out of the hosted database, and local speech are open.

## Design calls

- **A meter at the door, not a rule in each room.** Twenty-five call sites, two SDK styles and streams: the only place all of them pass is the server's own `fetch`. New call sites are covered the day they are written.
- **Refuse in the provider's own error shape.** Every feature already handles "the model did not answer". A new kind of failure would have needed twenty-five new branches.
- **The cap is for the instance, not per person.** There is one bill.
- **The file copy never deletes.** A backup that mirrors deletions protects against a dead disk and not against a mistake.

## For Phil

- Nothing to do for the meter: it is on. You will get one Telegram message if spend reaches £4 in a month and one at £5.
- **MYC-182** still needs the drive letter for the second copy.
- Decide, when convenient, whether you want an off-site copy (free in Google Drive, encrypted).
- This terminal cannot write the Claude project's copies of the state documents; `graphify update .` could not run.

Sources for the prices: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI pricing](https://openai.com/pricing), and for the `whisper-1` note [OpenAI API pricing 2026 (gptprompts.ai)](https://gptprompts.ai/openai-api-pricing).
