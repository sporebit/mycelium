# Neurodivergent design research — rules for Mycelium

*Researched 2026-11-20. Evidence labels: **strong** (meta-analysis or several controlled studies), **moderate** (some controlled or large observational work), **weak** (small or qualitative), **anecdotal** (clinician opinion, user reports). Numbers in brackets point to Sources.*

## 1. Verdict

The plan is mostly pointed the right way: it externalises time, memory and motivation at the moment of action, which is the best-supported idea in this field [6][7]. The strong evidence backs four things — make time visible, pay the reward immediately, turn intentions into if-then plans, and record progress where someone can see it [1][3][4][8]. The plan's weak points are where it adds pressure or volume: unlimited partner nudges, a multi-agent chat, a dormant-feature display that opens as a wall of neglect, any streak that can break, and two unbounded queues (captures, overdue). Those work against the mechanisms that actually stop him — delay aversion, shame after a lapse, and overload [9][26][29]. The governing rule is that the tool must never require the function it is compensating for: it has to arrive by itself, cost under a minute, and carry no debt when he comes back after a gap. One further risk is not in the literature but is in his own rules: building the landscape is more interesting than using the loop.

## 2. Key mechanisms

| Mechanism | What it means for design | Strength |
|---|---|---|
| Point of performance | Knowing what to do is not the problem; doing it at the right moment is. Put cues, time and consequences where the action happens [6]. NICE puts environmental changes ahead of medication for adults [7]. | Moderate (theory plus guideline; few direct trials) |
| Time blindness | A 55-study meta-analysis found less accurate and more variable time estimation in ADHD [4]. Time has to be shown, not felt. | Strong |
| Delay discounting | Across 21 studies people with ADHD devalue later rewards more steeply (d = 0.43) [3]. Rewards must land at completion. | Strong |
| If-then plans | Across 94 tests, when-where-how plans improved goal attainment (d = 0.65), including getting started [1]. Small studies of boys with ADHD brought performance level with peers [2]. | Strong generally; moderate in ADHD |
| Self-set intentions | Adults with ADHD formed and carried out fewer of their own intentions in daily life; the usual reason given was not feeling like it [5]. Event cues beat remembering. | Moderate |
| Progress monitoring | 138 studies: tracking helps, more so when recorded physically or seen by others [8]. | Strong |
| Body doubling | Popular and plausible; evidence is surveys, a provider-commissioned study and a 12-person pilot. No controlled trial in adults with ADHD [30]. | Weak |
| Partner influence | Supportive prompting relates to behaviour change; pressure relates to worse mood, hiding and doing the opposite [29]. | Moderate |
| Streaks | Seven studies: an intact streak raises repetition; a broken one lowers it, more so when self-blamed, less so when repairable [9]. Tracking can turn a liked activity into a chore [10]. | Moderate |
| Gamification novelty | Effects dipped from about week four and only partly recovered [11]; motivational effects were unstable under stricter analysis [12]. | Moderate |
| Notifications | Two micro-randomised trials: a push raises engagement in the next hours, and the lift fades within a day [13][14]. Neither tested a daily cap. | Moderate |
| Scroll friction | A short delay with a way out cut target-app openings by 57% over six weeks; the delay and exit did the work, the message did not [15]. ADHD traits correlate with problematic phone use (small cross-sectional study) [16]. | Moderate / weak |
| Autistic inertia | Starting, stopping and switching are all hard and not under conscious control; prompts and a fitting environment help, stress worsens it (32 adults) [17]. | Weak (qualitative) |
| Monotropism | Attention sits in few deep tunnels; interruption is costly and switching needs time [18]. | Weak (theory, widely endorsed) |
| Predictability | Intolerance of uncertainty correlates strongly with anxiety in autistic people (r = 0.62) [19]; NHS guidance is advance notice and visible sequence [20]. | Moderate |
| Demand avoidance | NAS rates the research as limited and low quality; indirect wording and real choice come from lived experience [21][22][23]. | Weak |
| Rejection sensitivity | "RSD" rests on clinical observation and small qualitative studies [24][25]. Better supported: adults with ADHD report more perceived criticism and less self-compassion (n = 1,203) [26]. | Anecdotal as a label; moderate for shame |
| Interest-based nervous system | Interest, novelty, challenge and urgency engage; importance does not. Clinician observation only [24], though consistent with [3][5]. | Anecdotal |
| Overload and burnout | Burnout follows demands outrunning capacity; recovery came with lower expectations and acceptance (19 interviews) [27]. | Weak |
| Sensory load | Government accessibility guidance: calm colour, plain literal words, predictable layout, no clutter [28]. | Moderate (consensus guidance) |
| Sleep inertia | Decision-making is impaired for about 30 minutes after waking, sometimes longer [31]. | Strong |
| Apps | Inflow kept about 40% of users to week seven, uncontrolled [32]. Tiimo, Structured, Goblin Tools, Focusmate, Finch, Habitica: user reports only [33]–[38]. | Anecdotal |

