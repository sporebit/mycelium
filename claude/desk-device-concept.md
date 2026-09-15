# Mycelium Desk Device — Concept & Build Notes

*Personal project. Not for sale. Started July 2026.*

---

## What it is

A physical, mushroom-shaped desk companion that surfaces tasks and calendar state from **mycelium** (Phil's app) without requiring a browser tab or a context switch. Loosely inspired by the ZIEA One, but deliberately diverging: the screen *is* the feature here, not the focus button.

The core bet: a persistent object in peripheral vision beats an app you have to go looking for — **but only if it stays honest about whether its data is fresh.**

---

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Compute | Raspberry Pi (5 preferred) | Touch + animation ruled out the low-power ESP32-only path |
| Primary display | Wide bar, 320×1480 IPS, capacitive touch | The "log / substrate" the mushroom grows from |
| Secondary display | ~2.1" round, 480×480 | The mushroom cap — the focal point |
| Satellites | Independent ESP32 nodes over MQTT | Avoids a second renderer on the Pi and GPIO/DPI conflicts |
| Data source | Hosted mycelium API | Pi polls or subscribes; no local DB coupling |
| Enclosure | 3D printed, PETG or ASA | PLA will soften against an enclosed Pi 5 + backlight over a warm season |

---

## The geometry problem, and the resolution

A 11.9" 320×1480 panel is roughly **295mm × 64mm** — nearly a foot wide. A mushroom that size is a stage prop, not a desk object.

So the bar is **not** the cap. Layout:

- **Cap** — round display, mounted on the stem, angled toward the user. Focal point.
- **Log / substrate** — the bar display, lying flat or slightly raked, running the timeline and task strip.
- **Gills** — the vent path for Pi and driver-board heat, hidden as functional geometry under the cap.
- **Satellites** — smaller mushrooms, independently placeable, sprouting elsewhere on the desk.

---

## Display budget (the numbers that constrain the design)

**Bar — 295 × 64mm, ~127ppi**
- 10mm fingertip target ≈ 50px of the 320px height
- → **two comfortable touch rows, maximum.** Three if cramped.
- → Vertical scrolling lists are a mistake here. **Horizontal swipe-through-cards** is the native gesture.

**Cap — ~53mm diameter, ~229ppi**
- Progress ring eats the outer annulus, leaving ~400px ≈ 44mm of usable interior width
- Text at glanceable-across-desk size (~6mm cap height ≈ 54px) → **3–4 words maximum**
- → "Current focus" must be hard-truncated at the source, or you'll lean in to read it, which defeats the entire premise

---

## The freshness mechanic (most important design idea here)

The intended failure mode is "becomes an ornament that still draws me back." That only works if the ornament is *honest*. A device confidently displaying yesterday's tasks is worse than a dark one.

The theme solves this for free — **data freshness is rendered as organism health:**

| State | Appearance |
|---|---|
| Synced, recent | Mycelium threads pulse; cap lit and saturated; slow ambient motion |
| Stale (> ~30 min) | Growth animation stops; colour desaturates; light dims |
| Disconnected / API error | Dormant — cap dark, threads still, faint slow breath only |

No "last synced 14:32" label required. The object visibly wilts. That *is* the nag, and a dormant mushroom is still a pleasant thing to have on a desk.

---

## Architecture

```
mycelium API (hosted)
        │  poll / SSE
        ▼
   Raspberry Pi 5  ──── bar display (DSI or HDMI + USB touch)
   ├─ UI app        ──── cap display (round)
   └─ Mosquitto broker
        │  MQTT (state topics)
        ├──► ESP32 satellite #1
        └──► ESP32 satellite #2
```

**Why MQTT for satellites:** the Pi publishes device state; satellites subscribe and render independently. No shared GPIO, no second renderer inside the main app, and each satellite can be unplugged without breaking anything. Mosquitto runs on the Pi itself.

**Satellite hardware note:** for GIF playback, use small **240×240 round GC9A01** panels, not 480×480. GIF decode at 480×480 needs an ESP32-S3 with PSRAM and an RGB parallel interface — significantly more painful. 240×240 GIF playback on a plain ESP32 is well-trodden ground (bitbank2's AnimatedGIF library).

---

## Cap content — unresolved conflict

Requested for the cap: ambient organism health **+** progress through the day **+** current focus.

That's three information layers in a 53mm circle. Simultaneously, they will fight. Proposed resolution — **layer by role, not by stacking**:

- **Background / whole-surface treatment** → ambient health (always present, never competes for attention)
- **Outer annulus** → radial progress fill for the day
- **Interior, ≤4 words** → current focus

That composes. What does *not* compose is giving any of the three a second visual variable. Pick one job per layer and defend it.

---

## Proposed v1 scope

**In:**
- Pi + bar display + cap display in one printed body
- Poll mycelium API, render task strip and next-event
- Horizontal swipe card interaction on the bar
- Full freshness/health visual system (this ships in v1 — it's not polish, it's the trust model)

**Deferred:**
- ESP32 satellites
- GIF-playing decorative mushrooms
- Any attempt at phone Focus-mode control (the ZIEA feature that DIY can't cleanly replicate)

**Rationale for deferring satellites and GIFs:** they're the most fun part to build, which is exactly why they'll eat the available weekends before the task pipeline is trustworthy. Build the thing that has to work first, then decorate.

---

## Open questions

1. Does mycelium's API expose a push channel (SSE/websocket), or is polling the only option? Determines how "live" the device can feel.
2. Bar display interface — DSI or HDMI? Pi 5's dual MIPI connectors make DSI attractive, but HDMI is more forgiving to debug.
3. Desk footprint tolerance — is ~295mm of bar actually acceptable, or should a shorter panel from the same family be sourced?
4. Power: single USB-C PD into the base with internal distribution, or separate feeds?
5. Does the device ever *write* back to mycelium (tick a task off by touch), or is it read-only? Read-only is dramatically simpler and worth considering for v1.

---

## Known risks

- **Software rot outlives the enclosure.** The printed body will be fine in three years; the API integration won't be unless the contract is stable. Keep the sync layer thin and boring.
- **Thermals in an enclosed print.** Pi 5 + LCD driver + backlight in a sealed mushroom is a warping risk. Vent through the gills; PETG/ASA minimum.
- **Scope drift toward decoration.** Flagged above. The GIF mushrooms are a reward, not a milestone.
