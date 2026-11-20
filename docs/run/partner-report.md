# Master run — Stream C report (the partner: build now, invite later)

*2026-11-20, 06:35–07:50 London. Claude Code on the PC. Ticket MYC-185. Status: **built and deployed** (release 6, commit `375e164`, then release 7). Migrations 0167, 0168, 0169, 0170. Phil invites her after the UI is signed off; everything here was built and checked with the second test person. Phil's live check is chunk 11 of MYC-193 and needs the email service first (MYC-194).*

## What the brief asked for, and where each part stands

| Asked (master run §7) | State | Where |
|---|---|---|
| Her view of his space: Work, Fitness, and the Day log **only for entries he marks shared** | Built. Work and Fitness by an ordinary share. The Day log has a per-day switch honoured by the database. See "The Day log". | 0169, `app/api/journal/shared-days`, `components/daylog/SharedWithMe.tsx` |
| Nudge: she taps it on any item of his she can see; he gets a push (and the wall says it); no limit | Built, except the wall speaking (the wall is a later stream; the line it would say is recorded). | 0168, `lib/system/nudges.ts`, `lib/nudges/nudge.ts`, `components/nudges/NudgeButton.tsx` |
| Her own space starts with Work, Fitness and Health, the Day log; he sees only what she shares | Already true: a new person's menu hides Finance, Studio, Ventures, Drops and The Boys, and everything she makes is hers until she shares it. Organisation stays visible because the Day log lives in it. | 0112 (unchanged) |
| A family team both belong to; either can add and assign there | The team model does this already. Creating the team is one step for Phil in People & teams (it needs his sign-in and his authenticator). | |
| Update `docs/onboarding.md` and write her first run | Done: a section on what changed, and a fifteen-minute first run for a partner. | `docs/onboarding.md` §8, §9 |

## The Day log

Sharing was all or nothing: giving someone a view of your Day log would have shown them every day you have written. Now each day carries a switch, **Private / Shared**, private by default.

The rule in the database has two parts:

1. **A day in someone else's personal space is never readable through the Day log's tables**, whatever share exists.
2. **Days marked shared are read through one door** (`daylog_shared_with_me`), which gives the day, the owner's summary and the scenes. Not the conversation, the facts drawn from it, the scores, the cost, or a scene the owner hid.

The first version of this did it the obvious way (a shared day simply becomes visible in the tables) and its tests passed. Reading the Day log's own code showed that was wrong: the code asks "the day for this date" and expects one answer, so on any date he had shared she would have had two, and her own journal (the page, the lists, the scores, the nightly tidy-up) would have mixed his days into hers. Hence the separate door. Her own Day log never sees a row of his.

On her Journal page the marked days appear under **Shared with me**. Taking the switch back removes a day at once.

## Nudges

One tap on an item that is someone else's and that you can see. Four fixed wordings, all offers ("Want company for this?", "Can I help with this?", "Shall we do this together?", "Thinking of you on this one"). There is no free text: the feature cannot be used to say "you still haven't".

- A nudge **belongs to the person who receives it**: it is written into their space and only they can read it. The sender's request is checked under the sender's own rules (can she see this item?) before anything is written; if she cannot, she gets "not found" and nothing is written for anyone.
- It is **outside the interruption budget**: a person reaching for you is not the app nagging. It is recorded and never counted.
- **Not today** is one tap, asks no reason, and tells nobody.
- **When the thing is done she is told**, once, within five minutes (the tick).
- On the plate it shows as a **margin note** with the time and a Not today button, as in the mock-up.

## Faults closed on the way (from the test pass)

- **A link to a person could cross spaces, and changed the other person's record.** Any row naming a person (a quote's speaker, who a ticket waits on, who shares a receipt line) could name one in someone else's space; the trigger behind it then promoted that other person's contact. Now refused at the database on every table that links to a person (0167).
- **Every new person was greeted as "Phil"**: a new settings row was created with his name. It now starts with their own. And the name set in Settings is now the name other people see (it never reached the profile).
- **Reading someone's shared Work left no line in their "who has seen my data" log.** It does now.
- **A promoted admin with no authenticator, and a device signed out remotely, saw empty pages.** Both are now taken to the right page (in the Phase 1 report).

