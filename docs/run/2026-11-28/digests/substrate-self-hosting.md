# Digest: Self-hosting (Substrate, new Work project)
Brief sections: Section 7, 7b, H2 item 3 (IONOS vs better home), H5 VM question line, H2 item 5 (old VPS, context). Source A:\Projects\Mycelium\docs\intake\intake-2026-11-27.md. Dashes in quoted answers are the brief's own.

## 1. First answers

### Section 7: Self-hosting (new Work project) (brief lines 213-242)

1. Why, all four: **cut monthly costs, privacy and owning his data, not depending on companies, learning and enjoyment**. (But see 18: not about cancelling anything.)
2. Host: **a separate always-on box**, not the main PC.
3. Spare parts: **enough for a whole machine**.
4. Budget: **decide after a costed list**.
5. House services, all four, plus Home Assistant: **network DNS filter, VPN, local camera recording, network monitoring and device alerts**.
6. Personal data, all four: **photo library with phone upload, files and sync, a media library for the TVs, backups of phones and computers**.
7. His projects: **the Mycelium PC worker, FixForward's background jobs, git hosting and build runners**.
8. Mycelium itself: **keeps the hybrid** (free cloud for the app and database, nothing at home exposed). Not reopened.
9. AI if the worker moves: **research power cost against benefit** (queue on server with AI left on the PC's RTX 4070, versus a spare GPU in the server).
10. Exposure: **nothing; VPN only**. Kirsty's phone gets the VPN.
11. Platform: **research, then he approves** (plain Linux with containers versus a VM host).
12. Linux comfort: **some experience; guides for anything new**.
13. Dependability: **house basics fail safe** — internet and light switches work with the server off; each house service gets a "what happens when it is off" test.
14. Backups: **second drive plus an encrypted off-site copy**.
15. Off-site: **a drive at a family member's house**.
16. Password manager: **stays on Proton Pass**.
17. Photos: **run beside the phones' cloud photos first**, decide after three months and a tested restore.
18. Paid services to cancel: **none — this is not about cancelling**.
19. For Kirsty: **invisible to her**; each family service has a "set up on Kirsty's phone" ticket and is not done until it works there untouched for a week.
20. Updates: **in the monthly review, snapshot first**.
21. Monitoring: **both** a push through Mycelium and a status page.
22. Power cut: **restart cleanly by itself**; tested by pulling the plug once.
23. Location: **beside the routers**.
24. Addresses: **names under sporebit.com with real certificates**, resolving only inside the house or over the VPN.
25. Sign-in: **each service's own login, kept in Proton Pass**.
26. Media library: **large; worth a proper library**.
27. Camera recording: **motion clips for a set number of days**, doorbell and outdoor cameras only; the baby monitor is live view, never recorded.
28. Docs: **config in a git repo plus a runbook per service in Docs**.
29. Order: **network needs first** — DNS filter and VPN, then Home Assistant, backups, photos and files, media, git, the worker.
30. Done means: **every chosen service runs 30 days without him touching it**.

## 2. Round 2 extras

### Section 7b: Self-hosting, extras (brief lines 491-500)

- **The server is called Substrate.**
- **Likely reason he would switch it off:** mainly it breaking things Kirsty relies on; also the upkeep eating evenings and a data-loss scare.
- **Power:** measure first with a plug-in meter for a week, then set a limit; the costed list includes the monthly figure.
- **Bus test:** it needs nothing for a month, and there is a printed "if it breaks" page for Kirsty; **a dated ticket before June** proves it by leaving it untouched for 30 days.
- **Noise:** silent or near it — shapes which spare parts are used.
- **Rule for anything Kirsty uses, both:** no change without a tested way back and never on a weeknight (one set window, snapshot, rehearsed one-step revert); and a separate "family" group of services touched only in the monthly review.
- **Learning:** build the first service by hand with a guide, then everything as code.
- **Also run:** a paperwork archive that reads and files scanned documents, a feed reader for the digest's sources, an ebook and audiobook library.
- **Rebuild promise, both:** a restore test per service at set-up, and a yearly timed rebuild drill on a spare drive.
- **Wider family access:** not now; a later ticket if photos take off.

## 3. Round 3 corrections and additions (these win)

### H2 item 3: Is there a better home than IONOS? (brief lines 614)

3. **"Is there a better home than IONOS?"** goes into the self-hosting epic as one research ticket: what runs on the VPS today, what Substrate replaces, and a registrar comparison. Mail stays at IONOS.

### H5 line: phone access, the VM question, SFTP (brief lines 662)

- **Phone access to Claude Code, the VM question, SFTP:** folded in. Phone access goes to the glasses epic's "steer Claude Code" work; the VM question to Substrate's platform research; SFTP dropped unless a site still needs it.

### H2 item 5: the first "Mycelium" on the IONOS VPS (context) (brief lines 616)

5. **The first "Mycelium" on the IONOS VPS** (May 2026: Postgres and FastAPI at `api.philwhelan.com`, an agent reading four IONOS inboxes hourly and writing to Google Calendar, a review queue, a watch list and a renewals table; stopped mid-build on 17 May). **Assumed** (unanswered): a ticket checks what it is doing now (is the agent still running, what has it spent, what is in the review queue), with "export its data, then switch it off" as the recommended outcome. Nothing is switched off without Phil's word.

## 4. Flags marked [claude] that touch this epic

None.

## 5. Assumed items

### H2 item 5: the old VPS (assumed) (brief lines 616)

5. **The first "Mycelium" on the IONOS VPS** (May 2026: Postgres and FastAPI at `api.philwhelan.com`, an agent reading four IONOS inboxes hourly and writing to Google Calendar, a review queue, a watch list and a renewals table; stopped mid-build on 17 May). **Assumed** (unanswered): a ticket checks what it is doing now (is the agent still running, what has it spent, what is in the review queue), with "export its data, then switch it off" as the recommended outcome. Nothing is switched off without Phil's word.

## 6. Dates named for this epic

- Done means: every chosen service runs 30 days without him touching it (section 7 answer 30, brief line 242).
- A dated ticket before June proves the 30-day hands-off test by leaving it untouched (7b, line 494).
- Photos run beside the phones' cloud photos first, decide after three months and a tested restore (answer 17, line 229).
- Power: measure first with a plug-in meter for a week (7b, line 493).
- Yearly timed rebuild drill on a spare drive (7b, line 499).
- Updates in the monthly review, snapshot first (answer 20, line 232).

## 7. Cross-links to other epics

- sec-home-network: DNS filter and VPN come first (section 7 answer 29), the network epic decides where the filter runs.
- dashboard-wall: Home Assistant is the control route for the wall (section 6 answer 10).
- baby: monitor is a local camera through Home Assistant, live view only.
- mail-email-migration: service names under sporebit.com (section 7 answer 24); alerts@ for server and backup reports (1b).
- mycelium-second-brain: PC worker move, backups, off-site drive at a family member's house (section 11 answer 24).
- sec-keys-and-domains: old VPS secrets and open port 3000 are handled there; the VPS stays up while DropShipAuto is kept alive (H6, line 669).
