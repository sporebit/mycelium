# Receipts — live verification

End-to-end exercise of the receipts feature against the hosted database.
Everything below was observed, not read from source.

Companion to `docs/receipts-phase3-report.md`, which covers the parallel splits
and housekeeping work. That document reports what was built; this one reports
what was exercised live. Section 5 corrects one of its findings.

**Fix commits: zero.** Nothing in the migration check or the end-to-end exercise
was blocked, so no code was changed. Findings that did not block verification are
in section 4.

---

## 0. What was exercised, against what

Local `next dev` on `localhost:3000`, reading `.env.local`, therefore pointed at
the **hosted** Supabase project — the same database and the same private storage
bucket the deployed site uses. Not a local Supabase stack.

The deployed site was **not** reachable from here. `PUBLIC_BASE_URL` in
`.env.local` is an ngrok tunnel that was not running; both `/organisation/receipts`
and `/api/receipts` returned ngrok's own 404 page. `.vercel/repo.json` names the
Vercel project but carries no production domain, and no domain is recorded
elsewhere in the repo. The hosted database is the shared component, so the parse,
storage, reconciliation and cascade behaviour below is production behaviour; only
the Vercel edge/runtime layer is unverified.

Two access paths, both live:

- Browser, headless Chromium at 1440x900, cookie session — for the upload
  gestures, the title field and the privacy toggle.
- `x-api-secret` header, the CLI path in `middleware.ts` — for the route
  contract, reparse, delete and the negative cases.

### The run happened twice, and that matters

The first pass ran against local `dccd1bf`. Pushing then failed: `main` had moved
on by eleven commits from a parallel worktree — receipt title, add-photos, merge,
and the whole splits feature (`0096`). `origin/main` was merged and **the
exercise was re-run in full against the merged tree**. Every result in section 2
is from the post-merge run unless it says otherwise. Two findings from the first
pass were already closed upstream and are recorded as closed rather than deleted,
because they explain what the pre-merge tree looked like.

### Fixtures

The two receipt images already in the bucket, downloaded and re-uploaded. They
turned out to be the top and bottom halves of one Costco receipt, which is why
the multi-image case is a genuine overlap test rather than a synthetic one.

---

## 1. Migration and bucket state

`supabase migration list` succeeded. The `SUPABASE_ACCESS_TOKEN` blocker recorded
in the phase 1 report is gone — the CLI is authenticated and the project linked.

Before the merge, `0092`–`0095` were present in both columns and `0096` existed
**remote-only**, with no local file. That is the coordination hazard the splits
report describes from the other side: its branch had pushed to the shared
database before the migration file reached `main`. Merging `origin/main` closed
it. Final state:

| Migration | Local | Remote |
|---|---|---|
| `0092_receipts.sql` | present | present |
| `0093_receipt_title.sql` | present | present |
| `0094_pc_metrics_machine_id.sql` | present | present |
| `0095_pc_metrics_retention.sql` | present | present |
| `0096_receipt_splits.sql` | present | present |

`supabase db push` was **not** run. Nothing was missing once the merge landed.

### Bucket

The private `receipts` bucket **already existed** and was not created by this
session. Confirmed by listing buckets through the Storage API with the
service-role key:

| Field | Value |
|---|---|
| `id` / `name` | `receipts` |
| `public` | `false` |
| `created_at` | 2026-08-29T15:59:57Z |

That timestamp falls inside the window in which `0092` was pushed, so `0092`'s
`insert into storage.buckets` did take effect against the hosted project rather
than merely naming a bucket someone had to create by hand. No action taken.

All three tables were present and readable through the service-role client, and
already held three receipts from a manual session on 2026-08-29.

---

## 2. End-to-end path confirmed working

Every row is an observed result.

### Upload

