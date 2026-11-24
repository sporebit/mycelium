# PhirstMaxx — a Mycelium section (rewrite of Phirstymaxxing)

*Written 2026-11-21 (Cowork chat with Phil). Status: **committed**, for Claude Code after the current run and after `claude/family-calendar-spec.md`. The repo is ground truth: where this doc and the code disagree, the code wins; fix the doc and note the drift.*

## 0. What Phil asked for

Merge PhirstMaxxing into Mycelium as a section called **PhirstMaxx** — database, logic, everything. "I want it to never fail us." Whatever they drop in (a YouTube video, an Instagram or Facebook video or post, a website, a photo) is researched to give as much detail about the place as possible: time to get there, how long to spend there, best times to go, and whether both of them can be there within their time together. Adding things must be quick and seamless. Busy time (work etc.) is painted on a weekly grid like Excel: always 7 days in 30-minute slots, click and drag to highlight several ranges, save them all together. Notify when someone agrees to something, and when it plans an experience for them.

## 1. Decisions (Phil, 2026-11-21)

| # | Decision |
|---|---|
| D1 | **Full rewrite inside Mycelium.** Not a port, not a lift-and-shift. |
| D2 | **Kirsty's Mycelium invite still waits for the UI rebuild.** Until then the old app at phirstmaxxing.sporebit.com stays live and is what the two of them use together. **Superseded 2026-11-24 23:20 (Phil): no old data is wanted.** The old PhirstMaxxing Supabase project is being deleted, so the old app at phirstymaxxing.sporebit.com **stops working**; PhirstMaxx starts empty. Removing its Vercel project, its IONOS DNS record and the PWA from both phones is **MYC-211**. |
| D3 | **Travel time: both** — free routing (OpenRouteService) for drive / walk / cycle, with researched public transport, **and** Google Routes for real transit times. |
| D4 | Calendar: plans land on the Google **Family** calendar (`claude/family-calendar-spec.md`). |
| D5 | Section name **PhirstMaxx**. Lives in the family team's space (Phil, Kirsty, the test account). |

Flag recorded once `[claude]`, then complied with: the old app is in real use and carries 81 commits, a ~30-entry decisions log, 101 engine tests across 8 files and twelve travel routes pinned against OSRM. A rewrite that ignores those re-learns every edge case the hard way (cross-midnight windows, buffers, waking hours, "ends next day", proposal expiry). **Default applied: the code is rewritten, but the old engine's test fixtures and the decisions log in `A:\Projects\PhirstMaxxing\CLAUDE.md` are the acceptance suite and the requirements list.** Every old engine test is re-expressed against the new engine and must pass, or the difference is written down as a deliberate change.

Consequence of D2 `[claude]`: until Kirsty joins, PhirstMaxx in Mycelium is used by Phil and proven with the test account. Agree/decline notifications between two real people start at her invite.

## 2. "Never fail us" — the rules the design follows

1. **A drop is never lost.** The sender keeps it until the server says `saved`; the server stores the raw payload before doing anything clever and answers in under a second. Same client id sent twice = one drop.
2. **Research is separate from saving.** It runs as queued jobs, stage by stage. A failed stage retries with backoff, never blocks the others, and never removes what earlier stages found. A drop with zero research is still a usable card.
3. **Every outside service has a fallback, and the screen says which one answered.** No field is blank because one API was down; no estimate is dressed as a fact.
4. **Every researched fact carries its source, a confidence and the date it was checked.** Anything a person edits by hand is never overwritten by research.
5. **The engine is pure functions with fixtures** (windows, travel, fit, scoring). No database or network inside it.
6. **Saves are atomic.** A painted week saves as one transaction or not at all.
7. **It tells you when it is unwell.** Research queue depth, last successful run per source, and stuck drops are on the section's status line and in the daily health check.
8. **Nothing retires until proven.** The old app is switched off only after a parallel run (§10). *Overtaken 2026-11-24: Phil decided the old data is not worth keeping, so there is no parallel run; the old project is deleted and the app stops (§10, MYC-211).*

