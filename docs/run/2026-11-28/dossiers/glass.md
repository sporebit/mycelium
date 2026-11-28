# Dossier: E.glass, glasses that answer to "Mycelium" (GLASS)

*Written 2026-11-28 for the run of that day (Stream T, step T2). Sources checked 2026-11-28 unless a line says otherwise. Plan section 14; digest `digests/glasses.md`; built state from `claude/backlog.md` (capture Stream A, the iPhone Shortcuts built from code, the PC worker and the tick), `supabase/migrations/0159_capture_pipeline.sql` (the `jobs` table), `pc-worker/worker.mjs`, `app/api/capture`, `app/api/ask`, `lib/nudges/interrupt.ts`. Nothing was installed, paired, enabled or changed for this dossier. This area moves fast: every product fact below carries its check date and should be re-checked when glass.01 starts.*

## 1. What Phil decided

"Control Claude" means all four: ask questions by voice and hear the answer, capture notes and tasks hands-free, start and steer Claude Code on the PC, and show Claude what he is looking at. The Ray-Ban Meta Gen 3 glasses are in daily use, paired with the iPhone 17 Pro. A research ticket comes first (Gen 3 support; own Android app against a headset plus phone Shortcut against voice messages to a bot; what triggers the glasses allow; silent taps). Then a weekend prototype of one feature, voice capture into Mycelium, before any other build work. It answers to "Mycelium", listens only after he triggers it, uses the phone's dictation and the phone's built-in voice, works anywhere with phone signal through Mycelium's cloud queue with nothing at home opened, and costs nothing beyond his Claude plan. The brain is Claude Code on the PC on his plan, with Mycelium's agents as the fallback when the PC is off. Spoken notes go through the existing capture pipeline and review. One running thread per day is saved, with every camera frame kept. Answers are "short" or "full" as he says each time; up to 15 seconds with a working tone, then "saved for later" and the answer goes to the phone. Voice approvals of Claude Code requests: anything, after a read-back and a confirm word. Nudges into the glasses inside the three-a-day budget; "private" sends an answer to the phone only; it never speaks unprompted while it hears conversation. No work-hours rule. Built for any headset; the glasses add the camera. If only an iPhone app would work (there is no Mac), the glasses pair with the Pixel instead. Done means a week of daily use without taking the phone out for it.

## 2. His kit and constraints

- **Glasses:** Ray-Ban Meta (Gen 3), in daily use, paired with the iPhone 17 Pro through the Meta AI app. Gen 3 has six microphones, a 12 MP camera, about nine hours of battery and a new customisable action button [6][7].
- **Phones:** iPhone 17 Pro (main); a Pixel (model not stated in the brief). No Mac, so an iOS app cannot be built and signed locally.
- **PC:** Windows, RTX 4070, Ollama present, Claude Code on Phil's Claude plan; the PC worker (`pc-worker/worker.mjs`) runs Whisper, a local model through Ollama and the Kokoro voice, and collects jobs from the cloud **once a minute** (`pollSeconds: 60`), connecting outwards only.
- **Mycelium as built:** `/api/capture` answers "Saved" at once and files afterwards; every capture goes to review in the evening close and files itself after seven days tagged "unreviewed" (Stream A, MYC-183, migrations 0159 and 0162). The `jobs` table has three lanes (`pc`, `cloud`, `any` with a `cloud_after` time) and a `dedupe_key` so a retried request never queues twice. The iPhone Capture v2 Shortcut uses Dictate Text, then an edit box, then JSON to `/api/capture`; unsent words are kept as files in `iCloud Drive/Shortcuts/Mycelium Inbox` and a Retry Shortcut resends them; no recording is kept (backlog, "iPhone Shortcuts built from code"). Phil's standing rule: every Shortcut is written in Cherri, compiled and signed through the Cherri Playground and handed over as an import link; MYC-197 is the open build of the remaining Shortcuts. The phone capture token can capture and nothing else. `/api/ask` answers from his memories through a paid cloud model under the meter (`lib/system/aiMeter.ts`, £5 monthly cap). Nudges go through one `interrupt()` with the three-a-day budget (`lib/nudges/budget.ts`). The Telegram bot is a capture channel (webhook at `/api/telegram/webhook`).
- **Hosting:** Vercel Hobby (functions up to 300 seconds [17]) and hosted Supabase. No sub-daily Vercel cron (memory note); the five-minute tick is knocked by the PC.
- **Money:** nothing beyond the Claude plan (answer 25). The Apple Developer Program fee is the known blocker for an iOS app (backlog, native iPhone app idea).

