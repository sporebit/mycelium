# Ideas — decision record (DRAFT, 2026-09-22/23)

*Status: discovery complete; full spec next. 21 decisions from Phil (Q1–Q10 on 2026-09-22, Q11–Q21 on 2026-09-23). Backlog: "Ideas" section in `claude/backlog.md`. Written in Cowork; the 09-22 draft was built on stale project docs (DB assumed at 0120) — corrected 2026-09-23 against the repo (DB at 0134; 0121 partition, 0122 keys, 0123 sprints already shipped).*

## Problem (Phil)
Many ideas (apps, automations, inventions, home projects, products). He never finishes them, gets distracted, then forgets everything. Wants one place in Mycelium that holds everything figured out per idea. Quick dumps come via Whisper/Telegram or the web page; most discovery and planning happens in Claude chats/projects. Getting info from Claude into Mycelium must be effortless, and the stored info must be the best available every time. Tickets link to the idea. A large number of ideas is fine — volume is not a problem to solve.

## Decisions
| # | Decision |
|---|---|
| 1 | **An idea = a Tickets project at an idea stage.** One `projects` table; no separate ideas silo. **Ventures** is where ideas that become businesses end up: a dashboard for everything venture-related, to be expanded in its own spec later. |
| 2 | Fix: forgetting details, never starting, abandoning mid-way. ("Too many at once" dropped 2026-09-23 — Phil has no issue with quantity.) |
| 3 | Lifecycle: Spark → Exploring → Planned → Building → Shipped / Parked / Killed (killed keeps the brief and the reason). |
| 4 | **No pushback** on starting new ideas: no cap, no nag. |
| 5 | **Mycelium MCP connector**: Claude (claude.ai chats and projects, Cowork, Claude Code) reads and writes ideas directly. |
| 6 | Contents: a fixed-section brief + freeform notes + raw dumps kept verbatim. |
| 7 | Re-import = **versioned merge + diff**; decisions are append-only; revert is possible. |
| 8 | **One "Ideas" Claude project**: its instructions pull the idea from Mycelium at chat start and push the brief at the end. |
| 9 | Tickets attach **from Exploring onwards** (research/spike tickets first, build tickets later), via `project_id`. |
| 10 | Quick dumps land in the **Tickets Inbox**; the Clarify card stack gains a **"This is an idea"** action (new Spark, or append to an existing idea). |
| 11 | **Keys:** `MYC-` only for the Mycelium project; other projects their own prefix; unprojected = space prefix `PW-n` (as shipped in 0122). **New:** a `PW` ticket is re-keyed the first time it gets a project (old key redirects), and the 79 legacy unprojected `MYC-n` + non-Mycelium habit tickets are re-keyed once with aliases. Tracked in the backlog Tickets section. |
| 12 | Brief = **universal core + per-type sections**. Core: problem, who for, requirements, constraints, decisions, open questions, risks, next step, links. Types: app (stack / data / screens), invention/product (parts / BOM / cost / manufacture), home (materials / measurements / tools), automation (triggers / inputs / outputs), business (market / pricing). |
| 13 | **Both edit the brief; Phil's edits win.** Claude merges on top of the latest version and never silently overwrites a hand-edited line — conflicts are flagged. |
| 14 | **Gap list per stage.** Each stage has required fields (e.g. Planned needs requirements + cost estimate + first tickets); the idea shows what is missing; Claude opens the next chat by working the gaps. Not a hard gate. |
| 15 | Chat start in the Ideas project: **Claude infers the idea from the first message, loads brief + gaps, confirms in one line**; offers a new Spark if nothing matches. |
| 16 | Push timing: **at checkpoints (a decision or requirement settled) + whenever Phil says "save"**; one version per push. |
| 17 | At Building (apps/automations): Mycelium generates **a Claude Code build prompt** from the brief/decisions/gaps **and** a **repo `CLAUDE.md` + the first build tickets**. |
| 18 | Research: **on demand only** ("Research this" → Sonnet + web search, stored as a dated section, monthly £ cap). |
| 19 | Resurfacing: **"Where was I" card** on every idea (last decision, open gaps, next step, days idle) + **weekly review section** (ideas idle 30+ days: continue / park / kill) + **Telegram nudge** about stale ideas with their next step. |
| 20 | Media: **photos + sketches, files (PDF / CAD / datasheets), typed links, and voice notes kept as audio** alongside the transcript. Private bucket, signed URLs. |
| 21 | **Placement:** idea-stage projects (Spark → Planned) live on their **own Ideas surface regardless of area**; at Building they show under Tickets (`areas.kind = technical`: Mycelium + Side projects) or Tasks (life) per 0121. |

## Flags / assumptions (raised once)
- **Q10 depends on Clarify** (latency fixes shipped 09-18 in `37f08ba`). Routing dumps to an idea at Clarify only works if the weekly review empties the Inbox.
- **`projects.status`** is active/paused/done/archived. Idea stages need a `stage` column (preferred) or a widened enum. Check how 0123 sprints and the Ventures tables reference projects before choosing.
- **Connector auth is unverified:** check which auth methods claude.ai custom connectors (remote MCP) accept before committing to the scoped `mtk_` bearer tokens from 0120. They may require OAuth.
- **Telegram stale-idea nudges** with a large idea count: default no more than one nudge per week, for the most recently active stale idea (assumption).
- **Voice audio:** the capture pipeline must save the original audio file (it may currently keep only the transcript). Check before building; storage counts against the Supabase bucket quota.
