"""
Apply the red team's changes (docs/run/2026-11-28/red-team.md, findings 1 to 76)
to the ticket files in docs/run/2026-11-28/tickets/ before anything is created.

    python -I scripts/apply-red-team-2026-11-28.py

Safe to run twice: every text change is marked with the finding number under a
"## Red team" heading and is not appended again; structural changes (a new
dependency, a date, a new ticket) are checked before they are made. Prints the
list of changes as markdown for plan.md §28.
"""
from __future__ import annotations

import glob
import json
import os
import sys

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "run", "2026-11-28", "tickets")
FILES: dict[str, dict] = {}
BY_SID: dict[str, tuple[str, dict]] = {}
LOG: list[str] = []

for path in sorted(glob.glob(os.path.join(DIR, "*.json"))):
    stem = os.path.basename(path)[:-5]
    with open(path, encoding="utf-8") as fh:
        FILES[stem] = json.load(fh)
    for t in FILES[stem]["tickets"]:
        BY_SID[t["sid"]] = (stem, t)


def T(sid: str) -> dict:
    if sid not in BY_SID:
        sys.exit(f"no ticket {sid}")
    return BY_SID[sid][1]


def E(stem: str) -> dict:
    return FILES[stem]["epic"]


def note(sid: str, n: int, text: str) -> None:
    """One line under "## Red team" in the description, once per finding."""
    t = T(sid) if not sid.startswith("E.") else E(sid[2:])
    mark = f"- Finding {n}:"
    if mark in t["description"]:
        return
    if "## Red team" not in t["description"]:
        t["description"] = t["description"].rstrip() + "\n\n## Red team\n"
    t["description"] = t["description"].rstrip() + f"\n{mark} {text}\n"
    LOG.append(f"{n}. {sid}: {text}")


def after(sid: str, *deps: str, n: int) -> None:
    t = T(sid)
    t.setdefault("after", [])
    added = [d for d in deps if d not in t["after"]]
    if added:
        t["after"].extend(added)
        LOG.append(f"{n}. {sid} now also after {', '.join(added)}")


def drop_after(sid: str, dep: str, n: int) -> None:
    t = T(sid)
    if dep in t.get("after", []):
        t["after"].remove(dep)
        LOG.append(f"{n}. {sid} no longer after {dep}")


def link(sid: str, *refs: str, n: int) -> None:
    t = T(sid) if not sid.startswith("E.") else E(sid[2:])
    t.setdefault("links", [])
    added = [r for r in refs if r not in t["links"]]
    if added:
        t["links"].extend(added)
        LOG.append(f"{n}. {sid} links {', '.join(added)}")


def due(sid: str, date: str | None, n: int) -> None:
    t = T(sid)
    if t.get("due") != date:
        LOG.append(f"{n}. {sid} due {t.get('due')} becomes {date}")
        t["due"] = date


def retitle(sid: str, title: str, n: int) -> None:
    t = T(sid)
    if t["title"] != title:
        LOG.append(f"{n}. {sid} retitled: {title}")
        t["title"] = title


def tag(sid: str, *tags: str, n: int) -> None:
    t = T(sid)
    t.setdefault("tags", [])
    added = [x for x in tags if x not in t["tags"]]
    if added:
        t["tags"].extend(added)
        LOG.append(f"{n}. {sid} tagged {', '.join(added)}")


def who(sid: str, value: str, n: int) -> None:
    t = T(sid)
    if t.get("who") != value:
        LOG.append(f"{n}. {sid} who {t.get('who')} becomes {value}")
        t["who"] = value


def desc(what: str, why: str, done: str, unlocks: str, depends: str, extra: str = "") -> str:
    return (
        f"## What\n{what}\n\n## Why\n{why}\n\n## Done looks like\n{done}\n\n## Unlocks\n{unlocks}\n\n## Depends on\n{depends}"
        + (f"\n\n{extra}" if extra else "")
    )


def step(sid: str, title: str, where: str, body: str, expect: str, minutes: int, block: str | None = None, irreversible: bool = False) -> dict:
    s = {
        "id": sid,
        "title": title,
        "actor": "you",
        "minutes": minutes,
        "where": {"label": where, "kind": "page"},
        "body_html": f"<p>{body}</p>",
        "expect_html": f"<p>{expect}</p>",
    }
    if block:
        s["blocks"] = [{"label": "value", "text": block, "kind": "value"}]
    if irreversible:
        s["irreversible"] = True
    return s


