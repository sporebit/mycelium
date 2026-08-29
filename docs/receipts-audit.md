# Receipts audit — current state of the codebase

Audit only. No code was changed. Every path and column below was read from the
repository; nothing here is inferred and nothing is proposed.

`supabase/migrations/` holds 90 files at time of writing.

---

## 1. Purchases / receipts / invoices

### Routes and components that exist

| Path | What it does |
|---|---|
| `app/api/purchases/route.ts` | `GET` lists purchases (query-param filters); `POST` creates one. Selects `PURCHASE_SELECT`, joins `projects(name)`. |
| `app/api/purchases/[id]/route.ts` | `PATCH` updates one purchase, restricted to `ALLOWED_FIELDS`; `DELETE` removes one. |
| `app/organisation/purchases/page.tsx` | Server page; reads a `projectId` search param and renders `<PurchasesClient initialProjectId={projectId} />`. |
| `components/compost/PurchasesClient.tsx` | Client UI for the purchases list: filters, add form, per-row patch and delete. |
| `lib/types/purchase.ts` | Types and constants: `PurchaseUrgency`, `PurchaseWantOrNeed`, `PurchaseListType`, `PurchaseCategory`, `Purchase`, `currencySymbol()`. |

`PURCHASE_SELECT` — `app/api/purchases/route.ts:17`:

    id, user_id, title, amount, currency, want_or_need, urgency, list_type,
    category, project_id, completed_at, raw_capture_id, created_at, updated_at,
    projects(name)

`ALLOWED_FIELDS` for PATCH — `app/api/purchases/[id]/route.ts:27`:

    title, amount, currency, want_or_need, urgency, list_type, category,
    project_id, completed_at

### `purchases` table columns

Created in `supabase/migrations/0017_purchases.sql`:

| Column | Type / constraint |
|---|---|
| `id` | `uuid` PK, `default gen_random_uuid()` |
| `user_id` | `text not null` |
| `title` | `text not null` |
| `amount` | `numeric` |
| `currency` | `text default 'GBP'` |
| `want_or_need` | `text`, check in `want` / `need` / `unclear` |
| `urgency` | `text not null default 'someday'`, check in `today` / `this_week` / `this_month` / `someday` |
| `completed_at` | `timestamptz` |
| `raw_capture_id` | `uuid references raw_captures(id) on delete set null` |
| `created_at` | `timestamptz not null default now()` |
| `updated_at` | `timestamptz not null default now()` |

Added by later migrations:

| Column | Migration | Type / constraint |
|---|---|---|
| `list_type` | `0018_purchases_extensions.sql` | `text not null default 'shopping'`, check in `shopping` / `wishlist` |
| `project_id` | `0018_purchases_extensions.sql` | `uuid references projects(id) on delete set null` |
| `deleted_at` | `0029_kind_conversion.sql` | `timestamptz` |
| `converted_from` | `0029_kind_conversion.sql` | `jsonb` |
| `context_where` | `0030_context_fields.sql` | `text` |
| `context_device` | `0030_context_fields.sql` | `text` |
| `context_energy` | `0030_context_fields.sql` | `text`, constraint `purchases_context_energy_chk`, in `low` / `medium` / `high` |
| `context_tag` | `0030_context_fields.sql` | `text` |
| `category` | `0085_purchase_category.sql` | `text`, check in `groceries`, `electronics`, `clothing`, `home`, `health`, `fitness`, `subscriptions`, `entertainment`, `transport`, `dining`, `gifts`, `other` |

RLS is enabled with a restrictive `"deny all"` policy; access is via the
service-role client only.

### Receipts / invoices

**No receipt or invoice route, component, table, column or type exists.**

A search of `app/`, `components/`, `lib/` and `supabase/` for `receipt` or
`invoice` returns two unrelated regex literals inside keyword matching in
`lib/router/classifyCapture.ts:897` and `lib/router/classifyCapture.ts:902`,
where the word "invoice" contributes to `device = "pc"` and `tag = "admin"`.

---

## 2. Spending — imported bank transactions and PayPal matching

### `bank_accounts` — `supabase/migrations/0036_bank_transactions.sql`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `text not null` |
| `bank` | `text not null default 'Halifax'` (default dropped in `0037`) |
| `account_number` | `text not null` (NOT NULL dropped in `0037`) |
| `sort_code` | `text` |
| `label` | `text` |
| `created_at` | `timestamptz not null default now()` |

