# Dossier: E.baby, Baby (BABY)

*Written 2026-11-28 for the run of that day (Stream T, step T2). Every fact below that depends on a law, a product or a date carries the day it was checked. Plan section: §7. Digest: `digests/baby.md`. Ticket data: `tickets/baby.json`.*

## 1. What Phil decided

First child for both of them, due June 2027 (working date 2027-06-15; MYC-182 asks the real one and every baby date moves with it). Safety items (car seat, mattress) are bought new, the rest used or handed down; family is asked about hand-me-downs before anything is bought, and three recent parents are asked what they wish they had and had not bought. The total budget is set with Kirsty after the starter lists are priced, and paid from a shared baby pot with who paid what in the household budget and a running total on the Family page and in the payday summary. Every list item is marked Need, Nice or Wait; only Need is bought before the birth and Wait is reviewed a month after. One guardrail ticket comes first: a rules page from official UK sources that each item ticket links. A comparison guide is written per big item (car seat, pram, cot, mattress, monitor). The car seat must fit both cars (the C220 and the EQA) with a base in each and one seat; the pram is researched against both boots, the streets and the budget; where the baby sleeps for six months is researched; the monitor is a local camera through Home Assistant, live only, over the VPN, and the evidence on baby technology is read first. Nappies are disposable; feeding is Kirsty's decision. The nursery is cleared first, after the home epic's storage ticket, on a weekend booked with Kirsty, and nothing for the room is bought until it is empty. Admin: paternity leave notice, antenatal classes, birth registration and documents, the GP and insurance; Kirsty's own items each get a ticket. Skills: a baby first-aid course, nappies, bathing and safe sleep, supporting Kirsty in labour. First weeks: freezer meals, a help rota, a visitor plan; the first fortnight at home is quiet in Mycelium and nothing counts as slipped. A gift list is a shareable read-only page (the one decided public endpoint), and a price watch alerts on a real drop. Baby tickets are the exception to "no dates": dated, worked back from the due date, big items early, the hospital bag late. Done means everything essential in the house and set up a month before the due date.

## 2. His kit and constraints

- **Cars:** a Mercedes C220 (generation not stated: W205, 2014 to 2021, or W206, 2021 on; body style not stated) and a Mercedes EQA. "Both are fine", no change of car.
- **Family section (0171), built 2026-11-20:** `/family` with tabs timeline, calendar, baby, names, lists, letters, home, budget. Three starter prep lists seeded from `lib/family/starter.ts`, 45 rows, no prices: **Hospital bag** (18 rows), **Nursery** (12 rows: cot or Moses basket, new mattress, fitted sheets, sleeping bags, room thermometer, baby monitor, changing mat, drawers, blackout blind, night light, feeding chair, nappy bin), **Buying list** (15 rows: pram, car seat, sling, newborn nappies, wipes, nappy cream, vests and sleepsuits, bibs and muslins, bath support, towels, thermometer, nail clippers, bottles and steriliser if using, breast pump if using, changing bag). Each row (`family_list_items`) holds title, price, quantity, bought, bought by, bought at, link, note. The sheet is edited in place (Enter moves down, Tab across), which suits Phil. There is no "getting the house ready" list, so baby.30 is a ticket with its own steps.
- **Family calendar:** "Phirsty Life" on Google, two-way with the in-app calendar, Phil and Kirsty only.
- **Household budget** in the family space records who paid what; Phil's own Finance stays private and never on the wall.
- **Kirsty** is not yet in Mycelium (her invite waits for the UI rebuild), so her tickets sit in Phil's space.
- **Home Assistant** does not exist yet (sub.08); the cameras network and VPN viewing come from net.14 and sub.07.
- **Location:** South Yorkshire (used only to name first-aid and antenatal providers; no address used anywhere).

## 3. What the research found

