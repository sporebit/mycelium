# Dossier: Mycelium as second brain (E.brain, MYC)

*Written 2026-11-28 for the run's ticket plan §15. Every product fact carries the day it was checked. Nothing was bought, connected, exported or switched on to write this.*

## 1. What Phil decided

A second brain means all four: anything put in can be found again by asking, it tells him what to do next, it holds his reference material, and it links things together. The biggest gap is that he still does not open it daily, because nothing pulls him in. The order is the unblock queue, then voice capture, then notes, then the connector, then imports. Notes get a dedicated quick-notes section called **Spores**. The **Mycelium connector** is built next so every Claude session reads and writes Mycelium; its first ticket settles the sign-in question. Finding things means **better search inside each section** (Work and Docs, captures and notes, People, Finance), not one ask box. Reference material comes in from Claude project docs and chat decisions, Google Drive, household paperwork (text read on the PC for free) and his existing notes (Apple Notes and Claude chats). Spreadsheets are listed first, then the selling sheet, household and shopping lists, and the finance and net-worth sheet move in. Facts keep their history for people, money and decisions. Export is monthly, automatic, to plain files beside the database dumps; Family and Day log data is permanent. Off-site backup is the same drive at a family member's house as Substrate. The one number is days per week he captures something, with a blunt Sunday scoreline (features shipped against days captured), an evening prompt on a day with no capture and a blunt call-out next morning. It should come to know what he has promised people, who he owes a reply, where things are in the house, and what he has read and watched. A year review for him and one for the family. Phone: stay with the web app and Shortcuts, research a native app "even if its android". Kirsty's invite keeps waiting for the UI rebuild. Agents' long-term memory gets a design ticket with a question round first. Done means 30 days running with a capture every day. If only three of four can be done well in 2027, "what next" is dropped.

## 2. His kit and constraints