def guide(slug: str, title: str, answer: str, phases: list[tuple[str, int, list[dict]]], unlocks: list[str], to_hand: list[str]) -> dict:
    return {
        "format": "field-guide",
        "slug": slug,
        "kind": "setup",
        "title": title,
        "version": 1,
        "intro": {
            "answer": answer,
            "unlocks": unlocks,
            "to_hand": to_hand,
            "time": f"about {sum(p[1] for p in phases)} minutes in {len(phases)} sitting{'s' if len(phases) > 1 else ''}",
            "cost": "nothing",
            "last_verified": "2026-11-28",
            "sources": [],
        },
        "phases": [{"id": str(i + 1), "title": p[0], "minutes": p[1], "steps": p[2]} for i, p in enumerate(phases)],
        "finish_html": "<p>Done. Paste the hand-back to Claude.</p>",
        "handback_prompt": f"I finished {title}. Read my answers on this ticket and carry on.",
        "tested": {},
    }


def add_ticket(stem: str, t: dict, n: int, before: str | None = None) -> None:
    if t["sid"] in BY_SID:
        return
    t.setdefault("after", [])
    t.setdefault("links", [])
    t.setdefault("tags", [stem])
    t.setdefault("steps_definition", None)
    t.setdefault("due", None)
    tickets = FILES[stem]["tickets"]
    if before and before in BY_SID:
        idx = next(i for i, x in enumerate(tickets) if x["sid"] == before)
        tickets.insert(idx, t)
    else:
        tickets.append(t)
    BY_SID[t["sid"]] = (stem, t)
    LOG.append(f"{n}. new ticket {t['sid']}: {t['title']}")


def drop_ticket(sid: str, replace_with: str | None, n: int) -> None:
    if sid not in BY_SID:
        return
    stem, t = BY_SID[sid]
    FILES[stem]["tickets"] = [x for x in FILES[stem]["tickets"] if x["sid"] != sid]
    del BY_SID[sid]
    for _, other in BY_SID.values():
        for field in ("after", "links"):
            lst = other.get(field) or []
            if sid in lst:
                lst.remove(sid)
                if replace_with and replace_with not in lst and replace_with != other["sid"]:
                    lst.append(replace_with)
    for d in FILES.values():
        lst = d["epic"].get("links") or []
        if sid in lst:
            lst.remove(sid)
            if replace_with and replace_with not in lst:
                lst.append(replace_with)
    LOG.append(f"{n}. dropped {sid}" + (f" (references now point at {replace_with})" if replace_with else ""))


def move_ticket(sid: str, new_sid: str, to_stem: str, n: int) -> None:
    if sid not in BY_SID:
        return
    stem, t = BY_SID[sid]
    FILES[stem]["tickets"] = [x for x in FILES[stem]["tickets"] if x["sid"] != sid]
    del BY_SID[sid]
    t["sid"] = new_sid
    t["tags"] = [x for x in t.get("tags", []) if x != stem] + [to_stem]
    FILES[to_stem]["tickets"].append(t)
    BY_SID[new_sid] = (to_stem, t)
    for _, other in BY_SID.values():
        for field in ("after", "links"):
            lst = other.get(field) or []
            if sid in lst:
                lst[lst.index(sid)] = new_sid
    LOG.append(f"{n}. {sid} moved into E.{to_stem} as {new_sid}")


def existing(stem: str, key: str, append: str, n: int, set_epic: bool = False) -> None:
    ex = FILES[stem].setdefault("existing", [])
    if any(x["key"] == key for x in ex):
        return
    ex.append({"key": key, "set_epic": set_epic, "append": append})
    LOG.append(f"{n}. existing {key}: note appended")