### 3.1 Car seats (baby.01, baby.08, baby.13, baby.24)
- Only approved seats may be used in the UK. Height-based seats carry a capital E in a circle and **R129**; weight-based seats carry the E and **ECE R44**. Height-based seats **must be rear facing until the child is over 15 months**. Front airbags must be deactivated before fitting a rear-facing seat in a front seat. Children need a seat until 12 years old or 135 cm, whichever is first. Manufacturers may now only make booster cushions approved as group 3. [1] (checked 2026-11-28)
- RoSPA advises against second-hand seats because their history cannot be verified; only accept one from family or friends with a known history and its instructions. [2] (checked 2026-11-28) Phil chose new for all safety items, which is stricter.
- i-Size seats are meant to fit i-Size seating positions, but not every car position is i-Size compatible; the vehicle handbook and the seat maker's vehicle fit list decide. Makers' fit tools: Britax Römer Fit Finder, Maxi-Cosi's vehicle advisor; Cybex lists compatible vehicles per seat. [3] (checked 2026-11-28)
- **Mercedes:** the owner's manuals (other models, same wording family) say an ISOFIX or i-Size seat is preferred and a rear seat should be used where possible; on the front passenger seat the airbag status must be correct and some models have automatic passenger airbag shut-off with a PASSENGER AIR BAG OFF lamp; forward-facing seats use the Top Tether. [4] (checked 2026-11-28). **The C220 (W205 or W206) and EQA i-Size seat tables could not be read** (the Mercedes online manual refused the fetch): which rear seats are i-Size, whether a support leg may stand over any underfloor storage, and the EQA's position table are **UNVERIFIED**. baby.24 step 1.1 has Phil read the handbook in the car, and baby.08 asks the cars' years and body styles before shortlisting.
- Sensible shortlist rule for baby.08: new R129 infant carrier, base listed for both cars on the maker's fit list, two bases of the same model.

### 3.2 Safe sleep (baby.01, baby.10, baby.11, baby.16, baby.22, baby.26)
- Lullaby Trust: on the back for every sleep; a clear cot; **in the same room as the parents for at least the first six months**; follow the advice to 12 months. [5] (checked 2026-11-28)
- Room 16 to 20°C; use a room thermometer where the baby sleeps; no hats indoors; the Trust gives no tog chart (check the chest or back of the neck). [6] (checked 2026-11-28)
- This matters for the plan: the nursery is not where the baby sleeps for the first six months, so the sleep place (Moses basket, bedside crib or cot) goes in the main bedroom, and a full cot may be a Wait item.

### 3.3 Mattresses, cots, bedding (baby.11, baby.16)
- Firm, flat, waterproof cover, the head sinks no more than a few millimetres; fits the basket or cot properly with no gaps; **buy a new mattress for each baby**. Standards: **BS 7177:2008+A1:2011** (fire), and **BS EN 16890:2017+A1:2021** for cot, travel cot and crib mattresses. Sleeping bags to **BS EN 16781:2018**, chosen by the baby's weight. No pillows, duvets, bumpers or weighted products. [7] (checked 2026-11-28)
- BS EN 16890:2017 partially supersedes BS 1877-10:2011+A1:2012, which still appears on labels and can still be used for pram and Moses basket mattresses. [8] (checked 2026-11-28)
- Cots: **BS EN 716-1:2017** (with its 2019 corrigendum) is current; it does not cover carry cots, cribs and cradles, which have their own standard (BS EN 1130 is believed to be it: **UNVERIFIED**). [9] (checked 2026-11-28)
- A used pram's carrycot mattress counts as a mattress under Phil's rule; baby.14 says buy it new.

### 3.4 Monitors and baby technology (baby.12, baby.21)
- Lullaby Trust: "there is no research showing they help prevent SIDS"; a monitor never replaces supervision; movement monitors alarm after about 20 seconds without movement and are unreliable when co-sleeping; its CONI programme does not use vital-sign (pulse oximetry) monitors or Wi-Fi-dependent monitors. [10] (checked 2026-11-28)
- This supports Phil's choice of a plain local camera with no cloud account, and the "evidence first" ticket.

### 3.5 Antenatal classes (baby.19)
- NHS: classes usually start **8 to 10 weeks before the birth**, weekly for about two hours, free, found through the midwife, health visitor or GP; some welcome a partner. [11] (checked 2026-11-28) For 2027-06-15 that is about 2027-04-06 to 2027-04-20.
- NCT runs paid courses in Sheffield and Rotherham for set due-date ranges; NCT says most parents book **around 16 weeks** of pregnancy (about 2026-12-29 here) and courses can fill; a course ending about three weeks before the due date is suggested; about £239 was listed for some Sheffield courses. [12] (checked 2026-11-28)

