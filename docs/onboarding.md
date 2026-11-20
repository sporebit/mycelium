# Joining Mycelium — the how-to for a new user

*Written 2026-10-29 from the invite page (`app/invite/[token]/page.tsx`), the accept function (0112 `accept_invite`) and the as-built record in `docs/multi-user-handoff.md`. For the owner's side see `claude/spec-access.md`.*

Mycelium is invite-only. Nobody can sign up on their own: an account is created only when an invited email address opens its invite link.

## 1. For the person inviting (owner or admin)

1. Settings → **People & teams** → the team → **Invite**. Enter the email address and the role (member or viewer; admins can be invited only by the team owner).
2. The invite is emailed through Resend. If the email service is not configured, the page shows the link instead: copy it and send it yourself.
3. The link works for **7 days** and **once**. If it expires or goes astray, send a new invite.
4. The invitee's email address must match: a different signed-in account cannot accept the link.

## 2. For the person joining

1. **Open the link.** The page shows who invited you, to which team, and as what role. It works before you have an account.
2. **Choose how to sign in.** Magic link (an email with a link), a password you set now, or Google. The account is created at this step and only for the invited address.
3. **Come back to the invite page.** Email confirmation is on, so the magic link, the confirmation email, or the Google round-trip all bring you back to the same invite page. If you land on the home page instead (this happens when the confirmation email is opened on another device), **open the invite link again** while signed in; it still accepts.
4. **Accept.** Press the button. You are now in the team with the role you were invited as.
5. **Authenticator app, if asked.** Team owners and admins must set up a time-based one-time code (TOTP) before they can use the app; the page sends you to Settings → Security → Enrol. Members and viewers may set one up but do not have to.

Afterwards you sign in at `/login` with the same method (magic link, password, passkey once you have added one, or Google). If you have an authenticator, the sign-in asks for the code.

## 3. What you see at first

- **Your own space and the team's.** Everything you create lives in your personal space, which nobody else can see unless you share it deliberately. Team members see the team's space only, never each other's personal spaces.
- **A reduced menu.** Finance, Studio, Ventures, Drops and The Boys (the AI agents) are hidden to start with, and AI features (voice capture, AI categorisation, vision scan) are off. Turn any of them on under Settings → Layout (hidden sections) and Settings → Features (AI behaviours).
- **Your name.** Set it on the Settings page (display name); it is what the team sees on comments, assignments and the weekly rundown.
- **What your role allows.** Owner: everything, including sharing and team settings. Admin: view, edit, create and delete across all sections, plus inviting and sharing. Member: view, edit, create and delete in the sections the owner has enabled for you. Viewer: read only. The owner can narrow a role per section but never widen it.

## 4. Sharing and being shared with

- **Being shared with.** When another user shares part of their personal space with you, it appears under Settings → People & teams → **Shared with me**, with what was shared and until when. You can decline it.
- **Sharing your own data.** Settings → People & teams → **Share**: pick the person (by their exact email), the section, what they may do (view, edit, create/delete) and, optionally, an expiry. Finance and platform data can never be shared. Sharing asks you to re-enter your authenticator code first.
- **Who has seen your data.** Settings → Security → **Who has seen my data** lists every time someone else's request read rows from your space.

## 5. Security settings worth knowing

- **Sessions.** Settings → Security lists every device signed in as you; sign any of them out remotely.
- **Authenticator.** The same page enrols or removes TOTP. Sensitive pages (account deletion, admin) ask for a fresh code even when you are signed in.
- **API tokens.** If you use the command-line tools, mint a token under Settings → Security → API tokens, scoped to the projects and routes you need. The value is shown once; copy it then.

## 6. Leaving, exporting, deleting

- **Export.** Settings → Data → Export gives you a zip of everything in your personal space, one JSON and one CSV per table.
- **Leave a team.** Settings → People & teams → the team → Leave. What you created in the team stays there, credited to you. A team owner must name a successor before leaving.
- **Delete your account.** Settings → Security → Danger zone: type your email to confirm (authenticator code required). Your personal space is removed; anything you contributed to a team stays, with the author cleared.

