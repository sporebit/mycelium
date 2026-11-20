# Home views — mock-up sources

Reference sources for the four Home views decided on 2026-11-20. The decision record is `claude/ui-direction.md`; the run's scope is `claude/master-run.md` §13.

| File | View | Status |
|---|---|---|
| `Plate.dc.html` | Specimen plate (default) | **Build now** |
| `Core.dc.html` | Core sample | Decided, deferred |
| `Burrow.dc.html` | Burrow | Decided, deferred |
| `Colony.dc.html` | Colony | Decided, deferred |

The three deferred views wait until Phil says his usage limits have refreshed. Do not start, scaffold or stub them before then.

Live, clickable versions: https://claude.ai/artifact/KYdGhqrFcH4CjP2jTaKY99 (open a board full-window to use the menu and the view links).

## What these files are

Claude Design component files, published as mock-ups. They are **not runnable pages** outside that canvas and **not code to paste into the app**. Each has a template (`<x-dc>` markup with `{{ }}` bindings, `<sc-for>`, `<sc-if>`), a `<style>` block and a `class Component extends DCLogic` script. Read them for:

- layout, proportions, type and colour of each view;
- the shared top menu bar (groups in `menuGroups`; the grouping is a proposal Phil may change);
- the network engine in each script (`rnd`, `seg`, `wander`, `trunk`, `build`, `burst`, `frame`): seeded, three depth layers, pointer push and parallax, spores, a growth burst when something is finished;
- in `Plate.dc.html`: the `kinds` table and `specimen(kind, seed)` generator (five code-drawn species), the draw-in animation, the spore print, the margin figures and the week strip.

## Known limits

- Sample data throughout. The real views read the shared "today" data contract described in `claude/ui-direction.md`.
- The network is random from a seed here. In the app it is built from real completion history.
- Mushrooms are simple shapes drawn in code. Real artwork is an open choice for Phil.
- None of these boards was opened and checked on screen after publishing. Expect rough edges.
- Pointer reaction is desktop only; the wall and touch need an equivalent.
