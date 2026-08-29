# Receipts — Phase 1 report

What was done. Six commits, one per numbered section.

| Commit | Section |
|---|---|
| `e9d6595` | 1 — migration |
| `67fe9cd` | 2 — storage helper |
| `02fd8d0` | 6 — types |
| `5a911bd` | 4 — parser |
| `f263f04` | 3 — API routes |
| `6c385ba` | 5 — UI |

`npx next build` exits 0 with no new warnings. `npx tsc --noEmit` exits 0.

---

## Files created

| Path | Contents |
|---|---|
| `supabase/migrations/0092_receipts.sql` | `receipts`, `receipt_images`, `receipt_lines`; RLS + `"deny all"` + `grant ... to service_role`; indexes `receipts_user_purchased_idx`, `receipt_images_receipt_id_idx`, `receipt_lines_receipt_id_idx`; private `receipts` storage bucket. |
| `lib/storage/receipts.ts` | `uploadReceiptImage()`, `getSignedUrl()`, `removeReceiptImages()`, `downloadReceiptImage()`; consts `RECEIPTS_BUCKET`, `SIGNED_URL_TTL`. |
| `lib/types/receipt.ts` | `ReceiptStatus`, `Receipt`, `ReceiptImage`, `ReceiptImageWithUrl`, `ReceiptLine`, `ReceiptDetail`, `ParsedReceipt`, `ParsedReceiptLine`, `ParseOutcome`; consts `ACCEPTED_MEDIA_TYPES`, `MAX_RECEIPT_IMAGES`, `TOTAL_TOLERANCE`. |
| `lib/receipts/parse.ts` | `PARSE_PROMPT`, `normaliseParsed()`, `parseReceipt()`. |
| `app/api/receipts/route.ts` | `GET` list (retailer/from/to/status), `POST` multipart upload + inline parse. |
| `app/api/receipts/[id]/route.ts` | `GET` receipt + lines + signed URLs, `PATCH` (retailer, purchased_at, total), `DELETE`. |
| `app/api/receipts/[id]/lines/[lineId]/route.ts` | `PATCH` (description, quantity, unit_price, vat, line_total, item_code). |
| `app/api/receipts/[id]/reparse/route.ts` | `POST` re-run parse on stored images. |
| `components/purchases/ReceiptsClient.tsx` | List view, detail view, drag-drop + file picker, editable line table, reparse, reconciliation row. |
| `app/organisation/receipts/page.tsx` | Route wrapper rendering `ReceiptsClient`. |

Files modified: `lib/nav/sections.ts` (one nav entry added).

---

## Migration applied: NO

`supabase db push` was not run. `supabase migration list` fails with:

    LegacyPlatformAuthRequiredError: Access token not provided. Supply an access
    token by running `supabase login` or setting the SUPABASE_ACCESS_TOKEN
    environment variable.