## 3. What the research found

### 3.1 Meta Wearables Device Access Toolkit (the "DAT")

- **State:** after a year in developer preview, DAT 1.0 launched at Connect 2026 (24 September 2026) and rolled out from 30 September 2026; the current release is 1.1.0 [1][2][3]. Anyone can download the SDK; full capabilities and the Wearables Developer Center need an "AI glasses supported country" [1] (whether the UK is on that list: UNVERIFIED, Meta AI itself is offered on glasses in the UK [21]). No fee is mentioned [1].
- **Publishing:** submissions to Meta's store surfaces are "coming soon"; no date [2][3]. **Developer mode** lets an unpublished app connect to the developer's own glasses without review [5]. That is enough for one person's own use. Whether a developer-mode app expires or needs re-enabling: UNVERIFIED.
- **Supported devices (checked 2026-11-28):** the FAQ names Ray-Ban Meta (Gen 1 and Gen 2), Meta Ray-Ban Display, Oakley Meta HSTN and Oakley Meta Vanguard, and says "new SKUs of these devices are supported as they become available" [1]. The 1.1.0 Version Dependencies page lists "Ray-Ban Meta glasses", "Ray-Ban Meta Optics glasses", "Meta glasses", Display, HSTN and Vanguard, each at firmware V130 or later, with Meta AI app V292 or later; it names no generation [4]. **Gen 3 is not named anywhere: UNVERIFIED.** It is likely covered by the generic "Ray-Ban Meta glasses" row, but only a developer-mode test on the real glasses settles it. Firmware is checked in the Meta AI app under the device's settings, General, About, Version [5].
- **What a phone app may use** [3][8][9]: camera streaming (resolution and frame rate chosen by the app, frames delivered to the phone, a still captured during a stream); standalone high-quality photo capture and in-stream audio capture are marked "experimental; unavailable for production publishing" (fine under developer mode); on-device **speech** recognition with partial and final results; **voice invocations**, "launch or activate an app from 'Hey Meta' and acknowledge each action" [8][2]; **inputs**: navigation, button, capture and drag events from the glasses [8], with a documented double-press quirk (a SHORT_PRESS arrives before the DOUBLE_PRESS) [10]; motion (head orientation); display only on the Display model.
- **Audio** [9]: the microphones reach the phone over Bluetooth HFP as mono voice at 16 or 8 kHz; the glasses **beamform towards the wearer's voice**, so other people's speech is turned down ("expected behaviour"). Playback is A2DP (high quality) or HFP (voice quality, needed while the microphone is open); the two are exclusive. The HFP route must settle (the sample waits two seconds) before a stream starts, or audio routing stops without an error.
- **Sessions** [3]: one session at a time per device; the wearer can pause or stop it by tapping, closing the hinges or taking the glasses off; camera permission is granted in the Meta AI app (always, once, or deny); Meta says it does not access media moved directly from the glasses to the third-party app.
- **Known issues that touch Phil's kit** [10]: on **iPhone 17 series running iOS 26, calls routed to the glasses over HFP may have no audio either way; Meta's workaround is iOS 27 or later.** The speech capability silently stops returning text after about a minute and must be restarted. Camera capture stops after the V128 firmware update until the glasses are rebooted. The toolkit app will not install below 10% glasses battery.
- **iOS app without a Mac:** the iOS SDK needs an Xcode build and signing. Without a Mac that means a cloud Mac or Xcode Cloud, which needs the paid Apple Developer Program (about £79 a year per the backlog). Against answer 25. This is exactly the case answer 24 covers.
- **Android app on the Pixel:** buildable on the Windows PC with Android Studio, free, sideloaded, developer mode on the glasses [11]. Android 14 and later: a foreground service that uses the microphone must declare the `microphone` type and must be started while the app is visible, with narrow exemptions [12]. In practice the Mycelium app opens once after boot (or is launched by "Hey Meta"), then keeps a foreground service with a notification.
- **Pairing:** glasses work with one phone's Meta AI app at a time. Moving them to the Pixel means the iPhone stops being their phone for Meta AI, calls and music (UNVERIFIED in Meta's own words: the help pages would not load past a cookie wall).

