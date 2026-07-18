# Cron migration: Vercel → cron-job.org

Migrating three cron routes off Vercel's native `crons` block and onto
cron-job.org. Two routes stay on Vercel.

## vercel.json diff

Removed (three entries) — these paths are now scheduled externally:

| Path                       | Previous Vercel schedule | Meaning       |
| -------------------------- | ------------------------ | ------------- |
| `/api/cron/reminders`      | `0 6 * * *`              | 06:00 UTC daily |
| `/api/cron/drops-monitor`  | `0 9 * * *`              | 09:00 UTC daily |
| `/api/cron/google-sync`    | `0 * * * *`              | top of every hour |

Retained (unchanged, still on Vercel native cron):

| Path                          | Schedule       | Meaning                    |
| ----------------------------- | -------------- | -------------------------- |
| `/api/briefings/morning`      | `0 6 * * 1-5`  | 06:00 UTC, Mon–Fri         |
| `/api/briefings/morning`      | `0 8 * * 0,6`  | 08:00 UTC, Sat + Sun       |
| `/api/finance/paypal/sync`    | `0 7 * * *`    | 07:00 UTC daily            |

### Required cron-job.org configuration for the removed three

All GETs. Middleware behaviour differs — see the auth column.

| Path                       | HTTP | Auth header to send                        | Enforced by       |
| -------------------------- | ---- | ------------------------------------------ | ----------------- |
| `/api/cron/reminders`      | GET  | `Authorization: Bearer $REMINDERS_CRON_SECRET` | route handler (middleware bypass via `PUBLIC_PREFIXES`) |
| `/api/cron/drops-monitor`  | GET  | `Authorization: Bearer $CRON_SECRET`       | route handler (middleware bypass via `PUBLIC_PREFIXES`) |
| `/api/cron/google-sync`    | GET  | `Authorization: Bearer $CRON_SECRET`       | middleware **and** route handler (both accept the same header) |

`REMINDERS_CRON_SECRET` is a distinct env var from `CRON_SECRET` — do not
reuse the wrong one.

---

## `/api/cron/google-sync` audit

Read-only investigation of the handler and its transitive call graph.
Handler is scoped to a single call: `pullFromGoogle()` from `lib/google/sync.ts`.

### Direction: one-way (Google → Mycelium only)

The endpoint is **not bidirectional**. Its entire body is a call to
`pullFromGoogle()`, which:

1. Fetches events from Google via `listEvents("primary", now, now+30d, 250)`.
2. For each returned event, looks up matching rows in `tasks`, `events`, and
   `drops` by `google_event_id`.
3. If a local row's start time differs from Google's, updates the **local**
   row to match Google.

No `pushTaskToGoogle` / `pushEventToGoogle` / `pushDropToGoogle` calls
happen here — pushes are triggered inline from the individual write
handlers when a user edits a task/event/drop, not from this cron. So the
cron is purely for absorbing changes the user made in Google Calendar
(dragging an event, re-scheduling from their phone, etc.) back into
Mycelium's DB.

Bin events are structurally invisible to this pull: their Google event
IDs live only in `bin_google_events`, never in `tasks`/`events`/`drops`,
so all three lookups return `null` and the loop skips them silently.

### Overlap guard: none

There is no:

- No advisory lock / row lock
- No `last_run_at` gate (early-return if last run was <N minutes ago)
- No in-progress flag on `user_settings` or elsewhere
- No idempotency key on the outbound Google API calls
- No mutex file / KV lock

If cron-job.org fires a second invocation while a previous one is still
running, both handlers will proceed independently and concurrently.

### Concurrent-run safety analysis

The operations performed under concurrent invocations:

1. **`listEvents`** — read-only against Google, no side effect. Safe to run twice.
2. **Table lookups by `google_event_id`** — read-only, safe.
3. **`update` on `tasks` / `events` / `drops`** — this is the risky spot.
   Two concurrent runs both read the same "old" `scheduled_at`, both see it
   differs from Google's "new" value, both write the same "new" value. The
   writes are idempotent — the final state is identical to a single run.
   No lost data, no data corruption, just wasted work.
4. **`result.updated` counter** — double-counted, but this is only in the
   HTTP response body; nothing persists it.

So the race is benign in practice for the current pull-only shape.
If this endpoint later grows a push-side (bidirectional sync), that
analysis would need to be redone — writes to Google are not idempotent
in the same way (a `createEvent` called twice creates two events).

### Risk of raising cadence hourly → every 15 min

**Practical impact of a 4× frequency bump:**

- **Google Calendar API quota**: default is 1,000,000 queries/day per project
  and 500 per 100s per user. Each run makes one `events.list` call. At 15-min
  cadence that's 96 calls/day for the list operation alone. If a run also
  writes back N events to Google (currently it doesn't — pull only), add
  N per run. Nowhere near quota unless you have thousands of events.
- **Supabase query load**: each event returned by Google triggers up to
  3 lookups (tasks → events → drops) plus a possible update. For a typical
  calendar of ~50 events in the 30-day window, that's ~150 reads + a small
  number of writes per run, 96 runs/day = ~14k reads/day. Trivial.
- **Vercel function invocations**: at 15-min cadence, ~96 invocations/day
  for this endpoint. Hobby plan cap is 100k/day, Pro is 1M — no concern.
  Note: cron-job.org, not Vercel-native cron, is invoking it here, so it
  counts against your Vercel function budget the same as any external
  HTTP call. Just budget it in.
- **Overlap**: possible in theory if a run takes >15 min. Observed runtime
  is subsecond to a few seconds. Realistically no overlap risk under
  normal conditions. If Google API latency spikes (rare) a run could stall
  behind rate limits, but the analysis above shows overlap is benign.
- **User-visible sync lag**: hourly → 15-min drops p50 lag from ~30 min
  to ~7.5 min. This is the actual reason to raise cadence — it makes
  Google-side edits appear faster in Mycelium.

**Verdict**: raising to every 15 min is safe. No handler change required.
If cadence ever climbs to sub-minute, add a `last_run_at` short-circuit
in the handler as cheap insurance.

### Suggested cron-job.org schedules

| Route                     | Suggested cadence  | Rationale                             |
| ------------------------- | ------------------ | ------------------------------------- |
| `/api/cron/reminders`     | `0 6 * * *`        | Match existing behaviour              |
| `/api/cron/drops-monitor` | `*/5 * * * *`      | Source comment says every 5 min; the previous `0 9 * * *` was likely under-scheduled |
| `/api/cron/google-sync`   | `*/15 * * * *`     | Safe frequency bump for faster pickup |