## 3. Design rules

**Whole app**

1. **Zero-initiation entry.** Every loop starts from an event that already happens (alarm stops, phone plugged in, a scroll app opens). Nothing depends on remembering to open Mycelium [5][6].
2. **Zero-debt return.** After any gap the app opens on one card. No backlog count, catch-up queue or summary of what was missed.
3. **Sixty-second sessions.** Pick, start, complete, park and close each finish in under a minute, one-handed. The app is built to be left.
4. **Bounded lists.** No view shows more than seven rows without "Show more". No counters or badges anywhere, including the app icon.
5. **No shame mechanics.** Avoid: red overdue walls, the word "overdue", withering or dimming of the growth network, a lost-streak state, guilt copy, disappointed agents [9][26].
6. **Stable shell, rotating surface.** Navigation, gestures, card layout and loop timings change only with notice. Novelty lives in a cosmetic layer (completion animation, terrain weather, agent phrasing) on a rotation he controls [11][19].
7. **Sensory defaults.** Calm dark palette with text contrast at 4.5:1 or better; a reduce-motion mode that turns off parallax and strands; every sound mutable; nothing plays unannounced [28].
8. **Loop before landscape.** Capture and the daily loop ship before any growth-visual polish.

**Phone focus card**

9. The card shows the title, a first step of five minutes or less, a time estimate (his guess × 1.5) and a "then" peek at the following item [4][20].
10. Buttons are **Start / Not now / Swap**. Swap offers two alternatives and never asks for a reason [21].
11. Start opens a visible countdown. At zero: **Done / 10 more minutes / Park** — a stopping cue as well as a starting one [17].
12. First steps are drafted as if-then plans tied to a real cue: "When I sit down after lunch, I open the file and write the heading" [1][2].

**Terrain**

13. Keep distance-as-time and add a fixed "now" line and a today band, so time is physical [4][6].
14. The front zone holds at most three items. Anything slipped for seven days loses its date and is offered once as **Re-date / Someday / Drop**.
15. The network only grows. A gap shows as nothing, never as a dead patch.

**Daily loop**

16. The morning proposal is prepared the night before. At alarm-stop it needs one tap ("Looks right") or none: untouched for 45 minutes, it applies itself. No choice is demanded in the first half hour awake [31].
17. Today is one win plus up to four extras labelled "if there's time". The day is won when item one is done. Total estimated time stays under half his free hours [4][27].
18. Evening close runs two minutes and ten cards at most, opens with what got done, and "Close the day" is always enabled.
19. Capture confirms "Saved" at once. Confident captures file themselves; only uncertain ones become cards. Items split from a brain dump land as ideas, never commitments.
20. Cards older than seven days file themselves with the AI's guess and a small "unreviewed" tag.

**Finishing**