`.env.local` contains no `SUPABASE_ACCESS_TOKEN`, and `supabase/.temp/pooler-url`
is `postgresql://postgres.vokfwbkwuccikordcnxz@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
with no password embedded, so `--db-url` is not usable either. The CLI is
installed (v2.116.0) and the project is linked (`vokfwbkwuccikordcnxz`).

To apply, authenticate then push:

    supabase login          # or: export SUPABASE_ACCESS_TOKEN=...
    supabase db push
    supabase migration list # Local and Remote should both show 0092

Confirmed live consequence of it not being applied: `GET /api/receipts` returns
`500 {"error":"Could not find the table 'public.receipts' in the schema cache"}`.
The page itself renders and degrades without a client error.

---

## Deviations from the brief, and why

1. **Migration is `0092_receipts.sql`, not `0091_receipts.sql`.**
   `supabase/migrations/0091_ui_prefs.sql` already exists. Using 0091 would have
   collided with an applied migration. 0092 was the next free number.

2. **Commit order is 1, 2, 6, 4, 3, 5 — not 1..6.**
   Still one commit per numbered section. Section 3 (routes) imports section 4
   (parser) and section 6 (types); section 4 imports section 6. Committing in
   strict numeric order would have produced commits that do not compile.

3. **There is no "Purchases section sub-nav" and no "Agents" tab in this
   codebase.** Verified: `app/organisation/layout.tsx` renders `<Shell>` only;
   `components/compost/PurchasesClient.tsx` has filter chips (`FILTERS`, line 27)
   but no sub-nav; a search for an "Agents" tab returns nothing. The nearest
   existing structure is the Organisation `subPages` list in `lib/nav/sections.ts`,
   whose last entry is `Assistant` → `/organisation/assistant`.

   What was done: added `{ label: "Receipts", href: "/organisation/receipts" }`
   immediately before the `Assistant` entry, so Assistant stays last, and created
   `app/organisation/receipts/page.tsx`. **`PurchasesClient.tsx` was not touched
   at all**, which also satisfies the "do not touch beyond adding a sub-nav tab"
   constraint. If the intent was a tab strip inside the Purchases page instead,
   that is a different change and has not been made.

4. **`<Num>` was not used for amounts.** Amounts use
   `font-[family-name:var(--font-mono)] tabular-nums`. `--font-mono` in
   `app/globals.css:224` resolves to `"Berkeley Mono"` first, with JetBrains Mono
   as fallback, so this is the Berkeley Mono path. `components/ui/Num.tsx:36`
   masks every plain value when `financeHidden` is set, which would blank receipt
   amounts whenever finance privacy is on.

5. **`maxDuration = 60` is set on the two parse-invoking routes only** —
   `app/api/receipts/route.ts` (POST parses inline) and
   `app/api/receipts/[id]/reparse/route.ts`. The detail and line routes do not
   call the model, so they were left at the default.

6. **Extra helpers beyond the brief's two.** `lib/storage/receipts.ts` also
   exports `removeReceiptImages()` (used by `DELETE` so deleting a receipt does
   not orphan its images in the bucket) and `downloadReceiptImage()` (needed by
   reparse, which has only storage paths to work from).

7. **`PATCH` on a line recomputes `receipts.parsed_total`.** Not specified.
   Without it, editing a line total leaves the reconciliation row showing a stale
   figure until the next reparse.

8. **HEIC rejection is by MIME type and by filename extension** (`.heic`/`.heif`),
   because browsers sometimes send an empty or generic `type` for HEIC files. The
   error body names the iPhone setting that avoids it.

---

## Behaviour notes

- `parseReceipt()` sets `status = 'parsing'` before the model call, deletes all
  existing lines, then inserts the new set — a reparse replaces rather than
  appends.
- `parsed_total` is the rounded sum of `line_total`. Status resolution:
  `total` null → `needs_review` / `no_total`; `|parsed_total − total| > 0.05` →
  `needs_review` / `total_mismatch`; otherwise `parsed`.
- Failure reasons written to `review_reason` with `status = 'failed'`:
  `no_images`, `images_unreadable`, `vision_call_failed`, `unparseable_response`,
  `line_insert_failed`.
- All images go into one Anthropic user message as ordered image blocks,
  followed by the prompt — that is what allows overlap de-duplication. The
  prompt instructs one emission per line, receipt order preserved, and Costco
  `"2 @ 3.49"` quantity lines folded into the item line.
- Full model output is stored in `receipts.raw_parse`.

## Verified in the browser

`/organisation/receipts` at 1440×900, dev server, migration not applied:

    page status: 200
    heading present: true
    dropzone present: true
    choose button: 1
    file input accepts: image/jpeg,image/jpg,image/png
    file input capture: environment
    multiple: present
    nav has Receipts link: true
    page errors: none

---

## Uploading two images

Two JPEGs, optional retailer. Run from a shell with the app running; the
`x-api-secret` header is the CLI access path in `middleware.ts:64`.

    curl -X POST http://localhost:3000/api/receipts \
      -H "x-api-secret: $API_SECRET" \
      -F "images=@/path/to/page1.jpg;type=image/jpeg" \
      -F "images=@/path/to/page2.jpg;type=image/jpeg" \
      -F "retailer=Costco"

Against production, swap the origin for `$PUBLIC_BASE_URL`.

The response is `201` with the parsed receipt and the parse outcome:

    {
      "receipt": { "id": "...", "retailer": "Costco", "total": 84.31,
                   "parsed_total": 84.31, "status": "parsed", ... },
      "parse": { "status": "parsed", "review_reason": null,
                 "parsed_total": 84.31, "line_count": 23 }
    }

Then, using that id:

    curl -H "x-api-secret: $API_SECRET" http://localhost:3000/api/receipts/<id>
    curl -X POST -H "x-api-secret: $API_SECRET" http://localhost:3000/api/receipts/<id>/reparse
    curl -X PATCH -H "x-api-secret: $API_SECRET" -H "Content-Type: application/json" \
      -d '{"line_total": 12.99}' \
      http://localhost:3000/api/receipts/<id>/lines/<lineId>

**These calls return 500 until migration 0092 is applied.**
