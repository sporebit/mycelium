# Receipts phase 3 — housekeeping and splits

Branch `worktree-receipts`. Migrations applied and verified via `supabase migration list`; clean `npx next build` before every commit; API and UI verified against live data with test rows removed.

## 0. Findings
- Toggle `components/dashboard/PrivacyToggle.tsx:45`, mounted `components/shell/Sidebar.tsx:169` and `:200`.
- Shortcut **Ctrl/Cmd+Shift+H**, `lib/context/PrivacyContext.tsx:31-51`.
- Button is `hidden lg:inline-flex` — on mobile the shortcut is the only toggle, and there is no keyboard for it.
- Costco `7b2571d1`: **1** `receipt_images` row; ACETUM VINEGAR 2PK appears **twice** in `raw_parse` (two identical
  objects, both persisted at sort_order 7 and 8). One image, so page overlap does not explain it.
- `ce397df4` / `94548dfb` are near-certainly one receipt uploaded twice (same date, total, line count). Not merged —
  irreversible, left for you.

## Commits
1. `5e35297` `0093_receipt_title.sql`. `RECEIPT_SELECT` was in three routes; centralised, not copied a fourth time.
2. `692055d` `POST /api/receipts/[id]/images`. Validation/storage in `lib/receipts/upload.ts`, reused by create.
3. `e781c73` `POST /api/receipts/merge`. Images renumbered into one sequence; losers deleted only after the move.
4. `a695cda` **`0096`**, not 0094 — see below. Constraints and RLS verified against the live DB.
5. `f934daa` participants / shares / tag / balances / settlements. Ownership proven up to the receipt on every write.
6. `92b6162` `ReceiptSplits.tsx` — strip, per-line chips, footer. Long-press 500ms and secondary click open the popover.
7. `e9e21e8` `/organisation/receipts/balances`. Overpayment shows as OVERPAID rather than clamped.

## Deviations and decisions
- **No signed-upload exists** — private bucket, no client write policy. Uploads go multipart to the route under the
  service-role key; §2 reuses that path plus `getSignedUrl` on read.
- Unit shares survive a recompute and reserve their percentage out of the even-split pool; otherwise tagging anyone
  would silently destroy "2 of the 3". Removing a participant deletes their shares and rebalances those lines.
- Settlements are per person, not per receipt. Finance matcher not built, as instructed —
  `receipt_settlements.transaction_id` is in place and nullable for it.
- Each percentage share rounds to 2dp independently, per the specified `line_total × pct/100`, so a 50/50 split of
  £3.35 gives £1.68 + £1.68 = £3.36 — 1p over. Owner remainder clamps at zero. Built as specified; fixing it means
  allocating the last penny rather than rounding each share in isolation.

## Coordination hazard
`supabase db push` writes to the shared remote DB from an unmerged branch. My 0093 reached remote before the file was on `main`, so the parallel PC-monitoring session reconstructed it (`ae4cf2a`) and took 0094/0095. Repaired: merged `origin/main` (`2482320`), restored their applied-but-uncommitted 0095 (`2dc854b`), renumbered mine to 0096. Numbers are per-branch but the database is global — parallel worktrees will keep colliding.

## Filesystem fault
`P:` briefly served all-zero bytes for intact files and `git status` reported `index file corrupt`; both cleared on retry. `.git/worktrees/receipts/ORIG_HEAD` was genuinely destroyed (41 zero bytes), blocking `git merge` until removed; `CLAUDE_BASE` and `locked` are also zero-filled but are optional bookkeeping. No tracked file was affected.