### 3.6 Paternity and maternity notice (baby.18, baby.20)
- Paternity: tell the employer the due date **at least 15 weeks before the baby is expected**, the leave start and whether one or two weeks; confirm the dates **at least 28 days** before each period. [13] (checked 2026-11-28)
- Paternity leave is a right **from the first day of employment**; Statutory Paternity Pay needs 26 weeks' continuous employment by the end of the **qualifying week (the 15th week before the due week)** and average earnings of at least £129 a week. [14] (checked 2026-11-28)
- Working the dates: 2027-06-15 is a Tuesday; the expected week of childbirth starts **Sunday 2027-06-13**; the 15th week before it runs **2027-02-28 to Saturday 2027-03-06**. The notice is due by 2027-03-06.
- Maternity (Kirsty): tell the employer at least 15 weeks before the due date (same deadline), the employer replies within 28 days; SMP needs 28 days' notice and proof of pregnancy; the **MATB1** is issued no more than 20 weeks before the due date (from about 2027-01-26). [15] (checked 2026-11-28)

### 3.7 Birth registration (baby.34)
- All births in England must be registered **within 42 days** (by 2027-07-27 for a birth on 2027-06-15) at the register office for the area where the baby was born, or at the hospital if it offers registration; take the red book and proof of identity. [16] (checked 2026-11-28)
- Married or civil-partner parents: either can register alone. Unmarried: both names go on only if they register together, or one completes a statutory declaration of parentage that the other takes, or with a court document. [17] (checked 2026-11-28). Whether Phil and Kirsty are married is not in the brief, so baby.34 makes it a step.

### 3.8 GP registration (baby.34)
- A child under 16 is registered by a parent on a separate form, online, in the NHS App or on paper; proof of identity such as the birth certificate may be asked for; the red book helps; usually confirmed within 5 days. [18] (checked 2026-11-28)
- The newborn physical examination is done before 72 hours, and the GP offers it again at **6 to 8 weeks**; registering the baby lets the surgery book it. [19] (checked 2026-11-28)

### 3.9 Child Benefit (fin.21, linked only)
- Claim from 48 hours after registering the birth; backdated up to 3 months from the claim date. [20] (checked 2026-11-28). The claim, the savings account and the High Income Child Benefit Charge belong to fin.21; baby.34 only points to it.

### 3.10 Pram and boots (baby.09, baby.14, baby.24)
- Which?: 12 per cent of parents said their pushchair did not fit their boot; check folded and unfolded size; three-wheelers are often too bulky. [21] (checked 2026-11-28)
- Boots: EQA about 340 litres seats up [22]; C-Class W206 saloon about 455 litres, W206 estate about 460, W205 estate about 490 [23] (checked 2026-11-28). Litres do not decide fit; the opening and floor depth do, so baby.24 phase 3 measures them.
- Carrycot fit separately from the chassis is commonly reported as the catch: **UNVERIFIED** (forum level only).

### 3.11 Baby first-aid providers, South Yorkshire (baby.25; names only, nothing booked)
- **Mini First Aid** (Sheffield, Rotherham, Barnsley and Wakefield): two-hour baby and child class; about £25 a person seen on an adult page (**UNVERIFIED** for the baby class). [24]
- **Daisy First Aid** (Rotherham), **KeepaBeat First Aid** (Doncaster). [25]
- **British Red Cross**: paid baby and child courses; free online baby and child first-aid pages and an app. [26]
- **St John Ambulance**: a free Child and Infant Awareness eLearning was found through St John Ambulance Cymru; an England equivalent is **UNVERIFIED**. [27] (all checked 2026-11-28)

### 3.12 The gift list (baby.35)
- The only decided public endpoint in the plan (5.12). Invariants carried on the ticket: an unguessable random token (at least 128 bits) in the link, never an id; items only (title, quantity, optional shop link) for chosen rows, bought rows hidden; plain GET, no writes, no cookies, noindex and no-referrer, rate-limited; revocable at once from the Lists tab, a new link being a new token; tests for isolation, revocation and the response fields.

## 4. Risks

