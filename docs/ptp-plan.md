# Philip's Training Plan (The PTP)

Written by Kirsty, September 2026. Transcribed by Phil with two amendments,
marked **[amended]**.

**This document is the authoritative source.** The notebook photos in
`docs/ptp-source/` are the origin, not the record — where they and this
document disagree, this document wins. The database rows in
`supabase/migrations/0100_ptp_programme_seed.sql` are this document
expressed as data.

---

## Structure — 3 phases

### Phase 1 — Restore + Stabilise (3–6 weeks)

Pilates + rehab dominant. 3 purposeful sessions + 2 gentle recovery/mobility
days.

Session structure: mobility → activation → controlled strength → light
conditioning → mobility.

Principle: teach the body to move well before loading.

Movement pool: controlled breathing / ribcage work, pelvic control, cat-cow /
thoracic mobility, dead bugs, bird dog, glute bridges, side-lying glute work,
supported split squats, controlled calf raises, rows, light presses/pulls,
carries.

### Phase 2 — Rebuild (5–10 weeks, goal dependent)

Entry gate: daily movement + Phase 1 exercises consistently pain free or
substantially improved; then weights become prominent.

Example week:

| Day | Session |
| --- | --- |
| Mon | Lower + core |
| Tue | Pilates / mobility |
| Wed | Upper body + zone 2 cardio |
| Thu | Recovery / mobility |
| Fri | Full body strength |
| Sat | Family activity day (hike, walk, enjoyable cardio) |
| Sun | Rest |

### Phase 3 — Hybrid (long-term goal)

3 strength sessions, 2 cardiovascular exposures, 1 pilates/mobility. Only
after Phase 1 + half of Phase 2 are complete.

---

## Phase 1 — the five days

**[amended]** All five days below belong to Phase 1. Everything rehab/recomp
led.

### Day 1 — lower

5–10 min treadmill walk · mini-band lateral walk · glute bridges / hip
thrusts · goblet squats to 90% comfortable depth · leg press · seated leg
curls · controlled leg extension (only if symptom free) · calf raises · dead
bug / heel touch.

**Prescription:** 3–4 sets, 8–10 reps, deliberately leaving 2–3 reps in
reserve. No pushing. No "one more because I can". No testing knees.

### Day 2 — pilates / mobility (deeper control work)

Breathing + rib stacking · pelvic tilts · dead bugs · heel taps · bird dogs ·
glute bridges · side-lying hip work · adductor work · thoracic rotation ·
scapular control · gentle shoulder mobility · hip mobility · feet/ankle +
calf mobility.

**Prescription:** slow and controlled; eccentrics + isometrics.

### Day 3 — upper + shoulder rehab

Neutral/comfy-grip pulling · scapular rows · light DB shoulder press ·
push-up variation · lat pull-down · cable triceps · cable curls.

**Rule:** any clicking or pain → adapt/modify.

### Day 4 — conditioning

Bike or cross trainer. Something comfortable while building knee capacity.

### Day 5 — full body

Goblet squats · hip thrusts · supported rows · walking lunges (log currently
states pain free) · leg curls · push-ups or comfortable press · lat
pull-downs · farmer carry / overhead carry · core work.

**Prescription:** 3 sets, 10–12 reps. Controlled loads, no ego lifting.

**Progression order (hard rule):** technique → pain response → reps → load.
Load is the last thing that moves.

---

## Nutrition

Basis: ~80kg, 5'10–5'11, age 32. Targets depend on activity level and goals.

**[amended]** Daily targets — hold 3–6 weeks, **review at week 3**:

| Target | Value |
| --- | --- |
| Calories | 2600 kcal |
| Protein | 200 g (800 kcal) |
| Fat | 80 g (720 kcal) |
| Carbs | 270 g (1080 kcal) |
| Fibre | 30–35 g |
| Water | 2.5–3 L, plus extra around training |

**Note for the record:** Kirsty's original figures were 150 g protein / 320 g
carbs, derived from 1.6–2.0 g/kg. Protein was raised to 200 g and the deficit
taken out of carbs. These targets are provisional and dated — they are
modelled as a versioned target with an effective-from date and a review date,
not as constants.

Effective from **2026-09-07**, review on **2026-09-28**. Superseding them
means inserting a new `nutrition_targets` row with a later `effective_from`,
never editing the existing row — the old row is the record of what was being
eaten toward at the time.

---

## How the plan is modelled

