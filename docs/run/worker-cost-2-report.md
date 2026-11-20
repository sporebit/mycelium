# Master run — Stream E report, part 2 (who spends what, the database's weight, the PC's voice)

*2026-11-20, 13:05–13:45 London. Lane E2 of the parallel run, Claude Code on the PC, branch `lane-e2`. Ticket MYC-187. Status: **built and checked in the lane; the integrator merges, ships and runs the one-off sweep below.** Migration **0179**.*

## What the brief asked for, and where each part stands

| Asked (master run §9; part 1's "not done") | State | Where |
|---|---|---|
| The eighteen formerly silent paid-AI call sites each name their feature, so the usage page and the cap alerts can say which feature spent what | Built. One header per site; the meter files the cost under it. Two sites that were being counted twice are counted once. The usage page has a "This month, by feature" table; the two alerts name the three dearest features. | `lib/ai/meterRules.ts`, `lib/system/aiMeter.ts`, the sites below, `/api/other/api-usage`, `app/other/api-usage/page.tsx` |
| Bulk reference data out of the hosted database, personal records stay | Built. Recipe details (46 MB of the hosted 88 MB) move to a store on the PC, batch by batch, only once the PC confirms it holds each one; the cookbook pages lose nothing; an opened recipe's detail comes back within a minute when the PC is on. **The sweep against production is the integrator's one-off run** (run-book below): a lane never writes to hosted. | `lib/reference/`, `lib/health/recipeDetail.ts`, `pc-worker/reference.mjs`, `/api/cron/reference` on the tick |
| Local speech: a natural open-source voice on the PC, a `speak` job that makes a file the app serves, the browser's voice when the PC is off | Built. Kokoro-82M (Apache 2.0) through `kokoro-onnx`, installed in the worker's Python environment with the two model files; a `speak` job renders a WAV into a private bucket; `requestSpeech` answers with the file or says to use the browser. Checked end to end with the real worker on this PC. | `lib/speech/`, `/api/speech`, `pc-worker/speak.py`, `pc-worker/setup.ps1` |

## How it is put together

### 1. Which feature is spending

The meter already stands in front of the server's `fetch` and reads each paid call's cost from the provider's reply. The gap was the name: eighteen sites were filed as `meter.<provider>.<endpoint>`. Rather than teach eighteen places to count (the thing the meter was built to avoid), each site now sends one header, `x-mycelium-feature`, with its feature's tag. The meter reads it, strips it before the request leaves (nothing extra reaches Anthropic or OpenAI), and files the cost under that tag. A site that sends nothing is still counted, under the bare endpoint, as before. The sites that record their own spend keep doing so and are not counted twice.

| Site | Before | After |
|---|---|---|
| `app/api/agents/[agentId]/route.ts` and `…/stream/route.ts` | `meter.anthropic.messages` | `agents.chat` |
| `app/api/agents/[agentId]/confirm-tool/route.ts` | `meter.anthropic.messages` | `agents.tool` |
| `app/api/agents/[agentId]/end-session/route.ts` | `meter.anthropic.messages` | `agents.session` |
| `app/api/ask/route.ts` | `meter.anthropic.messages` | `ask` |
| `app/api/health/eye-prescription/parse/route.ts` | `meter.anthropic.messages` | `health.eye-prescription` |
| `app/api/health/recipes/parse/route.ts` | `meter.anthropic.messages` | `health.recipes` |
| `app/api/journal/[id]/summary/route.ts` | `meter.anthropic.messages` | `journal.summary` |
| `app/api/nutrition/foods/scan-label/route.ts` | `meter.anthropic.messages` | `nutrition.scan-label` |
| `app/api/tickets/smart/route.ts` | `meter.anthropic.messages` | `tickets.smart` |
| `lib/briefings/intro.ts` | `meter.anthropic.messages` | `briefing.intro` |
| `lib/finance/categorise.ts` | `meter.anthropic.messages` | `finance.categorise` |
| `lib/receipts/parse.ts` | `meter.anthropic.messages` | `receipts.parse` |
| `lib/ai/anthropic.ts` (`callClaudeJSON`, now with a required `feature`) | `meter.anthropic.messages` | `nutrition.estimate`, `nutrition.redistribute`, `finance.snapshot`, `fitness.voice-parse` (one per caller) |
| `lib/router/classifyCapture.ts` (when the pipeline is not counting it) | `meter.anthropic.messages` / `meter.openai.chat` | `capture.classify` |
| `lib/openai/embeddings.ts` (`generateEmbedding`, a `feature` per caller) | `meter.openai.embeddings` | `capture.embed`, `memory.embed` |
| `lib/openai/whisper.ts` (`transcribeAudio`, a `feature` per caller) | `meter.openai.transcriptions` | `capture.transcribe`, `voice.transcribe`, `telegram.transcribe`, `agents.transcribe` |
| `lib/agents/voice.ts` (OpenAI and ElevenLabs speech) | `meter.openai.speech` / `meter.elevenlabs.speech` | `agents.voice` |

**Two double counts, fixed.** The finds verdict's cloud fallback (`lib/finds/verdict.ts`) recorded its own usage under `finds.verdict` but did not carry the recorded marker, so the meter counted it again under the bare endpoint. It now carries the marker. And `app/api/capture-audio/route.ts` recorded its two transcription paths by hand (`voice.transcribe`, `capture.transcribe`, with its own size-based estimate) while the meter also counted the same calls; the hand records are gone and the meter files them under those two names, with its own estimate from the bytes sent.

The usage page (`/other/api-usage`, instance owner only) now opens its spend section with **This month, by feature**: what the meter recorded, against the cap, the figure the cap is enforced from. The older estimates from row counts stay underneath, labelled as such. The two alerts read, for example, "Cloud AI: £4.10 of this month's £5.00 cap is spent. Most of it: the Boys' chat £2.30, capture £1.10 and the ask box £0.40." A per-item tag such as `daylog:<day>` is grouped as `daylog`. Readable names live in one table in `lib/ai/meterRules.ts`; an unknown tag reads as itself.

### 2. The database's weight

Measured on the hosted database before anything was built (read-only):

| Table | Total | Of which | Rows |
|---|---|---|---|
| **gousto_recipes** | **65 MB** | 15 MB rows, **46 MB large-value storage (the `detail` column)**, 4.6 MB indexes | 12,147 |
| memory_chunks | 3.9 MB | embeddings | 86 |
| transactions | 3.0 MB | | 2,639 |
| tickets | 920 kB | | 315 |
| pc_metrics | 744 kB | **all of it indexes; the table holds no rows** | 0 |
| raw_captures | 528 kB | | 258 |
| everything else | under 450 kB each | | |
| public schema | 88 MB | | |
| whole database | 109 MB | | |

So the "old metrics" named in the brief are already gone: `pc_metrics` is empty, and what remained was 744 kB of indexes left behind by the deletes. 0179 rebuilds them. The reference data is one column of one table: a recipe's ingredients, steps, allergens and nutrition, 3.8 kB each, a copy of a public cookbook and not a record of anything Phil did.

**What moves, and how.** A recipe's `detail` is *cold* when it is not a favourite, has no saved copy, and has not been opened in two months (`lib/reference/offload.ts`). The sweep (`reference_offload`, a job on the PC lane) is queued by `/api/cron/reference` on Sunday morning after the Gousto sync, or on request with `?force=1`. As the PC claims it, the cloud picks the next three hundred cold details; the PC writes them to its store, reads each back, and answers with the slugs it holds; the cloud clears the hosted `detail` of exactly those slugs, checking each is still cold, stamps `detail_offloaded_at`, and queues the next batch while there is more. Nothing leaves the hosted database before the PC has confirmed it holds the copy, and a recipe favourited or opened between the claim and the answer keeps its detail.

**The store** is one SQLite file the worker owns, `%LOCALAPPDATA%\Mycelium\reference.sqlite`, through Node's own `node:sqlite` (Node 26 on this PC): no package to install. `node pc-worker/reference.mjs --status` says what it holds; `--export [file]` writes every row as JSON lines, an archive dump for the second-drive copy (MYC-182) when there is one.

**Reading a recipe** goes through one function, `recipeDetail` (`lib/health/recipeDetail.ts`), whichever side the detail is on. Hosted: returned, and the opening stamped so it stays hosted for two months. On the PC and the PC on: the PC is asked once (`reference_get`, one live request per recipe), the page says the detail is on its way and refreshes itself; the PC's answer writes the detail back onto the row. On the PC and the PC off: the listing (title, picture, rating, cuisine, times, categories, description) is shown as before, with one line saying the ingredients and method are kept on the PC and appear next time it is on, or read it on gousto.co.uk. Nothing in the cookbook list or search touches the detail column, so nothing there changes.

**The weekly Gousto sync** (`scripts/gousto-sync.mjs` on the PC) is unchanged: it fetches details only for rows with no `detail_fetched_at` or a stale one, and an offloaded row keeps its stamp, so the sync does not refill what the sweep moved out. A refreshed detail (stale after 30 days) lands on the hosted row again and is swept out again when cold; a small amount of churn, bounded by the sync's own pace.

### 3. The PC's voice

**Kokoro-82M** through `kokoro-onnx` 0.6.1 (`docs/run/external-facts.md` §"local speech" made the case: Apache 2.0, British voices built in, installs with one package on Python 3.13, runs on the processor). Installed into the worker's existing environment (`pc-worker/.venv`, Python 3.13.17) with `kokoro-onnx`, `soundfile`, `phonemizer` and `espeakng-loader` (which brings its own espeak-ng; nothing else to install). **Downloaded:** `kokoro-v1.0.onnx` (325,532,387 bytes) and `voices-v1.0.bin` (28,214,398 bytes), together 337 MB, into `%LOCALAPPDATA%\Mycelium\models\kokoro`. Both are free, local, and under the model's Apache licence. No paid service is called and nothing leaves the PC except the two downloads. `pc-worker/setup.ps1` does all of this on a new machine, step by step, then registers the worker; `register.ps1` points to it.

**Measured on this PC, processor only** (the `[gpu]` extra was not installed; it is not needed):

| Line | Spoken length | Render time | File |
|---|---|---|---|
| "Two minutes left. Find a stopping place." (bf_emma) | 2.2 s | 3.7 s, including loading the model | 105 kB |
| A four-sentence briefing opening (bm_george) | 13.1 s | 6.0 s | 614 kB |
| "Good evening. The week closes in ten minutes." (through the real worker and the local server) | 2.5 s | 2.7 s round trip, render and upload | 116 kB |

**How a line becomes a file.** `requestSpeech(db, text, { voice })` (`lib/speech/server.ts`) is the one function. It keys the line by its words and voice (`sha256`), so the same line is rendered once and played many times. If the clip exists and is ready: a signed link to its WAV (an hour), and the play stamped. If not and the PC is on: a `speech_clips` row and a `speak` job, answer "queued"; the caller says the line itself this time. If the PC is off: "off"; the caller says it itself. The job's cloud half makes a signed upload link for `<clip id>/clip.wav` in the private `speech` bucket; the PC renders with `speak.py` (words on stdin, no shell quoting) and PUTs the bytes to the link; the result stamps the row ready. A job that gives up deletes its half-made row so the next request starts clean.

**For lane G (the wall):** in the browser, `pcSpeaker(browserSpeaker)` from `lib/speech/client.ts` is a `Speaker` for `setSpeaker` in `lib/wall/speak.ts`. It posts the line to `/api/speech`, plays the file when there is one, and hands anything else to the browser's voice. One line to wire at integration; nothing else on the wall changes. `warmSpeech(db, lines)` asks for several lines ahead of time (tonight's nudges, tomorrow's briefing) so they are files when wanted; the briefing is not yet calling it.

**Bucket and rows.** `speech_clips` is personal (the 0111 shape through `app.adopt_table`; group `platform.speech`); the bucket's policies tie a file to its clip's row and the row to its owner, so Tess cannot play Phil's lines or put files in his folder. 20 MB file cap.

## Checked

- Unit: `lib/ai/meterRules.test.ts` (the feature tag, grouping, the alert line), `lib/system/aiMeter.test.ts` (the header is read, stripped, filed; a site with no header is still counted), `lib/speech/clips.test.ts`, `lib/reference/offload.test.ts`, `lib/system/schedule.test.ts` (the new tick route has a handler). 46 checks in those five files, all passing, and the finds, capture and router suites that import the changed helpers still pass (128 together with the meter's); `tsc` and `eslint` clean on every changed file (one pre-existing `env` warning in `worker.mjs`).
- End to end on port 3106 (a dev server; the Playwright worker stands in for the PC): `e2e/speech.phil.spec.ts` (3: nothing to say is refused and the PC off means the browser speaks; a line is queued once, collected with its signed link, uploaded and from then on a file, Phil's alone; a job that gives up leaves no half-made clip) and `e2e/reference.phil.spec.ts` (4: the sweep is queued once per request and refuses a stranger; the worker is handed the cold detail only and the hosted copy is cleared for what it holds, never for a favourite it wrongly claims; a recipe on the PC keeps its listing, says so, asks the PC once when it is on, and gets its detail back; the page's wording). Regression on the same server: `worker.phil` and `tick.phil` (19 passed together with the two new specs); `capture.phil` and `capture.tess` for the transcription change: 75 passed, 1 skipped, 7 failed, the same seven lane H2 met on a dev server (six browser tests that click the sidebar's Capture button under the Next dev-tools badge, which the production-mode server on 3100 has not got, and the seven-day-rule test, which passed on a solo rerun; none touches the changed code).
- **With the real worker** (`node pc-worker/worker.mjs --once` against the local server, this PC's Python and Kokoro): a `speak` job rendered and uploaded in 2.7 s and the row went ready with the file's true size; a sweep moved two seeded details into the store and cleared them from the local database; a `reference_get` brought one back onto its row; `--status` and `--export` read the store. The worker's self-test lists `speak`, `reference_offload` and `reference_get` among its kinds and reports the store's size.
- Not run in the lane: `next build`, the full suite on 3100, anything against hosted (read-only size queries only).

## Found on the way

- **Two paid call sites were counted twice** (above). Before today's change the recorded figure overstated transcription and finds spend; small in money, but the cap is enforced from it.
- **`pc_metrics` is empty but weighed 744 kB** in indexes alone. A table that is cleared by deletes keeps its index pages until something rebuilds them; 0179 does.
- **The storage schema refuses direct deletes** (`storage.protect_delete`): a test teardown cannot clear a bucket with SQL, only through the Storage API. The speech spec leaves one 44-byte file per run in the local bucket and says so.
- **The lane's `db push --local` was refused** because higher-numbered migrations from other lanes were already in the shared local history; 0179 was applied with psql and its version inserted by hand, as the other lanes did.
- **The worktree's Supabase CLI is not linked**: `supabase/.temp` is untracked, so a lane must copy it from the main checkout before any `--remote` query.

## Design calls

- **A header, not a counter, at each site.** The meter reads the cost; a site only says who it is. New sites get one line; forgetting it degrades to "counted, unnamed", never to "uncounted".
- **The PC confirms before the cloud clears.** The sweep's result is the list of slugs the store read back; the cloud clears those and only those, re-checking each is still cold. A copy exists before an original goes.
- **The listing stays hosted.** Search, cards and the cookbook grid never needed the detail; only the recipe page does, and it says plainly where the detail is when the PC is off.
- **One clip per line and voice, rendered once.** Spoken lines repeat ("Two minutes left"); the store of clips grows with the vocabulary, not with the days.
- **Processor, not graphics card, for the voice.** A sentence in under a second once the model is loaded, with no CUDA build of onnxruntime to keep in step with Whisper's.

## For the integrator (not Phil)

1. Merge `lane-e2`; 0179 ships with `scripts/ship.sh` (it now passes `--include-all`).
2. **The PC worker needs the new code and the new package:** after the pull into `A:\Projects\Mycelium`, `kokoro-onnx` and `soundfile` are already in `pc-worker\.venv` and the model files are in place (this lane installed them); run `powershell -ExecutionPolicy Bypass -File pc-worker\register.ps1` to restart the scheduled task so it picks up `worker.mjs`. `node pc-worker\worker.mjs --selftest` should list `speak`, `reference_offload`, `reference_get`.
3. **The one-off sweep against production, recorded here as the deletion step the brief asks for:** take the on-demand backup first (`powershell -File scripts\db-backup.ps1 -BackupRoot 'A:\Backups\mycelium\on-demand'`), then `curl -X POST -H "authorization: Bearer <CRON_SECRET>" "https://mycelium.sporebit.com/api/cron/reference?force=1"`. With the worker running, 12,000 details drain in about forty batches, a round apiece, around 15–40 minutes. Check with `node pc-worker\reference.mjs --status` (expect about 12,000 `gousto_details`) and a read-only `select count(*) from gousto_recipes where detail is not null` on hosted (expect favourites, saved copies and recently opened only). Record both counts in the ticket comment. From then on the tick runs the sweep on Sunday mornings.
4. Wire the wall's voice: `setSpeaker(pcSpeaker(browserSpeaker))` where lane G's `WallClient` starts (see "For lane G").

## Phil's live check (a chunk of MYC-193, 10 minutes; the integrator numbers it into `phase1-live-checks.json`)

1. **Other → API usage.** The first spend card is *This month, by feature*: a figure against the £5 cap and a short table naming features (the Boys' chat, capture, the ask box…), not provider endpoints. Anything you used today is there by name.
2. **Ask the ask box one question, then reload API usage.** The ask box's row grows by one call. (If the month's cap is spent the question is answered from what is free and nothing changes; say so.)
3. **Health → Recipes → Gousto cookbook.** The grid, search and a recipe's picture, rating and times are as before. Open a recipe you have never opened, with the PC on: the ingredients and method appear within a minute (the page refreshes itself; a line says they are on their way while it waits). Open a favourite: instant, as before.
4. **The same with the PC off** (or the worker stopped): the recipe page shows the listing and one line saying the ingredients and method are kept on the PC and appear next time it is on. Nothing is broken, nothing spins.
5. **The voice, by hand:** on the PC, `echo "Two minutes left." | pc-worker\.venv\Scripts\python pc-worker\speak.py --out test.wav` then play `test.wav`. A British woman's voice (Emma). Try `--voice bm_george` for a man's. Say which you would like the wall to use; the worker's `pc-worker\config.json` takes `"voice"`.
6. **On the wall (after lane G is wired):** the next spoken line comes in that voice when the PC is on, and in the browser's own voice when it is off. The second time the same line is said it is the PC's voice even if the PC has since gone off.

## Not done, and why

- **The sweep against production** waits for the merge and deploy (a lane never writes to hosted); run-book above.
- **The briefing and the nudges do not yet warm their lines** (`warmSpeech` exists; the callers are lane G's and lane B2's code paths, touched at integration rather than here).
- **A reference store for anything but recipe details.** Nothing else is heavy: the next largest table is 3.9 MB.
- **An export of the store is by hand** (`--export`); the nightly backup does not yet copy `reference.sqlite`, which belongs with the second-drive decision (MYC-182).
- `graphify update .` is not installed on this PC. The project-side copies of `context.md` and `backlog.md` are the integrator's.

**Phil's tickets created:** none. Nothing here needs a sign-in, a card or a decision from him; the voice is a preference he can give in the live check.