### 3.2 Other Meta routes

- **Voice messages to a bot:** the glasses send messages and voice messages by voice through **WhatsApp, Messenger and Instagram** ("Hey Meta, send a message to [name] on WhatsApp"); voice messages stop after 3 seconds of silence or 1 minute and ask to confirm before sending [13]. **Telegram is not listed**, so Mycelium's existing Telegram bot cannot be reached from the glasses this way. A WhatsApp or Messenger bot means Meta's business platforms (cost and eligibility: UNVERIFIED; WhatsApp business messaging is generally charged). Weakest route.
- **Meta AI Connectors** (developer preview, sign-up): a service exposed "through an API or MCP server" can be used inside a Meta AI conversation, including on the glasses, with no app [2][14]. In principle "Hey Meta, ask Mycelium ..." with Mycelium as an MCP server. The answer is spoken by Meta AI, not the phone's voice, and the words pass through Meta. Eligibility, auth and limits are not published (UNVERIFIED). Worth a watching brief in glass.01, not a build.
- **WebMCP and Web Apps:** Display model only [1]. Not relevant to Gen 3.
- **Gen 3 action button:** customisable in the Meta AI app (Customize controls, Action button): a Meta AI command or custom prompt, a capture mode, or sending a message [7][15]. Whether it can trigger a DAT app directly: UNVERIFIED (the DAT "button" input events suggest an app in session receives presses [8]).

### 3.3 iPhone: Shortcuts from the glasses and "Hey Siri"

- Meta's own "voice shortcuts" live in the Meta AI app and need "Hey Meta"; they are not Apple Shortcuts [16]. No source shows the Ray-Ban Meta glasses running an Apple Shortcut or passing "Hey Siri" through their microphones; a May 2026 AppleVis thread found the only way was the iPhone hearing "Hey Siri" itself (setting "listen when locked and face down") [16]. For non-Apple Bluetooth headsets generally, "Hey Siri" spoken into the headset does not work; a headset button press does [18]. Whether a Meta glasses tap or the action button can hand over to Siri: UNVERIFIED.
- So on the iPhone the trigger is "Hey Siri, Mycelium" heard by the phone (a Shortcut named "Mycelium" runs by saying its name), the Action Button or a lock-screen widget. With the phone in a pocket this is unreliable. Once the Shortcut runs, Dictate Text should take audio from the active Bluetooth input and Speak Text should play through it (UNVERIFIED for Meta glasses; test in glass.01), subject to the iPhone 17 / iOS 26 HFP issue above.
- Locked phone: a Shortcut that only fetches a URL and speaks the result can run from Siri while locked; a step that opens an app or shows a screen asks for unlock [19]. The capture Shortcut's edit box is a screen: a hands-free variant must skip it (Phil's own decision says Send is the default, so a "send without editing" variant fits).
- **Speech APIs (for an app, not Shortcuts):** iOS 26 has `SpeechAnalyzer` with `SpeechTranscriber` (long-form, on-device), `DictationTranscriber` (short utterances) and `SpeechDetector` (voice activity detection, paired with a transcriber); no custom vocabulary yet [20]. `SFSpeechRecognizer` remains for short requests. en-GB availability: UNVERIFIED. These need an iOS app, so they are out while there is no Mac.
- **Background recording on iOS:** an app must be in the foreground to start recording; with the audio background mode it may continue [22]. A Shortcut is not affected (it runs in the foreground of Siri or the lock screen).

### 3.4 Pixel equivalents