| Step | Result |
|---|---|
| File picker: "Choose photos" opens a chooser, multiple allowed | chooser fired, `isMultiple` true |
| Dropzone text switches while the parse runs | "Drop receipt photos here" to "Reading receipt…" |
| Parse runs inline, detail view opens on the new receipt | 11 lines, `parsed_total` 70.71 |
| Drag-drop: `dragover` applies the highlight class | highlight applied |
| Drag-drop: `drop` with a real `DataTransfer` uploads and parses | 11 lines, same figures |
| Signed image URL renders in the detail view | `naturalWidth` 3024x4032, `complete` true, src is the storage `object/sign/receipts/` form |
| Signed URL fetched directly | 200, `image/jpeg`, full byte length |
| Multi-image upload, both pages, via `x-api-secret` | 201 in 28.5s, 18 lines, header `subtotal` 100.70, `vat_total` 15.82, `total` 116.52 |
| PNG upload, and PNG reparse from storage | 201, stored with `media_type` `image/png` and a `.png` object key, round-tripped back through the vision call |
| List response carries `image_count` | present and numeric on every row |
| Detail response carries `participants` and `shares` | both arrays present |
| Browser console / page errors across all runs | none |

### Parse accuracy, checked against the paper

Both single-image outcomes were verified by reading the photographs, so the
statuses are correct rather than merely plausible:

- Top half — 9 item lines summing to exactly 48.97, and the image is cut off
  before any printed total. `needs_review` / `no_total` is right.
- Bottom half — 11 item lines summing to exactly 70.71, against a printed
  `TOTAL(INCL VAT)` of 116.52 and `TOTAL NUMBER OF ITEMS SOLD = 16`. Only 11 of
  those 16 are in frame. `needs_review` / `total_mismatch` is right.

Re-uploading the same image reproduced the earlier session's figures exactly
(48.97, 9 lines), so the parse is stable across runs.

### Statuses observed live

All five values in the `0092` check constraint were reached:

| Status | How it was reached |
|---|---|
| `uploaded` | row insert before the parse begins |
| `parsing` | held for the full ~27s of the vision call, polled from the table |
| `parsed` | line edit that brought the sum inside tolerance |
| `needs_review` / `no_total` | image with no printed total |
| `needs_review` / `total_mismatch` | partial photo of a longer receipt |
| `failed` / `no_images` | reparse of a receipt with no image rows |

### Line edit and reconciliation

`lib/receipts/reconcile.ts` exercised in both directions on a live row, before
and after the merge, with identical results.

| Step | Result |
|---|---|
| PATCH a line's `line_total` so the lines sum to the printed total | 200; `parsed_total` 116.52, `status` `parsed`, `review_reason` null |
| Receipt row re-read afterwards | same three values persisted; edited `line_total` persisted |
| PATCH the same line back to its original value | 200; `parsed_total` back, `status` `needs_review`, `review_reason` `total_mismatch` |
| PATCH `description` and `quantity` together | 200, both persisted |
| PATCH a field outside the allow-list | 400 `no valid fields` |

The rule flips cleanly in both directions and the response body carries the same
outcome the row does.

### Receipt PATCH, reparse, delete

| Step | Result |
|---|---|
| PATCH `retailer`, `purchased_at`, `total` | 200, all three persisted |
| PATCH `title` | 200, persisted |
| PATCH `title` as whitespace | stored as NULL, so the list falls back to the retailer |
| PATCH a field outside the allow-list | 400 `no valid fields` |
| PATCH an unknown id | 404 |
| Reparse on the stored images | 200 in 27.2s, no re-upload needed, both images reused |
| Reparse replaces the line set wholesale | every line id new, a hand-edited description gone, count back to 18 |
| Reparse leaves the images alone | both image rows intact |
| Reparse of an unknown id | 404 |
| List filters `status`, `retailer`, `from`/`to` | all applied correctly |
| DELETE | 200; receipt, image and line rows all gone via cascade |
| Storage objects after DELETE | bucket prefix empty; direct object fetch 400 |
| GET the deleted receipt | 404 |

**Storage cleanup was verified, not assumed.** The objects were listed and
fetched successfully immediately before each delete, then the prefix was listed
again after. One caveat worth recording: for roughly a second after a delete, the
bucket listing was already empty while a direct authenticated GET on the object
path still returned 200 with the full body. It settles to 400 shortly after —
confirmed at 4s. Verifying deletion by listing is reliable; verifying it by
fetching within the first second produces a false failure.