## 7. If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "This invitation has expired" | more than 7 days passed | ask for a new invite |
| "This invitation has already been used" | someone accepted it | if it was you, just sign in at `/login`; otherwise ask for a new one |
| "You are signed in as X, but this invitation is for Y" | another account is signed in in this browser | sign out, open the link again |
| Sign-in email never arrives | the address was mistyped on the invite, or it is in spam | check spam; ask the inviter to confirm the address and resend |
| "Check your email" and nothing happens after clicking the link | the link opened on a different device or browser | open the invite link again where you are signed in |
| Sent to "Enrol an authenticator" | you were invited as owner or admin | enrol; it takes a minute with any authenticator app |

## 8. What changed on 2026-11-20

*Added by the master run. Where this section and the ones above disagree, this one is right.*

- **An authenticator, once set up, is asked for at every sign-in**, whichever way you sign in (password, magic link, Google). Until the code is given the app shows nothing. Before, a password alone opened everything.
- **Owners and admins must have an authenticator.** If you become an owner or admin without one (promoted, named successor, or by creating a team) you are taken straight to Settings → Security to set one up, and everything opens again as soon as it is done. Do it before the promotion to avoid the detour.
- **"Sign out there" is immediate.** A device signed out from another device lands on the sign-in page at its next tap.
- **Sharing asks for your code and brings you back.** Press Share, confirm your authenticator code on the Security page, and you are returned to the share form to fill it in.
- **Your Day log is private day by day.** Sharing your Day log with someone shows them nothing by itself. On any day's page there is a switch, **Private / Shared**. Only days you switch to Shared are visible to the people you share your Day log with, and they see the summary and the scenes: not the conversation, the facts pulled from it, the scores or anything else. Take the switch back and it is gone at once.
- **Reading someone's shared days.** They appear on your own Journal page under **Shared with me**. They are never mixed into your own days.
- **Nudge.** On an item that is someone else's and that you can see, a **Nudge** button offers four fixed wordings, all offers ("Want company for this?"). They get a notification that does not count against the app's own limit of three a day. They can answer **Not today** with one tap; you are not told about that. When they finish the thing, you are told.
- **Your name.** A new account now starts with your own name, not the owner's. Changing it in Settings changes what everyone else sees.
- **Today, Finish line, Close the day.** Three new pages for the day itself: the one next thing with a first step; up to three things that are nearly done; and a two-minute close in the evening.

## 9. A first run for a partner

*For the second person in a household, on her own phone. About fifteen minutes. The person inviting should read the two notes first.*

**Before the invite (the person inviting):** the email service must be set up, or the invite is not emailed and the page shows a link to send by hand. Invite as **member**, not admin: an admin must set up an authenticator before the app will open.

1. **Open the invite** from the email. It shows who invited you and to which team. Choose **Password**, set one, and confirm from the email it sends. If that lands you on the home page, open the invite link once more and press **Accept**.
2. **Add it to the Home Screen.** In Safari: Share → Add to Home Screen. Open it from there from now on.
3. **Allow notifications** when asked. Without them a nudge or a "finished" message has nowhere to go.
4. **Set your name.** Settings → Profile. This is what the other person sees.
5. **Look at what you have.** Your own space starts with Work, Fitness, Health and the Day log. Everything you make is yours and private until you share it. The team's space is separate: anything put there is seen by everyone in the team.
6. **Capture one thing.** The + button: type something to do. It answers "Saved" at once and files it a moment later.
7. **Open Today.** One card: the next thing, a first step, about how long. Start, Not now, or Swap.
8. **See what has been shared with you.** Settings → People & teams → Shared with me lists it. Open one of the other person's items and try **Nudge**.
9. **Decide about the authenticator.** Settings → Security → Enrol takes a minute with any authenticator app. Without one you can do everything except share your own things and see who has read them. With one, every sign-in asks for its code.
10. **Share something back, if you want to.** Settings → People & teams → Share: the person's exact email, the section, what they may do. For the Day log, remember the switch on each day: sharing the section shows nothing until a day is switched to Shared.

11. **The family space, once it exists.** Under Organisation, **Family**. The first time, it tells you that everything you add there is seen by the other person, and asks you to press **Understood**. That is true of everything in it: notes, letters, the lists, the budget. Your own space is not affected. If you would rather have somewhere in it that is yours alone, say so: it is a small change.

**If it goes wrong:** the table in section 7 still applies. Two more: *pages open empty and an error mentions an authenticator* means your role now needs one (go to Settings → Security); *you were signed out without doing it* means the other person pressed "Sign out there" for your device (sign in again).