- Mycelium on Vercel Hobby (daily crons only; a sub-daily cron fails the deploy) and hosted Supabase. Next.js 15 App Router. A PWA already (serwist).
- An iPhone 17 Pro (the glasses epic) and a Pixel (named in glass.15). iPhone Shortcuts are written in Cherri and handed over as import links (his standing rule, backlog 2026-11-21); MYC-197 builds the capture, retry, photo, share, quick note set.
- A Windows 11 PC with an RTX 4070 running the Mycelium PC worker (`pc-worker/`, local Whisper transcription and speech). No Mac is named anywhere in the digest or backlog.
- What already exists, so it is not re-ticketed:
  - Capture: typed capture form and entity registry, capture learning, the `idea` capture kind and `/organisation/ideas`, Telegram capture, the review queue (backlog, Capture). Captures live in `compost_items`.
  - Search: the Work query language with a `text` clause (title, description, key, aliases by ILIKE) in `work_search` (migration 0147); the People search box (MYC-155); agent memory search (`/api/memory/search`). No full-text index or ranking exists; no search in Finance or captures.
  - Docs: the Work Docs tree (MYC-174). W10 (move `claude/*.md` into Docs, read and written by Claude sessions through the API) is committed "after the MCP connector".
  - The connector: committed in the Ideas spec ("Mycelium MCP connector"). A finding of 2026-10-29 in the backlog: claude.ai custom connectors take OAuth or fixed request headers, the latter in beta for some organisations; "Phil to check the dialog once". Scoped `mtk_` tokens exist for the Tickets API.
  - People: contacts, tiers, merge, vCard import and export (MYC-165), the review queue (0149).
  - Export: `/api/export` (JSON, CSV, PDF by section, run by hand) and `/api/people/export.vcf`.
  - Backups: `scripts/db-backup.ps1` nightly at 02:30 to `A:\Backups\mycelium\nightly\<date>\` (schema, data dump, manifest; 7 daily, 4 Sunday, 12 monthly) and `scripts/storage-backup.mjs` for stored files. The off-site copy does not exist.
  - Native app: an idea entry (2026-11-20, "later, after the UI rebuild"), with the Apple Developer fee flagged against the no-paid-services rule.
- Spend as close to zero as possible; cloud AI under a £5 monthly cap with local-first on the PC.
- The Google OAuth app used for the Family calendar is being published as part of MYC-207. Anything that adds a Google scope touches that app.

## 3. What the research found

### 3.1 The Mycelium connector (brain.02, brain.03)

- Claude's hosted apps (claude.ai web, Desktop, mobile, Cowork) and Claude Code share one authentication infrastructure for remote MCP servers. Three ways in: OAuth 2.0 (each user signs in), a static credential in a request header (beta, limited organisations; Owners without it do not see the Request headers section), or no authentication. [1] (checked 2026-11-28)
- OAuth types supported by default: Dynamic Client Registration (RFC 7591) and a Client ID Metadata Document (CIMD). Claude uses CIMD only when the authorization server advertises `client_id_metadata_document_supported` and `none` in its token auth methods; otherwise it falls back to DCR. PKCE with S256 is required on every request. [1] (checked 2026-11-28)
- The hosted callback is `https://claude.ai/api/mcp/auth_callback`. Claude Code uses a loopback redirect on a random port, so the server must match `localhost` and `127.0.0.1` ignoring the port. [1] (checked 2026-11-28)
- Discovery: an unauthenticated request must get a `401` with a `WWW-Authenticate: Bearer resource_metadata="..."` pointer; Claude ignores the header on a `200`. The protected resource metadata `resource` must equal the server URL exactly. The pointer may live anywhere on HTTPS, which suits Vercel route handlers that cannot serve root `/.well-known/` paths. [1] (checked 2026-11-28)
- Timeouts: 10 seconds for discovery, registration and token endpoints, 30 seconds for refresh. Refresh errors must be `invalid_grant`. The token endpoint must accept form-urlencoded bodies. Rotate refresh tokens for public clients. [1] (checked 2026-11-28)
- A request-header credential is the organisation's, not a person's: every member's calls carry the same key. Tokens must never go in the URL. [1] (checked 2026-11-28)
- Requests come from Anthropic's cloud (egress `160.79.104.0/21`), not from the device, so the server must be public on the internet. [1] [2] (checked 2026-11-28)
- Claude Code can add a remote server with a fixed bearer header (`claude mcp add --transport http <name> <url> --header "Authorization: Bearer ..."`, user scope across projects). Reported gotcha: if the server also advertises OAuth, Claude Code ignores the configured header and starts OAuth instead. [3] [4] (checked 2026-11-28)
- Building it on Vercel: `mcp-handler` (Vercel) hosts an MCP server in a Next.js route handler over Streamable HTTP; v2 needs Node 20+, the MCP SDK v2 and Zod v4; `withMcpAuth(handler, verifyToken, { required: true })` wraps it and the tool handlers read the caller from the auth info. v2 drops the old HTTP+SSE transport. [5] [6] (checked 2026-11-28)
- **What this means for the sign-in decision (brain.03).** Three options, for Phil to choose:
  1. Bearer token only: a scoped Mycelium token per client. Works today in Claude Code (header) and in claude.ai only if the Request headers section appears for his organisation. Smallest build. The same token for every session, so the server cannot tell sessions apart.
  2. OAuth with CIMD or DCR backed by Mycelium's own Supabase sign-in: works in every Claude surface, each sign-in is his own account, tokens are revocable per connection. The largest build (a small authorization server: metadata, authorize, token, refresh, consent screen).
  3. Both: OAuth for the hosted apps, bearer for Claude Code and scripts. The server must not advertise OAuth to the bearer path, or Claude Code drops the header (the reported gotcha), so this needs separate URLs or a lazy-auth split. UNVERIFIED whether the gotcha still holds today.
  The first step of brain.03 is the check the backlog already asks for: open claude.ai's Add custom connector dialog and see whether a Request headers section is offered. Nothing is added in that sitting.

### 3.2 Section search (brain.04 to brain.07)