`0037_multi_bank_support.sql` adds `external_key text` (later `SET NOT NULL`) and
`account_type text not null default 'current'`. It drops
`bank_accounts_user_id_account_number_key` and adds
`bank_accounts_user_bank_external_key_key`.

### `transactions` — `supabase/migrations/0036_bank_transactions.sql`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `text not null` |
| `account_id` | `uuid not null references bank_accounts(id)` |
| `txn_date` | `date not null` |
| `txn_type` | `text not null` |
| `description` | `text not null` |
| `amount` | `numeric(12,2) not null` — signed, credit positive, debit negative |
| `debit` | `numeric(12,2)` |
| `credit` | `numeric(12,2)` |
| `balance` | `numeric(12,2) not null` (NOT NULL dropped in `0037`) |
| `category` | `text` |
| `dedup_hash` | `text not null unique` |
| `created_at` | `timestamptz not null default now()` |

Added by later migrations:

| Column | Migration | Type |
|---|---|---|
| `fee` | `0037` | `numeric(12,2)` |
| `currency` | `0037` | `text not null default 'GBP'` |
| `state` | `0037` | `text` |
| `started_at` | `0037` | `timestamptz` |
| `completed_at` | `0037` | `timestamptz` |
| `enriched_merchant` | `0038` | `text` |
| `enrichment_source` | `0038` | `text` |
| `category_source` | `0048` | `text` |
| `ai_confidence` | `0048` | `numeric(3,2)` |
| `category_locked` | `0048` | `boolean not null default false` |

`0047_txn_type_standardise.sql` rewrites existing `txn_type` values in place:
`TFR` to `Transfer`; `DEB` and `Express Checkout Payment` to `Card Payment`;
`DD` to `Direct Debit`; `SO` to `Standing Order`; `FPO` to `Faster Payment Out`;
`FPI` to `Faster Payment In`; `BGC` to `Bank Giro Credit`; `BP` to `Bill Payment`.
There is no CHECK constraint on `txn_type`.

### `paypal_payments` — `supabase/migrations/0038_paypal_payments.sql`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `text not null` |
| `transaction_id` | `text not null unique` |
| `ref_txn_id` | `text` |
| `paypal_date` | `date not null` |
| `merchant_name` | `text` |
| `description` | `text not null` |
| `currency` | `text not null default 'GBP'` |
| `gross` | `numeric(12,2) not null` |
| `fee` | `numeric(12,2) not null` |
| `net` | `numeric(12,2) not null` |
| `amount` | `numeric(12,2) not null` |
| `funded` | `boolean not null default false` |
| `funding_type` | `text` |
| `match_status` | `text not null default 'pending'` |
| `matched_transaction_id` | `uuid references transactions(id)` |
| `created_at` | `timestamptz not null default now()` |

Indexes: `paypal_payments_user_id_idx`, `paypal_payments_ref_txn_id_idx`,
`paypal_payments_match_status_idx`.

### Match-state enum

**There is no Postgres enum type and no CHECK constraint for `match_status`.**
It is a plain `text` column with `not null default 'pending'`.

The value set exists only in TypeScript, at `lib/finance/paypal-match.ts:13`:

    export type MatchStatusCounts = {
      matched: number;
      ambiguous: number;
      pending: number;
      standalone: number;
    };

Values actually written to the column:

- `pending` and `standalone` — `lib/finance/paypal-csv.ts:114`, assigned as
  `funded ? "pending" : "standalone"`.
- `matched` — `lib/finance/paypal-match.ts:254` and `:304`.
- `ambiguous` — `lib/finance/paypal-match.ts:221`, `:230`, `:261`, `:311`.
- Reset to `pending` with `matched_transaction_id = null` —
  `lib/finance/paypal-match.ts:165`.

A separate run-result shape, `MatchRunResult` (`lib/finance/paypal-match.ts:6`),
reports `auto_matched`, `ambiguous`, `pending`, `standalone_corrected`.

### Where the matching logic lives