A full reconciliation of bucket prefixes against `receipts.id` at the end of the
session found no orphaned prefixes and no `receipt_images` rows without a parent.

### Upload rejections

| Case | Result |
|---|---|
| No `images` field | 400 |
| `image/heic` | 415, with the iPhone Formats instruction |
| `.HEIF` filename with an empty MIME type | 415, same message — the extension fallback works |
| `application/pdf` | 415, names the received type |
| 9 images against a max of 8 | 400 |
| GET with no credential | 401 from `middleware.ts` |

### Privacy

Finance privacy defaults to **on** (`lib/context/PrivacyContext.tsx`), so the
screen masks before anything is toggled. `Ctrl+Shift+H` toggles both ways.

Measured on the merged detail view, which now carries the splits UI as well as
the original reconciliation row and line table:

| State | Masked glyphs on the page | Real amounts on the page |
|---|---|---|
| Privacy on | 36 (`£•••.••` and the signed `•£•••.••`) | **0** |
| Privacy off | 0 | 3 header amounts, plus 33 numeric line inputs |

Nothing leaks. Every amount on the list and on the detail masks, including the
per-line and per-person figures the splits work added after phase 2 was written.
The line table's monetary inputs are replaced by static masked values while
privacy is on, so the figures cannot be read out of input values either;
`quantity` stays editable and unmasked, which is correct — it is a count.

Two corrections to the phase 2 report, which predates `99eb6bf`, `3aec616` and
`6399532`:

1. Phase 2 reported amounts rendering through `Num` and masking to the plain
   placeholder, and flagged the glyph mismatch against Spending as an open item.
   No longer true — amounts render through `components/finance/Money.tsx` with
   `format="balance"` and mask to the same glyph Spending uses. That item is
   closed.
2. Phase 2's note that receipt amounts had moved from Berkeley Mono to JetBrains
   Mono no longer applies, for the same reason.

The Total column carries a screen-reader-only currency label. It shows up in
`textContent` extraction but is not visible on screen; confirmed against a
rendered screenshot. Not a defect.

**Not verified:** `/organisation/receipts/balances` rendered cleanly in both
privacy states but had no participants or settlements to show, so it displayed no
amounts either way. Its masking is untested. Creating split data to test it would
mean exercising the splits feature, which belongs to the other phase 3 report.

### The parsing window — observed, not fixed

Instrumented directly against the table during a live reparse.

| Moment | `status` | `parsed_total` | line rows |
|---|---|---|---|
| baseline | `needs_review` | 110.10 | 18 |
| 1.5s to 6s into the parse | `parsing` | 110.10 | 18 |
| immediately after a line PATCH landed mid-parse | `parsing` | **1106.74** | 18 |
| after the parse finished | `needs_review` | 110.10 | 18 |

What this establishes:

- The guard added in `cf304b7` **works**, and the phase 2 report's description of
  this window as unguarded is out of date. `status` and `review_reason` were held
  at their pre-parse values; the edit did not relabel the receipt.
- `parsed_total` is still written unconditionally during the window, as phase 2
  documented deliberately. A PATCH landing mid-parse leaves a visibly wrong
  reconciliation figure until the parse completes.
- The line PATCH returned **200**. The edit was then discarded wholesale by the
  parse's delete-and-reinsert, with nothing telling the caller.
- Lines are deleted only *after* the model returns, so the half-inserted-line-set
  risk is confined to the brief delete/insert step, not the full ~27s call.

Left as is. It self-heals, and closing it is a design change, not a fix.

---

## 3. What broke

Nothing. No fix commits.

---

## 4. Findings, reported not fixed

None blocked verification, so under the phase rules they are recorded rather than
changed.

1. **The parse's final write is unchecked.** `lib/receipts/parse.ts` checks the
   error on the line insert but not on the closing update that writes `retailer`,
   `purchased_at`, `total`, `status` and the rest. The failure mode was
   reproduced directly against the table: an out-of-range `purchased_at` rejects
   the whole update with SQLSTATE `22008`, leaving the row stuck at
   `status = 'parsing'` while `parseReceipt()` returns a success outcome and the
   route returns 200. The trigger would be a model returning a date in a shape
   the prompt did not ask for; that did not happen in any of the seven parses run
   here, so this is a latent defect, not an observed one. It would stay invisible
   until someone noticed a receipt stuck on PARSING.