# ---------------------------------------------------------------------------
# Blockers
# ---------------------------------------------------------------------------
# 1 mail history export before any deletion
add_ticket(
    "mail",
    {
        "sid": "mail.04a",
        "title": "Export every mailbox's history (17 addresses, both catch@ included) before anything is deleted",
        "kind": "setup",
        "points": 3,
        "who": "P",
        "description": desc(
            "A Field guide in two sittings. Every retiring mailbox's mail (me@, shopping@, travel@, pw@ on philwhelan.com; phil@, contact@ and the legacy creps@, ebay@, git@, int@ on sporebit.com; both catch@ mailboxes; the fixclothing.co.uk mailbox) is moved into phil@philwhelan.com under an old/<name> folder, or exported to an .mbox file in the encrypted backup where it does not fit. Message counts are written down before and after.",
            "Red team finding 1: section 1 answer 9 says move it all across, and the October plan had already made some of these mailboxes live login or reset addresses. Nothing may be deleted until the history is safe and the inventory (mail.03) says which addresses are still in use.",
            "Every retiring mailbox has a matching count in its old/<name> folder or an .mbox in the backup. The guide's answers hold the counts.",
            "mail.05 (deletions), mail.28 (legacy closures), mail.30 (fixclothing), mail.41 (done check).",
            "mail.06: the kept mailbox and its folders exist. mail.03: the inventory says which addresses are still in use.",
        ),
        "after": ["mail.06", "mail.03"],
        "tags": ["mail", "setup", "admin"],
        "steps_definition": guide(
            "mail-history-export",
            "Export every mailbox's history before anything is deleted",
            "Move each retiring mailbox's mail into phil@philwhelan.com under old/<name>, or export it to .mbox in the backup, and write the counts down. Nothing is deleted in this guide.",
            [
                (
                    "Count and move the first half",
                    15,
                    [
                        step("1.1", "Write down the message count of each retiring mailbox", "IONOS Webmail, each mailbox in turn", "Open each retiring mailbox in webmail and note the total message count shown at the bottom of the folder list. Type the counts into the box, one per line.", "A count per mailbox in the answer box.", 5),
                        step("1.2", "Move the first mailbox's mail into old/<name>", "Mail app with both accounts added (see mail.05 sitting 1)", "Select all messages in the retiring mailbox's Inbox and drag them into phil@philwhelan.com's old/<name> folder. Repeat for Sent.", "The old/<name> folder shows the same count as step 1.1.", 10),
                    ],
                ),
                (
                    "Move the rest and check the counts",
                    15,
                    [
                        step("2.1", "Move the remaining mailboxes", "Mail app", "Repeat the move for each remaining mailbox, one at a time, into its own old/<name> folder. Where a mailbox will not fit, export it with the mail app's export (an .mbox file) into the encrypted backup folder instead and note the file name.", "Every retiring mailbox has an old/<name> folder or an .mbox file.", 12),
                        step("2.2", "Compare the counts", "Mail app", "Compare each old/<name> count with the count in step 1.1 and type any difference in the box.", "Every count matches, or the difference is explained.", 3),
                    ],
                ),
            ],
            ["mail.05", "mail.28", "mail.30", "mail.41"],
            ["IONOS login", "The mail app with both IONOS accounts added", "The encrypted backup folder"],
        ),
    },
    n=1,
    before="mail.05",
)
after("mail.05", "mail.03", "mail.04", "mail.04a", n=1)
note("mail.05", 1, "No address is deleted or stops forwarding while any inventory row (mail.03) still uses it; such addresses become forwards until their rows are moved (mail.24). Deletion comes only after mail.04a's counts match.")
after("mail.28", "mail.04a", n=1)
after("mail.41", "mail.04a", n=1)

# 2 the Gmail anchor
after("mail.08", "keys.06", n=2)
note("mail.08", 2, "First phase before anything else: name the anchor Gmail account; sign in; confirm two-factor, the recovery phone and the backup codes (codes into Proton Pass); confirm it is not the inaccessible address in mail.29. No recovery address is changed until the anchor has received a test mail. keys.06's census report is read first because the anchor's app password is known to sit in plain text on the PC.")

# 3 auto-renew belongs per domain, after the cull
note("keys.12", 3, "Auto-renew is removed from this account-level sitting: it is a per-domain, per-pound setting and belongs in keys.13 after the keep-or-drop sitting. Added here instead: the IONOS account's recovery email is the Gmail anchor (mail.08) before two-factor is enabled; registrar two-factor recovery codes go into Proton Pass.")
after("keys.12", "mail.08", n=3)
note("keys.13", 3, "Auto-renew on for the kept domains only; sporebit.store and sporebit.org stay set to not renew.")

# 4 the VPS is shared
retitle("keys.08", "Inventory of everything on the VPS: every tenant (old Mycelium agent, DropShipAuto, PolySnipe, StreetGuesser, anything else), what each listens on, what each costs; nothing switched off", n=4)
link("keys.08", "DSA-16", "POLY-6", "POLY-20", "SG-2", n=4)
note("keys.08", 4, "Four open production tickets (DSA-16, POLY-6, POLY-20, SG-2) show the VPS hosts DropShipAuto, PolySnipe and StreetGuesser as well as the old agent. Nothing is switched off in this ticket.")
who("keys.09", "PC", n=4)
note("keys.09", 4, "If port 3000 belongs to a live tenant it goes behind the reverse proxy or the VPN rather than being closed; closed only on Phil's word.")

# 5 the delete gate
after("rescue.06", "rescue.01", "rescue.02", "rescue.03", "rescue.05", n=5)
after("rescue.07", "rescue.04", n=5)
note("rescue.07", 5, "A project is deleted only after its own export and its own harvest check; one project per step, each a second-tap irreversible step.")