- **Money:** overspend on things not needed (Phil's own worry). Mitigation: baby.02 budget, baby.06 Need, Nice or Wait, baby.03 running total, baby.36 price watch, baby.38 Wait review. Nothing is bought in this run; every Buy ticket's payment step is marked irreversible.
- **Losing pay or a legal right:** the paternity and maternity notices have a fixed legal deadline (2027-03-06 for this due date). Mitigation: baby.18 and baby.20 dated before it, and MYC-182's answer recomputes the deadline (the formula is on the ticket).
- **Safety:** a seat that does not fit a car, a second-hand mattress, a gap round a mattress, a tipping chest of drawers, blind cords. Mitigation: baby.01 rules, maker fit lists in baby.08 and baby.13, the labels and fit checks in baby.16, the dry run in baby.24, anti-tip strap and cords in baby.22.
- **Privacy (Kirsty-facing):** the gift list is public. Mitigation: items only, revocable, tested (baby.35). The monitor is local only, never recorded, no cloud account (baby.21, net.14).
- **Lock-out:** none in this epic. Moving the project into a family space later re-keys tickets (5.20 flag).
- **Leaving it too late:** dates are worked back with big items early; baby.39 on 2027-05-15 catches anything missing and makes a dated ticket for it.

## 5. Facts that differ from the plan

- **baby.18 (Paternity leave notice), plan date 2027-03-28:** too late. GOV.UK requires notice at least 15 weeks before the baby is expected; for a 2027-06-15 due date the deadline is Saturday 2027-03-06. The JSON dates baby.18 **2027-02-21** (the cautious version). The integrator should confirm and correct plan §7.
- **baby.20 (Kirsty's own items), plan date 2027-03-28:** the maternity leave notice inside it has the same 2027-03-06 deadline, and the MATB1 is available from about 2027-01-26. The JSON dates baby.20 **2027-02-14** so her tickets exist in time. Integrator to confirm.
- **baby.19 (Antenatal classes), plan date 2027-03-14:** fine for the free NHS classes (they start about 2027-04-06 to 2027-04-20), but NCT says most people book around 16 weeks (about 2026-12-29) and Sheffield courses fill. Kept at the plan date; if Phil and Kirsty want an NCT course, the date should move to early January 2027. Question for the integrator or Phil.
- **baby.10, baby.15, baby.16, baby.22 (sleep and nursery):** the Lullaby Trust says the baby sleeps in the parents' room for at least six months, so the first sleep place is in the main bedroom, not the nursery. The plan's titles stand, but the cot may become a Wait item if a crib is chosen; baby.10 and baby.11 say so.
- **baby.06 (Need, Nice or Wait):** the Family list rows have no Need, Nice or Wait column and no target-price column (`family_list_items` has title, price, qty, bought, bought by, bought at, link, note). The tickets use the note cell as a stopgap; baby.36 adds a target price field. No ticket in the plan adds a proper Need, Nice or Wait column: the integrator may want one small C task, or accept the note.
- **baby.36 (Price watch):** no route to read retailer prices is decided; scraping may breach a retailer's terms (the same concern as plan §27 point 4 for FixForward). The ticket makes Claude propose the route and Phil approve it before any fetching is built.
- **baby.07 (Nursery cleared):** the digest says clearing the nursery is "the first dated ticket of the epic", but in the plan baby.01, baby.02 and baby.04 are dated earlier (2026-12-13 and 2026-12-20) and baby.07 is 2027-01-31 because it waits for home.10. The plan's reading (guardrail first, as 5.14 says) is kept; the red team may want to note it.
- **No "getting the house ready" list exists** in the Family section's starter lists (only Hospital bag, Nursery, Buying list), although Phil named four prep lists. baby.30 carries its own steps instead.
- **Extra blocking dependencies written in the JSON, not in the plan:** baby.03 after baby.02 (it reads the budget figure), baby.31 after baby.30 (freezer space), baby.33 after baby.18 (leave notice first). All fit the dates.
- **Car seat facts for the two cars are UNVERIFIED:** the C220's generation and body style are not in the brief, and the Mercedes manual pages could not be fetched. baby.08 asks Phil first.

## 6. Sources

1. https://www.gov.uk/child-car-seats-the-rules, GOV.UK: Child car seats, the rules (checked 2026-11-28)
2. https://childcarseats.org.uk/choosing-using/second-hand-child-seats/, RoSPA Child Car Seats: second-hand seats (checked 2026-11-28)
3. https://www.childcarseats.org.uk/choosing-using/child-car-seat-fitting-and-compatibility/, RoSPA Child Car Seats: fitting and compatibility; https://www.which.co.uk/reviews/child-car-seats/article/i-size-child-car-seats-explained-aTtO35C7FGbr, Which?: i-Size explained (checked 2026-11-28)
4. https://moba.i.mercedes-benz.com/baix/cars/463_comand_2019_a/en_GB/page/ID_86219203eeb820ab354ae3655d746ddb-8da588002f8b9958354ae365646c217d-en-GB.html, Mercedes-Benz owner's manual (G-Class): ISOFIX or i-Size mounting brackets, as search excerpt; https://moba.i.mercedes-benz.com/baix/cars/213.2_comand_2017/en_GB/page/5b7a648b4c8f11e59d7bdbd2949fc776.html, Mercedes-Benz owner's manual (E-Class): children in the vehicle (checked 2026-11-28; pages refused direct fetch)
5. https://www.lullabytrust.org.uk/baby-safety/safer-sleep-information/, The Lullaby Trust: safer sleep information (checked 2026-11-28)
6. https://www.lullabytrust.org.uk/baby-safety/safer-sleep-information/room-temperature/, The Lullaby Trust: room temperature (checked 2026-11-28)
7. https://www.lullabytrust.org.uk/baby-safety/baby-product-information/mattresses-and-bedding/, The Lullaby Trust: mattresses and bedding (checked 2026-11-28)
8. https://knowledge.bsigroup.com/products/childrens-furniture-mattresses-for-cots-and-cribs-safety-requirements-and-test-methods, BSI: BS EN 16890; https://knowledge.bsigroup.com/products/domestic-bedding-specification-for-mattresses-and-bumpers-for-children-s-cots-perambulators-and-similar-domestic-articles, BSI: BS 1877-10 (checked 2026-11-28)
9. https://knowledge.bsigroup.com/products/furniture-childrens-cots-and-folding-cots-for-domestic-use-safety-requirements-1, BSI: BS EN 716-1 (checked 2026-11-28)
10. https://www.lullabytrust.org.uk/baby-safety/baby-product-information/baby-monitors/, The Lullaby Trust: baby monitors (checked 2026-11-28)
11. https://www.nhs.uk/pregnancy/labour-and-birth/preparing-for-the-birth/antenatal-classes/, NHS: antenatal classes (checked 2026-11-28)
12. https://www.nct.org.uk/courses-workshops/locations/sheffield-rotherham-antenatal-classes, NCT: Sheffield and Rotherham antenatal classes; https://www.nct.org.uk/courses-workshops/nct-antenatal-course/frequently-asked-questions, NCT: antenatal course FAQ (checked 2026-11-28)
13. https://www.gov.uk/paternity-pay-leave/how-to-claim, GOV.UK: Paternity pay and leave, how to claim (checked 2026-11-28)
14. https://www.gov.uk/paternity-pay-leave/eligibility, GOV.UK: Paternity pay and leave, eligibility (checked 2026-11-28)
15. https://www.gov.uk/maternity-pay-leave/how-to-claim, GOV.UK: Maternity pay and leave, how to claim (checked 2026-11-28)
16. https://www.gov.uk/register-birth, GOV.UK: Register a birth (checked 2026-11-28)
17. https://www.gov.uk/register-birth/who-can-register-a-birth, GOV.UK: Who can register a birth (checked 2026-11-28)
18. https://www.nhs.uk/nhs-services/gps/how-to-register-with-a-gp-surgery/, NHS: how to register with a GP surgery (checked 2026-11-28)
19. https://www.nhs.uk/conditions/baby/newborn-screening/physical-examination/, NHS: newborn physical examination (checked 2026-11-28)
20. https://www.gov.uk/child-benefit/how-to-claim, GOV.UK: Child Benefit, how to claim (checked 2026-11-28)
21. https://www.which.co.uk/news/article/parents-reveal-biggest-pushchair-purchase-regrets-agNDi5V1iu1V, Which?: parents reveal biggest pushchair purchase regrets (checked 2026-11-28)
22. https://drivingelectric.com/mercedes-benz/eqa/practicality, Driving Electric: Mercedes EQA practicality and boot space (checked 2026-11-28)
23. https://www.cinch.co.uk/guides/choosing-a-car/mercedes-c-class-boot-space, cinch: Mercedes C-Class boot space; https://www.carbuyer.co.uk/reviews/mercedes/cclass/estate/practicality, Carbuyer: C-Class Estate 2014 to 2021 practicality (checked 2026-11-28)
24. https://sheffield.minifirstaid.co.uk/, Mini First Aid Sheffield (checked 2026-11-28)
25. https://bookwhen.com/dfarotherham, Daisy First Aid Rotherham; https://happity.co.uk/south-yorkshire/c/baby-first-aid, Happity: baby first aid classes near South Yorkshire (checked 2026-11-28)
26. https://www.redcross.org.uk/first-aid/learn-first-aid-for-babies-and-children, British Red Cross: first aid for babies and children (checked 2026-11-28)
27. https://sjacymru.org.uk/en/courses/BATO, St John Ambulance Cymru: Child and Infant Awareness online (checked 2026-11-28)