21. WIP is a soft limit of three (setting). Parking is one tap and saves a "where I left off" note. It never blocks capture or a five-minute task.
22. Finish-line view shows three items, each with what is left and its next step, and three exits: **Finish / Good enough — close as is / Drop**.
23. Weekly close-out: same slot each week, 45-minute box, someone present (Kirsty or one agent), plan stated at the start and reported at the end [8][30].
24. Completion feedback lands within 300 ms. The daily win and finish-line closures get the larger moment; small ticks get the small one [3].
25. Progress is week fill plus lifetime totals. Any streak counts days with a win, has two automatic rest days a week, and never displays zero or "lost" [9].

**Nudges**

26. One interruption budget across push, Telegram and wall speech: three app-initiated a day in total. Each carries the tiny step and a one-tap action; ignored nudges are not repeated in the same words [13][14].
27. Nothing fires during a running focus timer. Scheduled switches get ten-minute and two-minute notices [17][18].
28. The Boys: one agent answers per message, two sentences at most; others speak only when named; no agent-to-agent chatter.
29. Wall speech: chime, then twelve words or fewer, with the next spoken reminder time visible on the wall.
30. Kirsty sees wins first. Her presets lean to offers ("Want company for this?"). Phil has a one-tap "Not today" needing no explanation, and she is told automatically when the thing is done [29].
31. Scroll friction: an iOS Shortcuts automation on opening each scroll app shows the focus card for 5–10 seconds with **Close app / Continue**. No lecture text [15].

**Dormant features**

32. No dormant marks in navigation by default. At most one section is raised per weekly close-out as **Keep / Pause / Retire**; paused sections leave the nav. Never ask why.

**Wording**

| Use | Never use |
|---|---|
| "Next up: boiler quote. First step: find the email. About 5 min." | "You still haven't…", "Don't forget…" |
| "It's 14:10. This takes about 20 min; there's 50 before the call." | "You're running late", "Hurry" |
| "Boiler quote moved to tomorrow." | "Overdue", "Missed", "Failed" |
| "Welcome back. Nothing's been lost. Here's one thing." | "You've been away 9 days" |
| "Two steps left on the shed. Next: order the hinges." | "So close — don't give up now!" |
| "Recipes has been quiet since August. Keep, pause or retire?" | "Why haven't you used Recipes?" |

State facts and offer options. Avoid "should", "must", "need to", "just" and "only". Use literal language with no idioms, and label buttons with what they do [21][22][28].

## 4. Where ADHD and autistic needs conflict

| Conflict | Default | Setting |
|---|---|---|
| Novelty vs sameness | Fixed structure, rotating cosmetics (rule 6) [38] | Rotation: off / monthly / weekly |
| Surprise reward vs predictability | Same chime and motion every time; an occasional larger moment only for finish-line closures | Variable rewards on/off |
| Interrupt to rescue vs protect deep focus | No interruptions during a timer; a stop cue at its end | Hard stop / gentle / none |
| One card (less choice) vs seeing what is coming | One card plus a "then" peek | Peek depth 0–3 |
| Urgency as fuel vs pressure as threat | Visible time, no countdown alarms or red | Deadline emphasis low / high |
| Rich feedback vs sensory load | Soft sound, short motion | Sound, motion and speech each switchable |
| Social accountability vs demand avoidance | Offers and a no-reason opt-out | Nudge tone presets; Kirsty's view scope |

## 5. Risk notes on decisions already made

