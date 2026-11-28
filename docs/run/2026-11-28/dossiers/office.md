# Dossier: E.office, office restart (HOME)

*Written 2026-11-28 by a T2 dossier agent from plan §11 and the digest `digests/home-3d-rooms.md` (H4). Web facts carry their checked date.*

## 1. What Phil decided

The office starts again. Only the measurements carry over, marked "do not re-derive", and the room goes through the same mood-board process as every other room, last in the room order (after bathroom, nursery, bedroom and living room), with its budget set when its turn comes. Fixed inputs: a solid oak or ash desktop, 2 m, on the right wall; the 3D-printed "Mycelium" wall panels as the signature piece (this replaces section 8b's "a quiet nod in his office only", flagged once, not reopened); a ply overlay under click flooring with a thin firm underlay; steel sheet, not magnetic paint, for a writable wall; the chimney flue stays sealed. Recess storage and wall colour are decided at the mood boards. A 3D printer (PLA and PETG only) is wanted but not bought, behind the baby and bathroom spend. The two AutoHotkey window scripts from July get a one-week keyboard trial; MIDI pads are an idea behind it. The Access to Work equipment application is undecided and is a review row, not a ticket.

## 2. His kit and constraints

- **Measurements to keep** (millimetres): shell 3500 wide, 4900 deep, 2450 high; alcove front-right 1050 deep with a 460 beam drop; chimney breast on the left wall projecting 360, recesses 1460 and 2220; two windows 1650 wide, sill 740; door on the right wall; radiator on the back wall; clear right-wall run 2500.
- **Source file**: `office-design-state.md` is named in the brief but is not in this repo (searched 2026-11-28). The figures above come from the intake text. The Office Set Up project's chats (six unread) and the file come in through rescue.01 and rescue.03.
- **Existing ticket**: GARDN-1 "Patch and repair office walls" (backlog).
- **PC**: Windows 11 (the run environment reports Windows 11 Pro); the AutoHotkey scripts' whereabouts are not recorded in the repo.
- **Money**: the printer waits behind baby and bathroom spend; nothing is bought in this run.

## 3. What the research found

### 3.1 AutoHotkey window hotkeys

- AutoHotkey v2 is the current line; its documentation has the window and monitor functions a snap script uses: WinMove to move and size a window, and MonitorGetWorkArea, which returns a monitor's usable area (left, top, right, bottom) excluding the taskbar [1][2]. Download from the official page [3].
- Scripts written for v1 do not run under v2 unchanged; a forum thread reports a v1 snap script not working on Windows 11 and not compatible with v2 [4]. The office.07 guide therefore checks for a `#Requires AutoHotkey v2` line before installing.
- Display scaling can make the final window position differ from the requested one (forum reports; UNVERIFIED as a general rule) [4]. The guide's troubleshooting line covers it.
- The two July scripts' content is unknown; if they are only in the Office Set Up chats, rescue.01 brings them.

### 3.2 The fixed inputs

No research was needed to record them; the steel sheet and ply overlay rules are Phil's July decisions. The 3D printer choice is deliberately left to the time of purchase: models and prices change fast, and the plan puts it behind other spend.

### 3.3 Walls (office.05, linked to GARDN-1)

- The tap test for hollow plaster and cutting back to sound edges before patching is standard practice (the same method as external render, [5]). Large areas are a plastering job and go to the learn-it-or-hire-it ticket (home.20).

## 4. Risks

- **Re-deriving the measurements** (lost work). Mitigation: office.01 enters them as given, marked "do not re-derive", and only notes differences when rescue.01 brings the source file.
- **Spending on the printer early** (money). Mitigation: office.06 waits on office.04, which waits on the office's turn; cost "to be priced".
- **Hotkey script misbehaving** (minor; windows thrown off-screen). Mitigation: a one-week trial, keep/change/drop verdict, scripts started from the Startup folder so removing them is a single delete.
- **The chimney flue** (safety): stays sealed, recorded as a fixed input.

## 5. Facts that differ from the plan

- **office.01**: its source `office-design-state.md` is not in the repo; the ticket uses the intake's figures and links rescue.01 to check them later.
- **office.05**: GARDN-1 already exists for the same job. The plan keeps office.05 as the guide and links GARDN-1; written that way, and GARDN-1 gets an appended pointer rather than being re-parented (it lives in the GARDN project, which stays).
- **office.07**: the scripts' location is not recorded anywhere in the repo; the ticket allows for them coming through rescue.01.
- **office.08**: not a ticket, as instructed (an undecided row in review.02).

## 6. Sources

1. https://www.autohotkey.com/docs/v2/lib/WinMove.htm, AutoHotkey v2 docs: WinMove (checked 2026-11-28)
2. https://www.autohotkey.com/docs/v2/lib/MonitorGetWorkArea.htm, AutoHotkey v2 docs: MonitorGetWorkArea (checked 2026-11-28)
3. https://www.autohotkey.com/download/, AutoHotkey download page (checked 2026-11-28)
4. https://www.autohotkey.com/boards/viewtopic.php?p=569877, AutoHotkey forum: v2 and Windows 11 with two monitors (checked 2026-11-28)
5. https://www.homebuilding.co.uk/advice/render-repair, Homebuilding: render repair (checked 2026-11-28)