Phase 1 starts **2026-W37** (Monday 7 September 2026). `end_week_iso` is
deliberately **NULL**: the Phase 1 → Phase 2 exit is gated on being pain
free, not on a date, so a hard end date would be fiction.

The three phases are three `workout_programmes` rows sharing the strict
prefix `PTP — `, not three phases of one programme.
`workout_programme_sessions` is `UNIQUE (programme_id, day_of_week, slot)`,
so three blocks that each use Monday afternoon cannot coexist under one
programme. The prefix is what allows them to be grouped later.

Only Phase 1 has a `workout_programme_phases` row. Phases 2 and 3 are
visible at `/fitness/programmes` and are not schedulable, which is the
intent — the progression is visible without being on a calendar.

**Known footgun:** if `end_week_iso` is ever set on the Phase 1 row and that
week passes with no later phase, `app/api/fitness/today/route.ts` finds no
active phase and the Today surface renders **no programme sessions at all** —
silently, with only ad-hoc live sessions showing. There is no "programme
ended" state. Leaving `end_week_iso` NULL avoids this entirely.

### Weekday mapping

| Day | Weekday | `day_of_week` | Slot | Kind |
| --- | --- | --- | --- | --- |
| Day 1 — Lower | Monday | 0 | afternoon | resistance |
| Day 2 — Pilates / Mobility | Tuesday | 1 | afternoon | mobility |
| Day 3 — Upper + Shoulder Rehab | Wednesday | 2 | afternoon | resistance |
| Day 4 — Conditioning | Thursday | 3 | afternoon | cardio |
| Day 5 — Full Body | Friday | 4 | afternoon | resistance |

Saturday and Sunday are free.

### Guardrails

Stored in `workout_programmes.guardrails` on all three PTP programmes and
rendered as a pinned banner at the top of the live session log
(`components/fitness/LogClient.tsx`), so they are read during the workout:

```
Progression order — technique → pain response → reps → load. Load is the last thing that moves.
Leave 2–3 reps in reserve on every set. No pushing. No "one more because I can".
No ego lifting. No testing knees.
Any clicking or pain → adapt or modify the movement. Do not push through it.
Teach the body to move well before loading it.
```

Per-exercise conditionals ("to 90% comfortable depth", "only if symptom
free") live in `workout_programme_exercises.notes`. These are copied onto
the logged session at session start and render under the exercise name
mid-workout.

---

## Canonical exercise names

The exercise library is **derived** — `/api/fitness/exercises` builds it from
distinct `workout_session_exercises.name` values, and `exercise_aliases` is
empty. There is no canonical exercise table and nothing deduplicates. The
first typo, especially via voice logging, becomes a permanent second entry in
the library and splits that exercise's history in two.

**Use these strings verbatim.** Anything already in the library is reused
rather than re-spelled.

### New to the library (19)

```
Glute bridge
Barbell hip thrust
Dead bug
Bird dog
Side-lying hip abduction
Adductor squeeze
Pelvic tilt
Breathing + rib stacking
Thoracic rotation
Scapular retraction
Hip mobility flow
Ankle + calf mobility
Stationary bike
Cross trainer
Farmer carry
Overhead carry
Push-up
Chest-supported row
Cat-cow
```

`Cat-cow` is spelled to match the existing constant in
`lib/fitness/seed-mobility.ts` so the two converge rather than duplicate. It
is not used by the Phase 1 sessions as seeded — `Thoracic rotation` covers
that slot — but it is pinned here because the Phase 1 movement pool names it.

### Reused from the existing library (15)

```
Treadmill walk
Mini band lateral squat walk
Dumbbell Goblet Squat
Leg press — feet high and wide
Seated leg curl machine
Leg extension (light, pain-free range)
Seated calf raise
90 Degree Heel Touch
Lat Pulldown
Dumbbell Shoulder Press
Cable Triceps Pushdown
Cable Curl
Dumbbell bent-over row — single arm
Walking Lunge
Plank
```

Note the inconsistent casing above is the library's, not a transcription
error — `Dumbbell Goblet Squat` and `Seated leg curl machine` genuinely
differ. Reproduce them exactly.

### Known duplicate clusters (not cleaned up)

The library already contains `Seated Leg Curl` / `Seated Leg Curl Machine` /
`Seated leg curl machine`, `Leg Extension` / `Leg extension (light, pain-free
range)`, and `EZ bar curl` / `EZ Bar Curl`. Collapsing these via
`exercise_aliases` is backlogged.

---

## Source photos

`docs/ptp-source/` holds the seven notebook photographs this transcription
was made from, taken 6 September 2026.