- **Morning pick at alarm-stop.** The event trigger is right [5]; a decision on waking is not [31]. Least harm: rule 16.
- **Evening close on plug-in.** Good trigger, worst energy, and the phone is in his hand at bedtime. Least harm: rule 18, with the wall screen as an alternative place to do it.
- **Five items.** At the top of what his over-commitment pattern can take. Least harm: rule 17 — success is defined by one.
- **Park one to start one.** No direct evidence for WIP limits in ADHD, and a hard gate blocks the rare moment interest arrives. Least harm: rule 21.
- **Finish-line view.** Fits his pattern exactly, yet a full list of nearly-dones reads as a charge sheet. Least harm: rule 22; "drop" counts as finishing.
- **Streak and rings.** Immediate feedback is well supported; a breakable streak is the single element with evidence of backfiring [9][10]. Expect the glow to fade around week four [11]. Least harm: rules 6 and 25.
- **Three pushes a day.** Restraint is reasonable, but the cap is hollow if Telegram, the wall and Kirsty sit outside it. Least harm: rule 26.
- **The Boys all replying.** No evidence supports several voices; it adds reading, noise and time inside a messaging app. Least harm: rule 28.
- **Spoken reminders.** Right place, wrong if unpredictable — sudden speech breaks focus and adds sensory load [18][28]. Least harm: rules 27 and 29.
- **Kirsty nudging without limit.** The evidence cuts against this most clearly: pressure predicts hiding and reactance, and perceived criticism is tied to lower self-compassion [26][29]. Least harm: keep it uncapped, shape it with rule 30, and review it together monthly.
- **Review queue and split brain dumps.** Reviewing is the dull task he will skip, and splitting multiplies commitments. Least harm: rules 19–20.
- **Dormant indicator from true history.** A deficit display that opens on mostly-dormant, followed by an agent asking why, is close to a shame mechanic. Least harm: rule 32; "pause" is a good outcome because fewer sections means less load.
- **Terrain.** Sound metaphor; risks are motion load, overdue items massing at the front, and build time. Least harm: rules 7, 8 and 14.

## 6. Is it working?

Review monthly in the close-out; keep these off the home screen.

1. **Win rate** — days per week item one was done. Start by aiming for four.
2. **Start latency** — median minutes from morning pick to first Start.
3. **Finish ratio** — items finished ÷ items started each week (aim for 1 or above), plus items stuck above 80% for over 14 days.
4. **Plan accuracy** — accepted today-items completed; 70–80% means the plan fits.
5. **Return time** — days to come back after a missed day. This is the test of the no-shame design.
6. **Nudge response** — share acted on within 30 minutes. Falling for two weeks means cut volume.
7. **Scroll time** — weekly Screen Time for the named apps, typed in at close-out.
8. **Two questions with Kirsty** — are the nudges helping him, and are they costing her?

## 7. Sources