Both checks the tester had left switched off for these are now on and passing.

## Second half: the faults the test pass had left open

- **People belong to a space.** The assignee picker, @mentions and the Docs "who can see this" list offered every member of every team you are in, wherever you were, and the server accepted any of them. Giving a ticket in your own space to a teammate sent them its title. Now one function says who belongs to each space (a team's members; for a personal space its owner and the people the owner has shared Work or Docs with), the pickers show the people of the space they are in, and the server refuses an assignee from outside it and tells nobody outside it anything: no notification, and a mention does not make them a watcher. Someone who has since left a team stops being told about its tickets.
- **Two spaces, one address.** Every space starts with a doc space "HOME" and a project "General". Someone in a team saw two identical "Home" cards that both opened their own, and three identical "General" projects. A doc space now has an address that means one thing to the reader (its key when that is unambiguous for them, else its id); Docs cards and Projects headings say whose each is ("Yours", the team's name, the person's name), yours first; a page opened under the wrong "HOME" (a link written by someone else) goes to its own; a link sent in a notification carries the id, so it opens the same page for whoever receives it. A project with no key of its own no longer shows its id as one.
- **An invite can be cancelled** (0170): a Cancel beside each pending invite, for whoever could have sent it. The link stops working at once.
- **The page says before a promotion that someone has no authenticator** (0170): a "no authenticator" tag on the member's row, and a confirmation before making them an admin that says what will happen to them.
- **The invite welcome** no longer tells someone who already has an authenticator to set one up, and names the sections a new person really sees.

## Mistake made

My new "shared days" route was first written to an address that already existed (the route that shows a linked person the scenes they are in), replacing it. The existing Day log check caught it on the next run; the original is restored byte for byte and the new list has its own address. It did not reach production.

## Not built

- **The wall speaking a nudge** (wall stream).
- **Delete a team.** It removes a space and everything in it for every member and cannot be undone, so it was not built unattended: MYC-199 asks what should happen to what is in it.
- **The Work pages still use your own space's types, workflows and projects when you open a team's ticket.** Reading and editing a team ticket works; choosing a type or project for it offers yours. The @mention list in the editor likewise offers everyone you work with (the server tells only those in the space).
- **A team's default project has no short key**, so its tickets are addressed by id. Giving each team a prefix is a naming decision for whoever creates the team.
- **Her granting him a view of hers** uses the same share form; nothing new was needed, and nothing new was tested from her side beyond the second test person.

## Design calls

- **The Day log's privacy is enforced where it cannot be forgotten**: a restrictive database rule, which no share can widen, rather than a filter in each query.
- **A separate door for shared days** rather than widening the tables, for the reason above.
- **Nudges are owned by the receiver.** It avoids a table two people can read, and means nothing about his answer is visible to her except "it is done".
- **No free text in a nudge.** Research rule 30: presets lean to offers.
- **"Told when done" is checked every five minutes, not sent from each place a ticket can be finished.** There are at least six such places.
- **Who belongs to a personal space includes the people it is shared with.** Otherwise the owner could not mention or assign to the one person they deliberately let in.
- **Your own doc space keeps its short address; another's is addressed by id only when the short one would be ambiguous.** Existing links and bookmarks of yours are unchanged.
- **Notifications are filtered where they are written, not where they are raised**: one place, so a new kind of event cannot forget the rule.

## For Phil

- **Before inviting her:** set up the email service (MYC-194), and invite her as **member**. Do not make her an admin or name her successor until she has an authenticator (the page now warns you).
- **One decision, MYC-198:** who may switch on the paid AI features for a new person. Today she can switch them on herself and they count against the one monthly cap. Nothing waits on it.
- **Create the family team** in Settings → People & teams when you are ready (your sign-in and code are needed, so the run cannot).
- **Share Work and Fitness** with her from the same page. For the Day log, share the section, then use the switch on each day you want her to see.
- Chunk 11 of MYC-193 walks through it with her phone.
- This terminal cannot write the Claude project's copies of the state documents; `graphify update .` could not run.
