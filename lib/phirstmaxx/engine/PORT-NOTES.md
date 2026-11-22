# PhirstMaxx engine port notes

Source: `A:\Projects\PhirstMaxxing\src\lib\engine` (read-only). Every old test is
re-expressed in the colocated `*.test.ts` here and passes. Nothing was dropped.
Old suite: 101 `it` blocks (112 at runtime, since the calibration loop expands
to 12). New suite: 152 at runtime, which is the 112 ported plus 40 new.

| File | Old (runtime) | Ported | New |
|---|---|---|---|
| time | 8 | 8 | 1 |
| intervals | 7 | 7 | 0 |
| recurrence (+ expand) | 7 | 7 | 6 |
| overlap → windows | 33 | 33 | 1 |
| travel | 26 | 26 | 2 |
| score (+ chains) | 16 | 16 | 4 |
| preferences | 10 | 10 | 0 |
| trip | 5 | 5 | 1 |
| sky | 0 | 0 | 4 |
| fit | 0 | 0 | 21 |

## Deliberate differences

| Old test / code | What changed | Why |
|---|---|---|
| time: all (`londonTime(...).toISOString()`) | `londonTime` returns epoch ms, not a `Date`; tests wrap it in `new Date()` | The shared types (`Interval`, `EngineBlock`, `TogetherWindow`) use epoch ms throughout |
| time: whole module | No date-fns-tz. The zone offset comes from `Intl.DateTimeFormat` parts, as in `lib/daylog/day.ts`. `addLondonDays` is now calendar arithmetic, not "noon + n×24 h" | The repo has no date-fns and none may be added. The DST tests pin the same answers |
| recurrence: all | `expandRecurrence` takes and returns ms intervals (`{start, end}` numbers) | Same reason as above |
| recurrence: "degrades a malformed rule" | Same outcome, but rules are parsed by a hand-rolled subset (FREQ DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY incl. monthly ordinals, BYMONTHDAY, COUNT, UNTIL, WKST). Unknown parts such as BYSETPOS or BYMONTH now degrade to a one-off. The rrule package would have honoured them | The repo has no rrule package. Refusing beats guessing. New tests pin the subset |
| expand (no old tests) | `expandForDisplay` is generic over `{id, start, end, rule?, exceptions?, rejected?}`, returns ms, and skips `rejected` instead of `status === "rejected"` | No `AvailabilityBlockRow` in this repo |
| overlap → windows: all | `findWindows({range, people})` replaces `{range, users, settings}`. Blocks are `EngineBlock` plus optional `rule`/`exceptions`/`status`/`has_car`/`has_pet`. `flexible: true` became `firmness: "flexible"`. `locationId`/`userId` became `place_id`/`person_id`. Windows carry `people[]`, not `users[]`, and `start`/`end` are ms | Shared type names (`Firmness`, `EngineBlock`, `EnginePerson`, `TogetherWindow`) |
| overlap: buffer tests (`buffers: {}` / `{shift: 45}`) | Persons carry full `{shift, sit, walk}` buffers (`DEFAULT_BUFFERS`). Other kinds fall back to `kindBuffers` and then `DEFAULT_KIND_BUFFERS` (work/busy/faith/free 0) instead of `couple settings.buffers` | `EnginePerson.buffers` is per person and non-optional in the shared types |
| overlap: `settings.minWindowMin` | Now `minWindowMinutes`, defaulting to 90 | No couple settings object in the engine |
| overlap: tentative | `knownDays` is optional. When it is left out, every day counts as known (new test) | The shared shapes have no "known day" concept yet |
| travel: `haversineKm` | Renamed `distanceKm` (same maths). New `travelMinutes(km, mode)`: drive uses the profile, walk 5 km/h, cycle 15 km/h, transit is `null` | Brief asked for `distanceKm` and a per-mode estimate |
| travel: "adds the faff constant and road factor" | Comment corrected (it described the pre-calibration maths). Expectations 10 and 46 are unchanged | The old comment was stale |
| score: all | `IdeaRow` became the engine-local `EngineThing`, named after `PmThing`: `title`→`name`, `category`→`kind`, `dog_friendly`→`dog_rule`, `duration_min`→`min_minutes`. `Candidate.ideas` became `things`. The window is `{start, end, day, minutes}` in ms. `now` is ms | Things, not ideas, in the new spec |
| score: weights | Same nine weights. `ScoreContext.weights` is now `Partial` and goes through `normaliseWeights` (merge over defaults, clamp at 0, scale to sum to 1) | Old decision: sliders, normalised on read |
| score: spec §7 terms | Added `variety` (needs `recentKinds`) and `waited` (needs `created_at`) at default weight 0, so old scores are unchanged (pinned by a new test). **Follow-up:** fit margin (from `FitResult`), season/weather (forecast), and cost against the budget as a separate engine-proposal term. `cost_fit` covers budget today | They need data from fit.ts and the forecast stage, which the proposer will join |
| score: `windowDay()` | Dropped; use `londonDate(window.start)` or `window.day` | One-line alias with no callers or tests |
| chains | `Chain.ideas` became `things`; categories are read from `kind` | As score |
| preferences: all | `MemoryRow` became the engine-local `EngineMemory` (`done_on`, `tags`, `rating_by`, `again_by`). `now` is required ms, no `new Date()` default | Pure functions take `now` (repo convention) |
| trip: dog message | "…and Max is coming." became "…and {petName} is coming." with `petName` defaulting to "the dog" (new test). Em dashes in two messages became commas ("Not sure whether X takes dogs, so check.") | No pet name hard-coded in a family app. Old substring tests still match |
| trip: `TripConstraints` | Kept only the fields the validator reads (no `vehicle`, `base_*`, `notes`) | Engine-local type. The research/trip code owns the full shape |
| sky (no old tests) | The suncalc package was replaced by the same low-precision formulas, hand-written. Instants are ms. New tests pin the Aug 2026 new and full moons and London midsummer sunset | The repo has no suncalc |

## fit.ts decisions (new module, spec §6 step 5)

- Travel happens inside the window. The window is when everyone is free and
  awake, so leaving earlier would mean cutting a block short.
- Start point: the free block with a place covering the start, else the block
  that ended last that London day, else home. The earliest departure is that
  block's end plus the person's buffer (firm blocks only).
- Next block: a non-free block starting at the window end (within 1 minute).
  Travel to its place and arrive the person's buffer early. With no such block,
  be home by the window end (bedtime).
- The travel lookup is assumed symmetric for the way back
  (`lookup(backToPlace, mode)`), matching the old "overrides are symmetric".
- A null `min_minutes` means 60 (`DEFAULT_MIN_MINUTES`). `max_minutes` caps the
  time there, but tightness is judged on the time available.
- One result per window. "together" when all start places match, otherwise "meet".
- `nextFit` returns `{result, text}`. The text is "next fits: …", or
  "next tight fit: …" when only a tight one is ahead. A result counts as ahead
  while its earliest departure is at or after `now`.
- **Follow-up:** `indoor` is carried but not used yet. Daylight and forecast
  suitability belong with the weather stage.
