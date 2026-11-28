# Dossier: Unblock Mycelium (E.unblock, MYC)

*Written 2026-11-28 for the run's ticket plan §16. This epic is mostly the existing "Phil's queue" tickets moved under one epic, each with a line naming what it unlocks. Little outside research is needed; the one product fact that gates the most (Enable Banking's free mode) was re-checked.*

## 1. What Phil decided

His own gating jobs (bank sign-up, mailbox, Shortcuts, frame, key rotation) become an "Unblock Mycelium" epic of 15-minute tickets, worked first, each naming what it unlocks (section 11 answer 7). The overall order is unblock queue, voice capture, notes, connector, imports (answer 29). H2.10 makes the census-files check (keys.06) the first unblock item: 15 minutes for Claude to look, nothing deleted.

## 2. His kit and constraints

- The fifteen queue tickets already exist on production (open-tickets.txt, 2026-11-28): MYC-180, 182, 192, 194, 195, 196, 197, 198, 200, 201, 202, 203, 204, 205, 210. They are moved under the epic by PATCH and gain an "## Unlocks" section; none is recreated.
- Banks to feed: Halifax, Revolut, AMEX through Enable Banking restricted mode (backlog, Finance auto-import).
- iPhone Shortcuts are built from code (Cherri) and handed over as import links (backlog 2026-11-21).
- Vercel Hobby allows daily crons only; MYC-180 is now one cron-job.org job, which matters only when the PC is off (backlog).
- API_SECRET is not rotated until every caller on MYC-209 is ready (Phil's instruction of 2026-11-24). MYC-196 waits for the new Shortcuts (MYC-197).

## 3. What the research found

- **Enable Banking restricted mode is still free for a private individual's own accounts.** A new application starts Inactive; linking an account in the Control Panel activates it in restricted mode, and data comes only from linked accounts. The terms limit production use to linked accounts for evaluation or the personal use of private individuals, free of charge; the number of linked accounts per application may be limited. [1] [2] [3] (checked 2026-11-28)
- Firefly III's importer documents the same free mode and warns that skipping the link step returns no accounts. [4] (checked 2026-11-28)
- UNVERIFIED: that Halifax, Revolut and AMEX UK all appear in Enable Banking's UK list today; MYC-195 is the ticket that checks this, so it is not pre-empted here.
- The rest of the queue is account set-up inside services already chosen in earlier runs (Resend for email, cron-job.org, Cloudflare R2, BotFather, GitHub). Nothing in this epic changes those choices.

## 4. Risks

- **Lock-out by rotation order.** Rotating API_SECRET before the new Shortcuts and the PC scripts move off it stops capture. Mitigation: MYC-196 stays after MYC-197 and the MYC-209 caller list; the order on the epic puts key rotation fifth.
- **Money.** MYC-200 (Cloudflare R2) needs a card on file even on the free tier. Mitigation: the ticket says "not urgent"; it is placed late in the order and nothing is bought in this run.
- **Bank consent expiry.** Enable Banking links need periodic re-consent. Mitigation: the backlog's decision (a dated ticket and a push a week before expiry) belongs to the Finance build, not this epic.
- **Census files.** keys.06 may find live credentials on the PC (an app password, unencrypted exports). Mitigation: unblock.01 and keys.06 report only; nothing is revoked or deleted until keys.07, on Phil's say.

## 5. Facts that differ from the plan

- **unblock.01 versus unblock.02:** the plan puts the census check first (H2.10) and the epic order as bank sign-up, mailbox, Shortcuts, frame, key rotation (11.7). Both hold because the census check is Claude's 15 minutes and needs nothing from Phil; the epic order lists it first as "Claude, in parallel", then Phil's queue. The red team may prefer to move it below MYC-195.
- **unblock.01 duplicates keys.06.** keys.06 is the census check itself (Claude, 2 points). unblock.01 is written as the pointer that puts keys.06 at the front of the queue, linked, not a second check.
- **MYC-182** carries three answers (backup drive, due date, photo frame). The due date moves every dated baby ticket (plan §27 point 1); this makes MYC-182 the queue ticket with the widest reach after MYC-195.
- **MYC-210** is the 2026-11-24 overnight run's report, not a gate; its "unlocks" are the PhirstMaxx confirmations (phm.01). It is kept under the epic as the plan says.

## 6. Sources

1. https://enablebanking.com/docs/api/linked-accounts/ , Whitelisting own accounts for restricted API usage in production, Enable Banking (checked 2026-11-28)
2. https://enablebanking.com/terms , Terms of Service, Enable Banking (checked 2026-11-28)
3. https://enablebanking.com/docs/api/control-panel/ , Control Panel overview, Enable Banking (checked 2026-11-28)
4. https://docs.firefly-iii.org/tutorials/data-importer/eb/ , Enable Banking, Firefly III data importer documentation (checked 2026-11-28)
