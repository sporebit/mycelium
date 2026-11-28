# Digest: Home dashboard on smart screens (Mycelium wall stream, MYC-189)
Brief sections: Section 6, 6b, H10 Dashboard (section 6) folded item. Source A:\Projects\Mycelium\docs\intake\intake-2026-11-27.md. Dashes in quoted answers are the brief's own.

## 1. First answers

### Section 6: Home dashboard on smart screens (/wall is already built) (brief lines 180-209)

1. It is **the existing wall view, plus smart-home controls and more panels** — not a new build.
2. First screen: **the A3 touch photo frame he owns**.
3. Frame operating system: **not sure — a ticket to identify model, OS, browser version and full-screen ability**.
4. First room: **kitchen**.
5. **Several rooms from the start.**
6. Main job: **glance at what is happening today, and control the house**.
7. Further rooms: **living room, bedroom, office**.
8. Extra screens: **devices he already owns, researched first** (nothing bought before that).
9. Controls, all four: **lights and plugs, cameras and the doorbell, heating, scenes**.
10. Control route: **through Home Assistant** (depends on the self-hosting epic).
11. New panels: **shopping list and meal plan, parcels expected, energy use, PhirstMaxx plans**.
12. And: **baby log, photo slideshow, music controls, cooking mode**.
13. Energy kit: **a smart meter and a home EV charger**.
14. Cameras on a shared-room screen: **pop up when the doorbell rings**, otherwise on demand.
15. First thing proved: **the existing wall on the real frame**, lived with for a week; nothing new is built until that works.
16. Panel order: **by how often they would be used** (shopping and meals, baby log, cooking mode first; energy, parcels, music later).
17. Start-up: **boots straight into the dashboard, full-screen**; a ticket per device type.
18. Wake: **touch only**.
19. Night hours: **fixed per room**, set in Settings.
20. Layout: **its own plain tile grid, independent of the on-hold Home redesign**.
21. Per room: **same panel library, a different set per device**.
22. Slideshow photos: **a shared phone album** (a new connection, not the Family timeline).
23. Music: **Spotify control on whichever speaker is playing**.
24. Parcels: **from the mail import** (waits on MYC-201).
25. PC off: **everything still works except house controls and the PC voice**.
26. Hardware spend: **nothing until he has seen a costed list** (refresh the table in `docs/run/wall-report.md`).
27. Screens sit on **the Smart-devices network, allowed to reach Mycelium and Home Assistant only**.
28. Internet down: **last known board with an "as of" time**; controls keep working locally.
29. Control lock: **lights and scenes open; cameras and heating behind the quick-unlock PIN**.
30. Done means: **both of them use the kitchen screen daily for two weeks**.

## 2. Round 2 extras

### Section 6b: Home dashboard, extras (brief lines 479-487)

- **Character:** a short greeting by time of day.
- **Kitchen at 7am:** all four matter (first commitment, who is doing what, tonight's meal, weather and countdown) — **tiles of varying sizes, with what is on that day as the largest**.
- **Replaces on paper, all four:** the wall calendar, the shopping list pad, the bin-day leaflet and fridge reminders, a chores rota (a new panel).
- **Guest mode:** one tap by hand **and** on a schedule he sets, **choosing which device or all**.
- **Idle:** house status (doors, heating, what is on).
- **Bedroom screen:** a wind-down — dims at a set time, shows tomorrow's first thing, then dark.
- **Sound:** soft natural chimes; **speech only when asked for** (this narrows the earlier "spoken reminders and nudges aloud" decision for the wall).
- **A small "from the archive" tile** rotating saved quotes and photos from this day in past years.
- **If unused:** touches per tile counted from day one; unused tiles are dropped until they earn their place.

## 3. Round 3 corrections and additions (these win)

### H10 folded item: Dashboard (section 6) (brief lines 707)

- **Dashboard (section 6):** the photo frame's purchase could not be found in his email; the "identify the frame" ticket (6.3) starts from the device itself.

## 4. Flags marked [claude] that touch this epic

None.

## 5. Assumed items

None.

## 6. Dates named for this epic

- First thing proved: the existing wall on the real frame, lived with for a week (section 6 answer 15, brief line 194).
- Done means: both of them use the kitchen screen daily for two weeks (answer 30, line 209).
- Night hours fixed per room, set in Settings (answer 19); bedroom wind-down dims at a set time (6b, line 484).
- Kitchen at 7am: what is on that day is the largest tile (6b, line 480).
- If unused: touches per tile counted from day one (6b, line 487).

## 7. Cross-links to other epics

- substrate-self-hosting: house controls go through Home Assistant on Substrate (section 6 answer 10).
- sec-home-network: screens sit on the Smart-devices network, allowed to reach Mycelium and Home Assistant only (answer 27).
- mail-email-migration: parcels panel comes from the mail import, waits on MYC-201 (answer 24).
- ventures-and-life (PhirstMaxx plans panel): PhirstMaxx plans are a new panel (answer 11); see mycelium-second-brain for PhirstMaxx.
- baby: baby log panel (answer 12); baby monitor camera through Home Assistant.
- home-3d-rooms: lighting positions become Home Assistant scenes and dashboard buttons (8b, line 511).
- glasses: house control by voice comes later, after the dashboard controls work (section 10 answer 19).
