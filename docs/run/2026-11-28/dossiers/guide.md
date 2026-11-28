# Dossier: Field guide follow-ons (E.guide, MYC)

*Written 2026-11-28 for the run's ticket plan §24. The Field guide itself is built in this run by Stream U (`field-guide-design.md`); these are the three things it leaves for later.*

## 1. What Phil decided

The Field guide is the final format (section 12 answer 30), delivered all three ways: a Mycelium ticket, a shareable link and a downloadable file (12.20). Its state lives in Mycelium's database for every guide (12.21). Guides are read aloud by voice ("done", "next", "repeat") once the glasses route exists (12b). With the format final, the global Claude instructions prompt is written with the template change (12.30, H10 Field guide). Design decision D4 (taken for Phil in this run): the shareable link is the in-app page `/guides/[key]` behind sign-in, and the downloadable file is a self-contained read-only HTML snapshot; a **public** read-only link is not built and is ticketed with its design question (unguessable token, no answers shown, revocable).

## 2. His kit and constraints

- Mycelium on Vercel Hobby and Supabase. AGENTS.md rule quoted in D4: no public GET unless the brief decided it. The only decided public GET in the brief is the baby gift list (5.12).
- A guide's answers can hold non-secret personal facts (dates, model numbers, counts); the secret guard (D6) refuses anything that looks like a key.
- "For someone else" mode (D5) exists for guides handed to another person (Kirsty, a family member), which is the likely reason for a public link.
- Voice: glass.12 builds "Field guide steps read aloud" after glass.05; the glasses route is decided by glass.01.

## 3. What the research found

### 3.1 A public read-only link (guide.01)

- A capability URL grants access to anyone who holds it; URLs are not generally kept secret and leak (browser history, logs, shared screenshots, referrers). The W3C TAG's guidance: use them only where the risk is acceptable, make them unguessable, let them expire, and let the owner revoke them; fresh URLs are better than long-lived ones. [1] (checked 2026-11-28)
- Referrer leakage is stopped by `Referrer-Policy: no-referrer` on the page; this does not stop every route by which a URL leaks. [2] [3] (checked 2026-11-28)
- UNVERIFIED (no source found in this run): search engines indexing capability URLs. A `noindex` robots header and meta tag cost nothing and should be on the page anyway.
- **Design the ticket lays out for Phil:** a random token of at least 128 bits per share (not the ticket key), stored hashed, with an expiry (default 30 days) and a Revoke button on the ticket; the page shows steps and ticks but **never answers**, never `prompt` blocks, never Claude's `did_html`; "for someone else" mode on by default; `no-referrer`, `noindex`, no scripts beyond the ticking if ticking is allowed at all; a read-only first version (ticking by the visitor is a second decision, because it writes to his database without a session). Each view logged on the ticket's activity. The decision comes before any build (the plan's wording).

### 3.2 Guides by voice (guide.02)

- No research here: glass.12 owns the build and glass.01 the route. The format-side work is small and already in the data shape: every step has a title, a `minutes` and an `expect_html`, which is what a spoken step needs ("Step 2.3. Set the forward. About 2 minutes. You should see..."). What the format may need: a short spoken form per step where the body is long (`plain_title` and `plain_body_html` already exist for someone mode and can double as the spoken text). guide.02 is a link and a checklist of what glass.12 must read.

### 3.3 Global Claude instructions prompt (guide.03)

- The prompt is a run deliverable written by Stream U in `docs/guides/` (plan §24). The folder does not exist yet on `main` at the time of writing (checked in the repo, 2026-11-28), so guide.03 waits for Stream U's ship. Phil's job is to read it and paste it into each project's CLAUDE.md (or his global Claude instructions); Claude can do the repo edits for repos on the PC once he approves the text.

## 4. Risks

- **Private data reaching strangers (guide.01).** A forwarded link shows whatever the page shows. Mitigation: no answers, expiry, revoke, logged views, decision first.
- **Writes without a session (guide.01).** If visitors can tick, an anonymous request changes his database. Mitigation: read-only first; ticking is a separate later decision.
- **Spreading a prompt that goes stale (guide.03).** A prompt pasted into many CLAUDE.md files drifts when the format changes. Mitigation: each project's CLAUDE.md points at the one copy in Mycelium's repo (or Docs) rather than pasting the whole text, if Phil agrees; written as a choice on the ticket.
- No money and no lock-out risk in this epic.

## 5. Facts that differ from the plan

- **guide.03:** the prompt file in `docs/guides/` does not exist yet (Stream U writes it); guide.03 cannot start until Stream U ships. Written as depending on that ship, not on a sid (Stream U has no ticket sid in the plan).
- **guide.01:** the plan's title says "unguessable token, no answers shown, revocable"; research adds expiry and `no-referrer` as part of the same design. Not a contradiction, an addition.

## 6. Sources

1. https://www.w3.org/2001/tag/doc/capability-urls , Good Practices for Capability URLs, W3C TAG (checked 2026-11-28)
2. https://www.w3.org/TR/referrer-policy/ , Referrer Policy, W3C (checked 2026-11-28)
3. https://web.dev/articles/referrer-best-practices , Referer and Referrer-Policy best practices, web.dev (checked 2026-11-28)
