# Dossier: E.review, This run's review (LIFE)

*Written 2026-11-28 by a dossier agent during the unattended run. No web research: this epic is about the run's own output.*

## 1. What Phil decided

The Final five: a one-off map of the epics and what unlocks what, saved to Docs now, and a live roadmap page in Mycelium (drawn from ticket links, next unblocked ticket highlighted) as a ticket. The brief's finish has Phil review every decision made for him. H10: nothing in the undecided list has been put to him as a question; each item gets one row in a LIFE checklist, keep or drop, and no ticket until he says keep.

## 2. His kit and constraints

- `docs/run/2026-11-28/decisions.md` is written through the run, one line per entry in the form `[D|S|A|U] what | why | how to undo`; it held ten entries when this dossier was written and grows until the end of the run.
- The H10 undecided list is in `digests/ventures-and-life.md` §3 (brief lines 724 to 731).
- Checklists are Field guide data on the ticket (`steps_definition`), with answer boxes that refuse anything secret-looking.
- Tickets carry dependency rows (`ticket_dependencies`, shown both ways) and relates links; that is what review.03 draws from.

## 3. What the research found

**The H10 list has 47 items**, not "about 45": ventures and makes 11, money 5, house and things 10, devices 5, tools and scripts 7 (the bug-fix pipeline and the recipe-card PDF import are two items), family 2, personal 2 (health threads as one "track any?" row with no detail; career goals), July's one-liners 5. review.02 lists each as one step with a `keep_or_drop_<n>` field (keep / drop / later) and an `answer_<n>` box, numbered 1 to 47, in five sittings of 7 to 12 minutes.

**review.01** is a definition with one placeholder phase; the integrator replaces it with one step per decisions.md entry (fields `keep_or_undo_<n>` and `answer_<n>`), split into sittings of at most 15 rows.

**review.03** draws from data that already exists (dependency rows and links); it should be a page inside the app under the user's session, because a public GET needs a decision the brief did not make (decisions.md records the same rule for the Field guide link).

**review.04** (the map in Docs) is made by the run (T6) and is not a ticket.

## 4. Risks

- **review.01 shipped with only the placeholder row** if the integrator does not fill it. Mitigation: the placeholder step's title says what replaces it; the epic's Done means requires every row answered.
- **A "keep" that never becomes a ticket.** Mitigation: review.02's finish says Claude turns each keep into a ticket; rescue.06 points untracked harvest items here.
- **Health detail in a checklist.** Mitigation: one row, no detail, as H10 says.

## 5. Facts that differ from the plan

- **review.02:** 47 rows, not "about 45". Title says 47.
- **review.02:** the digest calls it "seven bullets"; there are eight groups (ventures, money, house, devices, tools, family, personal, one-liners).

## 6. Sources

1. `docs/run/2026-11-28/digests/ventures-and-life.md` §2 (Final five) and §3 (H10 undecided) (checked 2026-11-28)
2. `docs/run/2026-11-28/decisions.md` (format line and entries so far) (checked 2026-11-28)
3. `docs/run/2026-11-28/field-guide-design.md` §2.1 and §2.2 (checked 2026-11-28)
4. `docs/run/2026-11-28/plan.md` §23 (checked 2026-11-28)
