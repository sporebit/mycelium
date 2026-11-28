# Dossier: E.wall, the home dashboard (MYC)

*Written 2026-11-28 for the run of that day (Stream T, step T2). Sources checked 2026-11-28 unless a line says otherwise. Plan section 8; digest `digests/dashboard-wall.md`; built state from `docs/run/wall-report.md`, `lib/wall/contract.ts`, `components/wall/Board.tsx`, `claude/backlog.md` (MYC-189, MYC-205). Nothing was bought, installed, paired or changed for this dossier.*

## 1. What Phil decided

The wall is the existing `/wall` view, not a new build, plus house controls and more panels. The first screen is the A3 touch photo frame he owns, in the kitchen; its model, operating system and browser are not known and the purchase could not be found in his email, so the first ticket identifies it from the device itself. Nothing new is built until the existing wall has run on the real frame for a week. Every screen boots straight into the dashboard, full-screen, wakes by touch only, has fixed night hours per room set in Settings, and draws its own plain tile grid (independent of the on-hold Home redesign) from one panel library with a different set per device. Panels come in the order they would be used: shopping and meals, baby log and cooking mode first; energy, parcels and music later; plus PhirstMaxx plans, a slideshow from a shared phone album, a chores rota, bin day and fridge reminders, and a small "from the archive" tile. House control goes through Home Assistant on the Substrate box: lights, plugs and scenes open to anyone, cameras and heating behind the quick-unlock PIN, the doorbell camera pops up on shared-room screens. Speech only when asked; soft natural chimes. Guest mode by one tap and on a schedule, per device or all. Touches per tile are counted from day one and unused tiles are dropped. Screens live on the Smart-devices network and reach Mycelium and Home Assistant only. With the internet down the board shows its last state with an "as of" time and controls keep working locally. Nothing is bought until he has seen a costed list. Done means both of them use the kitchen screen daily for two weeks.

## 2. His kit and constraints