- The DAT Android app is the real route: "Hey Meta" invocation, on-device speech, button events, camera, speakers [8].
- Without the DAT: Google Assistant or Gemini via the headset button; AppFunctions lets apps offer actions to Gemini, in early preview on selected Pixel 10 and Galaxy S26 devices only (February 2026) [23]. Not a route for "Mycelium" by name today (UNVERIFIED for Phil's Pixel model).
- Android speech: the platform `SpeechRecognizer` (on-device on Pixel) and `TextToSpeech` (the phone's voice); both free.

### 3.5 Hearing conversation while listening "only after I trigger it" (the flag in 10b)

Two shapes fit Phil's two answers:

1. **No listening at all (literal).** The glasses never speak unprompted. A nudge that falls due is held; the next time he triggers "Mycelium" it says "one nudge waiting" first, or the nudge goes to the phone as a push. No microphone opens without his trigger. Works on every route. Cost: nudges are never spoken into the ear unasked.
2. **Listen before speaking, nothing kept.** Only when a nudge is due, the app opens the microphone for about two seconds, runs on-device voice activity detection on that buffer in memory, and throws the audio away; if speech is present the nudge waits and tries later (still inside the three-a-day budget). Options: Silero VAD (about 2 MB, under a millisecond per 32 ms chunk on phones; licence shown as MIT in older material and CC BY-NC 4.0 on one PyPI release, UNVERIFIED, personal use either way) [24][25], WebRTC VAD (smaller, tells voice from silence only) [25], the DAT on-device speech partials, or iOS `SpeechDetector` (iOS app only) [20]. Limits: the glasses beamform towards the wearer, so other people's voices are turned down and may go unheard [9]; non-beamformed camera-stream audio is dev and beta only [9]; on iOS a background app cannot start the microphone [22], so shape 2 needs the Android app's foreground service.

Recommendation for glass.01 to confirm: shape 1 on the iPhone route; shape 2 only if the Android route is chosen, with a hard rule that no audio buffer is written to disk or sent, and the "wait" decision logged as a yes or no only.

### 3.6 The 15-second budget (estimates to be measured in glass.02 and glass.08)

From the end of his sentence to the first spoken word of a short answer. Figures are planning estimates, not measurements, except where marked.

| Stage | Estimate | Note |
|---|---|---|
| End of speech detected | 1 to 2 s | Dictate Text "after pause", or the DAT speech final result |
| Phone to Vercel | 0.3 to 1 s | 4G or 5G; the Vercel region is `iad1` by default [17], about 80 ms each way from the UK (UNVERIFIED for this project's region) |
| Queue to the PC | **up to 60 s today** | the worker polls every 60 s (`pc-worker/worker.mjs`); needs a fast lane: a held-open claim (long poll) of up to about 25 s, re-opened at once, or a 1 to 2 s poll while a voice request is live |
| Claude Code starts | 2 to 8 s (UNVERIFIED) | a fresh `claude -p` per question; a warm Agent SDK process on the PC avoids most of it. `claude -p` and the Agent SDK signed in with the plan draw from the plan's limits (Anthropic, update of 7 October 2026) [26] |
| Model writes a short answer | 2 to 6 s | "short" capped at two or three sentences |
| Result back to the phone | 0.3 to 1 s | the phone's request held open by the server (Hobby allows 300 s [17]) until the job finishes or 14 s pass |
| Phone voice starts | under 0.5 s | Speak Text or Android `TextToSpeech` |

Total with a warm PC and the fast lane: about 6 to 18 s, so "short" answers mostly land inside 15 s and "full" answers will often go to "saved for later" and the phone, as Phil decided. The working tone must start inside a second of the request leaving the phone. With the PC off, `lane: any` with `cloud_after` set to about 5 s sends it to the cloud agents (metered, see section 5).

### 3.7 Claude Code from the phone and the glasses

- **Remote Control** (Claude Code 2.1.51 or later, Pro or Max plan): `claude --remote-control` or `/rc` lets the Claude app on the phone or claude.ai/code drive a session that keeps running on the PC; one remote per process; a network gap longer than about ten minutes ends it [27]. This is the "phone access" part of glass.07 at no cost, but it is a screen, not voice.
- For voice, the PC worker takes a `claude_code` job (status, start saved prompt, instruction, answer a pending question), runs it against a named session through the Agent SDK or `claude -p --resume`, and posts a short spoken summary back. Permission prompts arrive as a pending question in Mycelium, read back on the glasses, and are answered by the confirm word (glass.07).

## 4. Risks

| Risk | Kind | Mitigation the tickets carry |
|---|---|---|
| Gen 3 not supported by the DAT | wasted build | glass.01 tests Gen 3 in developer mode before any Android work; the iPhone Shortcut route needs no DAT and is the prototype's fallback |
| Pairing the glasses with the Pixel takes them off the iPhone | daily-use breakage | glass.15 is a check-first ticket: try it, note what the iPhone loses, re-pair the iPhone if it is worse; nothing is unpaired until glass.01 picks the route |
| iPhone 17 / iOS 26 HFP bug gives silence | prototype looks broken | glass.01 records the iOS version; glass.02 tests with the glasses and with plain earbuds (answer 29: any headset) |
| A voice approval merges, deploys or pushes to the database wrongly | data loss, production breakage | glass.07's read-back covers action, target, scope, migration contents and undo; the confirm word is bound to one request and expires; anything else is "no" |
| A frame at the work desk stores patient data | privacy (Phil's call, flagged) | written as decided: no work-hours rule; flag carried on glass.03 and glass.06 |
| Listening while others talk | privacy | glass.01 chooses shape 1 or 2 (section 3.5); shape 2 keeps no audio |
| Cloud fallback spends money | money | fallback goes through the existing meter and £5 cap; no new paid service; see section 5 |
| Speech capability stops after a minute | lost words | the Android app restarts it; captures are short; the capture pipeline never loses what reached it |
| Developer-mode app stops being allowed | lock-out from own feature | the iPhone Shortcut route stays working beside it |

## 5. Facts that differ from the plan

- **Digest preface and glass.01 (device list):** the preface's list (Gen 1, Gen 2, Optics, Display) is out of date. On 2026-11-28 the FAQ names Gen 1, Gen 2, Display, Oakley HSTN and Vanguard with "new SKUs supported as they become available", and the 1.1.0 dependencies page lists generic "Ray-Ban Meta glasses" at firmware V130 [1][4]. Gen 3 is still not named. glass.01's first job stands, as a developer-mode test on the real glasses.
- **glass.01 (trigger options):** "Hey Meta" voice invocation of a third-party app is in DAT 1.0 (September 2026) [2][8]. Earlier material saying the SDK has no voice invocation is from the preview and no longer holds.
- **glass.01 (voice messages to a bot):** the glasses message only through WhatsApp, Messenger and Instagram [13]; the Telegram bot cannot be reached this way, and a WhatsApp or Messenger bot means Meta's business platform (cost not confirmed). The third route is close to ruled out on cost; glass.01 should say so rather than build it. Meta AI Connectors (an MCP server inside Meta AI) is a fourth route the plan does not name [2][14].
- **glass.02 and §25 (unblock: glass.02 after MYC-197):** the iPhone route depends on MYC-197's Shortcuts and on the iPhone 17 / iOS 26 HFP issue [10]; glass.02 needs a step that checks the iOS version. The Capture v2 Shortcut's edit box asks for the screen; a hands-free variant without the edit box is needed (a new Cherri Shortcut, consistent with Phil's Cherri rule).
- **glass.06 (vision):** the glasses' camera is reachable only through the DAT, which means the Android app on the Pixel (no Mac). glass.06 therefore also waits for glass.15. The plan gives it only `after glass.03`.
- **glass.08 (15 seconds through the cloud queue):** the PC worker collects jobs once a minute, so the budget cannot be met on today's queue. glass.08 must add a fast lane (held-open claim or a short poll while a voice request is live) without opening anything at home. Plan sid glass.08 should say so.
- **glass.05 and glass.08 (answer 25, nothing beyond the Claude plan):** the fallback when the PC is off is Mycelium's cloud agents, which are paid model calls under the £5 cap (`/api/ask` calls a cloud model directly). That sits inside existing spend but is not "only the Claude plan". Check first: the tickets route the fallback through the meter and stop at the cap with "saved for later". Phil may prefer no cloud fallback at all; the question is his.
- **glass.10 ("into the home inventory"):** there is no home inventory in Mycelium yet (home.26 plans a furniture-only one; net.15 a device inventory "beside the home inventory"). glass.10 must either create the minimum "things and where they are" store or wait for home.26. The ticket writes the minimum store and links home.26.
- **glass.15 (pair with the Pixel):** moving the glasses to the Pixel takes them off the iPhone's Meta AI app (UNVERIFIED in Meta's words). This changes his daily use of calls, messages and music through the glasses; written as a check-first sitting.
- **glass.09 (silence while others talk):** on the iPhone route nothing can listen before speaking (a background app cannot start the microphone [22]) and the glasses beamform away from other speakers [9]. Shape 1 (no unprompted speech) is the only one that works everywhere.

## 6. Sources

1. https://developers.meta.com/wearables/faq , Meta Wearables FAQ (checked 2026-11-28)
2. https://developers.meta.com/blog/meta-connect-recap/ , Meta Connect 2026: the end-to-end recap, 24 September 2026 (checked 2026-11-28)
3. https://wearables.developer.meta.com/docs/develop/dat/build-overview/ , DAT integration overview (checked 2026-11-28)
4. https://wearables.developer.meta.com/docs/develop/dat/version-dependencies/ , DAT version dependencies, 1.1.0 (checked 2026-11-28)
5. https://wearables.developer.meta.com/llms.txt?full=true , Wearables developer docs index (developer mode, firmware check) (checked 2026-11-28)
6. https://www.androidauthority.com/meta-glasses-ray-ban-meta-gen-3-launched-3714910/ , Ray-Ban Meta Gen 3 launched, 24 September 2026 (checked 2026-11-28)
7. https://mixed-news.com/en/ray-ban-meta-gen-3-449-nine-hours-action-button/ , Ray-Ban Meta Gen 3: nine hours, action button (checked 2026-11-28)
8. https://github.com/meta/meta-wearables-dat-android , DAT for Android, README capability list (checked 2026-11-28)
9. https://wearables.developer.meta.com/docs/develop/dat/microphones-and-speakers/ , Use device microphones and speakers (checked 2026-11-28)
10. https://wearables.developer.meta.com/docs/develop/dat/knownissues/ , DAT known issues (checked 2026-11-28)
11. https://wearables.developer.meta.com/docs/develop/dat/build-integration-android/ , Integrate DAT into an Android app (checked 2026-11-28)
12. https://developer.android.com/develop/background-work/services/fgs/service-types , Android foreground service types (checked 2026-11-28)
13. https://www.meta.com/ai-glasses/hands-free-communication/ , Meta AI glasses hands-free communication; https://www.meta.com/help/ai-glasses/647079267216457/ , call and message on AI glasses (search summary; the page itself would not load past a cookie notice) (checked 2026-11-28)
14. https://developers.meta.com/blog/meta-connect-recap-ai-glasses/ , Connect recap: build for AI glasses, 24 September 2026 (checked 2026-11-28)
15. https://www.meta.com/help/ai-glasses/1474718630810547/ , Action button on Ray-Ban Meta Optics (search summary) (checked 2026-11-28)
16. https://applevis.com/forum/ios-ipados/using-meta-glasses-hey-siri-iphone , Using Meta glasses with Hey Siri, May 2026; https://www.meta.com/help/ai-glasses/1466035674686599/ , voice shortcuts on Oakley Meta Vanguard (checked 2026-11-28)
17. https://vercel.com/docs/functions/limitations , Vercel Functions limits (last updated 2026-08-24) (checked 2026-11-28)
18. https://helpguide.sony.net/mdr/whch510/v1/en/contents/TP0002402819.html , Sony headset manual: Siri by button, not "Hey Siri" (checked 2026-11-28)
19. https://discussions.apple.com/thread/256072200 , Apple Community: Shortcut speak text while locked (checked 2026-11-28)
20. https://developer.apple.com/videos/play/wwdc2025/277/ , WWDC25 SpeechAnalyzer; https://blakecrosley.com/blog/speech-framework-vs-sfspeechrecognizer (checked 2026-11-28)
21. https://www.uploadvr.com/meta-ai-now-on-ray-ban-meta-glasses-in-uk-and-australia/ , Meta AI on Ray-Ban Meta in the UK (checked 2026-11-28)
22. https://developer.apple.com/forums/thread/770556 , Apple forums: can backgrounded apps record audio (checked 2026-11-28)
23. https://android-developers.googleblog.com/2026/02/the-intelligent-os-making-ai-agents.html , Android Developers Blog, AppFunctions and Gemini, February 2026 (checked 2026-11-28)
24. https://soniqo.audio/guides/vad/android , Silero VAD on Android (checked 2026-11-28)
25. https://github.com/snakers4/silero-vad/wiki/FAQ , Silero VAD FAQ (WebRTC comparison) (checked 2026-11-28)
26. https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan , Use the Agent SDK with your Claude plan, update of 7 October 2026 (checked 2026-11-28)
27. https://code.claude.com/docs/en/remote-control , Claude Code Remote Control (checked 2026-11-28)