2. **No delete affordance for a single receipt.** The DELETE route works, but
   `ReceiptsClient.tsx` calls it only for participants and line tags. A receipt
   can be removed from the UI only as the losing side of a merge; otherwise
   deletion is API-only.

3. **Receipt-level fields other than `title` are render-only.** `retailer`,
   `purchased_at` and `total` are accepted by the PATCH allow-list but the detail
   view offers no way to edit them. This matters most for `total`, since setting
   it is the only way to move a receipt out of `no_total` short of a reparse.

4. **Line inputs show unpadded decimals** — a stored 3.50 renders as `3.5`,
   because the input is seeded from the raw numeric. Cosmetic.

5. **An unknown `status` filter value is ignored rather than rejected.**
   `?status=bogus` returns the unfiltered list with 200. Deliberate, given the
   guard against `RECEIPT_STATUSES`, but a caller cannot tell a typo from a match.

6. **Overlap de-duplication is imperfect.** The two-page upload produced 18 lines
   where the receipt prints `TOTAL NUMBER OF ITEMS SOLD = 16`, and `parsed_total`
   came out 6.42 short of the printed total. Separately, the bottom-half image
   prints an instant-rebate line as `3.50-` with a trailing minus, and it was read
   as a positive 3.50. The prompt is frozen; both are recorded as measurements,
   not as changes to make.

7. **Closed upstream during this work, recorded for the trail.** The pre-merge
   tree had `receipts.title` created by `0093` but referenced nowhere — absent
   from every `RECEIPT_SELECT`, from the PATCH allow-list, from the `Receipt`
   type and from the client. Commit `5e35297` wired it up, and the merged tree
   was re-tested: PATCH accepts `title`, whitespace stores as NULL, the list falls
   back to the retailer, and the detail view has an inline title field. Nothing
   to do.

8. **Outside this feature:** the login form has no `action`, and its submit
   handler is React-side. A submit that lands before hydration completes performs
   a native GET and puts the password in the query string, where it reaches the
   server log and the browser history. Observed accidentally while automating the
   browser. Unrelated to receipts and not touched.

---

## 5. One correction to `docs/receipts-phase3-report.md`

That report records, as a finding, that on Costco receipt `7b2571d1`
"ACETUM VINEGAR 2PK appears **twice** in `raw_parse` (two identical objects, both
persisted at sort_order 7 and 8). One image, so page overlap does not explain it."

The paper explains it. Zooming that receipt's stored image shows
`ACETUM VINEGAR 2PK` printed **twice consecutively**, each with item code
`402095`, each `1x 4.79`, each `4.79 Z` — two separate till lines for two units.
The duplicate in `raw_parse` is correct transcription, not a de-duplication
failure. No change is needed there.

The same zoom also confirms the nine top-half lines sum to exactly 48.97, which
is what the parser recorded.

---

## 6. Caveats deliberately left open

- **Parsing-window guard.** `status` is guarded; `parsed_total` and the line
  write itself are not. Measured in section 2. Not changed.
- **`reconcile()` unit tests.** Still none. There is no test directory under
  `lib/receipts/` and no `test` script in `package.json`, though `vitest` is a
  devDependency and `lib/finance/paypal-api.test.ts` shows the pattern. The rule
  was exercised live in both directions, twice, which is evidence but not a
  regression net.
- **Money-glyph alignment.** Closed, not open — see section 2. Receipts and
  Spending now mask identically.
- **Balances page masking.** Unverified, no data. See section 2.
- **Deployed Vercel runtime.** Unverified; no reachable production URL.

---

## 7. Data left behind

The database was returned to its pre-session state: the three receipts from
2026-08-29, three matching bucket prefixes, no orphans in either direction.

Everything this session created was deleted through the API — three receipts from
browser upload runs, one two-page throwaway, one PNG probe, and two zero-image
probes used to reach the `failed` path and to reproduce finding 1. The three
pre-existing receipts were read but never modified.