# 6 Microsoft alias
after("mail.16", "mail.07", "mail.08", n=6)
note("mail.16", 6, "Step order: 1 sign in with the Hotmail login; 2 confirm Gmail is a verified recovery address and Authenticator works; 3 confirm the Windows sign-in on the PC; 4 only then remove the alias (irreversible, second tap); 5 confirm the May attack's password change and session sign-out.")

# 7 Apple ID
after("mail.17", "mail.06", n=7)
note("mail.17", 7, "Step order: 1 send a test mail to phil@philwhelan.com and read it; 2 confirm the trusted phone number and set a recovery key or contact; 3 change the Apple ID on the iPhone itself, not the web (irreversible, second tap); 4 re-sign the Watch and any other Apple device; 5 PW-57's password change.")

# 8 router lock-out
note("net.06", 8, "A full config backup is taken and a restore of it rehearsed before the first applied change; every applied change has a one-step revert.")
note("net.07", 8, "Applied only while Phil is in the house with the admin page open on a wired or second device; the Trusted network is built last so the PC never loses its path.")
note("net.05", 8, "Check first: confirm which of the four-network design Asuswrt-Merlin on the RT-AX86U can do natively and which needs a script or a managed switch, before anything is built.")

# 9 VPN only
after("net.21", "sub.07", n=9)
note("net.21", 9, "The old route is removed only after the VPN has been used from outside the house on the PC, both phones and Kirsty's phone; the removal is its own final phase.")

# 10 lapsing domains
after("mail.30", "keys.10", "mail.03", n=10)
note("mail.30", 10, "Zero inventory rows and zero recovery addresses on fixclothing.co.uk before the mailbox goes.")
note("mail.35", 10, "The month-eleven ticket this creates carries H2.1's standing rule (no domain lapses while any address on it is a login or recovery address), the mail.32 public-trail list and the inventory count of rows still on the old domain; the lapse is a second-tap irreversible step.")

# 11 glasses money
note("glass.01", 11, "Each route priced. A route that needs a paid developer account or any subscription is not chosen without Phil's yes; the Pixel route (10.24) is the free fallback.")
note("glass.02", 11, "No paid account opened.")

# 12 DSA phone numbers
note("dsa.05", 12, "Priced and proposed; nothing bought. A phone number per store is a recurring cost the brief lists as open, not agreed.")
after("dsa.05", "fixf.34", n=12)

# ---------------------------------------------------------------------------
# High
# ---------------------------------------------------------------------------
note("keys.07", 13, "Before any deletion: confirm the Hotmail mailbox still holds that mail or the export has gone into the encrypted nightly backup; confirm the Proton Pass vault has every entry in the CSVs (row count). Each deletion is a second-tap irreversible step.")
note("phm.01", 14, "List what else the old project still holds (storage buckets, auth users, cron logs) and export it to claude/archive/ before phm.02.")
note("block.05", 15, "The Mycelium content is fetched only with the device's own session or device token; the unauthenticated block page shows the count and the quote only. No public endpoint.")
note("mail.15", 16, "Recovery codes go into the Proton Pass entry; a passkey is preferred where offered; unused accounts are closed (1.29).")
note("keys.13", 17, "DNSSEC only where IONOS both registers and hosts the zone; otherwise the DS record is published only after the zone is confirmed signed. Mail is tested in the same sitting.")
note("mail.05", 18, "philipwhelan@philwhelan.com (a forward) is kept as the seventeenth address: the catch-all (mail.07) points at it.")
note("mail.07", 18, "Test the chain end to end with a mail to a made-up old-domain address.")
for s in ("dsa.01", "dsa.02", "dsa.03", "dsa.04", "dsa.05", "dsa.06"):
    after(s, "fixf.34", n=19)
note("E.dsa", 19, "H6 [claude]: FixForward only until its first slice ships. Kept alive means the servers stay up and items are recorded; the build tickets wait for fixf.34. dsa.07 and the keys and security items stay live.")
# 20 the eBay split
retitle("mail.22", "Critical: eBay password rotated and 2FA on, before any FixForward automation touches the account", n=20)
note("mail.22", 20, "Split: this ticket is the password and two-factor only (H2.12), after mail.15 only, and blocks fixf.12. The address change is mail.22b.")
T("mail.22")["after"] = ["mail.15"]
add_ticket(
    "mail",
    {
        "sid": "mail.22b",
        "title": "Critical: eBay account to fixforward@sporebit.com",
        "kind": "task",
        "points": 1,
        "who": "P",
        "description": desc(
            "Change the eBay account's email to fixforward@sporebit.com once the address exists and the password and two-factor are done (mail.22).",
            "Red team finding 20: H2.12 asks for the password and two-factor before automation, not the address change; chaining the live test behind the address build would miss the FixForward dates.",
            "eBay shows fixforward@sporebit.com as the account email and a test notification arrives there.",
            "fixf.20 (offers).",
            "mail.05 (the address exists), mail.22 (password and two-factor).",
        ),
        "after": ["mail.05", "mail.22"],
        "tags": ["mail", "admin"],
    },
    n=20,
    before="mail.23",
)
fx = T("fixf.20")["after"]
if "mail.22" in fx:
    fx[fx.index("mail.22")] = "mail.22b"
    LOG.append("20. fixf.20 now after mail.22b instead of mail.22")
