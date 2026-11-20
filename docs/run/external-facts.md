# External facts for the build

Gathered 2026-11-20 by web research. Every claim carries the URL it was read on. "Tested" means a request was sent from this PC on 2026-11-20 with a public sample symbol and no key, account or personal detail. Nothing was signed up for.

How to read the confidence wording:

- **Read on the page** — the primary source said it.
- **Tested** — a live request returned it today.
- **Inferred** — follows from what the sources say, but no source states it outright.
- Anything else is in the "Not verified" list of its section.

---

## 1. Enable Banking — reading one's own UK bank accounts for free

### Is the free tier still offered?

Yes. The Terms of Service (last updated 2026-01-09) say:

- "Use of the Control Panel and the API under these Terms is free of charge."
- "Use of the API in the Production Environment is limited to Linked Accounts and is available solely for evaluation purposes or for the personal use of private individuals. The number of Linked Accounts per Application may be limited."
- The terms grant no right to use the API for "accessing account information that does not belong to the Control Panel user who associated the Linked Accounts", for business accounts, or for any commercial purpose.
- "Quotas for API requests per second, per hour and per day may apply." No numbers are given.
- "Enable Banking may modify or discontinue any functionality at any time." Service is "AS IS".

Source: https://enablebanking.com/terms (the page is a JavaScript app and would not render in the fetch tool; the text above was read from the site's own script bundle, https://enablebanking.com/js/app.d431952d.js, which holds the terms verbatim).

What "restricted mode" permits, from the docs:

- A production application starts as "Inactive". Linking an account with the "Activate by linking accounts" button makes it "Active" in restricted mode. "Using restricted applications you can only fetch data from accounts linked to the application." It stays restricted "until an agreement has been signed". https://enablebanking.com/docs/api/linked-accounts/
- An account that is not linked is stripped from responses, so the API returns an empty list. https://enablebanking.com/docs/faq
- It is real production data: the application is registered in the production environment and the bank's real consent screen is used. https://enablebanking.com/docs/api/linked-accounts/
- Linking in the control panel does **not** authorise the application: "This process won't handle authorization on behalf of the app." The same account must then be authorised again through the API. https://enablebanking.com/docs/api/linked-accounts/

### UK coverage — the finding that changes the plan

Enable Banking's own public coverage index (the search index its "Integrated ASPSPs" page at https://enablebanking.com/open-banking-apis reads from; queried directly because the page itself would not render) lists 1,048 UK entities, of which only **seven** have an account-information integration:

| ASPSP name in the index | Integrations behind it |
|---|---|
| ABN AMRO | ABN AMRO personal and business |
| Barclays | Barclays |
| Coutts | Coutts |
| HSBC | HSBC |
| HSBC UK Bank Plc | first direct, HSBC UK personal, HSBC UK business, HSBC Kinetic, HSBCnet, M&S Bank |
| NatWest | NatWest, Mettle, Ulster Bank |
| RBS | RBS |

The three accounts asked about:

| Provider | In the index? | Integration? |
|---|---|---|
| **Halifax** | No entry under "Halifax". Its legal entity "Bank of Scotland plc" (GB) and "Lloyds Bank PLC" (GB) are listed. | **None.** Both have empty integration lists. |
| **Revolut (personal, UK)** | "Revolut Bank UK Ltd" (GB) is listed. | **None for GB.** The working Revolut integration is the Lithuanian entity, and its country list is 30 EEA countries with GB absent. |
| **American Express UK** | No GB entry at all. The only "American Express" entry is Spain. | **None.** The changelog shows the American Express integration being enabled for France in January 2026; nothing for GB. |

Supporting evidence from Enable Banking's integration changelog (https://enablebanking.com/docs/core/latest, latest release 0.16.9 dated 2026-11-05):

