# Lane U2: the Field shell (2026-11-28)

Branch `lane-field-shell`, worktree `.claude/worktrees/field-shell`, from `46e304e`. No migration. No dependency. Not pushed, not merged, no `next build` (the integrator builds).

## What was built, against design §6

| §6 item | Built | Where |
|---|---|---|
| `ui_prefs.shell: "classic" \| "new" \| "field"`, Classic stays the default | Yes. One `SHELLS` list and a `shellOf` reader so any unknown value is Classic | `lib/settings/uiPrefs.ts` |
| Carried through `ShellPref`, `ShellFrame`, `app/layout.tsx`, `app/page.tsx` | Yes. `ShellFrame` has one branch for `new` and `field` with `data-shell` carrying the value; the layout puts `data-shell="field"` on `<html>` and skips the grain and the network backdrop | `components/shell/*`, `app/layout.tsx`, `app/page.tsx` |
| Settings, Appearance, Shell gains "Field" with the §6 line | Yes, third segment, the §6 description (plus the existing "Switch back at any time.") | `app/other/settings/page.tsx` |
| Token remap so every inner page is calm and flat | Yes, a marked FIELD SHELL block at the end of `app/globals.css`, on `html[data-shell="field"]` so every alias resolves through it. Three light-side values a step darker for 4.5:1 (decisions.md) | `app/globals.css` |
| Home on desktop is the tile grid (`tiles` in the registry, `defaultViewForShell`) | Yes | `components/home/TilesView.tsx`, `components/home/registry.ts` |
| Today 4x2: greeting, the win with first step and minutes, the rest with state, Done and Start | Yes. Done and Not now through the plate's handlers, now shared in `useHomeDay`; Start is the plate's "Start with a timer" link to Today; Done plays the small chime (larger for the win) honouring `chime`, the win turns moss | `components/home/TilesView.tsx`, `components/home/useHomeDay.ts` |
| This week 2x1 | Yes: seven cells of fill, the count, lifetime under it; moves on Done | same |
| Hours 2x1, hidden when null | Yes | same |
| Guides in progress 2x1 from `/api/guides` | Yes, client fetch with `useApi`, renders nothing on failure, on none, or when every guide is finished. **Lane U1 owns the route**; until it is merged the call answers 404 and the tile is absent | same |
| Captures 1x1, Nudges 2x1 (hidden when none), Gone quiet 2x1 (hidden when none, factual, no red) | Yes. Captures widens to 2x1 when there is no Hours tile so the grid has no hole | same |
| Family and Finds not drawn | Not drawn | same |
| Flat tiles, headings in the Field face, numbers in mono | Yes: paper-2 on paper, one hairline, radius 10, no shadow, no illustration | same |
| Phone unchanged on the focus card | Yes | `app/page.tsx` |
| Top menu: Guides under Work (both new shells) | Yes, straight after Work | `lib/home/menu.ts` |
| Wall: `TilesBoard`, default tiles, `?board=classic` keeps `Board` | Yes. Today 4x2 (countdown and today's appointments, up to three later ones), people 2x1 (numbers and week fill only), weather and bins 1x1, baby line and three taps 2x1, greeting in the header with no name. No field added to the wall contract | `components/wall/TilesBoard.tsx`, `components/wall/WallClient.tsx`, `app/wall/page.tsx` |
| Motion | One 240 ms entrance per tile, nothing loops; none under `data-motion` reduced or off or the OS setting; transitions off under off | `app/globals.css` |
| Wording | No "overdue", "missed" or "failed" in anything added; UK English; no em dashes | |
| Screenshots runner | `scripts/ui-screenshots.mjs`, data-driven (`SHOTS` rows of name, path, viewport, as, themes, focus) | |

## Files

Added: `components/home/TilesView.tsx`, `components/home/useHomeDay.ts`, `components/wall/TilesBoard.tsx`, `lib/home/greeting.ts`, `lib/home/greeting.test.ts`, `lib/settings/uiPrefs.test.ts`, `e2e/shell-field.tess.spec.ts`, `scripts/ui-screenshots.mjs`, this report.

Changed: `lib/settings/uiPrefs.ts`, `components/shell/ShellPref.tsx`, `components/shell/ShellFrame.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/other/settings/page.tsx`, `lib/home/menu.ts`, `lib/home/menu.test.ts`, `components/home/registry.ts`, `components/home/HomeView.tsx`, `components/home/PlateView.tsx` (handlers moved into the hook, behaviour unchanged), `components/wall/Board.tsx` (helpers exported, behaviour unchanged), `components/wall/WallClient.tsx`, `app/wall/page.tsx`, `app/globals.css` (one appended block only), `components/ui/SegmentedControl.tsx` (pill re-measure, see below), `docs/run/2026-11-28/decisions.md`.

Not touched: `lib/home/contract.ts`, `lib/wall/contract.ts`, `lib/wall/finance.test.ts`, anything of lane U1's, `supabase/migrations`, `package.json`.

## Tests run

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint <23 changed .ts/.tsx/.mjs files>` | clean |
| `npx vitest run lib/home lib/wall lib/settings` | 8 files, 44 tests passed |
| `E2E_PORT=3112 npx playwright test e2e/shell-field.tess.spec.ts` | 7 passed |
| `E2E_PORT=3112 npx playwright test e2e/shell-field.tess.spec.ts e2e/home.tess.spec.ts e2e/wall.phil.spec.ts e2e/settings-nav.tess.spec.ts` (after the last code change) | 28 passed (7 + 7 + 10 + 4) |

`e2e/wall.phil.spec.ts` passes unchanged against the tile board; it was not edited. `lib/wall/finance.test.ts` passes unchanged.

Every row the spec and the runner make is removed after them (checked: no `E2E-field-` tickets, no `UI-shot` teams). Phil's and Tess's local `ui_prefs.shell` are back on `classic`, theme `dark`, motion `full`.

## Screenshots

Taken with `E2E_PORT=3112 node scripts/ui-screenshots.mjs`, shell Field, written to `docs/run/2026-11-28/screenshots/` in the worktree: `home-desktop`, `home-phone`, `work`, `tasks` (redirects to `/work`), `finance`, `settings-appearance`, each in dark and light; `wall-tiles` and `wall-classic` in dark only (the wall is a dark screen with no theme). Each was looked at; fixes made from them: an empty plan (stale proposal) on Home, a hole in the grid beside Today, tile headings falling back to the sans face on the wall, small moss text under 4.5:1 in light, serif uppercase section labels on inner pages, and the segmented control's pill running past its label. **They are not committed**: `.gitignore` ignores `screenshots/` ("never committed") and they show Phil's local data. One line each in decisions.md.

## Left undone, and why

- The Guides tile cannot be seen with data until lane U1's `GET /api/guides` and `app/guides` are merged; it is coded to the agreed response shape and is absent meanwhile. After the merge, delete `BUILT_ELSEWHERE` in `lib/home/menu.test.ts`.
- Body copy app-wide is not switched to Newsreader (D11 says it should be); headings are. Decided against for dense pages, recorded with its undo.
- `graphify update .` not run (graphify is not installed, as the run's decisions log already notes).
- The project copies of `claude/context.md` and `claude/backlog.md` were not touched (lanes leave them to the integrator).

## Found on the way (not changed)

- `/finance` logs a hydration error in every shell: an `<a>` nested in an `<a>` in the overview cards.
- `/work` "Due in the next week" still prints the word "Overdue" on dated tickets (outside this lane's scope; ND wording table).
- `components/ui/SegmentedControl.tsx` measured its pill once, before the mono face loaded, so the pill overran its label in every shell; fixed in its own commit because it showed in this lane's screenshots.

## Phil's live check (for the integrator to number)

1. Settings, Appearance, Shell: choose Field. The page reloads with the top menu bar and a calmer, flatter palette.
2. Home on the desktop: a tile grid, "Good morning/afternoon/evening, Phil" in the largest tile with today's one thing, its first step and minutes. Press Done: a soft chime, the title turns moss, This week counts one more.
3. Open Work in the menu: Guides is the second entry. Open `/work` and `/finance`: same pages, calmer colours, nothing hard to read.
4. Flip the sun and moon: both sides calm, no neon green anywhere.
5. On the phone, Home is still the one next-thing card.
6. On the wall (or `/wall` in a browser paired as a wall): the tile board with today largest and a greeting; `/wall?board=classic` shows the old board.
7. Choose Classic again: everything is as before.
