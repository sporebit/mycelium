# Spec — Studio, Drops, Ventures, Journal, Places, Reminders

*Crawled 2026-08-29; reviewed with Phil same day. (?) = inferred. Journal replacement (Day log) recorded 2026-09-14 — planned, not built.*

## Studio — PC metrics (`/studio/pc`)

The live spec is `docs/pc-monitoring-plan.md` **in the repo** (newer than the project's `claude/pc-monitoring-rebuild.md` recon doc). State as of 2026-08-29: **M1 ✅** (`caa0779` — GPU by vendor not index, raw slimmed to diagnostics, 60s cadence, dashboard null/threshold fixes) + startup secret guard (`95a0e49`); **M1.5 🔒 blocked, parked by Phil 2026-08-29** — `PC_METRICS_SECRET` missing from Machine env on the new PC (config.js on disk holds no secret either; the only surviving copy is Vercel's env var — same-secret bring-up means recovering it from there); **M2 ✅** (0094: `machine_id` default 'desktop', composite index, RLS deny-all, GET auth in middleware, `?machine=` filter, dashboard selector); **M3 ✅** (0095: pg_cron 1.6.4 — raw 48h, `pc_metrics_hourly` avg+max rollups 90d, `?range=live|24h|7d`, explicit null buckets, never interpolate); **M4 🚧 at checkpoint** — LibreHardwareMonitor 0.9.6 installed, elevated scheduled task, loopback enforced by firewall block rule on :8085 (LHM ignores listenerIp); awaiting B550-F sensor dump review before agent reads data.json (`cpu_temp`, `gpu_power_w`, `gpu_fan_percent`, `temps`/`fans` jsonb) and UI design; **M5 ⬜** (site-configurable `interval_s` in POST response; offline = IT-helpdesk joke card that never hides real last-seen; threshold 3× interval). Deferred by decision: per-process top-talkers, Ubuntu VM agent. POST contract: `Bearer PC_METRICS_SECRET`, keys cpu_usage/cpu_temp/cpu_clock_mhz/gpu_* /ram_* /network_* /uptime_seconds/drives/raw, server-side recorded_at. Agent: `pc-agent/` node-windows service, config.js gitignored (URL + MACHINE_ID; secret via Machine env var, env wins over config — see pc-agent/README.md). Drift note: 0093 existed remotely with no local file (recovered verbatim, committed); RLS was already enabled on pc_metrics with zero policies.

## Studio — other

`/studio` landing, `/studio/spotify` (album-art cards, plays/top lists), `/pc-build` (0042 build log). Draft `/draft/studio` (Music/Footage/Design-Video) still placeholder.

## Drops (`/drops`)

0076. **Product-agnostic release/restock hunting** (Phil, 2026-08-29) — whatever is being tracked at the time, not a streetwear-specific section; cook guides ride along in the same section. Features: drops calendar, restock monitors (`/api/drops/monitors` + per-monitor check, last-check freshness, Telegram alerts via `/api/cron/drops-monitor` — alert logic FROZEN), raffles, wishlist, cook guides (article layout, reading column).

## Ventures (`/ventures`)

0071–0073 (+seed): ventures tree (hierarchical, add-child optimistic), detail (Overview/Plan/Steps/Ads/Notes tabs, split from an 1105-line monolith), "This Week" overview — every active venture surfaces exactly ONE next step (inline define-next-step when none), Incubator strip for idea-stage, closed only in tree. Ads per venture (spend tracking), inspiration board (restyle still deferred from P3). The Founder agent creates ventures/steps via tools — verification that they surface within one SWR cycle is still an open P3 follow-up.

## Journal, Places, Reminders, Events

- **Journal** — **Day log / Journal v2, Part A BUILT 2026-09-18 (0127, `a3b28b5`)**: `/journal` (day list + score strip) and `/journal/[date]` (entry, scores, transcript, composer), the Telegram nightly prompt with Talk / Quick / Skip / Snooze and the open-window routing rule (`/c ` escapes), `/api/journal/days*`, `/api/journal/scores`, `/api/cron/daylog`, Settings → Journal. The 0003 entries are migrated in as `mode = 'legacy'`; `journal_entries` and its old routes stay read-only for one release. Parts B–E (extraction + review, People Days tab, seeds/photos, linked users) follow Phil's live check. Full spec `claude/daylog-spec.md`. Summary: a nightly interview (Telegram prompt with Talk / Quick / Skip / Snooze buttons, or the in-app day page) run by one of The Boys on Sonnet; append-only transcript, editable narrative summary, a day = ordered **scenes** with place/people/facts/photos; per-turn Haiku delta extraction → pending entities in the captures review queue (never auto-creates a person) → `daylog_scene_people` / `daylog_facts` on approval; **1–5 scores every night** (mood · energy · sleep · productivity by default; keys in settings; asked even on Skip) as `daylog_days.scores`; seeds from calendar, Spotify/media, Apple Health/weather; never asserts world facts, no web search; one carry-over `open_thread`; turn cap + monthly £ alert; `people.linked_user_id` lets another Mycelium user (sharing a team) see scene basics they were part of, via RLS policies, never facts. Tables `daylog_days`, `daylog_scenes`, `daylog_scene_people`, `daylog_facts`, `daylog_media`; entity group `journal.daylog`; routes under `/api/journal/*` + `/api/cron/daylog`; pages `/journal`, `/journal/[date]`, Settings → Journal. 0003 entries migrate in as `mode = 'legacy'`; the old table is dropped in a follow-up migration; old `/api/journal/*` routes and the dashboard Journal card are re-pointed.
- **Places** (0043): `/places`, Leaflet map. Day-log scenes link here (`daylog_scenes.place_id`); unmatched place text creates a pending place via review.
- **Reminders** (0044): `/reminders`, NL parsing, outbound Telegram, cron pipeline (cron-job.org sub-daily).
- **Events** (0067): calendar events store backing Google sync. A Day-log seed source.

## Memory / search

`/api/memory/search` + `/api/memory/stats` (0002 pgvector (?)); `/api/ask` — global AI search/ask with SSE streaming (`streamFromAnthropic`), ⌘K GlobalSearch. Planned: Day-log summaries + facts embedded here at close so `/api/ask` answers "when did I last see X".