- UK integrations were first added in 0.16.1 (2026-02-28): Coutts, first direct, HSBCnet, HSBC Kinetic, HSBC UK business and personal, Mettle, M&S Bank, NatWest, RBS, Ulster Bank. Barclays followed in 0.16.2 (2026-03-29).
- 0.16.2 also says "Removed GB from getEEACountryList function", which fits Revolut and Wise (EEA-wide integrations) not covering GB.
- The whole changelog contains no mention of Halifax, Lloyds, Bank of Scotland, Monzo, Starling, Nationwide or Santander UK.
- The monthly blog changelogs read (May 2026: https://enablebanking.com/blog/2026/06/12/enable-banking-changelog-may-2026) list no UK additions.

Caveat: the authoritative list is `GET /aspsps?country=GB` on the API, which needs a signed token and therefore an account. That call was not made. The public index could lag the API.

### Sign-up and application registration, in order

1. Sign in at https://enablebanking.com/sign-in/ with an email address; "new accounts are automatically created on the first sign in". A one-time link is emailed. (https://enablebanking.com/docs/api/quick-start/)
2. Open https://enablebanking.com/cp/applications and fill in "Add a new application". (same page)
3. Choose **Production** rather than the default Sandbox. (https://enablebanking.com/docs/api/linked-accounts/)
4. Keep the default private-key option: "Your web browser will generate a private key for the application" and saves it to the downloads folder as `<application-id>.pem`. (quick-start page)
5. Enter the application name (the bank's consent screen shows it) and the redirect URLs, described as "URLs whitelisted for redirecting of end users". Press Register. (quick-start page)
6. The application shows "Inactive". Press "Activate by linking accounts", go through Enable Banking's page to the bank, accept the end-user terms, and authorise. The status becomes "Active" (restricted). (linked-accounts page)
7. Then run the API authorisation flow below for the same account.

Actual Budget's guide adds two practical points: if a privacy-policy or terms link is entered it must begin `https://` or the form reports "Invalid URL"; and skipping the linking step means no banks or accounts are returned later. https://actualbudget.org/docs/advanced/bank-sync/enable-banking

### Redirect URL

- Must be registered on the application; an unregistered one is rejected with error `REDIRECT_URI_NOT_ALLOWED`. https://enablebanking.com/docs/api/reference/
- Enable Banking's own pages do not state an https rule. Actual Budget's guide does: "Enable Banking only redirects to `https://` addresses", and a desktop `app://` address is not accepted. https://actualbudget.org/docs/advanced/bank-sync/enable-banking
- It can be a page on one's own site: Actual's example is `https://<your-domain>/enablebanking/auth_callback`. The bank returns the user there with `code` and `state` in the query string. (quick-start page)

### Authentication

Read on https://enablebanking.com/docs/api/reference/ and the quick-start page:

- A JWT signed with the application's private key, sent as `Authorization: Bearer <JWT>` on every call.
- Header: `typ` = `JWT`, `alg` = `RS256` (the only algorithm supported), `kid` = the application ID.
- Claims: `iss` = `enablebanking.com`, `aud` = `api.enablebanking.com`, `iat` = now, `exp` = expiry. The quick start uses one hour; "Maximum allowed time-to-live for token is 86400 seconds (24 hours)".
- Base URL `https://api.enablebanking.com`. (`https://api.tilisy.com` is deprecated.)

### Endpoints

All on https://enablebanking.com/docs/api/reference/:

| Call | Purpose |
|---|---|
| `GET /aspsps?country=GB&psu_type=personal` | List banks, with `maximum_consent_validity`, `required_psu_headers`, `auth_methods`, `psu_types`, `beta` per bank |
| `GET /application` | The application the token belongs to, including its allowed redirect URLs |
| `POST /auth` | Start an authorisation. Body: `access.valid_until` (RFC 3339 with offset), `aspsp.name` + `aspsp.country`, `state`, `redirect_url` (all required), `psu_type` (`personal`/`business`, "highly recommended"). Returns a URL to send the user to. |
| `POST /sessions` | Body `{"code": "<code from redirect>"}`. Returns `session_id`, `accounts`, `aspsp`, `access`. |
| `GET /sessions/{session_id}` / `DELETE /sessions/{session_id}` | Read or end a session |
| `GET /accounts/{account_id}/details` | Account details |
| `GET /accounts/{account_id}/balances` | Balances (`balance_amount`, `balance_type`, `reference_date`) |
| `GET /accounts/{account_id}/transactions` | Query: `date_from`, `date_to`, `continuation_key`, `transaction_status`, `strategy` (`default` or `longest`). Page until no `continuation_key` comes back. |

Account IDs are per session. After re-consent the session ID and account IDs change; match accounts across sessions with `identification_hash`. https://enablebanking.com/docs/faq

### Rate limits

- Enable Banking publishes no number of its own; every endpoint can return 429. https://enablebanking.com/docs/api/reference/
- The binding limit is the bank's: "many ASPSPs have the limit of 4 times a day for data fetches when PSU (i.e. the end-user) is not online". On `ASPSP_RATE_LIMIT_EXCEEDED` in the background "there is no way to avoid limits"; the FAQ advises waiting six hours. https://enablebanking.com/docs/faq
- PSU headers (for example `Psu-Ip-Address`, `Psu-User-Agent`) mark a request as user-present and lift that cap. Background jobs must send none of them; sending only some gives 422 `PSU_HEADER_NOT_PROVIDED`. https://enablebanking.com/docs/faq

### Consent length and re-consent

- "The maximum value you can set for `valid_until` is dictated by the ASPSP… For the majority of ASPSPs, this value corresponds to 180 days." The value asked for is trimmed to the bank's limit. https://enablebanking.com/docs/faq
- Actual Budget's guide says, for its users, access lasts "90 days at most, and some banks allow less". https://actualbudget.org/docs/advanced/bank-sync/enable-banking — the two sources disagree; the per-bank figure is `maximum_consent_validity` from `GET /aspsps`.
- Re-consent is the whole flow again: on `EXPIRED_SESSION`, "API clients should initiate a new authorisation and prompt end users to complete it." https://enablebanking.com/docs/faq
- History: "Most ASPSPs provide access to at least one year of transactions." Full history is usually only available for about an hour after authorisation; after that many banks restrict to the past 90 days. Use `strategy=longest` on the first fetch. https://enablebanking.com/docs/faq

### GoCardless Bank Account Data (background)

Sources disagree. Firefly III's guide says registration is closed (search-result extract of https://docs.firefly-iii.org/how-to/data-importer/import/gocardless/; the Firefly III site returned 403 to the fetch tool). GoCardless's announcement page is titled "Bank Account Data legacy wind down" and sends interested people to sales: https://gocardless.com/bank-account-data/announcement. Its marketing pages still describe a free tier.

### What this means for the build

- **Enable Banking, as publicly listed, covers none of Halifax, Revolut UK or American Express UK.** The bank-sync plan as written does not work for these three accounts.
- It would work today for Barclays, HSBC/first direct/M&S Bank, NatWest/RBS/Ulster/Mettle and Coutts, if any household account is with those.
- Before any code is written, the one decisive check is: create the free account, register a production application, and call `GET /aspsps?country=GB` (or simply look at the bank picker behind "Activate by linking accounts"). That takes minutes and costs nothing. It was not done here because it needs a sign-up.
- If the three are confirmed absent, the fallbacks are statement export/import (CSV/OFX from each provider) or another aggregator; neither was researched here.
- If the build goes ahead for a covered bank: store the private key as a server secret; mint a short-lived RS256 token per run; schedule at most four background fetches a day per account with no PSU headers; plan a re-consent reminder ahead of `valid_until`; key accounts on `identification_hash`, not account ID; do the deep history pull immediately after consent.
- The redirect page must be an https page on the app's own domain, registered on the application.
- Free use rests on terms that allow Enable Banking to withdraw or limit it at any time, and only for accounts belonging to the person who linked them. A second household member's accounts would need that person to do the linking under their own control-panel login.

### Not verified

- The live API bank list for GB (needs an account). The public index may be behind.
- How many linked accounts a restricted application may have (terms say only "may be limited").
- Consent length for any UK bank, and whether UK 90-day reconfirmation is handled differently.
- Whether Enable Banking holds a UK (FCA) permission; its terms cite only its Finnish registration. A third-party tracker says it appears in the UK Open Banking directory; not checked at source.
- Whether http or localhost redirect URLs are accepted (Enable Banking's own docs are silent; Actual's guide says https only).
- Firefly III's Enable Banking guide (https://docs.firefly-iii.org/tutorials/data-importer/eb/) returned 403 and could not be read.
- https://enablebanking.com/pricing returned 404.

---

## 2. iPhone Shortcuts — what a capture Shortcut can and cannot do

Note on versions: Apple's Shortcuts User Guide now defaults to **iOS 27** (its links carry `/ios/27`), so iOS 27 is the current release, not iOS 26. The iOS 18 edition was read separately where stated. Apple's guide is thin on action-level detail; where it is silent, the action catalogue kept by Matthew Cassinelli (a former Shortcuts team member) is used and named.

### Dictate Text and Record Audio on the same speech

- **Dictate Text**: "Transcribes what you say aloud into text and passes the result to the next action." No input. Output is text only. Options: Language; Stop Listening = After Pause / After Short Pause / On Tap. https://matthewcassinelli.com/actions/dictate-text/
- **Record Audio**: "Uses the microphone to record audio." Options: Audio Quality = Normal / Very High; Start Recording = On Tap / Immediately; Finish Recording = On Tap / After Time. Output: Normal gives M4A (AAC), Very High gives uncompressed WAV. Marked "Opens App". https://matthewcassinelli.com/actions/record-audio/
- Apple describes a shortcut as content "passed from action to action" (https://support.apple.com/guide/shortcuts/the-flow-of-content-apd33c8d5c6d/ios); it does not say in so many words that only one action runs at a time. **Inferred:** the two cannot capture the same utterance in one run. Dictate Text keeps no audio; Record Audio produces no text. No source was found describing a way to run them together.
- **The practical way to get both:** Record Audio first, then pass the recording to the built-in **Transcribe Audio** action to get text. The action exists and Apple lists "'Transcribe Audio' performance has been improved" among iOS 26 changes: https://support.apple.com/en-gb/125148.
- Reliability warnings for Transcribe Audio, all user reports: after updating to iOS 26 some shortcuts failed with "No common audio files among modules" (https://discussions.apple.com/thread/256155805); on iOS 18.0.1 one user got a single line from a longer recording (https://developer.apple.com/forums/thread/748779).
- Because the server already receives the audio, the server's own transcription can be the fallback whenever on-device text is empty or short.

### Save File to a named iCloud Drive folder without a prompt

- "Save files to iCloud Drive. Turn off 'Ask Where to Save' in order to specify a destination path in the Shortcuts folder." Service can be iCloud Drive or Dropbox. https://matthewcassinelli.com/actions/save-file/
- Community reports: with the prompt off the path is relative to iCloud Drive/Shortcuts (for example `/Shortcuts/Capture/`), the sub-folder must already exist or the action errors, and there is an overwrite option in the expanded settings. (https://talk.macpowerusers.com/t/siri-shortcuts-save-to-icloud-drive-question/8968 and https://forums.getdrafts.com/t/tip-save-anywhere-in-icloud-drive/3070 — both old threads, seen as search extracts only.)

### Get Contents of URL

- Methods GET, POST, PUT, PATCH, DELETE. "Request Body allows you to send JSON, a Form, or a File to the API as part of your request", available once the method is POST, PUT or PATCH. https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios
- Custom headers: the action "lets you add headers". For a multipart upload choose "Form" and add the file as a field value. Output is "(Files) The fetched data". https://matthewcassinelli.com/actions/get-contents-of-url/
- So there are two ways to send the audio: **Form** (multipart, a file field plus text fields such as an id) or **File** (the raw file as the whole body, with metadata in headers or the query string).
- Reading the reply: the response is JSON; use **Get Dictionary Value** to pull a key, then **If** to branch. https://support.apple.com/guide/shortcuts/get-dictionary-value-action-apdf01294032/ios and https://support.apple.com/guide/shortcuts/use-if-actions-apd83dcd1b51/ios
- **HTTP status code:** no source shows any way to read it. The action's only output is the body. A third-party note says the action does not expose response headers either; the separate "Get Headers of URL" action makes its own HEAD request and so says nothing about a POST. (https://polar.sh/sindresorhus/Actions/issues/44, search extract.) **Inferred:** the status code is not available.
- Apple's stated limits are only: no OAuth 2, and beware rate limits in Repeat loops. https://support.apple.com/guide/shortcuts/api-limitations-apd891a6c84e/ios

### Size and time limits (Action Button, lock screen, Siri)

- Apple publishes none. The Action Button page says only that it needs iPhone 15 Pro or later and is set in Settings > Action Button. https://support.apple.com/guide/shortcuts/run-shortcuts-with-the-action-button-apdfea15680b/ios
- One developer-forum report describes "the ~30-second intent timeout" hitting large uploads and downloads — but that is about a third-party app's own Shortcuts action, not Get Contents of URL. https://developer.apple.com/forums/thread/788242
- Running while locked is a per-shortcut switch: Info > Privacy > "Allow Running When Locked". https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios
- Record Audio is marked "Opens App", so expect it to bring Shortcuts to the front and to want the phone unlocked. https://matthewcassinelli.com/actions/record-audio/

### Ask for Input as the editable box

"Ask for Input allows you to specify a default value that prefills the dialog"; when run "you can adjust the prefilled information"; it supports text, numbers and dates and the result passes to the next action. https://support.apple.com/guide/shortcuts/use-the-ask-for-input-action-apd68b5c9161/ios — so the transcript goes in as the default value and the edited text comes out.

### Personal automations

- Triggers that can run without asking (identical list in the iOS 18 and iOS 27 editions): Time of Day, Alarm, Sleep, Arrive, Leave, CarPlay, Email, Message, Transaction, Wi-Fi, Bluetooth, Apple Watch Workout, NFC, App, Airplane Mode, Do Not Disturb, Low Power Mode, Battery Level, Charger, Sound Recognition. The iOS 18 edition names one that cannot: "Before I Commute". https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/8.0/ios/18.0 and https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios
- The four asked about:
  - **Alarm** — options "Is Snoozed" / "Is Stopped"; alarm choice Any / Existing / Wake-up. https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/8.0/ios/18.0
  - **Time of Day** — a set time, or sunrise/sunset with an offset; repeat daily, weekly or monthly. (same page)
  - **Charger** and **App** — both in the can-run-without-asking list. Their options (connected/disconnected, opened/closed) were not on a page that loaded.
- The on-screen choice is "Run Immediately" versus "Run After Confirmation", introduced in iOS 17; with Run Immediately there is a separate "Notify When Run" switch. (https://matthewcassinelli.com/automations-run-immediately-shortcuts-notifications/, August 2023, describing the iOS 17 beta.) Apple's iOS 18 page words it as turning off "Ask Before Running", and adds "You also may need to set individual actions to run automatically."
- Automations are per device: they back up to iCloud but arrive on another device switched off. https://support.apple.com/guide/shortcuts/intro-to-automation-shortcuts-apd690170742/ios
- Reported lag: an app-opened automation set to run immediately "often takes 1-2 seconds to trigger" (https://developer.apple.com/forums/thread/759448, search extract); Low Power Mode delays automations (https://getfinny.app/blog/ios-shortcuts-automations-flaky-fix, search extract).

### A pause before a social app opens

- The trigger exists (App, runs without asking) and a commercial app, one sec, is built on exactly this: one App automation per target app, pointing at its own action. https://tutorials.one-sec.app/en/articles/10309122
- On iOS 27 one sec can install its automations for the user ("iOS 27 can install the automations automatically"), with a known bug in the Add Shortcut button reported to Apple as FB24252363. (same page)
- What was not found in writing: how the target app is let through afterwards, and how the automation avoids firing again when the app comes back to the front.

### Sharing a Shortcut instead of building it by hand

- Two routes, both documented by Apple: an **iCloud link** (recipient taps Get Shortcut) or a **file** (Options > File, with "Anyone" or "People Who Know Me"). With "Anyone", Apple receives a copy "for validation (to prevent unauthorized tampering)". The recipient opens it and taps Add Shortcut. **Import questions** can be added so that values such as a server address or token are asked for at import. https://support.apple.com/guide/shortcuts/share-shortcuts-apdf01f8c054/ios and https://support.apple.com/guide/shortcuts/add-import-questions-to-shared-shortcuts-apdf330fd3a0/ios
- Generating one outside the app: since iOS 15 a shortcut file must be **signed** to import. https://zachary7829.github.io/blog/shortcuts/fileformat (search extract)
- Apple's own signing tool is the `shortcuts sign` command, which exists **only on macOS**; it takes an exported file, a mode (anyone / people-who-know-me) and writes a signed file, sending a copy to Apple. https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac
- Cherri (a language that compiles to shortcut files) signs with that tool on a Mac; elsewhere it relied on a third-party signing service, which a May 2026 article reported as failing. https://gigazine.net/gsc_news/en/20260506-cherri/ (search extract)

### What this means for the build

- **Dictate Text and Record Audio cannot both capture the same speech.** Build the capture Shortcut as: Record Audio → Save File → Transcribe Audio → Ask for Input (transcript as default) → POST text → upload audio → delete on confirmation.
- Treat on-device transcription as best-effort. If the text comes back empty, still let the user type in the box, and let the server transcribe the audio.
- The server must answer every request with a small JSON body carrying an explicit status value (for example a field the Shortcut can compare to "ok"). The Shortcut cannot see 200 versus 500. Anything that is not the expected value — including an HTML error page or no reply — must be treated as failure and the file kept.
- Make both server calls idempotent: generate an id in the Shortcut, send it with the text and with the audio, so the retry Shortcut can re-send safely.
- Keep the audio in a sub-folder of iCloud Drive/Shortcuts and create that folder once by hand; that is the location the sources agree works with no prompt.
- Use Normal quality (M4A), not Very High (WAV), to keep uploads small.
- All four automation triggers wanted (alarm stopped, charger connected, app opened, time of day) exist and can run without asking.
- There is no Mac in the picture, so a Shortcut file cannot be generated and signed from this Windows PC. Realistic delivery: build each Shortcut once on the phone following written steps, then keep its iCloud link as the backup/reinstall route, with import questions for the server address and token.
- The owner's phone is probably on iOS 27 now; steps should be written against the iOS 27 screens.

### Not verified

- An explicit Apple statement that Dictate Text and Record Audio cannot overlap (the conclusion is inferred from the action definitions).
- Whether Transcribe Audio works reliably on the owner's iPhone and iOS version, its length limit, and its languages. The catalogue page for it returned 404.
- Whether current iOS lets Save File target any iCloud Drive folder (not just under Shortcuts) without prompting, and the exact name and behaviour of the overwrite option.
- Any size or time limit for Get Contents of URL; whether an upload continues with the screen locked; what happens when started from Siri.
- That the status code is truly unreadable (no source shows a way; none states it formally).
- Whether Record Audio works from the lock screen or Action Button without unlocking.
- The Charger and App trigger option names on current iOS.
- Whether an app-opened automation can show a screen and then return to the app without re-triggering itself; the wait is likely done with a Wait or alert action but no source confirmed the loop behaviour.
- Deleting a file without a confirmation prompt: believed to need the Delete Files "Delete Immediately" option and a switch under Settings > Shortcuts > Advanced, but neither was found on a page that loaded.
- Whether an iCloud link can be created for a Shortcut that contains a token (it can, but the token would then sit in Apple's copy; use an import question instead).

---

## 3. Local text-to-speech on Windows, RTX 4070 (12 GB), Python 3.13

Package facts below were read from the Python Package Index metadata on 2026-11-20 (https://pypi.org/pypi/<name>/json) unless another URL is given.

| Engine | Licence | British English | Windows + Python 3.13 | Needs GPU? | Notes |
|---|---|---|---|---|---|
| **Kokoro** via `kokoro-onnx` 0.6.1 (2026-08-19) | Wrapper MIT; model weights Apache 2.0 (https://github.com/thewh1teagle/kokoro-onnx) | Yes: 8 built-in voices (below) | Yes. Requires Python >=3.10,<3.14. Pure-Python wheel; pulls `onnxruntime`, `espeakng-loader` (ships a Windows build of espeak-ng, so no separate install) and `phonemizer`. Two model files to download: `kokoro-v1.0.onnx` and `voices-v1.0.bin` (about 300 MB; about 80 MB quantised). | No. Optional `[gpu]` extra adds `onnxruntime-gpu`. | README example writes a WAV file. Speed claim on the README is only "near real-time" on a Mac M1. |
| Kokoro via `kokoro` 0.9.4 (official, PyTorch) | Apache 2.0 | Same voices | **No** — requires Python <3.13 (and so does its `misaki` dependency). | No | Use only through Kokoro-FastAPI, which brings its own Python. |
| **Kokoro-FastAPI** (https://github.com/remsky/Kokoro-FastAPI) | Apache 2.0 | Same voices, plus weighted voice mixing | Runs as a Docker image (`ghcr.io/remsky/kokoro-fastapi-gpu` or `-cpu`) or via `start-gpu.ps1` / `start-cpu.ps1` with uv. RTX 40-series uses the default GPU image. | No (CPU image exists) | OpenAI-compatible endpoint at `http://localhost:8880/v1/audio/speech`. Output mp3, wav, opus, flac, aac, pcm. Its own benchmark on an RTX 4060 Ti: 35x–100x real time, about 300 ms to first audio on GPU, about 3.5 s on an older CPU; 3.1–4.0 GB VRAM loaded. |
| **Piper** `piper-tts` 1.8.0 (2026-09-04) | GPL-3.0-or-later; each voice has its own licence in a MODEL_CARD (https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md) | Yes: alan, alba, aru, cori, jenny_dioco, northern_english_male, semaine, southern_english_female, vctk (https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB) | Yes. Windows wheel published; Python >=3.9 with 3.13 listed. espeak-ng is embedded. Only other dependency is `onnxruntime`. | No. `--cuda` is optional and needs `onnxruntime-gpu`. | CLI writes WAV; has a web-server mode. Samples: https://rhasspy.github.io/piper-samples. The project "is looking for maintainers". |
| Chatterbox `chatterbox-tts` 0.1.7 | MIT | No built-in British voice; accent comes from a reference clip (voice cloning) | Installs on 3.13 in principle (requires >=3.10) but pins `torch==2.6.0`, `transformers==5.2.0` and more; upstream tested only on Python 3.11 on Debian. | Practically yes | README: "As of August 2026, Chatterbox is retired research and is no longer maintained." Every output carries an inaudible watermark. https://github.com/resemble-ai/chatterbox |
| F5-TTS `f5-tts` 1.1.22 | Code MIT; **pre-trained models CC-BY-NC** (non-commercial; personal use is fine) | No built-in voices; always needs a reference clip | README asks for Python 3.10+, suggests a conda env on 3.11, needs ffmpeg and a matching PyTorch build. No Windows notes. | Yes | https://github.com/SWivid/F5-TTS |
| Coqui XTTS-v2 via `coqui-tts` 0.28.0 (2026-10-19, the maintained fork) | Code MPL-2.0; model under the "Coqui Public Model License" (https://huggingface.co/coqui/XTTS-v2) | Has preset speakers and cloning from a ~6-second clip; 17 languages; 24 kHz | Supports Python 3.10–3.14; Windows wheels published; PyTorch installed separately. Tested upstream on Ubuntu only. | Practically yes | https://github.com/idiap/coqui-ai-TTS |
| Phonon 31m (Gradium, released 2026-10-20) | Apache 2.0 for the 31M English model; the 40M models are CC BY-NC | 37 built-in voices; **no statement that any is British** | Python package with CLI and an OpenAI-compatible server; GGUF weights; CPU/CUDA/Vulkan backends. Windows not named. | No | Vendor's own tests claim it beats Kokoro on speed and accuracy. https://gradium.ai/blog/release-phonon-open-weight |

### Kokoro's British voices

From the model's own voice table (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md). British English is `lang_code='b'`, with espeak-ng `en-gb` as fallback for unknown words.

| Voice | Overall grade | Training data |
|---|---|---|
| bf_emma | B- | 10–100 hours |
| bf_isabella | C | 10–100 minutes |
| bm_george | C | 10–100 minutes |
| bm_fable | C | 10–100 minutes |
| bm_lewis | D+ | 1–10 hours |
| bf_alice, bf_lily, bm_daniel | D | 10–100 minutes |

For comparison the best American voices are graded A (af_heart) and A- (af_bella). So the British voices are a step below the model's best.

### How natural, by independent comparison

No single trustworthy, current ranking was found. The pages that turned up are third-party blogs that disagree with each other (one says Kokoro is unranked on the TTS Arena board, another quotes a score for it), and the live leaderboards could not be read. What the sources agree on: Kokoro is the usual lightweight choice and sounds good for its size; Chatterbox and F5-TTS are rated higher for expressive, cloned voices; the heaviest models are not needed for reading reminders. (Search extracts: https://localaimaster.com/blog/kokoro-vs-xtts-vs-chatterbox, https://codesota.com/guides/tts-models, https://offlinetts.com/blog/tts-model-ranking-2026/.)

### Recommendation

- **Use Kokoro**, voice `bf_emma` first (try `bm_george` / `bm_fable` for a male voice). Apache-licensed, British voices built in with no reference clip, installs on Python 3.13 on Windows with one pip package and two model files, and runs faster than real time on this GPU with a few GB of VRAM at most.
  - If the caller is the Python worker already on the PC: `kokoro-onnx` in-process.
  - If something else needs to call it over HTTP: Kokoro-FastAPI (Docker Desktop is already on the PC).
- **Fallback with no GPU: Piper**, voice `en_GB-alba-medium` or `en_GB-cori-high` to start (listen to the samples and pick). Smaller and quicker than Kokoro on a CPU, more "synthetic" sounding. Kokoro itself also runs on CPU, so Piper is only needed if Kokoro's CPU latency is too slow.
- Not recommended here: Chatterbox (retired), F5-TTS and XTTS (need a recorded reference voice, heavier installs, non-commercial model licences), Phonon (new, no confirmed British voice, vendor-only benchmarks).

### What this means for the build

- Stay on Python 3.13 with `kokoro-onnx`; do not use the official `kokoro` package on 3.13.
- Start on CPU. Add the GPU extra only if timing needs it — it brings CUDA and cuDNN version matching.
- Generate WAV, convert to mp3/opus if the audio is to be played from a web page or sent to the phone (Kokoro-FastAPI does this itself).
- Write numbers, times, dates and currency out as words before synthesis; a small text-normalisation step will matter more than the choice of model for a morning briefing.
- Piper is GPL: fine to run as a separate program for personal use.

### Not verified

- Actual speed and VRAM of `kokoro-onnx` on the RTX 4070 (the figures above are Kokoro-FastAPI's own, on a 4060 Ti).
- That `onnxruntime-gpu` 1.32.0 has a Windows wheel for Python 3.13 (3.13 is in its classifiers and Windows wheels for 3.11 and 3.12 were seen in the file list; the 3.13 Windows file was not seen directly) and which CUDA/cuDNN it expects.
- Piper voice quality tiers and each en_GB voice's licence (per-voice MODEL_CARD not opened).
- Whether the Coqui Public Model License is non-commercial (widely described so; the model page names the licence without summarising it).
- Any current independent listening-test ranking. Listen to samples before committing.
- Whether Phonon has a British voice.
- Windows' own built-in voices as a zero-install fallback were not researched.

---

## 4. Open-source wall and kiosk dashboards

### Projects worth borrowing from

| Project | What it shows | Idle / ambient | Night | Touch | People | Privacy / guest | Voice | Source |
|---|---|---|---|---|---|---|---|---|
| **MagicMirror²** (MIT, 24k stars) | Modules placed in screen regions. Defaults: Clock, Calendar, Weather, News Feed, Compliments, Alert. Hundreds of third-party modules. | It is ambient by design: a glanceable, non-interactive screen. | Via third-party modules (presence sensor turns the screen off). | Not a core aim. | Third-party face-recognition modules switch which modules show per person. | None built in. | Third-party modules only. | https://github.com/MagicMirrorOrg/MagicMirror , https://docs.magicmirror.builders/modules/introduction.html , forum extract https://forum.magicmirror.builders/topic/15232/mmm-face-reco-dnn-profileswitcher/6 |
| **WallPanel** for Home Assistant (GPL-3.0) | Turns any HA dashboard into a wall panel; hides side and top bars; full screen. | Screensaver after `idle_time` seconds: photo/video slideshow (local media, Immich, Unsplash) with an info box of chosen cards floating on top, which moves every so often to avoid burn-in. | `black_screen_after_time` goes fully black; time-based profiles possible through `profile_entity`. | Any touch, key or mouse move ends the screensaver (each separately switchable). | Profiles applied per logged-in user and per device. | None. | None. | https://github.com/j-a-n/lovelace-wallpanel , https://j-a-n.github.io/lovelace-wallpanel/configuration/ |
| WallPanel extras | Camera motion detection wakes the screen (compares 64x48 frames every 0.3 s; 5% changed pixels = motion). Screen wake lock via `keep_screen_on_time`. | | | | | | | same |
| **Kinboard** (PolyForm Noncommercial; was MIT up to v1.12.1) | Calendar (Google/CalDAV, two-way), weather and radar, meals and recipes, shopping, tasks, notes, birthdays, school timetable, photos, timers, media, smart home. | Photo screensaver (Immich, DLNA, Unsplash); optional mmWave presence sensor. | Not described. | Touch-first layouts for an always-on screen. | A profile per family member; devices join with a six-character code; notifications per device. | No guest mode; "designed for a trusted home network". | None built in; exposes an MCP endpoint so an assistant can read and edit calendar, tasks, lists, timers. | https://github.com/svenger87/kinboard |
| **Beacon** (MIT) | Weekly calendar, shopping lists, tasks, chores with streaks and a leaderboard, meal-plan bar, music, photos, timer, weather. | Automatic screensaver with clock overlay. | Auto or manual dark mode; 8+ themes. | Built for wall tablets. | Per-member colours, calendar filtering, **PIN-based profiles**. | Data stays local; no guest mode. | Voice API, MCP server, Home Assistant Assist sentences. | https://github.com/asachs01/beacon |
| Others seen (not opened) | FamilyHub (joe-bor) — calendar, tasks, meals; Oikos (ulsklyc) — planner with budget; FamQuest — kids' routines and rewards on a fridge screen; LX Family; Magic Frame — picture-frame dashboard. | | | | | | | search extract; e.g. https://github.com/joe-bor/FamilyHub |
| E-ink | Inkycal (GPL-3.0, Raspberry Pi + e-paper, modular incl. calendar); InkyPi (plugins incl. Google/Outlook/Apple calendar); TRMNL (open firmware, bring-your-own-server options); Tesserae (tile dashboards rendered headless and pushed to panels). Common pattern: render the page to an image on a server, push it a few times an hour. | Always-on, no glow. | No backlight, so nothing to dim. | None. | — | — | — | search extracts: https://github.com/aceinnolab/Inkycal , https://github.com/usetrmnl , https://forums.pimoroni.com/t/tesserae-self-hosted-dashboard-for-inky-panels/28932 |
| Photo frames | Immich Kiosk and ImmichFrame show a photo library full screen on cheap Android frames. | The whole thing is ambient. | Fully Kiosk's `sleep_dim_screen` dims during sleep hours. | — | — | — | — | https://immich-kiosk-docs.pages.dev/misc/frameo |

Ideas that recur and are worth copying:

1. **Two states, not one page**: an interactive dashboard, and an ambient state (photos or a big clock plus one or two facts) entered after N seconds idle. Any touch returns to the dashboard.
2. **A third "black" state** late at night, entered on a timer or schedule, instead of mere dimming.
3. **Move the ambient info box around** every few minutes to protect the panel.
4. **Presence wakes it**: camera frame-difference or a cheap presence sensor.
5. **People as colours plus optional PIN** — colour-coding everywhere, PIN only to act as someone.
6. **Per-device profiles** — the kitchen screen and a bedside screen get different settings from the same app.
7. **Voice is bolted on, not built in**: an API/MCP endpoint that an assistant talks to, rather than a microphone in the dashboard.
8. No project found has a real guest/privacy mode. That would be new work.

### What Android photo frames can actually run

Evidence is from 10-inch Frameo-based frames; nothing was found about the 15–21 inch models specifically.

- They are low-powered Android devices of widely varying age. Community-tested examples: Android 13 with WebView 101–109 (no changes needed, no root); Android 6.0.1 with WebView 44 and Android 8 with WebView 61 (both needed root to replace WebView). https://immich-kiosk-docs.pages.dev/misc/frameo
- One documented frame (Pastigio M15R4, about $40, September 2026): Rockchip RK3326, about **1 GB RAM**, Android 8.1, 32-bit userspace, stock WebView 61 — too old for a modern web app. The owner replaced it with WebView 106 by writing to the system partition as root. Fully Kiosk "caused SystemUI instability" and was dropped; Firefox was "slow and memory-heavy"; an open-source kiosk launcher worked. https://community.home-assistant.io/t/frameo-as-hass-wall-mounted-dashboard/1026111
- Installing an app: possible over ADB. Enable it on the frame under Settings > About > "Enable Beta Program", connect by USB, then install the APK. Some frames allow only one ADB connection; network ADB resets on reboot. https://immich-kiosk-docs.pages.dev/misc/frameo
- Gotcha: Frameo keeps its Wi-Fi settings inside its own app, so join Wi-Fi in Android settings before disabling the Frameo app or the frame drops off the network. (same page)
- A browser based on WebView 106 (late 2022) is still several years behind a current browser. A Next.js 15 / React 19 app may load, but modern CSS and JavaScript features will need checking against that floor.
- Keeping the screen awake: frames are built to stay on; Fully Kiosk's "keep screen on" is in its free tier. https://www.fully-kiosk.com/docs/en/features/all
- **Fully Kiosk Browser**: Android 6 minimum. Free: full screen, keep screen on, brightness, autoplay audio/video. **PLUS only**: screensaver, visual and acoustic motion detection, scheduled sleep/wake, kiosk lock-down, remote admin, REST API, JavaScript interface, text-to-speech, and **webcam/microphone access for web pages**. PLUS is a one-off 8.90 EUR per device. https://www.fully-kiosk.com/docs/en/features/all and https://www.fully-kiosk.com/docs/en/legal/fully-plus-license (price via search extract)

### Cheaper known-good alternatives (rough UK prices)

Prices move; these are the most recent figures found, with their source and date.

| Option | Rough price | Notes | Source |
|---|---|---|---|
| Amazon Fire HD 8 | about £50 | Small. Fire OS; kiosk browser must be side-loaded. | £49.99 in a March 2026 roundup (search extract) |
| Amazon Fire HD 10 | about £95–£150 | List £149.99, often on offer near £95–£105. Price reportedly rose mid-2026. | undated 2026 UK listings (search extract, https://www.techradar.com/tablets/the-budget-friendly-amazon-fire-hd-10-tablet-falls-to-its-lowest-price-this-year) |
| Raspberry Pi 5 (2 GB) + official 7" Touch Display 2 | about £74 + £58 = £132, plus power supply, card, case | **Pi prices have risen sharply in 2026** (memory costs): the 2 GB Pi 5 went to £74.40 on 2026-10-01. Runs a current Chromium in kiosk mode. A 7" screen is small for a wall. | https://www.omgubuntu.co.uk/2026/10/raspberry-pi-2gb-costs-how-much-now ; https://thepihut.com/products/raspberry-pi-touch-display-2 |
| Second-hand tablet | not priced | An iPad or mainstream Android tablet a few years old has a current browser, working mic and speakers, and no hacking. | no price source found |
| Mini PC + touch monitor | Kinboard's reference build is about €700 with a 27" touchscreen | The route to a large screen with a current browser. | https://github.com/svenger87/kinboard |

### What this means for the build

- Do not buy a 15–21" Android frame on the assumption it will run the app. The evidence says: old Android, old WebView, 1 GB RAM, root needed to fix it on older units, and the kiosk browser's microphone access is a paid feature. A recent unit on Android 13 might be fine, but sellers rarely state the Android version.
- If a frame is already owned: check its Android and WebView versions over ADB first; that single check decides it.
- The safe route to a large touch wall screen is a second-hand tablet (small) or a mini PC/old laptop with a touch monitor (large) running a normal current browser in kiosk mode.
- Build the wall view as its own route with the three states (dashboard, ambient, black), a wake lock, an idle timer, a moving ambient box, and per-device settings. Keep it light: no heavy animation, modest image sizes.
- Voice on the wall device should be optional and late; the surveyed projects all push voice to a separate assistant talking to an API.
- A guest/privacy mode would be original work; no surveyed project has one to copy.

### Not verified

- Anything about 15–21 inch frames specifically: Android version, WebView, RAM, whether ADB is offered.
- Whether a web page can use a frame's microphone and speakers (the one documented build did not test them; in Fully Kiosk it is a PLUS feature).
- Fire OS support in Fully Kiosk and current Fire tablet prices on amazon.co.uk (not opened).
- Second-hand tablet and touch-monitor prices.
- MagicMirror's handling of touch, dimming, profiles and voice beyond the forum extract — its docs pages for those were not opened.
- The smaller family-dashboard projects (FamilyHub, Oikos, FamQuest, LX Family, Magic Frame) were seen only as search extracts.
- DAKboard-style clones as a category: none of note was found beyond the projects above.

---

## 5. Free price feeds for a personal net-worth view

All "tested" results are from this PC on 2026-11-20.

### Foreign exchange

**Frankfurter** — free, no key, open source, self-hostable. https://frankfurter.dev/

- "No quotas or monthly/daily caps"; requests are rate-limited only against abuse. Reference rates, updated through the day, not live quotes. Blended rates are free for commercial use.
- v2 is current; v1 is deprecated but "remains available indefinitely". The old `api.frankfurter.app` host now answers 301 (tested).
- Tested, worked: `https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP,EUR` → JSON with `date` 2026-11-19 and rates.
- v2 forms (from the docs, not tested): `https://api.frankfurter.dev/v2/rates`, `/v2/rates?date=YYYY-MM-DD`, `/v2/rate/USD/GBP`, and ECB-only data at `/v2/providers/ecb/rates`.

**ECB** — the source itself, free, no key.

- Tested, worked: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` → XML, euro-based, one rate per currency, dated 2026-11-19. Published once each working day. GBP per USD must be derived by dividing two euro rates.

### Crypto

**CoinGecko**

- Keyless public API: works today. Limit is "IP-based rate limiting — shared across all users on the same IP"; no number published. https://docs.coingecko.com/docs/common-errors-rate-limit
- Demo plan (free account, one key, no card): **10,000 calls a month, 100 calls a minute**, data fresh "from 60 seconds", one year of daily history. "Attribution required." The page describes it as for "testing and exploration" and says nothing explicit about personal use; the commercial licence terms listed apply only to paid plans. https://www.coingecko.com/en/api/pricing
- Tested, worked, no key: `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=gbp&include_last_updated_at=true` → GBP prices. Response is cacheable for 30–60 seconds.
- Tested, worked, no key: `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=gbp&days=3&interval=daily` → daily history.

### Shares and funds

**Yahoo Finance — unofficial.** These endpoints are undocumented, unsupported, and not offered by Yahoo as an API. They can change or be blocked without notice, and Yahoo's terms were not checked. Behaviour today:

- Tested, worked (with a browser-style User-Agent): `https://query1.finance.yahoo.com/v8/finance/chart/VOD.L?range=5d&interval=1d` → price with `currency: "GBp"` (**pence**).
- Tested, worked: `.../v8/finance/chart/AAPL?range=1d&interval=1d` → USD.
- Tested, worked: UK funds are there under Morningstar-style tickers, e.g. `.../v8/finance/chart/0P0000KM22.L` → `instrumentType: "MUTUALFUND"`, `currency: "GBP"` (**pounds**).
- Tested, worked: ISIN to ticker lookup — `https://query1.finance.yahoo.com/v1/finance/search?q=GB00B3X7QG63&quotesCount=3&newsCount=0` → `0P0000SAVS.L`, Vanguard FTSE UK All Share Index Unit Trust Acc.
- Tested, **failed**: the same chart request with no User-Agent → 429 "Too Many Requests". The older `/v7/finance/quote` endpoint → 401 Unauthorized.

**Financial Times fund and share pages** — a web page, not an API.

- Tested, worked: `https://markets.ft.com/data/funds/tearsheet/summary?s=GB00B3X7QG63:GBP` → HTML containing "Price (GBP) 373.61 … as of Nov 19 2026". Addressed directly by **ISIN plus currency**.
- Tested, worked: `https://markets.ft.com/data/equities/tearsheet/summary?s=VOD:LSE` → "Price (GBX) 109.45".
- The currency suffix matters: a GnuCash user thread from 2026 reports fund lookups need ":GBP" or ":GBX" after the ISIN or they return nothing. https://lists.gnucash.org/pipermail/gnucash-user/2026-August/121420.html (search extract)
- The site's robots file allows general agents (`Allow: /`) while blocking named AI crawlers, and declares "ai-train=no, use=reference". https://markets.ft.com/robots.txt (tested). Page layout can change without notice.

**Stooq — no longer usable without manual steps.**

- Tested, **failed**: `https://stooq.com/q/l/?s=vod.uk&f=sd2t2ohlcv&h&e=csv` → 404 "The page you requested does not exist or has been moved". `https://stooq.com/q/d/l/?s=vod.uk&i=d` → a "requires JavaScript to verify your browser" page instead of CSV.
- Third-party reports say that since early 2026 the CSV download needs an `apikey` obtained by solving a CAPTCHA on the site, with a daily hit limit. https://github.com/pydata/pandas-datareader/issues/1012 (search extract)

**Alpha Vantage**

- Free key required (email sign-up). Free limit: "25 API requests per day". Real-time and 15-minute-delayed US data is premium only. https://www.alphavantage.co/support/
- Tested: the public `demo` key refuses anything but its own examples, so London-listed coverage (`TSCO.LON` style symbols) could not be confirmed without a key.

**UK-specific fund sources.** No free, documented API for OEIC or unit-trust prices was found. Hargreaves Lansdown, Trustnet and Morningstar publish prices on web pages; their terms were not checked. The FT page by ISIN and the Yahoo fund tickers above are the two workable free routes found.

### What this means for the build

- FX: Frankfurter (v2), one call a day. ECB XML as the fallback.
- Crypto: CoinGecko keyless `simple/price` in GBP, one call a day for all coins at once. No account needed at that volume; the free Demo key is there if the shared-IP limit bites (likely when called from a cloud host such as Vercel, where the IP is shared with others).
- UK funds: FT tearsheet by `ISIN:GBP` as the primary (it is keyed by the identifier already held); Yahoo by its `0P….L` fund ticker as the cross-check, found once via the ISIN search and stored.
- UK and US shares: Yahoo chart endpoint; FT equities page as the cross-check.
- **Normalise units on the way in.** London shares come back in pence (GBp/GBX), funds in pounds. Store the currency unit with every price and convert once. A hundredfold error is the classic bug here.
- Store each day's price with its source and its "as of" date; fund prices are a day behind and do not change at weekends.
- Every source here except Frankfurter, ECB and CoinGecko is unofficial or a scraped page. Build each as a replaceable adapter, keep the last good price when a fetch fails, and show the price's age rather than failing the view.
- Call from the PC worker rather than from the hosted site where possible: one household IP, daily, with a normal User-Agent, is the lowest-risk pattern.
- Drop Stooq and Alpha Vantage from the plan: one is gated, the other allows 25 calls a day and needs a key.

### Not verified

- Yahoo's and the FT's terms of use for automated personal access. Neither offers these as a sanctioned API.
- Whether the owner's actual funds and shares resolve on Yahoo and FT (only sample identifiers were tested), and SEDOL-based lookup (not tested anywhere; ISIN is the key that worked).
- CoinGecko's keyless rate number, and its position on personal use of the Demo key beyond "attribution required".
- Stooq's key process (described by third parties only).
- Alpha Vantage coverage of London-listed shares and UK funds on a free key.
- Frankfurter v2 endpoints (read from the docs; only v1 was tested).
- How these endpoints behave from a cloud host's IP range.

---

## 6. Two small ones

### (a) Resend free tier

- **3,000 emails a month, 100 a day.** The day is a UTC calendar day, resetting at midnight UTC. https://resend.com/pricing and https://resend.com/docs/knowledge-base/account-quotas-and-limits
- Each recipient counts: "Multiple To, CC, or BCC recipients in sent emails count as separate emails towards this quota." Received (inbound) emails count as well. (quotas page)
- Over the limit the API returns 429 with `daily_quota_exceeded` or `monthly_quota_exceeded`, and "Resend doesn't queue or retry that email." (quotas page)
- **Domains: up to 3 on the free plan**, so one sending domain is free. (both pages)
- **Verification is required** to send from one's own domain: "You must add and verify at least one domain to send emails with Resend." A subdomain is recommended (for example `updates.example.com`). https://resend.com/docs/dashboard/domains/introduction
- Without a verified domain only the shared test address works, and only to oneself: "The resend.dev domain is only available for testing purposes" — "You can only send testing emails to your own email address." https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- Rate limit 10 requests a second per team, no burst. Data kept 30 days on the free plan. Next tier is $20 a month. (quotas and pricing pages)

**What this means for the build**

- One verified sending subdomain costs nothing; DNS records must be added at the domain's DNS host once.
- The app must count its own daily sends: a digest to two people is two emails, and anything past 100 in a UTC day is dropped, not queued. Queue and retry on the app's side.
- If the app also receives mail through Resend, those count against the same 100.

**Not verified**

- The exact DNS records (the page read did not list them).
- Whether a payment card is asked for at sign-up (the pricing page does not say).

### (b) Cloudflare R2 free tier

- **10 GB-month storage, 1 million Class A operations, 10 million Class B operations per month, egress free.** https://developers.cloudflare.com/r2/pricing/
- Class A = writes and listings (PutObject, CopyObject, ListObjects, multipart steps). Class B = reads (GetObject, HeadObject). DeleteObject is free. (same page)
- "The free tier only applies to Standard storage, and does not apply to Infrequent Access storage." (same page)
- Beyond the allowance: $0.015 per GB-month, $4.50 per million Class A, $0.36 per million Class B. (same page)
- **Enabling R2:** "You need a Cloudflare account with an R2 subscription", added by going to Storage & databases > R2 > Overview and "Complete the checkout flow to add an R2 subscription to your account." https://developers.cloudflare.com/r2/get-started/
- The docs do not say in words that a card is needed. A Cloudflare status incident is titled "users unable to enable R2 on accounts without attached payment method", with the workaround "manually add a payment method to the account then enable R2" (https://isdown.app/status/cloudflare/incidents/443977-users-unable-to-enable-r2-on-accounts-without-attached-payment-method, search extract), and a 2026 third-party guide says a payment method is requested before the first bucket. **Taken together: expect to have to put a card (or PayPal) on the account, with nothing charged inside the free allowance.**

**What this means for the build**

- Audio captures fit comfortably: 10 GB and a million writes a month is far above household use.
- Because R2 is a metered subscription with a payment method attached, exceeding the allowance bills automatically. Keep objects in Standard class, set a lifecycle rule to expire old audio, and do not list buckets in a loop.
- If attaching a card is unacceptable, R2 is out, and the existing Supabase storage bucket is the no-card alternative.

**Not verified**

- The exact wording of the checkout step and whether PayPal is accepted (not seen on an official page).
- Whether Cloudflare offers a spending cap or alert for R2.

---

## Pages that would not load

| Page | Result |
|---|---|
| https://enablebanking.com/terms | JavaScript app; text recovered from the site's script bundle |
| https://enablebanking.com/open-banking-apis/GB | JavaScript app; data recovered from the public search index the page uses |
| https://enablebanking.com/pricing | 404 |
| https://docs.firefly-iii.org/tutorials/data-importer/eb/ | 403 |
| https://matthewcassinelli.com/actions/transcribe-audio/ | 404 |
| https://www.fully-kiosk.com/en/ | "documentation has moved" stub; the /docs/en/ pages were used |
| Stooq CSV endpoints | 404 and a browser-verification page |
| Live TTS leaderboards | not readable; only third-party summaries found |
