# Digest: Baby preparation (new Work project)
Brief sections: Section 5, 5b, Family section prep lists note, H10 Family (undecided) bullet. Source A:\Projects\Mycelium\docs\intake\intake-2026-11-27.md. Dashes in quoted answers are the brief's own.

## 1. First answers

### Section 5: Baby preparation (new Work project; due June 2027; builds on the Family section's prep lists, 0171) (brief lines 147-176)

1. First child **for both of them**.
2. Buying: **safety items new (car seat, mattress), the rest used or handed down**.
3. Total budget: **not yet, first ticket prices the starter lists, then set with Kirsty**.
4. Paid from **a shared baby pot** (topic 4 pots); the household budget records who paid what.
5. Where the baby sleeps first six months: **undecided, research the options**.
6. The nursery room **needs clearing first**.
7. Car seat: **check fit in both cars (C220 and EQA), a base in each, one seat**.
8. Pram: **research first** against the car boots, streets and budget.
9. Feeding kit: **Kirsty decides** (a ticket for her); a minimal either-route kit until then.
10. Nappies: **disposable**.
11. Hand-me-downs: **unknown, a ticket to ask family before anything is bought**.
12. Gift list: **a shareable read-only page from the buying list**. `[claude]` this is a deliberately public GET (invariant: endpoints are not public unless decided), unguessable link, no personal data beyond the items.
13. Research: **a house-style comparison guide per big item** (car seat, pram, cot, mattress, monitor).
14. Safety: **one guardrail ticket first**, a researched rules page from official UK sources; each item ticket links its rule.
15. Timing: **spread month by month**, big items first.
16. Price watch: **yes, alert on a real drop** below a level he sets.
17. Monitor: **a local camera through Home Assistant** (depends on the self-hosting epic; cross-link and order accordingly).
18. Family prep lists that become tickets, all four: **nursery set-up, hospital bag, the buying list, getting the house ready**.
19. Admin tickets, all four: **paternity leave notice to work, antenatal classes, birth registration and documents, adding the baby to GP and insurance**.
20. Tickets live in **his own space until Kirsty joins** (her invite still waits for the UI rebuild). `[claude]` note: moving a project between spaces later re-keys its tickets (tickets-spec §17.7).
21. **Tickets for decisions and jobs; list rows for items** (the Family buying list keeps price, link, bought).
22. **A minimal starter set** of clothing and kit.
23. First weeks: **freezer meals, a help rota, a visitor plan** (three tickets).
24. **A handover-note ticket** before paternity leave (personal ticket only; work content stays out).
25. Cars: **both are fine**, no change-of-car ticket.
26. Kirsty's own items (her leave notice, appointments, paperwork): **ticket them all**.
27. Running total: **on the Family page plus a line in the payday summary**.
28. Worries: **the cost, forgetting something essential, leaving it too late**.
29. **Exception to "no dates": baby tickets are dated, worked back from the due date** (big items early, hospital bag late).
30. Done means: **everything essential in the house and set up a month before the due date**.

## 2. Round 2 extras

### Section 5b: Baby preparation, extras (brief lines 466-475)

- **What he would kick himself over:** the nursery still full; overspending on things not needed.
- **Dry-run tickets:** fit the car seat in both cars, timed; fold the pram into each boot; bags in the car with a "go" checklist by the door. (Not the night drive to the hospital.)
- **Ask three recent parents** what they wish they had and had not bought, before the big buys.
- **His own skills, tickets for all three:** a baby first-aid course; nappies, bathing and safe-sleep basics; supporting Kirsty in labour.
- **Nursery:** clearing it is the first dated ticket of the epic (after the home epic's storage ticket), nothing for the room bought until it is empty, **and** a clear-out weekend booked with Kirsty.
- **Overspend guard:** every item marked Need, Nice or Wait; only Need is bought before the birth; Wait reviewed a month after.
- **Baby technology:** research the evidence before any of it.
- **First fortnight at home:** Mycelium goes quiet, only the baby log and Kirsty's nudges; nothing counts as slipped.
- **Nights and first weeks:** one conversation ticket with the options laid out.
- **Make one thing by hand:** a ticket to choose it and a dated ticket to finish it.

## 3. Round 3 corrections and additions (these win)

### Backlog note (Family prep lists)

Family section 0171 holds prep lists: nursery, hospital bag, buying list; see claude/backlog.md

### Undecided, for the Keep or drop checklist only: H10 Family (brief lines 729)

- *Family:* the baby scan heartbeat audio (waiting on his timestamps of the remaining static); his grandad's playlist from his MP3 collection.

## 4. Flags marked [claude] that touch this epic

- Section 5 item 12 (brief line 158): 12. Gift list: **a shareable read-only page from the buying list**. `[claude]` this is a deliberately public GET (invariant: endpoints are not public unless decided), unguessable link, no personal data beyond the items.
- Section 5 item 20 (brief line 166): 20. Tickets live in **his own space until Kirsty joins** (her invite still waits for the UI rebuild). `[claude]` note: moving a project between spaces later re-keys its tickets (tickets-spec §17.7).

## 5. Assumed items

None.

## 6. Dates named for this epic

- Due June 2027 (section 5 heading, brief line 145).
- Done means: everything essential in the house and set up a month before the due date (answer 30, line 176).
- Baby tickets are dated, worked back from the due date: big items early, hospital bag late (answer 29, line 175).
- Clearing the nursery is the first dated ticket of the epic, after the home epic's storage ticket (5b, line 470).
- Wait items reviewed a month after the birth (5b, line 471).
- A handover-note ticket before paternity leave (answer 24, line 172).
- Ask three recent parents before the big buys (5b, line 469).
- First fortnight at home: Mycelium goes quiet, nothing counts as slipped (5b, line 473).

## 7. Cross-links to other epics

- home-3d-rooms: nursery clearing follows the storage ticket; nursery design must come before June (section 8 answers 24 and 30).
- substrate-self-hosting and dashboard-wall: monitor is a local camera through Home Assistant (section 5 answer 17), depends on self-hosting; baby log on the wall.
- finance: shared baby pot, running total on the Family page and in the payday summary, lower-income months, child money tickets.
- sec-home-network: baby monitor local only, live view over the VPN, never recorded (section 2 answer 25; 7 answer 27).
- glasses: "log to the baby log" is one of the first voice actions (section 10 answer 18).