| Path | Role |
|---|---|
| `lib/finance/paypal-match.ts` | `runPayPalMatcher()` line 136, `getMatchCounts()` line 323, `getAmbiguousPayments()` line 342, `resolvePayment()` line 398. Phase 2 "standalone safety net" begins line 268. |
| `lib/finance/paypal-csv.ts` | Parses PayPal CSV, classifies rows, assigns initial `match_status`. |
| `lib/finance/paypal-persist.ts` | `findOrCreateAccount()`, `persistPayPalImport()`. |
| `lib/finance/paypal-api.ts` | `fetchTransactions()`, `normalizeApiTransactions()` for the PayPal REST path. |
| `lib/finance/paypal-api.test.ts` | Tests for the API path. |
| `lib/finance/csv-parser.ts` | Shared CSV types and helpers, including `dedupHash()` used by the matcher. |
| `lib/finance/halifax-csv.ts`, `lib/finance/revolut-csv.ts`, `lib/finance/amex-csv.ts` | Bank parsers, registered as `PARSERS` in the import route. |
| `lib/finance/categorise.ts` | Claude-based transaction categorisation. |
| `lib/finance/taxonomy.ts` | Category taxonomy. |

API routes:

- `app/api/finance/transactions/import/route.ts` — `POST`, CSV upload. Registers `PARSERS` at line 22; on `detectPayPal()` runs the PayPal flow then `runPayPalMatcher()` (imports at lines 9–15, PayPal branch at line 136).
- `app/api/finance/paypal/match/route.ts` — `POST`, runs the matcher.
- `app/api/finance/paypal/matches/route.ts` — `GET`, counts plus ambiguous list.
- `app/api/finance/paypal/matches/[paymentId]/resolve/route.ts` — `POST`, resolves one ambiguous payment.
- `app/api/finance/paypal/sync/route.ts` — `POST`, API sync then persist then match.
- `app/api/finance/transactions/route.ts`, `app/api/finance/transactions/[id]/route.ts`, `app/api/finance/transactions/[id]/category/route.ts`, `app/api/finance/categorise/route.ts`.

SQL functions live in `supabase/migrations/0049_txn_agg_function.sql` and
`supabase/migrations/0050_spend_analysis_functions.sql`. Category metadata is in
`supabase/migrations/0048_category_metadata.sql`.

---

## 3. OCR / image ingestion / vision API calls

Existing image or document calls, all to the Anthropic Messages API:

| Path | Input | Content block |
|---|---|---|
| `app/api/health/blood-tests/parse/route.ts` | `formData` field `file`, line 76 | `type: "document"`, `media_type: "application/pdf"` |
| `app/api/health/eye-prescription/parse/route.ts` | `formData` field `image`, line 50 | `type: "image"`, `source: { type: "base64", media_type }`, line 74 |
| `app/api/health/recipes/parse/route.ts` | `formData` field `image`, line 38, plus `existing_data`, line 47, for multi-page merge | `type: "image"`, line 76 |
| `app/api/nutrition/foods/scan-label/route.ts` | JSON body `image_base64` and `media_type`, line 132 | `type: "image"`, line 167 |

All four take their model from `MODEL_VISION` in `lib/config/models.ts`.

Other upload endpoints:

- `app/api/capture-audio/route.ts` — audio via `formData`, transcription; not image.
- `app/api/finance/transactions/import/route.ts` — CSV text upload; no OCR.

Client components containing a file or camera input:

`app/health/eye-prescription/page.tsx`, `components/health/blood-tests/AddResultsModal.tsx`,
`components/health/recipes/AddRecipeModal.tsx`, `components/nutrition/LabelScanner.tsx`,
`components/nutrition/BarcodeScanner.tsx`, `components/nutrition/QuickBarcodeLog.tsx`,
`components/nutrition/FoodSearch.tsx`, `components/compost/CaptureReviewClient.tsx`,
`components/finance/SpendingClient.tsx`, `components/agents/AgentChat.tsx`,
`components/agents/VoiceChatOverlay.tsx`.

**No dedicated OCR library or OCR service call exists** anywhere in the
repository — no Tesseract, Google Vision, or AWS Textract. Text extraction from
images happens only through the four Anthropic calls above.

`app/api/health-import/route.ts` reads a JSON body (`req.json()`, line 63) with
`metrics` and `workouts` arrays; it does not accept images.

Barcode routes (`app/api/nutrition/foods/barcode/[code]/route.ts`) take a code
string in the path, not an image.

Two grep false positives worth recording, so they are not re-counted as vision
call sites:

- `base64` also appears in `lib/auth/cookie.ts:13` (cookie payload encoding),
  `lib/finance/paypal-api.ts:30` and `lib/spotify/client.ts:35`, `:117`
  (HTTP Basic auth headers).
- `media_type` also appears in `app/api/media/route.ts`, `lib/types/media.ts:42`
  and `lib/ventures/types.ts:41` as a column name in the film/TV media library.

---

## 4. People / contacts