drop_after("fixf.13", "fixf.12", n=20)
after("fixf.13", "fixf.04", n=20)
# 21 the declined stopgap
t = T("baby.15")
if "(or the stopgap)" in t["title"]:
    t["title"] = t["title"].replace(" (or the stopgap)", "")
    LOG.append("21. baby.15 title no longer names the stopgap")
t["description"] = t["description"].replace("(or the stopgap)", "")
note("home.17", 21, "Trigger: if editor slice 2 (home.03) is not live by 2027-02-14, Phil is asked on the decisions review whether the nursery is designed on paper, in Floorplanner (the stopgap he declined), or the June date slips.")
# 22 one room at a time
after("home.17", "home.16", n=22)
note("home.17", 22, "If the bathroom is not finished by 2027-02-28 the nursery starts anyway as the one exception to one-room-at-a-time; Phil confirms on the decisions review.")
# 23 leave notices
due("baby.18", "2027-02-21", n=23)
if T("baby.20").get("due") not in ("2027-02-14", "2027-02-21"):
    due("baby.20", "2027-02-21", n=23)
note("baby.20", 23, "Statutory leave notice must be given by the end of the 15th week before the expected week of childbirth: 2027-03-06 for a 15 June due date, moving with MYC-182. MAT B1 is available from 20 weeks (about 2027-01-26).")
# 24 the monitor
note("baby.21", 24, "If net.14 is not done by 2027-04-11, buy a camera that works local-only on the LAN with no cloud account and add it to Home Assistant later. A cloud monitor is never the fallback. The net.14 dependency is a soft link.")
drop_after("baby.21", "net.14", n=24)
link("baby.21", "net.14", n=24)
# 25 bathroom budget
after("home.14", "home.09", n=25)
note("home.14", 25, "The bathroom's budget is the first row of home.09; items above it wait.")
# 26 garden budget
add_ticket(
    "garden",
    {
        "sid": "garden.00",
        "title": "Garden budget for March to May 2027 from the home pot; nothing bought above it",
        "kind": "task",
        "points": 1,
        "due": "2027-02-13",
        "who": "PK",
        "description": desc(
            "One sitting with Kirsty: the garden budget for the spring from the home pot. The May figure was about £100 a month. Written on this ticket and in Finance's pots.",
            "Red team finding 26: fourteen dated garden tickets buy seed, compound, membrane, gravel and treatment with no budget sitting.",
            "A figure on this ticket; every garden ticket that buys waits for it.",
            "Every garden ticket that buys something.",
            "garden.01: the design says what is needed.",
        ),
        "after": ["garden.01"],
        "tags": ["garden", "money"],
    },
    n=26,
    before="garden.01",
)
for s in [x for x in BY_SID if x.startswith("garden.") and x not in ("garden.00", "garden.01")]:
    after(s, "garden.00", n=26)
# 27 the printer
after("office.06", "baby.39", "home.16", "office.04", n=27)
# 28 drives
after("sub.11", "sub.01", n=28)
link("sub.11", "MYC-182", n=28)
note("sub.11", 28, "Drives bought only from the approved costed list (sub.01); MYC-182 asks about the backup drive.")
# 29 fitness owner-only
for s in [x for x in BY_SID if x.startswith("fit.")]:
    tag(s, "owner-only", n=29)
    note(s, 29, "Owner-only: never on the wall, never in a shared export, not visible to any other account (the run rule for H5 health tickets).")
note("E.fit", 29, "Every ticket in this epic is owner-only, not only the habit.")
# 30 the filter must exist
after("block.03", "sub.06", n=30)
retitle("sub.06", "Service: the DNS filter, wherever net.03 decided (Substrate, the router or hosted)", n=30)
note("sub.06", 30, "Moves epic if net.03's answer is not Substrate.")
note("net.03", 30, "A hosted filter is chosen only on a free tier or with Phil's yes to the cost.")
# 31 the medical display
note("fixf.15", 31, "The medical display row is imported as 'hold: ownership unconfirmed' and excluded from drafts until fixf.02 closes.")
link("fixf.02", "fixf.15", n=31)
# 32 MYC-170
link("mail.15", "MYC-170", n=32)
existing("mail", "MYC-170", "\n\n## Superseded\nSuperseded by mail.15 (the per-account routine, E.mail): the password half of this ticket is that routine. Close when mail.15 is live.", n=32)