- No outside research needed for the approach; the facts are in the repo. Work already has a `text` clause by ILIKE (0147). Postgres full-text search (a generated `tsvector` with a GIN index, `websearch_to_tsquery` for the user's words) is the standard upgrade within Supabase and costs nothing extra. Trigram (`pg_trgm`) catches misspellings of names, which matters for People. UNVERIFIED: the size of each table on hosted, which decides whether indexes need care on the free plan's database size (MYC-187 tracks database size).

### 3.3 Google Drive import (brain.10)

- `drive.readonly` is a **restricted** scope. Unverified apps requesting restricted or sensitive scopes show the unverified-app screen and are capped at 100 new users. Personal use is listed as an exemption from verification. Storing or transmitting restricted-scope data on servers can require a security assessment. [7] [8] [9] (checked 2026-11-28)
- `drive.file` is non-sensitive: per-file access to files the user picks (Google Picker) or the app made. [9] (checked 2026-11-28)
- An OAuth app left in "Testing" issues refresh tokens that expire after 7 days for test users; publishing to production removes that, and tokens minted while in Testing must be re-minted. [10] [11] (checked 2026-11-28; community sources quoting Google's wording, the official page was not opened)
- Google Takeout exports Drive as a zip with no OAuth at all, which suits a one-off import. UNVERIFIED for current Takeout Drive format conversions (Docs to .docx and so on); check at the sitting.
- **Cautious route for the ticket:** do not add a Drive scope to the Family calendar OAuth app (MYC-207), because a restricted scope on that app could change its verification state and break the calendar connection. Either a one-off Takeout zip imported from the PC, or `drive.file` with a picker, or a separate Google Cloud project kept personal. The ticket asks Phil to choose after Claude lays these out.

### 3.4 Household paperwork, text read on the PC for free (brain.11)

- `Windows.Media.Ocr` is built into Windows and runs on the device, but Microsoft's reference says it is supported only for desktop apps with **package identity** (installed from an MSIX). A plain Node or Python worker does not have that without packaging. [12] (checked 2026-11-28)
- The newer Windows AI text recognition API (Windows App SDK) is described as faster and more accurate than the legacy engine and hardware-accelerated on an NPU; it also needs package identity, and one source says it runs only on Copilot+ PCs. His PC is not known to have an NPU. [13] [14] (checked 2026-11-28; the NPU-only claim is UNVERIFIED)
- Tesseract is open source, free and runs offline; OCRmyPDF adds a searchable text layer to scanned PDFs and produces PDF/A. On Windows it needs 64-bit Python, Tesseract and Ghostscript (winget and uv install them), or Docker or WSL. [15] [16] (checked 2026-11-28)
- No independent accuracy benchmark between Windows OCR and Tesseract was found; the only comparison is from a vendor that sells its own engine. Test on his own documents. [17] (checked 2026-11-28)
- **Route for the ticket:** a new job type on the existing PC worker using Tesseract (images) and OCRmyPDF (PDFs), the text stored beside the file so section search finds it. This depends on brain.04 (search exists to find it). Sub.15 (Substrate's paperwork archive service) is the later home; brain.11 should not build a second archive, only the text extraction and search.

### 3.5 Apple Notes into Spores (brain.12)

- iOS 26 Notes can **Share, Export as Markdown** one note at a time, and imports `.md` files. No bulk export is built in; some users reported blank or corrupt files exporting several notes on iPadOS 26. [18] [19] (checked 2026-11-28)
- Notes on Mac exports a note as PDF or Markdown, also one at a time. [20] (checked 2026-11-28). No Mac is named in his kit.
- Apple's Data and Privacy page can send a copy of iCloud data including Notes; Apple says it can take up to seven days and the download is removed after about 14 days. One user report says formatting and tables were lost. [21] [22] (checked 2026-11-28)
- Third-party bulk exporters (Exporter on the Mac App Store, `notesctl`) need a Mac. [23] [24] (checked 2026-11-28)
- **Route for the ticket:** count the notes first. Under about 30: Export as Markdown by hand into a Mycelium upload. More: a Cherri Shortcut that loops over his notes and posts each body to the capture API as a Spore (fits his Shortcuts rule; the Shortcuts "Find Notes" action and its fields are UNVERIFIED for iOS 26 and need checking on the phone). The privacy-page copy is the fallback and the safety net: request it before anything is deleted from Notes. Nothing is deleted from Apple Notes by this ticket.

### 3.6 Native phone app (brain.23)

- iOS web apps installed to the home screen get push (since iOS 16.4) after a tap to allow, but no Background Sync, Periodic Background Sync or Background Fetch, so a PWA cannot retry an upload while closed. Every browser on iOS uses WebKit. Some sources report storage cleared after a period of non-use. [25] [26] (checked 2026-11-28; vendor blogs, no Apple feature matrix found)
- Apple Developer Program: US$99 a year; the UK price is shown at enrolment (the backlog's "about £79" is UNVERIFIED for 2026). If membership lapses, apps can no longer be downloaded or updated. [27] (checked 2026-11-28)
- Google Play: a one-time US$25 registration with identity verification. [27] (checked 2026-11-28)
- Android developer verification: open to all developers since March 2026; enforced for every app on certified devices in Brazil, Indonesia, Singapore and Thailand from September 2026, and **globally in 2027**. An "advanced sideloading" flow for power users exists from August 2026. A personal Android app installed outside Play will need a verified developer (a free limited-distribution account is described) or the advanced flow from 2027. [28] [29] (checked 2026-11-28)
- What a native app would add for Phil: true background capture upload (the reason in the backlog idea), widgets, and on Android a path for the glasses (glass.01 already researches "own Android app against a headset"). brain.23 should share its findings with glass.01 rather than repeat them.

### 3.7 Off-site backup (brain.17)

- No new research: the drive at a family member's house is sub.11's job (Substrate backups), and brain.17 only adds Mycelium's nightly dumps, the storage copy and the monthly plain-file export (brain.16) to what that drive carries. Encryption at rest on the off-site drive is sub.11's decision.

### 3.8 Monthly export to plain files (brain.16)

- Builds on `/api/export` (JSON, CSV, PDF) and runs on the PC beside `db-backup.ps1`, not as a Vercel cron (a monthly Vercel cron is allowed on Hobby, but the files belong on the PC drive beside the dumps). Family and Day log as Markdown plus their photos, so a person with no app can read them; "print" means a PDF per year.

## 4. Risks

- **Lock-out through the connector.** An OAuth authorization server that issues long-lived tokens with write scope is a new way into all his data. Mitigation on brain.02: owner-only, scopes split read and write, per-connection revocation in Settings, no token in a URL, refresh rotation, and the sign-in decision (brain.03) taken by Phil before any build.
- **Data loss on import.** Apple Notes and the spreadsheets are the only copies of some things. Mitigation on brain.08 and brain.12: nothing is deleted at the source; an export copy (privacy-page request for Notes, a downloaded copy for each sheet) is taken first; counts are compared after import.
- **Breaking the Family calendar.** Adding a Drive scope to the MYC-207 OAuth app could change its verification state. Mitigation on brain.10: a separate route (Takeout or a separate project), decided by Phil.
- **Private data in exports.** The monthly export and the off-site drive hold finance and the owner-only habit (H5). Mitigation on brain.16 and brain.17: owner-only export, the private habit excluded from any shared export, the off-site drive encrypted (sub.11).
- **Money.** The native app costs the Apple fee yearly (and a one-off Play fee). Mitigation on brain.23: research only; nothing bought; the cost stated against the no-paid-services rule for Phil's call.
- **Building instead of using.** Phil's own pre-mortem. Mitigation: brain.18 (the Sunday scoreline) and brain.19 (the evening prompt and call-out) are cheap and early; brain.26 is the done check.
- **Kirsty-facing breakage.** None in this epic directly; brain.24 is a decision only.

## 5. Facts that differ from the plan

- **brain.02 / brain.03:** the plan calls the sign-in "the open question"; the backlog (2026-10-29) already has half the answer: request headers work if the dialog offers them, otherwise OAuth. Today's documentation adds CIMD as a default OAuth route and a reported Claude Code gotcha (a configured header is ignored when the server advertises OAuth). brain.03's first step is the dialog check the backlog already asked for.
- **brain.10:** `drive.readonly` is a restricted scope; adding it to the Family calendar OAuth app (MYC-207) risks that app. The ticket is written as "choose the route first" (Takeout, `drive.file` with a picker, or a separate project). Question for the red team: should brain.10 carry `after MYC-207` so the calendar app is settled before any Google change?
- **brain.11:** "text read on the PC for free" cannot use the built-in Windows OCR from the current PC worker without MSIX packaging. Tesseract and OCRmyPDF are the free route. sub.15 (Substrate's paperwork archive) overlaps; brain.11 is written as text extraction only, linked to sub.15.
- **brain.12:** Apple Notes has no bulk export on iPhone and no Mac is named; the import route depends on the note count. Written as count first, then the route.
- **brain.23:** Android sideloading of a personal app needs developer verification globally from 2027; "even if its android" is no longer free of sign-up. The backlog's "about £79 a year" for Apple is UNVERIFIED (the fee is US$99, the sterling figure shown at enrolment).
- **brain.26:** the plan has `after brain.01` only. The done check reads the "days captured" count that brain.18 builds, so `after brain.18` is added.

## 6. Sources

1. https://claude.com/docs/connectors/building/authentication , Authentication for connectors, Claude docs (checked 2026-11-28)
2. https://support.claude.com/en/articles/11503834 , custom connectors with remote MCP, Claude Help Centre (checked 2026-11-28)
3. https://code.claude.com/docs/en/mcp , Claude Code MCP documentation (checked 2026-11-28)
4. https://zuplo.com/learn/mcp/errors/configured-headers-ignored-when-oauth-discovery-present , configured headers ignored when OAuth discovery is present (checked 2026-11-28)
5. https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel , Deploy MCP servers to Vercel (checked 2026-11-28)
6. https://github.com/vercel/mcp-handler , mcp-handler README (checked 2026-11-28)
7. https://support.google.com/cloud/answer/13464325 , Restricted scopes, Google Cloud help (checked 2026-11-28)
8. https://support.google.com/cloud/answer/7454865 , Unverified apps, Google Cloud help (checked 2026-11-28)
9. https://developers.google.com/workspace/drive/api/guides/api-specific-auth , Choose Google Drive API scopes (checked 2026-11-28)
10. https://discuss.google.dev/t/app-name-verification-failures-on-required-publishing-but-this-is-for-my-personal-use-only/354816 , personal-use app and 7-day tokens, Google Developer forum (checked 2026-11-28)
11. https://forum.rclone.org/t/7-day-reconnect-of-google-drive-oauth/50148 , 7-day reconnect of Google Drive OAuth, rclone forum (checked 2026-11-28)
12. https://learn.microsoft.com/uwp/api/windows.media.ocr , Windows.Media.Ocr namespace, Microsoft Learn (checked 2026-11-28)
13. https://learn.microsoft.com/windows/ai/apis/text-recognition , Text recognition in the Windows App SDK, Microsoft Learn (checked 2026-11-28)
14. https://jp.ext.hp.com/techdevice/ai/hybrid_ai_committee-windows_ai_apls/ , Windows AI APIs tested on hardware, HP (checked 2026-11-28)
15. https://ocrmypdf.readthedocs.io/en/latest/installation.html , Installing OCRmyPDF (checked 2026-11-28)
16. https://pypi.org/project/ocrmypdf/ , OCRmyPDF on PyPI (checked 2026-11-28)
17. https://ironsoftware.com/ocr/csharp/blog/ocr-tools/windows-ocr-engine-vs-tesseract/ , Windows OCR Engine vs Tesseract (vendor) (checked 2026-11-28)
18. https://www.macrumors.com/how-to/ios-import-export-markdown-apple-notes/ , import and export Markdown in Apple Notes, MacRumors (checked 2026-11-28)
19. https://forums.macrumors.com/threads/ipados-26-data-corruption-when-exporting-notes.2468611 , iPadOS 26 data corruption when exporting notes (checked 2026-11-28)
20. https://support.apple.com/en-gb/guide/notes/not201900c07/mac , Import, export and print notes on Mac, Apple Support (checked 2026-11-28)
21. https://support.apple.com/102208 , Get a copy of the data associated with your Apple Account (checked 2026-11-28)
22. https://macrumors.com/how-to/get-a-copy-of-your-apple-account-data , get a copy of your Apple Account data, MacRumors (checked 2026-11-28)
23. https://apps.apple.com/gb/app/exporter/id1099120373?mt=12 , Exporter, Mac App Store (checked 2026-11-28)
24. https://pypi.org/project/notesctl/ , notesctl on PyPI (checked 2026-11-28)
25. https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide , PWA iOS limitations and Safari support (checked 2026-11-28)
26. https://developer.apple.com/forums/thread/690471 , Push API and notification support in iOS PWA, Apple Developer Forums (checked 2026-11-28)
27. https://magora-systems.com/apple-developer-fee/ , Apple developer fee, and https://support.google.com/googleplay/android-developer/answer/112622 , Play Console registration (checked 2026-11-28)
28. https://support.google.com/android-developer-console/answer/16561738 , Understanding Android developer verification, Google (checked 2026-11-28)
29. https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/ , Android sideloading changes timeline, Android Authority (checked 2026-11-28)