- **The frame:** an A3 touch photo frame, brand and model unknown (MYC-182 asks; H10 says start from the device). A3 is about 16 to 17 inches diagonal at the A-series ratio.
- **The wall as built (lane G, 2026-11-20, migration 0176):** `/wall` in any browser; the household device is an ordinary member of the family team paired by an eight-digit code (Settings > Security > Walls); the family board shows people as numbers and week fill (titles wait for the PIN), the countdown, the week's family appointments, the baby log's last line with three taps (feed, nappy, sleep), weather (open-meteo) and the next bin day; a person's own day behind their PIN for ten minutes; idle ambient plate after three minutes; night dimming fixed at 23:00 to 06:00 London for every wall (`lib/wall/schedule.ts`); one-tap guest mode (clock, weather, family pictures, long press to leave); finance never reaches the wall (a unit test and the e2e spec hold it). The wall **speaks nudges, the morning pick and family reminders on its own** every twenty seconds through the browser voice; 6b now says speech only when asked, so that behaviour is reversed by `wall.23`.
- **What the wall can read:** only what any family-team member can read. Shopping lists, meal plans and recipes sit in the health section (`shopping_lists`, `meal_plan`, `recipes` in `lib/access/registry.ts`), which is personal space; the existing Spotify connection (`lib/spotify/client.ts`, table `spotify_tokens`) is read through a person's session. Panels drawing on these need a family-space source or the PIN.
- **The Field shell lane (Stream U, lane U2, tonight):** builds `TilesBoard`, the same `WallGlance` drawn as a 6-column tile grid with what is on today largest (4 by 2), people 2 by 1, weather and bins 1 by 1, the baby line 2 by 1, a greeting by time of day, and `?board=classic` for the old board (field-guide-design section 6; decisions.md line 13). The tile library in `wall.05` builds on that grid.
- **House:** a smart meter and a home EV charger (makes not stated); cameras, doorbell, plugs, bulbs, sensors, Alexa devices, TVs and streaming sticks (net.09's list); Home Assistant does not exist yet (sub.08); local names with real certificates come from sub.05.
- **Network:** RT-AX86U on Asuswrt-Merlin, four networks planned (net.07), screens on Smart devices (net.09, wall.24).
- **Hosting:** Mycelium on Vercel Hobby and hosted Supabase, so the wall page itself comes from the internet; Phil's iPhone 17 Pro; Kirsty's phone platform not stated.
- **Money:** nothing bought until he sees the costed list (wall.04).

## 3. What the research found

### 3.1 Identifying an unknown Android photo frame (wall.01)
- Many no-name "Wi-Fi touch" frames run Android with a single locked app, most often **Frameo**. On Frameo the settings are inside the app (Settings > About shows the app and Android versions); there is normally no browser and no Play Store. Frameo's own help says ADB access appears only after joining its Beta Program, then a toggle under Settings > About [5]. Community guides that replace the Frameo app with another app use ADB and often root, warn that the change may not survive a reboot, and are model-specific [6][7]. **Rooting or replacing the frame's launcher can leave it unusable; the tickets do not do it.**
- Frames that are a plain Android tablet in a frame (Skylight-type, some A3 frames) show Android's own Settings > About tablet (model, Android version, build number) and usually have a browser or Play Store. Developer options are hidden until the build number is tapped seven times (Android 4.2 and later) [8].
- The browser version and user agent are read by opening a "what is my browser" page in the frame's browser; the Android System WebView version (Settings > Apps) matters for kiosk browsers, which draw through WebView. UNVERIFIED for the specific frame.
- The back label usually carries an FCC ID or a model code; an FCC ID can be looked up for the internal photos and the maker's name [9].

### 3.2 Fully Kiosk Browser for boot, full-screen and touch wake (wall.03)
- Fully Kiosk Browser installs from Google Play or as an APK from its site; it offers kiosk mode, autostart on boot, lock-screen bypass, a screensaver, motion detection, remote admin and a JavaScript interface [1][2].
- **PLUS licence: 8.90 EUR (or 10.99 USD) plus tax per device, one-off, lifetime** [3]. Some features (kiosk mode among them, per user reports) are PLUS; the free version shows a watermark on PLUS features. Which features are PLUS for this use is UNVERIFIED on the vendor page.
- Gotchas from users: "Launch on boot" alone sometimes does not start the app; enabling kiosk mode with an exit PIN and making Fully the home app fixed it [4]. A screen that Android has fully switched off cannot always be woken by touch, and on Fire tablets Fully cannot always switch the screen back on; the reliable pattern for **touch wake** is Fully's screensaver (dim or black) with Android's own screen timeout set long, so a touch ends the screensaver [4][10]. After a wake the Android swipe lock screen can appear unless it is disabled or bypassed [4].
- An open-source alternative, FreeKiosk, targets Android 8.0 and later [11].

### 3.3 Home Assistant for scenes, lights, cameras and heating (wall.17, wall.18, wall.21, wall.22)
- REST: `POST /api/services/<domain>/<service>` with a bearer token; long-lived access tokens last ten years and are made on the user's profile page [12][13]. WebSocket API: authenticate with the token, then `call_service`, and `subscribe_events` / `subscribe_entities` for live state (doors, heating, what is on) [14].
- **CORS:** a browser on another origin needs that origin listed under `http: cors_allowed_origins` in Home Assistant's configuration; exact origins, not a wildcard [12][15].
- **Mixed content:** the wall is an HTTPS page from Vercel. Browsers block HTTPS pages from calling `http://` addresses for scripts and API calls, and an `http://` raw IP is never upgraded [16]. So the wall can talk to Home Assistant directly only if Home Assistant has an HTTPS name with a real certificate, which is exactly sub.05 ("names under sporebit.com with real certificates, resolving only inside the house"). Without that, every control call must go through the Mycelium server, which then needs a route into the house (the VPN) and stops working when the internet is down.
- **Token on a shared screen:** calling Home Assistant from the screen means a Home Assistant token on the screen. The cautious shape is a dedicated non-admin Home Assistant user for the walls, holding only light, plug and scene permissions, with camera and heating calls made only after the PIN (through Mycelium) or through a second, narrower path. This is a design choice for Phil (section 5).

### 3.4 Spotify control (wall.15)
- **February 2026 changes:** Development Mode apps require the owner to have Spotify Premium (the app stops while Premium lapses), each Client ID is limited to **five authorised users**, one Development Mode Client ID per developer, and a smaller set of endpoints; new apps from 11 February 2026, existing apps migrated 9 March 2026 [17][18][19]. **July 2026:** the app limit rose and quota is counted per developer account; over-quota calls return 429 [20]. Whether the player endpoints are in the Development Mode set today is UNVERIFIED (forum posts conflict [21]).
- Mycelium already has a Spotify app (`SPOTIFY_CLIENT_ID`, `lib/spotify/client.ts`), read through Phil's session; control needs the `user-modify-playback-state` and `user-read-playback-state` scopes and a token the wall may use.
- **Connect devices:** speakers often appear in `/me/player/devices` only while a Spotify client is active on them; some models are never listed; `is_restricted: true` devices accept no Web API commands; transfers to inactive devices return 404 or 500 [22][23]. "Whichever speaker is playing" therefore works for the currently active device; starting playback on an idle speaker from the wall may not.

### 3.5 UK smart meter and EV charger (wall.12)
- **n3rgy:** the consumer portal now requires an active consent through one of n3rgy's business customers; users report being locked out and new consumer sign-ups closed; the old IHD-MAC consumer API is described as withdrawn by a third-party catalogue (UNVERIFIED from n3rgy itself) [24][25][26]. Not a dependable route today.
- **Hildebrand (Bright app, Glowmarkt API):** the free Bright app reads the meter through the DCC; its cloud API is used by a community Home Assistant integration (half-hourly, not live) [27][28]. **Local live data** needs Hildebrand's Glow display (IHD/CAD) and MQTT switched on by Hildebrand on request [27][29]. Price of the Glow display today UNVERIFIED; it is a purchase and waits for wall.04.
- Ofgem's January 2026 impact assessment notes no standard consent process yet and proposes one [30].
- **EV charger:** the make is not stated; most current UK chargers expose data either through their own cloud API or a Home Assistant integration. UNVERIFIED until the make is known; `wall.12` starts by noting it.
- Energy figures are not finance (the finance guard is about money keys); a cost per day in pounds would trip the guard's "amount" and "pence" words and must not be drawn. kWh only.

### 3.6 Shared album for the slideshow (wall.14)
- **Google Photos:** since 31 March 2025 the Library API manages only content the app itself created; the shared-album functions return 403; reading a shared album someone else made is no longer possible; the Picker API needs a person to pick each time [31][32]. Not usable for a running slideshow.
- **iCloud Shared Albums:** an album can have **Public Website** switched on; anyone with the link can see it [33][34]. Community slideshow modules read such albums through an undocumented "webstream" endpoint that can change without notice [35]. Works from iPhone and, for contributors, from Android via the web link only to view; adding photos needs an Apple device or iCloud for Windows [34].
- **Immich (self-hosted, on Substrate):** shared albums, public links with expiry and password, a slideshow; but phone auto-upload into an existing shared album is a known gap [36][37]. Depends on Substrate.
- Phil's decision says "a shared phone album (a new connection)". The choice between a public-link iCloud album (anyone with the link sees the photos) and a self-hosted album is a privacy choice for Phil (section 5).

### 3.7 Costed hardware list refreshed (wall.04; supersedes the table in wall-report.md)

| Option | What it is | About, 2026-11-28 | Change since 2026-11-20 |
|---|---|---|---|
| A. The frame as it is | Fully Kiosk on the frame, if it is open Android | 0 to about £8 (8.90 EUR PLUS licence, plus tax) [3] | Licence price confirmed |
| A2. Frame is a locked Frameo-type | No kiosk without ADB and probably root; not attempted | £0, but see B to E | New line |
| B. Fire HD 10 on its own mount | 10.1 inch, speakers, mic, Fire OS; Fully as an APK | Tablet about £80 to £110 in sales, £149.99 list [38][39]; a mount about £15 to £30 (UNVERIFIED) | Sale prices are late-2025 figures; this year's Black Friday price UNVERIFIED |
| C. Touch monitor and a Raspberry Pi 5 | Verbatim 15.6 inch touch about £167 [40] (speakers UNVERIFIED); Pi 5 8 GB bare board about £168 [41] after three memory-driven price rises in 2026 [42]; case, supply, USB microphone about £40 (UNVERIFIED) | about £375 | Up from £270 to £380; the Pi alone has risen |
| C2. A 21.5 inch touch monitor and a Pi 5 | iiyama ProLite T2255MSC-B1, about £228 to £375 inc VAT [43] | about £440 to £590 | New line, closest to A3 and beyond |
| D. Frame for pictures, a tablet for the wall | as B | as B | none |
| E. Nothing new | an old phone, tablet or laptop he already owns | £0 | none; wall.04 surveys what he owns |

All prices are UK street prices seen today and move; nothing is bought in this run.

## 4. Risks

- **Bricking the frame (lock-out of the device):** rooting, disabling the Frameo app or a factory reset can leave the frame unusable or lose its photos. Mitigation: wall.01 and wall.03 only read and install from an app store or the vendor APK; any ADB, root or reset step is a separate decision Phil takes on the ticket, marked irreversible.
- **A Home Assistant token on a kitchen screen:** anyone in the kitchen, or anyone who takes the device, could control the house. Mitigation: a dedicated wall user in Home Assistant with the smallest rights, cameras and heating only after the PIN, the token revocable from Home Assistant's profile page, and the screens on the Smart-devices network (wall.24).
- **Kirsty-facing breakage:** a frame that boots into a broken page, a PIN prompt she does not know, speech at the wrong moment. Mitigation: the week on the real frame (wall.02) before anything is built; speech off unless asked (wall.23); the classic board kept at `?board=classic`; guest mode and night hours per room; the done check needs both of them (wall.26).
- **Internet down:** the page is served from Vercel. Mitigation: wall.22 caches the last board and makes local control depend on sub.05's local HTTPS names; until those exist "controls keep working locally" is not true and the ticket says so.
- **Privacy on a shared screen:** shopping lists, meal plans, recipes, PhirstMaxx plans, quotes and photos live in personal space today. Mitigation: each panel ticket starts by naming the family-space source or puts the panel behind the PIN; nothing personal is copied to the family space without Phil's say.
- **Money:** Fully PLUS per device, a Glow display, any tablet or monitor. Mitigation: costed in wall.04; each ticket with money has a Cost section saying nothing is bought in this run.
- **Spotify app stops:** if the app owner's Premium lapses or the five-user cap is hit, music control stops. Mitigation: wall.15 checks the app's status and scopes first and draws "music unavailable" rather than an error.
- **Burn-in on an always-on screen:** the ambient plate's moving figure already addresses it; per-room night hours (wall.19) add dark time.

## 5. Facts that differ from the plan

- **wall.17, wall.22 (and wall.18, wall.21):** direct control from the wall needs Home Assistant on HTTPS with a real certificate (mixed content) and CORS for the Mycelium origin. Add **after sub.05** to wall.17. Without it, controls run through the Mycelium server and stop when the internet is down, which contradicts answer 28 ("controls keep working locally").
- **wall.17, question for Phil:** where the Home Assistant token lives (on each screen as a narrow wall user, or on the server only) is a security decision. The ticket writes the cautious version (a narrow non-admin wall user, lights, plugs and scenes only on the screen; cameras and heating through the server after the PIN) and asks.
- **Digest answer 25 ("PC off: everything except house controls and the PC voice"):** with Home Assistant on the Substrate box (sub.08), house controls do not depend on the PC. The answer reads as a floor, not a rule; no ticket changes, but the integrator may want to note it.
- **wall.12:** n3rgy's consumer route is now gated behind a business partner's consent and is not dependable; the workable routes are Hildebrand's cloud API through the Bright app (half-hourly, free) or a Glow display for live local data (a purchase). The plan's "after sub.08" holds only for the Home Assistant route; the Bright API route does not need it. Energy shown as kWh only, never pounds (the finance guard).
- **wall.14:** Google Photos shared albums cannot be read by an app since 31 March 2025. The workable "shared phone album" is an iCloud Shared Album with Public Website on (anyone with the link can view it, read through an undocumented endpoint) or Immich on Substrate. Phil chooses; the ticket starts with that choice.
- **wall.15:** Spotify Development Mode (February 2026) requires the app owner's Premium, caps a Client ID at five users and narrows endpoints; whether playback control is still in the Development Mode set is unverified. Speakers appear only while active, so "whichever speaker is playing" works, starting an idle speaker may not.
- **wall.06, wall.08, wall.13, wall.16:** the data (shopping lists, meal plan, recipes, PhirstMaxx plans, quotes) is personal space today and the wall reads family space only. Each needs a family-space source or the PIN; the plan rows do not say which. Tickets ask before copying anything.
- **wall.23:** the built wall speaks nudges, the morning pick and family reminders on its own; 6b's "speech only when asked" means this ticket removes built behaviour, not only adds chimes.
- **wall.19:** night hours exist today as one fixed window (23:00 to 06:00) for every wall; the ticket moves them into Settings per device.
- **wall.24:** "reaching Mycelium and Home Assistant only" cannot be an IP rule on the router because Mycelium is on Vercel's shared, changing addresses; it needs the DNS filter's allow list (sub.06) or a domain-based rule, and the screen also needs Fully Kiosk's licence check, open-meteo (if fetched in the browser; today the server fetches it, UNVERIFIED), Spotify artwork and the photo album's host unless Mycelium proxies them. Add **after sub.06** or say "best effort until the DNS filter exists".
- **wall-report table (wall.04):** option C has risen to about £375 (Pi 5 8 GB about £168 bare board after the 2026 rises); Fully PLUS is 8.90 EUR per device; a 21.5 inch touch line added; a locked Frameo-type frame added as A2.

## 6. Sources

1. https://www.fully-kiosk.com/en/ , Fully Kiosk Browser and App Lockdown, features (checked 2026-11-28)
2. https://fully-kiosk.com/en , Fully Kiosk Browser help (checked 2026-11-28)
3. https://www.fully-kiosk.com/docs/en/legal/fully-plus-license , Fully PLUS License (checked 2026-11-28)
4. https://community.home-assistant.io/t/fully-kiosk-not-launching-at-boot-on-my-android-tablet/1021331 , Fully Kiosk not launching at boot (checked 2026-11-28)
5. https://support.frameo.com/hc/en-us/articles/6126183308434--How-to-Enable-ADB-on-Your-Frame , Frameo, how to enable ADB (checked 2026-11-28)
6. https://immich-kiosk-docs.pages.dev/misc/frameo , Immich Kiosk, Frameo frames (checked 2026-11-28)
7. https://demonwarriortechdocs.pages.dev/Documented%20Tutorials/Immich%20Frame/Frameo_Setup , Frameo setup for ImmichFrame (checked 2026-11-28)
8. https://developer.android.com/studio/command-line/adb.html , Android Debug Bridge (checked 2026-11-28)
9. https://fcc.report/FCC-ID/2ACJAHNDPF1160/4462450.pdf , example FCC filing for a photo frame (checked 2026-11-28)
10. https://community.home-assistant.io/t/fire-hd8-wake-from-sleep/135875 , Fire HD8 wake from sleep (checked 2026-11-28)
11. https://docsearch.algolia.com/mcp/docs/repo/rushb-fr/freekiosk , FreeKiosk documentation (checked 2026-11-28)
12. https://developers.home-assistant.io/docs/api/rest/ , Home Assistant REST API (checked 2026-11-28; reached through search mirrors, UNVERIFIED page text)
13. https://developers.home-assistant.io/docs/auth_api , Home Assistant authentication API (checked 2026-11-28)
14. https://developers.home-assistant.io/docs/api/websocket , Home Assistant WebSocket API (checked 2026-11-28)
15. https://community.home-assistant.io/t/cors-header-access-control-allow-origin-missing/196937 , CORS header missing (checked 2026-11-28)
16. https://web.dev/articles/what-is-mixed-content , What is mixed content? (checked 2026-11-28)
17. https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security , Update on developer access and platform security (checked 2026-11-28)
18. https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide , February 2026 Web API Dev Mode changes (checked 2026-11-28)
19. https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/ , TechCrunch on the Dev Mode change (checked 2026-11-28)
20. https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates , Web API quota updates for Development Mode (checked 2026-11-28)
21. https://community.spotify.com/t5/Spotify-for-Developers/February-2026-Spotify-for-Developers-update-thread/m-p/7361070 , February 2026 update thread (checked 2026-11-28)
22. https://developer.spotify.com/console/get-users-available-devices , Get available devices (checked 2026-11-28)
23. https://community.spotify.com/t5/Spotify-for-Developers/v1-me-player-devices-returns-empty-array/m-p/5268419/highlight/true , devices returns empty array (checked 2026-11-28)
24. https://forums.moneysavingexpert.com/discussion/6574003/n3rgy-data-consumers-require-active-consent-registration-with-business-customers , n3rgy consent with business customers (checked 2026-11-28)
25. https://providers.apievangelist.com/providers/n3rgy/ , n3rgy API catalogue entry (checked 2026-11-28)
26. https://kb.loop.homes/how-to-download-your-data , download your data from n3rgy (checked 2026-11-28)
27. https://community.home-assistant.io/t/hildebrandglow-smart-meters-smets2/267603?page=16 , Hildebrand Glow, SMETS2 (checked 2026-11-28)
28. https://github.com/HandyHat/ha-hildebrandglow-dcc , Hildebrand Glow DCC integration (checked 2026-11-28)
29. https://community.home-assistant.io/t/glow-hildebrand-display-local-mqtt-access-template-help/428638 , Glow display local MQTT (checked 2026-11-28)
30. https://www.ofgem.gov.uk/sites/default/files/2026-01/Consumer%20Consent%20Solution%20impact%20assessment%20%28final%29.pdf , Ofgem Consumer Consent Solution impact assessment (checked 2026-11-28)
31. https://developers.googleblog.com/en/google-photos-picker-api-launch-and-library-api-updates/ , Picker API launch and Library API changes (checked 2026-11-28)
32. https://developers.google.com/photos/support/updates , Updates to the Google Photos APIs (checked 2026-11-28)
33. https://support.apple.com/108314 , Shared Albums in Photos on iPhone (checked 2026-11-28)
34. https://support.apple.com/en-gb/guide/icloud/mme985ae44d8/icloud , iCloud User Guide, shared albums (checked 2026-11-28)
35. https://forum.magicmirror.builders/tags/icloud%20album , MagicMirror forum, iCloud album modules (checked 2026-11-28)
36. https://docs.immich.app/features/sharing/ , Immich sharing (checked 2026-11-28)
37. https://www.answeroverflow.com/m/1449072980788514896 , Immich shared album upload thread (checked 2026-11-28)
38. https://www.gsmarena.com/black_friday_deals_amazon_uks_top_tablet_laptop_and_ereader_deals-news-70493.php , Amazon UK tablet deals (checked 2026-11-28; article from November 2025)
39. https://www.trustedreviews.com/black-friday/amazons-discounted-fire-hd-10-is-a-true-black-friday-bargain-4394989 , Fire HD 10 list price (checked 2026-11-28)
40. https://www.scan.co.uk/products/156-verbatim-pmt-15-touchscreen-portable-monitor-ips-1920x1080-6ms-60hz-10001-250cd-m-hdmi-usb-c , Verbatim PMT-15 touch monitor (checked 2026-11-28)
41. https://www.techradar.com/pro/as-memory-costs-spark-raspberry-pi-price-hikes-avoid-this-usd200-standalone-board-trap-canakits-usd260-8gb-bundle-is-the-smarter-buy , Pi 5 8 GB UK price (checked 2026-11-28; article undated)
42. https://www.tomshardware.com/raspberry-pi/component-shortages-drive-raspberry-pi-prices-up-by-up-to-23-percent-escalating-lpddr4-lpddr5-costs-trigger-the-third-price-hike-of-the-year , third Pi price rise of 2026 (checked 2026-11-28)
43. https://www.iiyama-monitors.co.uk/products/monitors/t2255msc-b1 , iiyama ProLite T2255MSC-B1 (checked 2026-11-28)