## 3. Section and data model

- New section `phirstmaxx`. Sections are fixed by two check constraints (0110) — extend both. Entity groups: `phirstmaxx.time` (blocks, types, places, waking), `phirstmaxx.things` (drops, things, research), `phirstmaxx.plans`.
- All tables prefixed `pm_`, registered with `app.register_table`, RLS pattern on every one. Code in `lib/phirstmaxx/` (`engine/` pure, `research/`, `adapter.ts` as the only file touching other Mycelium tables), routes `/api/phirstmaxx/*`, pages `/phirstmaxx/*`.
- People are family-space members. Pets (Max) carry over as `pm_pets`: a thing's dog rules are checked against them.

| Table | Holds |
|---|---|
| `pm_places` | Saved start points per person (home, work, the other's house…) with lat/lng; one-off places flagged unsaved |
| `pm_block_types` | Work, Busy, Free, Sleep, Walk… → engine kind, colour, default firmness, default place |
| `pm_blocks` | Who, type, `starts_at`, `ends_at` (30-minute aligned), firmness (set in stone / flexible), place, title, `series_id` for weekly repeats |
| `pm_waking` | Per person weekday/weekend waking hours, per-day overrides ("late one tonight") |
| `pm_drops` | The raw thing as it arrived: URL, shared text/caption, media paths, source app, who, client id, `received_at`. Immutable. |
| `pm_things` | The researched place/event/activity (one per real-world thing; several drops can point at one) |
| `pm_thing_facts` | One row per fact: `key`, `value` jsonb, `source_url`, `source_kind`, `confidence`, `checked_at`, `edited_by_user` |
| `pm_research_runs` | Per drop per stage: status, attempts, error, started/finished, cost in pence |
| `pm_travel` | Thing × origin place × mode: minutes, km, provider (google / ors / estimate), `fetched_at` |
| `pm_plans` | Kind (hold / plan), window, thing(s), status proposed → accepted / declined / expired → done, proposed by (person or `engine`), calendar event id |
| `pm_plan_responses` | Each person's yes / no / "another time" with a timestamp |
| `pm_plan_legs` | Leave-by, travel, arrive, time there, leave, home — per person where they start apart |

Budget, trips, Our story and the night sky from the old app: **data migrates in phase 1; their screens are phase 2** (§9), where budget folds into the family household budget and Our story into the family timeline rather than living twice.

## 4. The weekly grid (busy time)

- **Always 7 days × 48 half-hour rows** (00:00–24:00), Monday first, opening scrolled to the person's waking start. Prev / next week, Today.
- Each day column is split in two: Phil left, Kirsty right. Together-windows (both free, both awake, buffers applied) are shaded across the pair. You edit your own half; the other half is read-only unless you switch person (allowed — either can enter the other's shifts, and the block records who entered it).
- **Paint like Excel.** Desktop: mouse down, drag across slots and days, release — the rectangle is highlighted. Drag again to add another range; drag over a highlight to remove it. Shift+arrows from a focused cell does the same from the keyboard. Phone: **press and hold 250 ms then drag** paints; an ordinary swipe scrolls. A "Paint" toggle makes drags paint immediately for a long session.
- **One save for everything highlighted.** A bar appears with the count ("5 ranges, 31 h"): choose type (Work by default, last-used remembered), firmness, place, optional title, "repeat weekly until…". **Save** writes all of it through one RPC (`pm_save_blocks`) in one transaction. Adjacent slots of the same type merge into one block. Overlaps with existing blocks are shown before saving: replace, keep both sides trimmed, or cancel.
- Tap a block to edit or delete; drag its top/bottom edge to resize in 30-minute steps. Undo for the last save (10 minutes).
- Fast paths: **Copy last week**, saved **patterns** ("my usual week", "early shifts") applied in one tap, and paste from a typed rota ("Mon–Thu 8–4:30, Fri off") through capture.
- Works offline: painted ranges sit in the outbox and sync when back; the grid shows them as pending.
- Events on the Family calendar appear on both halves as busy (read-only here; edit them in the calendar).
- Phil's own work calendar can feed his half as busy blocks (titles stay private) — setting, off by default.

## 5. Dropping things in

All routes end at `POST /api/phirstmaxx/drops` → 202 with the drop id in under a second.

| From | How |
|---|---|
| iPhone | Share-sheet Shortcut, built in Cherri and handed over as an import link (Phil's standing rule). Sends the URL, any shared text, and the image/screenshot if there is one. Keeps the payload in `iCloud Drive/Shortcuts/Mycelium Inbox` until the server answers `saved`. |
| Android (Kirsty, after her invite) | The installed Mycelium PWA as a share target (manifest `share_target`, files included) |
| Telegram | Send a link, photo or text to the bot with `/pm`, or to a PhirstMaxx topic |
| In the app | One box: paste a link, type a place name, or drop/choose a photo |
| Anywhere | Per-person inbox URL with a token, for anything else that can POST |

After the drop the phone shows "Saved — researching". No form, no required fields. If research cannot work out what the thing is, it asks **one** question by push ("What's this place called?") and carries on from the answer.

## 6. Research pipeline

Jobs on the existing `jobs` queue (0159); stages are independent and re-runnable; each writes `pm_thing_facts`.

1. **Read the drop.**
   - Website: fetch, readable text, OpenGraph, and **schema.org JSON-LD** (Place / Event / LocalBusiness give address, geo, opening hours, price range without AI).
   - YouTube: oEmbed + YouTube Data API (title, description, channel, location tags) + captions where available.
   - Instagram / Facebook: these block signed-out readers, so the link alone is often empty. Use what the share sheet sent (caption text, the image or a screenshot) and read the image with a vision model; try oEmbed/OpenGraph as a bonus. Never scrape behind a login.
   - Photo: EXIF GPS and time, then a vision model for signage, landmark and scene.
2. **Work out the real-world thing.** Name + rough location → geocode (Nominatim; Google Places when the key exists) → match against existing `pm_things` within 150 m and a similar name. A match attaches the drop to the existing thing instead of making a duplicate. A video about several places becomes several things, each linked to the drop.
3. **Enrich.** Official site, address, what it is, opening hours by day and season, last entry, price per adult / child / free, booking needed and how far ahead, parking and its cost, dog rules, toilets / food / step-free access, indoor or outdoor, weather-dependent, **typical time there** (min–max), **best times** (season, day of week, time of day; tide, sunset or dark-sky dependent; school holidays; one-off dates for events), what's nearby from their existing things. Sources in order: JSON-LD and the official site → OpenStreetMap tags → Google Places (if keyed) → a web-search-grounded model call that must cite a URL per fact. Uncited claims are dropped.
4. **Travel.** For each person's saved start points × modes: Google Routes when keyed (drive with typical traffic for the weekday/hour, transit), OpenRouteService for drive / walk / cycle otherwise, the old calibrated straight-line profile as the last resort. Cached in `pm_travel`; refreshed when a plan is proposed and again 24 h before.
5. **Fit** (pure engine, recomputed whenever blocks, facts or travel change). For each together-window in the next 8 weeks: each person leaves from where their previous block ends (plus their buffer), travels, both arrive; time there ≥ the thing's minimum; it is open for that span; each gets to their next block on time; daylight / forecast suit it. Verdict **Fits / Tight / Doesn't fit** with the reason in words, and "next fits: Sat 28 Nov, 13:00–17:30, leave by 12:10". Meeting-there (two start points) and travelling together are both tried.
6. **Tell the dropper.** One push: "Hackfall Woods — 55 min each way, about 3 h there, fits this Saturday."

Honest limits, shown in the UI: no free source gives live crowd levels, so "best times" is reasoned from hours, season, weather and what the research found, labelled *estimate*; transit without the Google key is a researched estimate.

Upkeep: opening hours and prices re-checked every 90 days and 48 h before an accepted plan; a change ("now closed Mondays") notifies both if a plan is affected. **Re-research** button per thing. Research spend is logged per run.

## 7. Plans, agreeing, notifications

- **Propose** from a thing ("when can we do this?" → its fitting windows) or from a window ("what fits here?" → ranked things). A **hold** is a plan with no thing yet.
- **The engine proposes too.** For a firm together-window of 3 h or more in the next 14 days with nothing planned, it proposes the best-fitting thing (score: fit margin, how long it has waited, season/weather, variety, cost against the budget). At most two engine proposals a week, never two for the same window.
- **States.** Proposed → each person answers Yes / No / Another time → both Yes = **accepted** → written to the Family calendar with the legs ("Leave by 12:10", travel, time there) → **done** afterwards (prompts a note/photo for the family timeline). Unanswered proposals expire at the window start. A change to a block that breaks an accepted plan flags it "conflicts now" to both.
- **Notifications** (web push; Telegram for Phil as fallback; the wall screen later):
  - the other person **agreed** / declined / suggested another time — immediately
  - **both agreed — it's on** (with leave-by time)
  - **the engine planned something** for you both — proposal with Yes / No buttons
  - research finished on your drop; a plan now conflicts; hours changed on a planned thing; leave-by reminder; weather warning with indoor swaps
  - Partner answers and things you started do not count against Phil's three-a-day interruption budget; engine proposals and research results do.
- Every notification is also a row in the in-app list, so a missed push loses nothing.

## 8. Screens (inside the new shell; inner pages calm and flat per the UI direction)

`/phirstmaxx` Home — next together-window, what's on, proposals waiting for you, newest researched drops · `/phirstmaxx/week` — the grid (§4) · `/phirstmaxx/things` — everything dropped, filter by fits-this-week / distance / cost / indoor / dog-friendly, map view · `/phirstmaxx/things/[id]` — the full research with sources, travel per person, fit list, Propose · `/phirstmaxx/plans` · `/phirstmaxx/settings` — places, block types, waking hours, buffers, pets, notification choices, research status.

## 9. Phases

1. **Core:** section, schema, engine with the ported fixtures, grid, drops, research stages 1–6, fit, plans + notifications, calendar write, importer (§10) for all old data.
2. **The rest of the old app:** trips (multi-day), budget (folded into the family household budget), Our story (folded into the family timeline), night sky + clear-night alert, booking-email drafts.
3. ~~**Cutover** (§10) once Kirsty is on Mycelium.~~ Dropped 2026-11-24: no cutover, PhirstMaxx starts empty (§10).

## 10. Old app → PhirstMaxx

**Decided 2026-11-24 23:20 (Phil): no old data is wanted.** The old PhirstMaxxing app holds nothing worth keeping, so the old Supabase project is being deleted, checklist phase 5 is skipped, `PHIRSTMAXX_OLD_DB_URL` is not needed anywhere, the importer is never run against the old project, and the nightly mirror and the cutover below are **dropped**. PhirstMaxx starts empty. Deleting the project breaks the old app at **phirstymaxxing.sporebit.com**, which stops working; removing its Vercel project, its IONOS DNS record and the PWA from both phones is **MYC-211** (Phil's). The importer itself stays in the repo as proven against `docs/fixtures/phirstmaxx-old-dump.json` (as-built spec §10), in case a dump ever turns up.

*What this section said before that decision, kept for the record:*
- `scripts/phirstmaxx-import.mjs` reads the old Supabase project (DB URL in env) and writes `pm_*`: dry run, conflicts report, undo — the Hours importer pattern. Idempotent on the old row id, so it can run nightly.
- ~~**Mirror period (now → Kirsty's invite):** the old app is the source for blocks and plans, imported nightly and on demand; PhirstMaxx screens show them and Phil can use drops/research/fit against real data.~~
- ~~**Cutover:** final import → Kirsty mapped to her Mycelium user by email → old app set read-only with a banner → two-week parallel check → Phil says retire → old Vercel project and Supabase project kept, paused, for 90 days.~~

## 11. Things only Phil can do (in-app checklist, answer boxes, no secrets in boxes)

*Guide for items 1–5, written 2026-11-21: https://claude.ai/artifact/SGRf5YDSCPN2ZumyoiDGro ; definition in the repo at `docs/checklists/google-family-phirstmaxx-setup.json` (one checklist covers this spec and the family calendar spec). The old repo has no `.env.local`, so the old database address comes from the Supabase dashboard (guide phase 5).*

1. OpenRouteService key — free, no card: https://openrouteservice.org/dev/#/signup → `ORS_API_KEY`. The API now lives at `https://api.heigit.org/openrouteservice/v2/…` (HeiGIT's unified address; `api.openrouteservice.org` answered 410 Gone on 2026-11-24 and the code moved that day).
2. **Google Maps Platform key (Routes + Places)** — has a free monthly allowance but **needs a billing account with a card**. Money-adjacent: the run stops and asks. Set a budget alert and a daily quota cap at creation. → `GOOGLE_MAPS_API_KEY`. Until it exists everything runs on the free route. **The bill must not be able to leave £0:** Mycelium counts its own calls per Google product per calendar month (table or `api_usage`) and refuses any call past **900**, falling back to the free route; Phil also sets console quotas of 30 a day on Routes API and Places API (New) and a £1 budget alert. The smallest free allowance is 1,000 a month (Enterprise tier, which Place Details with opening hours falls under), so 900 is under every tier. **Done 2026-11-24 (Phil):** the key "Mycelium Maps" in the `mycelium` Google Cloud project, restricted to Routes API and Places API (New), both enabled, billing linked; **per-day quotas could not be lowered** (Google marks them not adjustable), so Mycelium's 900-a-month counter per product is the hard stop; a £1 budget alerts at 50/90/100/150%. The billing account is on a **free trial that ends in about 90 days (late February 2027)**; when billing pauses Google answers 403 and both readers fall to the free route by design (`fetchJson` returns null on any non-2xx, `routeWithFallback` goes to OpenRouteService then the estimate, `resolve`/`enrich` keep Nominatim and Overpass) — each refused call still costs one count of the 900.
3. YouTube Data API key — free, same Google Cloud project → `YOUTUBE_API_KEY`.
4. ~~Old app's database URL for the importer → `PHIRSTMAXX_OLD_DB_URL`.~~ Not needed: no old data wanted (2026-11-24, §10).
5. **Research spend.** The web-search-grounded step is a cloud model call per drop and cannot run on the PC's local model. It sits under the £5 monthly AI cap unless Phil gives PhirstMaxx its own figure; the run asks before the first paid call and shows cost per drop on the status line.
6. Install the share Shortcut from its import link.

## 12. Done means

- Build (`rm -rf .next && npx next build`), vitest, Playwright green; every old engine fixture passes or has a written reason.
- Grid: paint five ranges across four days, one save, one transaction (kill the request mid-way → nothing saved); phone long-press paint does not fight scrolling; offline paint syncs.
- Drop: 202 in under a second; server killed mid-research → the drop is still there and research resumes; the same link twice → one thing; an Instagram link with a screenshot resolves to a place; a photo with GPS resolves to a place.
- Each research stage fails on purpose in a test and the others still complete; every fact on screen shows its source.
- Fit verdicts match hand-worked fixtures, including starting from two different places and a cross-midnight window.
- Two-user Playwright (Phil + test account): propose → other gets a push → agrees → proposer gets a push → event appears on the Family calendar (mocked) with the leave-by time; engine proposal reaches both.
- Importer: dry run then apply against a copy of the old data; second run changes nothing.
- Isolation: 0 leaks; no public GET; the inbox token route accepts POST only.
- Phil has verified it live (house checklist, 15-minute chunks).

## 13. Invariants

One migrations lane, numbered by build order; `supabase db push` only, dump first; RLS pattern on every `pm_` table; secrets in env only; no secret in docs, artifacts or chat; update `spec-index`, a new `claude/spec-phirstmaxx.md` as built, `context.md` and `backlog.md` in the repo and the project.