1. Gollwitzer & Sheeran (2006), implementation intentions meta-analysis — https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f
2. Gawrilow, Gollwitzer & Oettingen (2011), if-then plans in ADHD — https://www.socmot.uni-konstanz.de/sites/default/files/Gawrilow_Gollwitzer_Oettingen_Executive_Function_JSCP_2011.pdf
3. Jackson & MacKillop (2016), ADHD and delay discounting meta-analysis — https://www.pubmed.gov/27722208/
4. Marx et al. (2021), perceptual timing in ADHD meta-analysis — https://eprints.soton.ac.uk/456003
5. Altgassen, Scheres & Edel (2019), prospective memory and procrastination in ADHD — https://link.springer.com/article/10.1007/s12402-018-0273-x
6. Barkley, ADHD, self-regulation and executive functioning (slides) — https://cba-va.org/wp-content/uploads/2023/04/ADHD-Self-Regulation-and-Executive-Functioning-Russell-A.-Barkley-Ph.D..pdf
7. NICE NG87, rationale and impact — https://www.nice.org.uk/guidance/NG87/chapter/rationale-and-impact
8. Harkin et al. (2016), monitoring goal progress meta-analysis (APA summary) — https://www.apa.org/news/press/releases/2015/10/progress-goals
9. Silverman & Barasch (2023), broken streaks — https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions
10. The Decision Lab, "Streak Creep" (commentary; cites Etkin 2016) — https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification
11. Rodrigues et al. (2022), gamification novelty effect — https://link.springer.com/article/10.1186/s41239-021-00314-6
12. Sailer & Homner (2020), gamification meta-analysis (summary) — https://gamification-research.org/2019/08/does-gamification-of-learning-work/
13. Bidargaddi et al. (2018), push notification micro-randomised trial — https://mhealth.jmir.org/2018/11/e10123/
14. Bell et al. (2023), notifications and engagement — https://mhealth.jmir.org/2023/1/e38342/PDF
15. Grüning, Riedel & Lorenz-Spreen (2023), one sec, PNAS — https://pesquisa.bvsalud.org/ses/resource/pt/mdl-36795756
16. Current Psychology (2023), ADHD traits and technology addiction, n = 150 — https://link.springer.com/article/10.1007/s12144-023-05203-x
17. Buckle et al. (2021), autistic inertia — https://www.frontiersin.org/articles/10.3389/fpsyg.2021.631596/text
18. Murray, Lesser & Lawson (2005), monotropism — https://monotropism.org/murray-lesser-lawson/
19. Jenkinson, Milne & Thompson (2020), intolerance of uncertainty in autism — https://orca.cardiff.ac.uk/id/eprint/140692/
20. Leicestershire Partnership NHS Trust, coping with change — https://www.leicspart.nhs.uk/autism-space/health-and-lifestyle/autism-coping-with-change-and-transition/
21. National Autistic Society, demand avoidance — https://www.autism.org.uk/advice-and-guidance/behaviour/demand-avoidance
22. PDA North America, declarative language — https://pdanorthamerica.org/wp-content/uploads/2024/01/Declarative-Language-PDA.pdf
23. SA Department for Education, autism and PDA profile — https://www.education.sa.gov.au/docs/support-and-inclusion/practice-guidance/About-autism-and-pathological-demand-avoidance-PDA-profile.pdf
24. Dodson, ADDitude — https://www.additudemag.com/symptoms-of-add-hyperarousal-rejection-sensitivity/
25. Psychology Today (2026), RSD: the actual research — https://www.psychologytoday.com/us/blog/if-i-be-waspish/202604/rejection-sensitivity-dysphoria-the-actual-research
26. Beaton, Sirois & Milne (2020), self-compassion and criticism in ADHD — https://eprints.whiterose.ac.uk/165039
27. Raymaker et al. (2020), autistic burnout — https://pdxscholar.library.pdx.edu/socwork_fac/378
28. UK Home Office, designing for users on the autistic spectrum — https://ukhomeoffice.github.io/accessibility-posters/autism
29. Scholz et al. (2021), partner social control (reports Craddock et al. 2015) — https://www.frontiersin.org/articles/10.3389/fpsyg.2020.613546/full
30. Body doubling: BPS on Eagle et al. — https://www.bps.org.uk/news/side-side-success-lo-fi-body-doubling-technique ; VR pilot — https://arxiv.org/html/2509.12153v1 ; FLOWN-commissioned survey — https://neurodiversity.org/?p=11449
31. Hilditch & McHill (2019), sleep inertia — https://www.dovepress.com/sleep-inertia-current-insights-peer-reviewed-fulltext-article-NSS
32. Knouse et al. (2022), Inflow feasibility — https://doaj.org/article/fc1e182fbb5b4f1e891ba84c54821ac2
33. Tiimo, Goblin Tools, Finch review — https://blog.saner.ai/best-neurodivergent-apps-for-adults/
34. Focusmate review — https://blog.saner.ai/focusmate-review/
35. Finch for ADHD/AuDHD — https://adhd-audhd.vercel.app/en/tools/apps/finch/
36. Habitica review — https://www.choosingtherapy.com/habitica-app-review/
37. Tiimo and Structured comparison — https://super-productivity.com/blog/best-adhd-task-management-apps-2026/
38. AuDHD and executive function — https://lifeskillsadvocate.com/blog/audhd-executive-function-daily-life/

*Not verified in this pass: Llama Life (no usable source), and the CHADD, Autistica and PDA Society pages (would not load). No direct evidence was found for WIP limits, a five-item cap, dormant-feature displays or multi-agent chats in ADHD or autistic adults; those rules are reasoned from the mechanisms above.*