Yes. Three tables, all created in `supabase/migrations/0010_people_overhaul.sql`.
No later migration alters them.

### `people`

| Column | Type |
|---|---|
| `id` | `uuid` PK, `default gen_random_uuid()` |
| `user_id` | `text not null` |
| `first_name` | `text not null` |
| `last_name` | `text` |
| `display_name` | `text` |
| `relationship` | `text` |
| `phone` | `text` |
| `email` | `text` |
| `birthday` | `date` |
| `address` | `text` |
| `where_we_met` | `text` |
| `mutual_interests` | `text` |
| `notes` | `text` |
| `needs_review` | `boolean not null default false` |
| `created_at` | `timestamptz not null default now()` |
| `updated_at` | `timestamptz not null default now()` |

Indexes: `people_user_idx`, `people_needs_review_idx` (partial, where
`needs_review = true`).

### `people_aliases`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `person_id` | `uuid not null references people(id) on delete cascade` |
| `alias` | `text not null` |
| `is_primary` | `boolean not null default false` |
| `created_at` | `timestamptz not null default now()` |

Unique `(person_id, alias)`. Indexes: `people_aliases_alias_idx`,
`people_aliases_person_idx`.

### `people_mentions`

| Column | Type |
|---|---|
| `id` | `uuid` PK |
| `user_id` | `text not null` |
| `person_id` | `uuid references people(id) on delete cascade` |
| `source_type` | `text not null`, check in `capture` / `task` / `journal` |
| `source_id` | `uuid not null` |
| `raw_alias` | `text not null` |
| `confidence` | `text not null`, check in `high` / `medium` / `low` / `ambiguous` / `unresolved` |
| `candidate_person_ids` | `uuid[]` |
| `needs_review` | `boolean not null default false` |
| `resolved_at` | `timestamptz` |
| `created_at` | `timestamptz not null default now()` |

Indexes: `mentions_source_idx`, `mentions_person_idx`, `mentions_review_idx`
(partial). All three tables have RLS enabled with a restrictive `"deny all"`
policy, and are granted to `service_role`.

`last_mention_at` is **not** a column. It is computed per person in
`app/api/people/route.ts:79` from `people_mentions`, and typed as an optional
field at `lib/people/types.ts:40`.

The `0010` header comment records that an older `entities` table was left in
place at that time.

Related file: `lib/people/migrate-from-entities.ts`.

---

## 5. Telegram bot — photos and media groups

File: `app/api/telegram/webhook/route.ts`

**Photos and media groups are not accepted today.**

The inbound message type at line 31 declares only these fields:

    type TgMessage = {
      message_id: number;
      from?: TgUser;
      chat: TgChat;
      text?: string;
      voice?: TgVoice;
    };

There is no `photo`, `document`, `caption`, `video` or `media_group_id` field.
`TgVoice` (line 30) is `{ file_id: string; mime_type?: string; duration?: number }`.

The handler branches, lines roughly 249 to 305:

1. `if (message.voice)` — resolves the file, downloads it, transcribes it. On
   transcription failure it persists `audio_url` as the literal string
   `tg-file:` followed by the `file_id` (line 285).
2. `else if (message.text)` — assigns `rawText = message.text` (line 301).
3. `else` — replies `"unsupported message type"` and returns (lines 302 to 304).

Any photo, document, or media-group update falls to branch 3.

Other Telegram file: `app/api/telegram/send/route.ts` (outbound send).

---

## 6. Supabase Storage

**No Supabase Storage bucket exists, and there is no upload helper.**

- No occurrence of `storage.from(` or `.storage` anywhere in `app/`, `lib/` or
  `components/`.
- No bucket creation and no `storage.` reference in any of the 90 files in
  `supabase/migrations/`.
- `lib/supabase/` contains exactly two files, `client.ts` and `server.ts`.
  `server.ts` exports `createServerClient()`, a service-role `createClient()`
  with `auth: { persistSession: false }`. Neither file touches Storage.

Binary data in the system is not persisted to Supabase:

- Uploaded PDFs and images in the four vision routes are read into a Buffer,
  base64-encoded in memory and sent to the Anthropic API. They are not stored.
- `raw_captures.audio_url` and `journal_entries.audio_url` hold a string. The
  Telegram path writes the form `tg-file:<file_id>`
  (`app/api/telegram/webhook/route.ts:285`), which is a Telegram file reference,
  not a storage URL. `audio_url` is also written in
  `lib/router/writeCapture.ts:53` and `:223`.
