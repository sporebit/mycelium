# Design resources and skills — reviewed record

*Reviewed 2026-11-20 (Cowork chat). Phil pasted eleven X posts listing design sites, agent skills and libraries and asked for each to be reviewed and kept on record for future use. The full table — 76 unique entries with what each does, cost, a verdict for Mycelium, where else it could help, cautions and whether the page was actually opened — is the Sheet **"Design resources and skills — reviewed"**: https://claude.ai/artifact/PKJQHDY5tJFnZNzzvfkiSA. This doc is the short version plus the design rules taken from the skills.*

## How it was checked

58 pages were opened on the day. 16 well-known libraries and tools (three.js, GSAP, Remotion, FFmpeg, Lucide and similar) were not opened and are described from general knowledge; the Sheet marks them. One had no link at all. Land-book returned an error. Fontshare's licence page and the Openverse API root returned no readable content. Star counts in the posts were broadly accurate (pixelfx was overstated: 4.2k, not 6.2K). Nothing was installed.

## Verdict for Mycelium

**Use now (free):**
- **60fps.design** — clips of real app interactions, filterable by Success State, Reward, Card Stack and gesture. The reference source for the completion moment and the swipe-card review.
- **Make Interfaces Feel Better** (skill) — 19 specific, checkable polish rules. Best fit for an app.
- **Emil Kowalski skills** — animation review, gestures, performance, removing animation that should not be there.
- **Impeccable** (skill) — `critique`, `audit`, `polish`, `distill`, `quieter` and a 62-rule detector. **Caution:** its hooks run outside model approval in Claude Code, and its live mode can run the CLI with approvals off; read them before an unattended run.
- **Vercel agent skills** — `web-design-guidelines` (100+ review rules) and `react-best-practices`; Mycelium is Next.js on Vercel.
- **Fontshare** and **Realtime Colors** — the typeface and the "calmer dark" palette. Confirm Fontshare's self-hosting terms first.
- **Mobbin** — real app screens (free sign-up; its MCP is paid).

**Already in the repo:** UI UX Pro Max (`.claude/skills/ui-ux-pro-max`), local `gsap`, `three`, `lottie`, `animejs`, `css-animations`, `waapi` skills, `lucide-react`. No animation or 3D library is a dependency yet.

**Maybe later:** Motion (the library) and Motion AI Kit; LottieFiles motion-design-skill; Hallmark; GSAP + official GSAP skills; Remotion + skills, WhisperX and FFmpeg (the baby keepsake film; WhisperX also suits the PC transcription worker); Anatomy and Hairline (illustrations for guides); OpenDesign and Huashu Design (prototyping); Tweakpane (tuning motion values); Cosmos and Iconly.

**Skip for Mycelium:** every landing-page gallery (Land-book, Recent, Landdding, Footer, On.design; Godly now redirects to Recent), prompt shops and AI site builders (MotionSites and its Studio — run by the author of two of the posts — Modulify, motionin.design, SceneAI), paid reference MCPs (ThinkUI from $9.99/month; Uizze), paid asset shops (Wonderlist $329–999, Backgrounds Supply $49, LogoToUse), game tooling (Unity MCP, Universal Modder, gamedev skills, pixelfx), Blender tooling, and "Tobi's library" (no link).

## Where the skipped ones could help elsewhere

- **AI website agency:** Taste Skill (built for exactly this), Hallmark, Impeccable, the landing galleries, Magic UI, React Bits, MotionSites prompts, Font In Logo, SVGL, Shots; MotionSites Studio and Modulify as competitors to study.
- **Home 3D survey:** Blender MCP, three.js.
- **StreetGuesser / games:** pixelfx, gamedev agent skills.
- **Trip Book, how-to guides:** Anatomy, Hairline, Remotion.

## Install advice

Two or three, not all. Skills are third-party instructions (and sometimes scripts and hooks) that run inside Claude Code with the repo's permissions: read each SKILL.md and any hook before installing, pin to a commit, and do not install during an unattended run. Suggested set for the UI rebuild: **Make Interfaces Feel Better + Emil Kowalski + Impeccable (hooks off)**, with Vercel's `web-design-guidelines` as the review pass.

## Design rules taken from the skills (apply in the UI rebuild)

**Do**
- Outer radius = inner radius + padding (concentric corners).
- Elevation by layered, semi-transparent shadows; borders only for dividers and focus or selected states.
- Press feedback: scale 0.96–0.97. Entrances start from about 0.93 scale, never from 0.
- Ease-out for things entering and leaving; keep UI motion under 300 ms; make popovers grow from their trigger.
- CSS transitions for interactive state (interruptible); keyframes only for one-off staged sequences; stagger about 100 ms and only for rare entrances.
- Tabular numerals on numbers that change; `text-wrap: balance` on headings, `pretty` on body.
- Hit areas at least 40×40 px on desktop, 44×44 px on touch.
- One icon set, one stroke weight (1.5 px beside regular text).
- Every animated state change also has a static cue (colour, icon or label). Honour reduced motion.
- URL reflects UI state; visible focus rings; `color-scheme` set.

**Don't**
- `transition: all`; animation on keyboard actions or anything used many times a day; a delay on every tooltip.
- Cards inside cards; an icon tile above every heading; a small label above every heading; letter-spaced all-caps labels; numbered section labels (01, 02, 03); one coloured word in a headline.
- Thin-bordered cards with wide soft shadows; side-tab accent borders; pulsing status dots; equal-weight metric cards with no hierarchy.
- One default font for everything; purple-to-blue gradients; the warm-beige look; grey text on coloured fills.
- Invented facts or placeholder content presented as real.

## Desktop designs built from these rules (2026-11-20)

One canvas, three live desktop boards for Phil to refine: https://claude.ai/artifact/23XHpEr4sUTZWXT3jbcLQk. They differ on one dial — how much the landscape leads versus the information — and each uses a different typeface and accent so those can be mixed:
- **A · Terrain** — the landscape is the main surface; items sit on it by time with a "now" line; selected item in a side panel. Bricolage Grotesque + Atkinson Hyperlegible, lichen accent.
- **B · Horizon** — the day as a left-to-right strip with roots growing under finished items; the next thing large beneath it. Figtree, sea-green accent.
- **C · Workbench** — flat and dense: today's five as rows, completions week by week as a bar ribbon, finish line, hours. Geist + Geist Mono, amber accent.

All three: calmer dark, every section in the menu with quiet marks (Phil's dormant-feature version), one item marked as the day's win, Done / Start 5 min / Not now, tabular numerals in mono, no red and no "overdue", sample data only. Not opened or checked on screen after publishing (the Design type forbids it unless asked).

These sit alongside `claude/nd-design-research.md` (no shame mechanics apart from Phil's dormant-feature display, bounded lists, visible time).
