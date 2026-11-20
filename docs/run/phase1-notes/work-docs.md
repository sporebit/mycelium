# Phase 1 tester hand-back — Work + Docs (MYC-174)

*2026-11-20. One of five parallel testers. Final run on the hardened build (migration 0160 applied): 72 passed, 1 `test.fixme`. **Nothing that passed before the access hardening fails after it**, as Phil (signed in with a second factor) or as Tess.*

## Specs

| File | Person | Passing |
|---|---|---|
| `e2e/work.phil.spec.ts` | Phil | 30 (+1 fixme, burndown) |
| `e2e/work-issue.phil.spec.ts` | Phil | 7 |
| `e2e/work-workflows.phil.spec.ts` | Phil | 6 |
| `e2e/work-notifications.phil.spec.ts` | Phil | 7 |
| `e2e/docs.phil.spec.ts` | Phil | 9 |
| `e2e/work.tess.spec.ts` | Tess | 8 |
| `e2e/docs.tess.spec.ts` | Tess | 5 |

Shared helper: `e2e/work-kit.ts`. Name the files when running them: the prefix `e2e/work` also matches `worker.phil.spec.ts`. The kit seeds and removes notification rows by SQL (no app path produces one for a sole member) and waits on the shared per-person write limit.

## Fixed (each proven by a check that failed first)

- **Every Work write blanked the project page**: the refresh emptied every cached list before refetching, so "Saved" never showed and half-typed forms were lost (`lib/work/client.ts`, `components/work/NotificationsInbox.tsx`).
- The filter bar's search box ate spaces as typed (`components/work/FilterBar.tsx`).
- Toolbar formatting was wiped on an empty editor (a heading, list or divider replaced by the first key typed), and toolbar buttons never showed on/off (`components/editor/RichEditor.tsx`).
- The mention/ticket suggestion list repainted continuously under a resting pointer (`components/editor/suggestion.ts`).
- Issue rows could show no title at all (`components/work/kit.tsx`).
- Archived components vanished from Settings, so Restore could never be clicked (`app/api/work/projects/[key]/route.ts`).
- Sprint "Length" came out a day short in British Summer Time, as did the default end date (`components/work/Backlog.tsx`).
- **A user could create a sprint naming a project in someone else's space** (the row landed in their own space; nothing of the other person's was read or changed). Now 404 on both sprint routes.
- After Restore a Docs page kept showing the pre-restore content (`components/docs/DocHistory.tsx`).
- The Docs page menu did not close on Escape or outside click; "Save as a template" was promised and missing (`components/docs/DocPageView.tsx`).
- The project Key hint promised a re-key the API refuses once tickets carry the key; "Lay out columns" could produce an empty layout (`components/work/ProjectSettings.tsx`).

## Found, not fixed

1. **The burndown never burns from the Work pages.** It reads `ticket_completions`, which only the older complete route writes; the Status picker, a board drag and the Work PATCH leave no row. Suggested: derive completion days from the tickets' own resolved stamp (writing completion rows from Work would inflate the dashboard's "habits done yesterday"). Held as the fixme.
2. **A sole member can never receive a notification.** The actor is never told, and the only non-Phil actor (the GitHub and Vercel webhooks) does not call the writer. Phil's production inbox will stay empty. Suggested: record a status-change event in `advanceTicket` with a null actor.
3. **People lists ignore the space** (`lib/work/config.ts` `loadPeople`): in Phil's personal space the assignee picker, the @mention list and the Docs "who can see this" dialog offer members of every team he is on, who cannot see that space; assigning to one sends them the ticket title. `/api/tickets/assignees` is correctly scoped; reuse it.
4. **Two spaces, one address.** When a person belongs to a second space, Docs home shows two identical "Home HOME" cards both linking to `/docs/HOME`, and Projects shows two "General" with no space name. Needs the space in the address or on the card. This is what Kirsty will meet on day one.
5. Notification links are absolute to the production host (`lib/tickets/notify.ts`).
6. By reading only: the Create dialog keeps assignee, due and points after closing; the workflow colour picker PATCHes on every drag movement; two quick `ui_prefs.work` writes can drop one; two navigations are both named "Sections" on project pages.
7. One 500 on the epic search, once, not reproduced; it fell within a minute of a test-server swap.
8. Spec correction: `claude/spec-work.md` §11 says a key change re-keys and the page follows. True only while no ticket carries the key.

Left on the local stack: 87 archived `E2E-work-*` projects and 9 closed sprints (the app has no project delete).

## Needs Phil's eyes (15 minutes; drop 7, then 6, then 5)

1. **`/work/issues` on the phone.** Rows with labels and a due date still show their title; type two words in "Search text" at normal speed and both stay.
2. **A project's Board, desktop then phone.** Drag a card to another column and between two cards; it stays after reload. On the phone, see whether dragging works at all (the Status picker on the issue is the fallback).
3. **An issue with no description.** Click Add, click Heading, type: it is a heading and the button is lit. Type `@` and `#`: the list sits under the caret and a click picks. Judge the look of the chips.
4. **Project Settings.** Change the description, Save: "Saved" appears and the page does not flash. Archive a component: it stays, struck through, with Restore.
5. **Docs.** Edit a page twice, open History: is the diff readable? Restore the older version: the page shows it at once. The page menu closes on Escape; "Save as a template…" lists it under Templates.
6. **Backlog with a running sprint.** The look of the sprint block and burndown, knowing the line will not move (finding 1).
7. **Notifications on production.** The inbox will be empty (finding 2), so only Settings → Notifications is worth a look: the Telegram, Email and Push columns, and "Subscribe this device" on the phone.
