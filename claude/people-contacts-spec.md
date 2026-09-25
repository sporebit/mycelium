# People contacts — vCard import, merge, delete, export (Phil, 2026-09-25)

_The "project version" of this spec was not found on this machine or in the repo; this file is the brief as given, committed with MYC-165. The As-built section at the end records the migration number, deviations and the survey._

## Start
1. git pull. Make sure no other branch owns supabase/migrations/** and the Tasks merge is on main. Take the next free migration number (check both the local chain and `supabase migration list`).
2. `tix new "People: vCard import, merge, delete, export" --project MYC`. Reference that key in every commit.
3. Add imports/private/ to .gitignore BEFORE touching the file. Confirm with `git check-ignore imports/private/contacts.vcf`. Never commit, log, echo or paste any contact data into a report, commit message, ticket comment or doc. Report counts only.
4. Survey first and put it in the report: the people table's columns, every FK to people.id (from pg_constraint), every reader of people/people_aliases (grep .from('people'), the alias resolver, lib/daylog, lib/quotes, people_daylog_stats). Then parse the file and report only counts: number of cards, vCard version(s), cards with phones/emails/photos, and any unparseable cards.

## Decisions (locked)
- **C1** Contact tier: people.tier ('person'|'contact'). Imported contacts get 'contact' and are excluded from every matching path (daylog engine and interviewer cards, quotes speaker/alias matching, the alias resolver, people_daylog_stats). They're visible behind a Contacts chip. Promote with one tap, and automatically on the first link from anywhere; a DB trigger on the linking tables is the reliable way, so check it covers every FK found in the survey.
- **C2** No automatic merges. Same E.164 phone, same lower-cased email, or a name trigram ≥ 0.6 (the lib/quotes/text.ts function) → people_import_candidates with Merge into X / Keep separate / Skip. Non-matching cards import straight in as contacts. Import runs as a batch (people_import_batches) and is idempotent: re-running with the same file must not duplicate anyone (match on vCard UID first).
- **C3** Merge from anywhere in People: pick a survivor, choose per field. Phones, emails, aliases and vCard extras are unioned and de-duplicated. A SECURITY DEFINER function re-points every FK to people.id found through pg_constraint at run time (not a hard-coded list), in one transaction, and de-duplicates unique-key collisions. The loser gets deleted_at and merged_into_id, and any route given the old id resolves to the survivor. Write an audit_events row.
- **C4** Soft delete: deleted_at; hidden everywhere (every people reader filters it); a Settings → People bin with Restore; a nightly cron hard-deletes after 30 days (add it to the existing nightly cron, bearer CRON_SECRET). The confirm dialog lists linked counts and offers Merge instead.
- **C5** person_phones and person_emails: number_e164, number_raw, free-text editable label, is_current, include_in_export (defaults to false when marked old; Phil can re-enable per number), sort_order. Move any existing phone/email columns on people into them, with a count assertion in the migration.
- **C6** person_vcards keeps the raw card and its UID. On export, fields Mycelium doesn't model are carried through from the raw card, and modelled fields overwrite theirs.
- **C7** GET /api/people/export.vcf (authenticated, never public): vCard 3.0 for iPhone/iCloud, UTF-8, CRLF, 75-octet folding, UID kept, only include_in_export numbers and emails, custom labels via itemN.TEL + itemN.X-ABLabel, ?tier=person|contact|all (default all), deleted people excluded.
- New tables: P12 adoption helper, RLS per the invariant (enable + restrictive deny-all + service_role grant, then space policies), registered with People's entity group in lib/access/registry.ts. The isolation test must cover them.

## Libraries
- A maintained vCard parser that handles 2.1/3.0/4.0, quoted-printable, folding and PHOTO. libphonenumber-js with default region GB. Check what's already in package.json before adding anything.

## UI
- People list: Contacts / People chip, Promote, multi-select → Merge.
- Person page: Numbers and Emails editors (inline label edit, current/old, export toggle, add/remove/reorder), Merge…, Delete.
- /organisation/people/import: upload, the batch summary, the review list with side-by-side cards.
- Settings → People bin. An Export .vcf button on People.

## Tests
- Unit: the parser round-trip (import → export → re-import gives the same cards, UIDs kept), phone normalisation, the label/X-ABLabel writer, line folding, the merge FK walk against a test schema with a unique-collision case, soft-delete filtering, promote-on-link.
- npm test and npm run isolation-test must pass. Replay the migration on the local stack first, then supabase db push.
- Build gate before every push: rm -rf .next && npx next build. Push to main and smoke-test on production with a 3-card synthetic .vcf only, never the real file. Delete the synthetic people afterwards.

## Then the real import
- Run the import of imports/private/contacts.vcf against production as Phil. Report counts only: imported as contacts, sent to review, skipped, failed. Leave the review list for Phil.

## Finish
- Two repo templates, instantiated as tickets: (a) smoke-test-people-contacts (kind = test); (b) guide-contacts-to-iphone (kind = guide, house style) — export the current contacts from icloud.com/contacts as a backup vCard; download the Mycelium export; delete all contacts on icloud.com; import the Mycelium .vcf on icloud.com; check the count and five named people on the iPhone. Include a "why" line explaining that iCloud adds on import and doesn't merge.
- Update this file (migration number, deviations, the survey's FK list), claude/spec-organisation.md (People section) and claude/spec-index.md.
- Report with `tix comment <key>`: commits, migration, counts, deviations. No code and no contact data. Move to Done with deploy evidence; leave Closed for Phil.

## As built (2026-09-25, MYC-165)

**Migration `0140_people_contacts.sql`** (local 0139 → 0140 replayed first, then pushed). `people.tier` ('person' | 'contact', default person), `deleted_at`, `merged_into_id`, `promoted_at`. New tables `person_phones` (number_raw, number_e164, generated `number_key`, label, is_current, include_in_export, sort_order; unique per person and number), `person_emails` (same shape over `email_key`), `person_vcards` (uid, raw, version, batch_id; unique per space and uid), `people_import_batches`, `people_import_candidates` — adopted with `app.adopt_table`, RLS enabled, registered in `entity_groups` and `lib/access/registry.ts` under organisation.people, the 0111 policy loop inlined plus explicit service_role grants. `people.phone` / `people.email` moved into the tables with a count assertion, UK-shaped numbers normalised to E.164 in SQL, then the columns dropped. `people_daylog_stats` now joins live persons only.

**Survey — FKs to `people.id` (pg_constraint, hosted = local):** people_aliases.person_id (cascade), people_mentions.person_id (cascade), receipt_line_shares.person_id, receipt_participants.person_id, receipt_settlements.person_id, tickets.waiting_on_person_id (set null), quotes.said_by_person_id (set null), daylog_scene_people.person_id (cascade), daylog_facts.subject_person_id (set null); after 0140 also person_phones / person_emails / person_vcards / people_import_candidates (match_person_id, created_person_id) and people.merged_into_id. `public.people_link_tables()` returns the linking set at run time (every FK except the person's own tables); the migration creates one `promote_on_link_<column>` trigger per row of it (8 today) and `lib/people/contacts.test.ts` fails if any FK lacks one.

**Merge:** `public.people_merge(survivor, loser, fields)` (SECURITY DEFINER, authenticated) — checks both live, same space, caller may edit; applies the per-field choices; for every FK to people.id found in pg_constraint at run time it first deletes the loser's rows that would collide with the survivor's on any unique or primary key containing that column (the other key columns compared with IS NOT DISTINCT FROM), then re-points; chains earlier `merged_into_id` pointers; soft-deletes the loser with `merged_into_id`; a person merged into a contact promotes the survivor; writes `audit_events` (`people.merge`). `resolvePersonId()` follows the chain so `/api/people/<old id>` (and the person page) land on the survivor.

**Import:** `lib/people/vcard.ts` over `vcf` 2.1.2 (2.1 / 3.0 / 4.0, folding, groups, PHOTO) with our own quoted-printable + charset decoding; a card with no UID gets a stable content hash (`mycelium-<sha1>`), so the same file re-imports as skipped. Matching (`lib/people/import.ts`): E.164 number, lower-cased email, then name trigram ≥ 0.6 via `lib/quotes/text.ts similarity()`; a match → `people_import_candidates` (Merge into X / Keep separate / Skip on `/organisation/people/import`), no match → a contact with numbers, emails, aliases (display name + first name) and the raw card. Routes: `POST /api/people/import/vcf` (multipart, raw text/vcard or JSON), `GET /api/people/import/batches(/[id])`, `POST /api/people/import/candidates/[id]`.

**Export:** `GET /api/people/export.vcf?tier=person|contact|all` (default all; principal required; audit row `people.export`): vCard 3.0, UTF-8, CRLF, 75-octet folding that never splits a UTF-8 sequence, UID kept (a person with no card gets `mycelium-person-<id>`), only `include_in_export` numbers and emails, known labels as TYPE, custom labels as itemN.TEL/EMAIL + itemN.X-ABLabel, every unmodelled property of the raw card carried through (ORG, ADR, NOTE, PHOTO, URL, X-*) with Mycelium's N/FN/TEL/EMAIL/BDAY/UID winning.

**Readers:** `/api/people` (`?tier=`, default person; contacts under the Contacts chip), `/api/people/[id]`, review-queue, the calendar birthdays, receipts participant checks and the capture review's person update all filter `deleted_at`; the alias resolver, `resolveSpeaker()` (which `knownPeople()` and the interviewer cards use) and `people_daylog_stats` see live persons only. `DELETE /api/people/[id]` is soft (`?hard=1` for good); the bin is `GET /api/people/bin` + `POST /api/people/[id]/restore` and Settings → People & teams → Bin; the nightly cron (`/api/cron/tickets-nightly`) purges after 30 days via `people_purge_deleted(30)`.

**UI:** People list — People / Contacts chip, promote on a contact card, SELECT → two cards → MERGE, EXPORT .VCF, IMPORT → `/organisation/people/import`. Person page — Numbers and Emails editors (inline label, current/old with export auto-off, export toggle, add, remove, ↑↓), MERGE… (picker → dialog with survivor and per-field choice), DELETE (linked counts from `/api/people/[id]/links`, Merge instead), promote. The drawer takes one number and one email on create only.

**Tests:** `lib/people/vcard.test.ts` (9: parse 3.0 + 2.1, QP, groups/X-ABLabel, content UID stability, LF files + unparseable tail, phone normalisation, TYPE ↔ label, folding, custom-label writer, carry-through, full round trip with UIDs kept) and `lib/people/contacts.test.ts` (7 on the local stack: trigger coverage, promote-on-link, resolver + speaker ignore contacts and deleted, stats view, merge with two unique collisions + chaining + audit, self-merge refused, purge window).

**Deviations:** the "project version" of this spec was not on this machine, so the brief is the spec; the vCard ADR / NOTE / ORG are carried through from the raw card rather than modelled (address is imported into `people.address` for display but the raw ADR is what exports); a card with no UID uses a content hash for idempotency (the brief's "match on vCard UID first" has nothing to match on for this file, which has none); the Status-style label vocabulary is free text, with mobile / iPhone / home / work / main / fax / pager mapped to TYPE on export; the bin is a card on Settings → People & teams rather than a new settings page. Real-import counts: see the MYC-165 comment.