# ---------------------------------------------------------------------------
# Medium
# ---------------------------------------------------------------------------
# 33 every garden Saturday is a baby weekend: the seven that can wait move past the quiet fortnight
for s, d in (("garden.04", "2027-07-17"), ("garden.05", "2027-07-24"), ("garden.06", "2027-07-31"), ("garden.08", "2027-08-07"), ("garden.11", "2027-08-14"), ("garden.12", "2027-08-21"), ("garden.13", "2027-08-28")):
    due(s, d, n=33)
    note(s, 33, "Moved past the birth and the quiet fortnight: every spring Saturday was a baby weekend. Phil can pull it forward on the decisions review.")
note("E.garden", 33, "This epic and the baby share every weekend from March to the birth; the baby wins. The design, the weeds, the lawn, the back corner and the safe strip stay in spring; the rest moved to July and August.")
# 34 hedge and nests
due("garden.03", "2027-02-27", n=34)
note("garden.03", 34, "Check for active nests first; if any, wait until August. Bird nesting season runs March to August.")
# 35 storage and the clear-out
due("home.10", "2027-01-02", n=35)
due("baby.07", "2027-01-09", n=35)
# 36 the pot
note("baby.03", 36, "Open the pot at the bank and start paying in now; the Mycelium tracking (fin.08) follows.")
# 37 the bag before the done check
due("baby.29", "2027-05-09", n=37)
after("baby.39", "baby.29", n=37)
# 38 the digest
drop_after("block.18", "sub.14", n=38)
after("block.18", "block.01", n=38)
note("block.18", 38, "First slice from Mycelium's existing feed pipeline (Finds); the Substrate reader (sub.14) becomes its source when it exists.")
link("sub.14", "block.18", n=38)
# 39 the monthly review runs on today's network
drop_after("net.24", "net.07", n=39)
# 40 Kirsty's invite gates three epics
move_ticket("brain.24", "unblock.03", "unblock", n=40)
due("unblock.03", "2027-01-17", n=40)
note("unblock.03", 40, "Until Kirsty has an account, her tickets are held in Phil's space marked 'for Kirsty'. Dated before baby.20 because baby prep, the household budget and the kitchen screen all need her (11.17).")
note("baby.20", 40, "Kirsty cannot see this ticket until unblock.03 (her invite) is done; until then it is held in Phil's space marked 'for Kirsty'.")
# 41 the tracker after the habit
after("tracker.02", "brain.26", n=41)
note("tracker.02", 41, "The build starts after the capture habit has held for 30 days (brain.26).")
# 42 Everlight
note("net.22", 42, "First step: ask Everlight IT in writing which remote route is permitted; no route until the answer.")
note("net.08", 42, "Revert path in the same sitting; if the laptop's own VPN or management agents stop working it goes back to Trusted and the question goes to IT.")
# 43 glasses risks
note("glass.03", 43, "Frames are owner-only and never in a shared export. A 'forget that' voice command deletes the last frame and the last minute of the thread. Frames are not kept while the work laptop's screen is in view; the command is how.")
note("glass.07", 43, "A merge, deploy, migration or push is read back in full with the branch and target named; one confirm word and one stop word, both chosen by Phil; no confirm accepted within 3 seconds of the read-back.")
# 44 export the FML today
add_ticket(
    "home",
    {
        "sid": "home.04a",
        "title": "Export the Floorplanner FML today and store it in the repo under docs/home/ and in Docs",
        "kind": "setup",
        "points": 1,
        "who": "P",
        "description": desc(
            "One sitting: export the Floorplanner project's FML file and commit it under docs/home/ in the Mycelium repo, with a copy attached to a Docs page.",
            "Red team finding 44: the only correct geometry lives in Floorplanner; a lapsed account or a changed export loses it. home.05 consumes this file.",
            "docs/home/<project>.fml is in the repo and the Docs page links it.",
            "home.02 (editor slice 1), home.05 (the FML import).",
            "Nothing.",
        ),
        "after": [],
        "tags": ["home", "setup"],
        "steps_definition": guide(
            "home-fml-export",
            "Export the Floorplanner FML",
            "Export the project's FML now and put it somewhere that cannot lapse.",
            [
                (
                    "Export and store",
                    12,
                    [
                        step("1.1", "Export the FML", "Floorplanner, the project, Export", "Open the project, choose Export and pick the FML (JSON) option. Save the file to the Downloads folder.", "A file ending .fml (or .json) is in Downloads.", 5),
                        step("1.2", "Hand the file to Claude Code", "The Mycelium repo in Claude Code", "Move the file into docs/home/ in the repo and ask Claude Code to commit it and attach it to a Docs page.", "git log shows the commit and the Docs page shows the file.", 7, block="Commit docs/home/*.fml as 'Home: the Floorplanner FML export' and attach it to a Docs page in HOME"),
                    ],
                )
            ],
            ["home.02", "home.05"],
            ["Floorplanner login"],
        ),
    },
    n=44,
    before="home.05",
)
after("home.02", "home.04a", n=44)
note("home.05", 44, "Consumes the file home.04a stored, not a fresh export.")
# 45 the MCU project
link("sub.12", "MCU-4", "MCU-5", "MCU-6", n=45)
note("sub.12", 45, "Nothing deleted from iCloud or staging (MCU-6) until the three-month decision.")
link("sub.13", "MCU-7", "MCU-9", n=45)
link("sub.14", "MCU-11", "MCU-12", n=45)
# 46 DSA tokens
after("keys.03", "keys.08", n=46)
note("keys.03", 46, "The running services receive the new tokens in the same sitting; DSA's health is checked after.")
# 47 mood boards
drop_after("home.08", "home.04", n=47)
after("home.08", "home.01", n=47)
link("home.04", "home.08", n=47)
# 48 retired means kept
note("fin.13", 48, "Retired means read-only and kept in Drive; row counts compared after import; nothing deleted.")
note("brain.08", 48, "Retired means read-only and kept in Drive; row counts compared after import; nothing deleted.")
# 49 the prompts must exist
add_ticket(
    "rescue",
    {
        "sid": "rescue.00",
        "title": "Claude writes Prompt C (one-chat harvest) and Prompt D (project export) into claude/harvest-prompts-rescue.md",
        "kind": "task",
        "points": 2,
        "who": "C",
        "description": desc(
            "Write the two prompts the rescue guides ask Phil to paste, from the brief's description of them (H8), into claude/harvest-prompts-rescue.md, and recreate claude/harvest-review.md's purpose as a short header there.",
            "Red team finding 49: the files the brief names do not exist in the repo, and Phil cannot run a prompt that does not exist.",
            "Both prompts are in the file and each rescue guide links the exact section.",
            "rescue.01 to rescue.05.",
            "Nothing.",
        ),
        "after": [],
        "tags": ["rescue"],
    },
    n=49,
    before="rescue.01",
)
for s in ("rescue.01", "rescue.02", "rescue.03", "rescue.04", "rescue.05"):
    after(s, "rescue.00", n=49)
