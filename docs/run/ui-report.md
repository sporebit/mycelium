# Master run — Stream I report (UI: Specimen plate and the top menu bar)

*2026-11-20, 05:25–06:25 London. Claude Code on the PC. Ticket MYC-191. Status: **built, behind the switch in Settings → Appearance (default: Classic)**; Phil's live check is chunk 12 of MYC-193. No migration. Scope as set at 02:47: Specimen plate only. Core sample, Burrow and Colony were not started, scaffolded or stubbed.*

## What was built

| Asked (claude/ui-direction.md, master run §13) | Built | Where |
|---|---|---|
| A new shell behind the old/new switch | Yes. Settings → Appearance → Shell: Classic or New. The choice is read on the server, so the right shell is in the first paint. Classic is untouched. | `components/shell/ShellFrame.tsx`, `ShellPref.tsx`, `app/layout.tsx` |
| A classical top menu bar with dropdowns; groups in one config array | Yes: Today · Work (Work, Docs, Hours) · Life (Organisation, Journal, Places) · Body (Fitness, Health) · Money · Make (Studio, Drops, Ventures) · The Boys · Review · Settings. Regrouping is editing one array. Keyboard: Tab, Enter, Escape, arrows. Quiet sections carry "quiet 9 weeks" in the dropdown. | `lib/home/menu.ts`, `components/shell/TopMenu.tsx` |
| Capture in the bar | Yes; the floating capture button is hidden where the bar has it. | `TopMenu.tsx`, `app/globals.css` |
| Home = Specimen plate, desktop first | Yes: the win as a large annotated specimen (a what it is, b first step, c time, d where it grows), the rest of today as figures that can be brought to the centre, done colours the specimen in, the week's finished count as a spore print, hours as a ruler, captures waiting as loose spores, quiet features in the margin. | `components/home/PlateView.tsx`, `Specimen.tsx` |
| The phone keeps the single next-thing card | Yes. | `app/page.tsx` |
| A view registry and one shared data contract, only Plate registered, no visible toggle | Yes. A view is a component fed by `HomeData`; registering a second one is a line. There is no toggle while there is one view. | `components/home/registry.ts`, `lib/home/contract.ts`, `lib/home/data.ts` |
| The mock-up's five code-drawn species, each behind one component | Yes. All artwork is in two files; the layout never reaches past them. | `lib/home/specimen.ts`, `components/home/Specimen.tsx` |
| The network backdrop: seeded, three depth layers, leans away from the pointer, a burst of growth on done | Yes, ported. It also leans away from a finger (the wall, a tablet), and its size follows how much the person has ever finished. | `components/home/Network.tsx` |
| Completion feedback behind the switch | Yes: colour floods in, new growth from the specimen, the chime (the larger one for the day's win). | `PlateView.tsx` |
| Reduced motion | Yes: with motion reduced or off (the app's own setting or the system's) the ink is drawn at once and the network holds still. | `app/globals.css`, `Network.tsx` |
| Inner pages not restyled | Yes. They sit under the bar as they sat beside the sidebar; their sub-pages show as a chip row, since there is no sidebar to hold them. | `components/shell/SubChips.tsx` |

Handled, each with a check: no items (a blank plate), more lined up than fits (Today holds five; nothing scrolls sideways with long titles), a phone-width window, motion off, switching back to Classic.

## Findings

1. **Today and Home came back empty on the first visit of any day that had items**, and had since Today was built. Inside a page render React remembers the answer to an identical request for the length of the render; "is there a plan for today?" was asked, answered no, the plan was created, and the same question asked again was answered "no" from memory. The Today page hid it: when its server-side read fails the card quietly loads itself in the browser. Found because Home has no such fallback on desktop. Fixed by reading the new plan back from the row just made (`lib/daily/server.ts`). API routes were never affected, which is why every check had passed.
2. **The test server's log was empty** all night: its output was never captured, so a swallowed error could only be found by starting a second copy with its output attached. Noted for the harness.
3. **The two colour-token systems were already one where it matters**, and are now one in name too. The old names (`ink-0` to `ink-4`, `text-0` to `text-3`) were defined as aliases of the new ones (`surface-*`, `text-hi/mid/lo/ghost`). 4,152 class names in 212 files were renamed to the new vocabulary in one mechanical commit. Proof that nothing changed: twelve pages photographed before and after with everything that moves held still came out identical to the pixel (the comparison was first run twice on one build to show it was steady), and every page still opens. The aliases stay in the stylesheet for anything written in CSS by hand.
4. **The app's global heading rule outranks utility classes**, so a heading cannot be restyled with a class alone. The plate sets its own headings in one scoped rule.

## Looked at on screen

The mock-ups were never opened and checked after publishing. This build was: screenshots at 1440×960 of the plate with a day of items, after Done, the dropdown, and an inner page under the new bar. Five things were wrong on the first look and were fixed: headings not in the serif; the network bunched in one corner for someone with little history; every specimen the same species (all of a day's items shared one project); cramped figures; the old floating capture button sitting on the plate.

## Deviations from the direction

- **A species per item, not per section.** The direction allowed either. Per section gave a plate of identical mushrooms, because most of a day's items share a project.
- **"Family" is not in the Life menu yet**: it has no page. The config has a note; it joins when the family stream builds it.
- **Family, Finds and another person's margin note are not on the plate**: those streams are not built, and the contract leaves them empty rather than drawing sample data. Hours, loose spores and "gone quiet" are there because they are real.
- **The person switcher is not in the bar.** There is one person's data to show; it arrives with the family stream, where "whose day" has an answer.
- **No time of day on the figures** ("15:00", "evening" in the mock-up): Today's items have an order and a length, not a clock time.
- **The network is seeded per person and sized by their history; it is not yet drawn from the history itself** (each finished thing a thread). The direction asks for that; it needs the history laid out in space, which is a design step of its own.
- **Not built: the wall following Home** (the wall screen is a later stream; the contract and view are ready for it).

## Not done

- **Proper artwork.** The five species are simple code drawings, as agreed for a first pass. The source is Phil's choice (MYC-192): public-domain engravings are free; generated artwork costs money, so the run stops and asks before it.
- Core sample, Burrow, Colony: waiting for Phil's word, as instructed.

## Design calls

- **The shell choice travels from the server to the page**, not read in the browser, so there is no flash of the wrong shell and no layout jump.
- **Both shells share one frame component** and every page still calls the same `Shell`: no page was edited to support the new one.
- **The plate has its own palette** (ink on dark paper) set on the plate, not in the app's tokens: Home is the one place allowed to look different, and working pages must stay calm.
- **Done on the plate does not start a timer.** It is the place for "that one is finished"; the phone card and "Start with a timer" are for working through something.
- **The finished specimen holds the centre** until another figure is chosen: the moment is the point, and moving on at once threw it away.

## For Phil

- **Try it:** Settings → Appearance → Shell → New. Classic is one tap back. Nothing else changes until you switch.
- **Chunk 12 of MYC-193** is the fifteen-minute look. The questions that matter: is the plate what you pictured; are the menu groups right; which artwork (MYC-192).
- The other three views start when you say your limits have refreshed.
- This terminal cannot write the Claude project's copies of the state documents; `graphify update .` could not run.