# 50 one job, one ticket: keys.06 is the first unblock item
drop_ticket("unblock.01", "keys.06", n=50)
if T("keys.06").get("epic_sid") != "E.unblock":
    T("keys.06")["epic_sid"] = "E.unblock"
    T("keys.06")["links"] = sorted(set((T("keys.06").get("links") or []) + ["E.keys"]))
    LOG.append("50. keys.06 sits under E.unblock (epic_sid) and keeps its SEC project and a link to E.keys")
note("E.unblock", 50, "keys.06 (the census files check) is the first item and sits under this epic; MYC-182 (the due date) is the second because 39 dates hang on it.")
# 51 alias fallback
note("mail.25", 51, "If the plan's alias limit is below the retailer count, the fallback is shop@ with sub-addressing for the remainder; no paid tier without Phil's yes.")
# 52 the assumed item
after("keys.09", "keys.02", n=52)
# 53 which wall
note("wall.02", 53, "The week is lived with the classic board (the one proved so far); wall.05 moves the tile grid onto the frame after it.")
note("wall.05", 53, "Moves the tile grid onto the frame after wall.02's week; adds a short greeting by time of day (6b).")

# ---------------------------------------------------------------------------
# Low
# ---------------------------------------------------------------------------
add_ticket(
    "vent",
    {
        "sid": "vent.06",
        "title": "Watch and file the YouTube video pasted beside Copilot Money in July",
        "kind": "task",
        "points": 1,
        "who": "P",
        "description": desc(
            "Two minutes: watch youtube.com/watch?v=CxdqE83kxxw and file one line on what it was and whether it changes anything (H3).",
            "A decided answer with no ticket (red team finding 54).",
            "One line on this ticket.",
            "Nothing.",
            "Nothing.",
        ),
        "tags": ["vent"],
    },
    n=54,
)
note("block.03", 55, "An off switch for Phil's profile, one tap, logged in the weekly count (9.8).")
add_ticket(
    "net",
    {
        "sid": "net.27",
        "title": "Child's network: later",
        "kind": "task",
        "points": 1,
        "who": "C",
        "description": desc(
            "A placeholder for the child's own network (2.20): a fifth network with its own filter profile and hours, designed when the first device appears.",
            "The brief decided it is a later ticket (red team finding 56).",
            "A design note on this ticket when the time comes.",
            "Nothing yet.",
            "net.07.",
        ),
        "after": ["net.07"],
        "tags": ["net"],
    },
    n=56,
)
add_ticket(
    "fin",
    {
        "sid": "fin.32",
        "title": "Test the three leak guesses (food and takeaways, tech, subscriptions) against the first month of the feed",
        "kind": "task",
        "points": 1,
        "who": "C",
        "description": desc(
            "Once a month of transactions is in, compare Phil's three guesses at where the money leaks with the categorised spend and write the answer on this ticket.",
            "4b says the guesses are to be tested against the data (red team finding 57).",
            "Three lines: guess, actual, difference.",
            "fin.03's second pass.",
            "fin.03.",
        ),
        "after": ["fin.03"],
        "tags": ["fin"],
    },
    n=57,
)
note("wall.22", 58, "Includes the PC-off test: everything works except controls and the PC voice (6.25).")
note("mail.06", 59, "Set up on iPhone Mail and the Pixel as well as webmail (1.22).")
add_ticket(
    "brain",
    {
        "sid": "brain.27",
        "title": "Check: the phone health import still runs, and what it feeds",
        "kind": "task",
        "points": 1,
        "who": "C",
        "description": desc(
            "Confirm the phone health import (11.16) still runs, when it last wrote, and which pages read it. One line on this ticket.",
            "A decided answer not carried (red team finding 60).",
            "Last run date and the readers listed.",
            "Nothing.",
            "Nothing.",
        ),
        "tags": ["brain"],
    },
    n=60,
)
after("baby.28", "baby.10", n=61)
note("baby.10", 61, "Research only; the conversation is baby.28.")
drop_ticket("keys.15", None, n=62)
link("fin.16", "keys.01", n=62)
drop_ticket("guide.02", None, n=62)
link("E.guide", "glass.12", n=62)
after("glass.02", "MYC-197", n=63)
link("mail.33", "PW-46", "MYC-167", n=64)
link("brain.06", "PW-46", "MYC-167", n=64)
link("brain.03", "MYC-168", n=64)
link("glass.02", "MYC-172", n=64)
link("glass.10", "MYC-206", n=64)
link("block.20", "PW-139", n=64)
link("brain.18", "PW-139", n=64)
link("wall.08", "PW-142", n=64)
link("E.home", "PW-142", n=64)
link("keys.14", "PHM-16", "PMW-2", n=64)
note("review.02", 64, "DAY-3 (narration), PW-76 and PW-77 (scratch maps) and GARDN-4 (fan) already exist as tickets: their rows say 'already a ticket' rather than 'undecided'.")
link("fit.03", "PW-141", n=64)
note("fixf.27", 66, "A signed webhook, POST only, eBay's signature verified; no GET. Decided by 3.19, like the Telegram webhook.")
note("mail.36", 67, "The check never copies a password into Mycelium; hashes or yes/no only.")
note("baby.35", 67, "Revocable link; no names, dates or address; items, prices and bought state only.")
note("sub.11", 67, "The backup encryption key is in Proton Pass and on paper in a second place; a backup whose key is lost is not a backup.")
note("repairs.01", 68, "The panel is a boundary repair outside the garden design rule (H4); Phil confirms on the decisions review.")
note("repairs.03", 68, "Garden-side repair outside the design rule (H4); Phil confirms on the decisions review.")
note("repairs.02", 69, "Quote first; Phil approves before booking.")
note("baby.25", 69, "Cost shown before booking.")
note("vent.04", 69, "Phil buys no domain.")
note("fin.24", 69, "The free statutory reports only.")
note("baby.07", 70, "A list of what left the room and where it went; nothing thrown away without both agreeing.")
note("office.03", 73, "The boards are built around the two fixed pieces (Phil's panels and desktop); everything else is Kirsty's pick.")
link("fixf.01", "fixf.28", n=74)
note("fin.23", 75, "Then everything, as answered (4.24).")
note("mail.09", 76, "alerts@ has its own folder and no notification; reports summarised weekly, not read raw.")

# ---------------------------------------------------------------------------
# Write back
# ---------------------------------------------------------------------------
for stem, data in FILES.items():
    with open(os.path.join(DIR, f"{stem}.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

print(f"{len(LOG)} changes")
for line in LOG:
    print("- " + line)
